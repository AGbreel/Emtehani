using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Emtehani.Domain.Entities;
using Emtehani.Domain.Services;
using Emtehani.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Emtehani.API;

/// <summary>
/// Shared server-side helpers for the teaching module. Permission checks are
/// centralised here so every endpoint enforces the same rules.
/// </summary>
public sealed record TeachingScope(
    Guid UserId,
    Guid TeacherId,
    string Role,
    bool IsOwner,
    HashSet<string> Permissions,
    HashSet<Guid> GroupIds)
{
    public bool Has(string permission) => IsOwner || Permissions.Contains(permission);
    public bool CanAccessGroup(Guid groupId) => IsOwner || GroupIds.Count == 0 || GroupIds.Contains(groupId);
}

public static class TeachingAccess
{
    public static Guid? UserId(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    public static string Role(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.Role) ?? "";

    public static IResult Deny(string message = "ليس لديك صلاحية لتنفيذ هذا الإجراء.") =>
        Results.Json(new { message }, statusCode: StatusCodes.Status403Forbidden);

    public static IResult Bad(string message) =>
        Results.Json(new { message }, statusCode: StatusCodes.Status400BadRequest);

    public static IResult NotFound(string message = "العنصر غير موجود.") =>
        Results.Json(new { message }, statusCode: StatusCodes.Status404NotFound);

    /// <summary>
    /// Resolves the teacher whose data the caller may touch. Returns null for
    /// students and admins (they use dedicated student/admin paths).
    /// </summary>
    public static async Task<TeachingScope?> ResolveAsync(AppDbContext db, ClaimsPrincipal principal)
    {
        var userId = UserId(principal);
        if (userId is null) return null;
        var role = Role(principal);
        if (role == "Teacher")
        {
            var exists = await db.Users.AsNoTracking().AnyAsync(x => x.Id == userId && x.Role == "Teacher");
            if (!exists) return null;
            return new TeachingScope(userId.Value, userId.Value, role, true, [], []);
        }
        if (role != "Assistant") return null;
        var link = await db.TeachingAssistants.AsNoTracking()
            .FirstOrDefaultAsync(x => x.AssistantId == userId && x.Status == "Active");
        if (link is null) return null;
        var permissions = await db.AssistantPermissions.AsNoTracking()
            .Where(x => x.AssistantId == userId && x.TeacherId == link.TeacherId)
            .Select(x => x.Permission)
            .ToListAsync();
        var groups = await db.AssistantGroupAccesses.AsNoTracking()
            .Where(x => x.AssistantId == userId && x.TeacherId == link.TeacherId)
            .Select(x => x.GroupId)
            .ToListAsync();
        return new TeachingScope(userId.Value, link.TeacherId, role, false,
            permissions.ToHashSet(StringComparer.Ordinal), groups.ToHashSet());
    }

    /// <summary>Resolve and require a permission. Returns (scope, errorResult).</summary>
    public static async Task<(TeachingScope? Scope, IResult? Error)> RequireAsync(
        AppDbContext db, ClaimsPrincipal principal, string permission)
    {
        var scope = await ResolveAsync(db, principal);
        if (scope is null) return (null, Deny("هذا الحساب غير مرتبط بمدرس نشط."));
        if (!scope.Has(permission)) return (null, Deny("صلاحية غير كافية: " + permission));
        return (scope, null);
    }

    public static async Task<TeachingGroup?> GetGroupAsync(AppDbContext db, TeachingScope scope, Guid groupId)
    {
        var group = await db.TeachingGroups.FirstOrDefaultAsync(x => x.Id == groupId && x.TeacherId == scope.TeacherId);
        if (group is null) return null;
        return scope.CanAccessGroup(group.Id) ? group : null;
    }

    public static IQueryable<Guid> LinkedStudentIds(AppDbContext db, Guid teacherId) =>
        db.TeacherStudentRequests.AsNoTracking()
            .Where(x => x.TeacherId == teacherId && x.Status == "Accepted" && x.UnlinkedAtUtc == null)
            .Select(x => x.StudentId);

    public static async Task<bool> IsLinkedStudentAsync(AppDbContext db, Guid teacherId, Guid studentId) =>
        await db.TeacherStudentRequests.AsNoTracking()
            .AnyAsync(x => x.TeacherId == teacherId && x.StudentId == studentId
                && x.Status == "Accepted" && x.UnlinkedAtUtc == null);
}

public static class TeachingBillingLimits
{
    /// <summary>0 or negative means unlimited.</summary>
    public static bool Within(int limit, int current) => limit <= 0 || current < limit;

    public static async Task<(TeacherSubscription? Subscription, SubscriptionPlan? Plan)> CurrentAsync(AppDbContext db, Guid teacherId)
    {
        var sub = await db.TeacherSubscriptions.AsNoTracking()
            .Include(x => x.Plan)
            .Where(x => x.TeacherId == teacherId)
            .OrderByDescending(x => x.Status == "Confirmed")
            .ThenByDescending(x => x.UpdatedAtUtc)
            .FirstOrDefaultAsync();
        return (sub, sub?.Plan);
    }

    /// <summary>
    /// Null when the teacher may write. After the paid period plus grace, data
    /// stays readable but new content creation is blocked (no deletion).
    /// </summary>
    public static async Task<string?> WriteBlockReasonAsync(AppDbContext db, Guid teacherId)
    {
        var (sub, plan) = await CurrentAsync(db, teacherId);
        if (sub is null || sub.Status == "Confirmed") return null;
        if (sub.Status is "Suspended" or "Cancelled") return "الاشتراك موقوف. جدّد الاشتراك للمتابعة.";
        if (sub.Status == "Pending") return null; // the UI routes new teachers to the plan page.
        if (sub.EndsAtUtc is null) return null;
        var grace = Math.Max(0, plan?.GraceDays ?? 7);
        return sub.EndsAtUtc.Value.AddDays(grace) < DateTime.UtcNow
            ? "انتهى الاشتراك وفترة السماح. بياناتك محفوظة ويمكنك التجديد لاستئناف الإضافة."
            : null;
    }

    public static string? LimitReason(SubscriptionPlan? plan, string label, int limit, int current) =>
        plan is not null && !Within(limit, current)
            ? $"وصلت للحد الأقصى في خطتك الحالية ({label}: {limit}). قم بترقية الخطة للمتابعة."
            : null;
}

public static class TeachingNotify
{
    public static async Task SendAsync(AppDbContext db, IEnumerable<Guid> userIds,
        string type, string category, string title, string body,
        string? page = null, Guid? conversationId = null, Guid? announcementId = null)
    {
        var ids = userIds.Where(x => x != Guid.Empty).Distinct().ToArray();
        if (ids.Length == 0) return;
        var prefs = await db.NotificationPreferences.AsNoTracking()
            .Where(x => ids.Contains(x.UserId))
            .ToDictionaryAsync(x => x.UserId);
        foreach (var id in ids)
        {
            if (prefs.TryGetValue(id, out var pref) && !CategoryEnabled(pref, category)) continue;
            db.Notifications.Add(new UserNotification
            {
                UserId = id,
                Type = type,
                Category = category,
                Title = title.Length > 160 ? title[..160] : title,
                Body = body.Length > 400 ? body[..400] : body,
                Page = page,
                ConversationId = conversationId,
                AnnouncementId = announcementId
            });
        }
    }

    public static bool CategoryEnabled(NotificationPreference pref, string category) => category switch
    {
        "Messages" => pref.Messages,
        "Exams" => pref.Exams,
        "Sessions" => pref.Sessions,
        "Payments" => pref.Payments,
        "Announcements" => pref.Announcements,
        _ => pref.System
    };

    public static void Audit(AppDbContext db, Guid teacherId, Guid? actorId, string action,
        string entityType, string? entityId, string? details = null)
    {
        db.TeachingAuditLogs.Add(new TeachingAuditLog
        {
            TeacherId = teacherId,
            ActorUserId = actorId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Details = details is null ? null : details.Length > 2000 ? details[..2000] : details
        });
    }

    public static void ChatAudit(AppDbContext db, Guid conversationId, Guid? actorId, string action, string? details = null)
    {
        db.ChatAuditLogs.Add(new ChatAuditLog
        {
            ConversationId = conversationId,
            ActorUserId = actorId,
            Action = action,
            Details = details is null ? null : details.Length > 1000 ? details[..1000] : details
        });
    }
}

public static class TeachingText
{
    public static string Csv(string? value) => "\"" + (value ?? "").Replace("\"", "\"\"") + "\"";

    public static IResult CsvFile(string content, string fileName)
    {
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(content)).ToArray();
        return Results.File(bytes, "text/csv; charset=utf-8", fileName);
    }

    public static string Safe(string? value, int max)
    {
        var text = (value ?? "").Trim();
        return text.Length > max ? text[..max] : text;
    }

    public static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>Returns null for empty, "invalid" for rejected input, or the safe URL.</summary>
    public static string? ImageUrl(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var value = raw.Trim();
        if (value.Length > 500) return "invalid";
        if (value.StartsWith("/uploads/", StringComparison.Ordinal))
        {
            var fileName = value["/uploads/".Length..];
            if (fileName.Length is < 5 or > 80 || fileName.Contains("..") || fileName.Contains('/')
                || fileName.Contains('\\') || fileName.Contains('?')) return "invalid";
            var extension = Path.GetExtension(fileName).ToLowerInvariant();
            return extension is ".png" or ".jpg" or ".jpeg" or ".webp" ? value : "invalid";
        }
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)) return "invalid";
        if (uri.Scheme != Uri.UriSchemeHttps || !string.IsNullOrEmpty(uri.UserInfo)) return "invalid";
        return uri.ToString();
    }
}

public static class TeachingMediaTokens
{
    public static string Create(Guid materialId, Guid userId, string secret, int minutes = 10)
    {
        var exp = DateTimeOffset.UtcNow.AddMinutes(Math.Clamp(minutes, 1, 60)).ToUnixTimeSeconds();
        var payload = $"{materialId:N}.{userId:N}.{exp}";
        var signature = Sign(payload, secret);
        return $"{payload}.{signature}";
    }

    public static bool TryValidate(string? token, Guid materialId, string secret, out Guid userId)
    {
        userId = Guid.Empty;
        if (string.IsNullOrWhiteSpace(token)) return false;
        var parts = token.Split('.');
        if (parts.Length != 4) return false;
        if (!Guid.TryParseExact(parts[0], "N", out var material) || material != materialId) return false;
        if (!Guid.TryParseExact(parts[1], "N", out userId)) return false;
        if (!long.TryParse(parts[2], out var exp)) return false;
        if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp) return false;
        var payload = $"{parts[0]}.{parts[1]}.{parts[2]}";
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(Sign(payload, secret)),
            Encoding.ASCII.GetBytes(parts[3]));
    }

    private static string Sign(string payload, string secret) =>
        Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret + "|media"), Encoding.UTF8.GetBytes(payload)))
            .ToLowerInvariant();

    public static string HashQrToken(string raw) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
}

/// <summary>
/// File-type policy for device uploads. The extension picks the kind, but the
/// header signature must match too so a renamed executable cannot masquerade
/// as a lesson video.
/// </summary>
public static class TeachingMediaFiles
{
    public const long DefaultMaxBytes = 200L * 1024 * 1024;

    private static readonly Dictionary<string, (string Kind, string Mime)> Types = new(StringComparer.OrdinalIgnoreCase)
    {
        [".mp4"] = ("Video", "video/mp4"),
        [".m4v"] = ("Video", "video/mp4"),
        [".webm"] = ("Video", "video/webm"),
        [".mov"] = ("Video", "video/quicktime"),
        [".mp3"] = ("Audio", "audio/mpeg"),
        [".m4a"] = ("Audio", "audio/mp4"),
        [".aac"] = ("Audio", "audio/aac"),
        [".ogg"] = ("Audio", "audio/ogg"),
        [".oga"] = ("Audio", "audio/ogg"),
        [".wav"] = ("Audio", "audio/wav"),
        [".pdf"] = ("Pdf", "application/pdf"),
        [".doc"] = ("Document", "application/msword"),
        [".docx"] = ("Document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        [".ppt"] = ("Document", "application/vnd.ms-powerpoint"),
        [".pptx"] = ("Document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        [".xls"] = ("Document", "application/vnd.ms-excel"),
        [".xlsx"] = ("Document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        [".txt"] = ("Document", "text/plain"),
        [".csv"] = ("Document", "text/csv"),
        [".rtf"] = ("Document", "application/rtf"),
        [".jpg"] = ("Image", "image/jpeg"),
        [".jpeg"] = ("Image", "image/jpeg"),
        [".png"] = ("Image", "image/png"),
        [".webp"] = ("Image", "image/webp"),
        [".heic"] = ("Image", "image/heic"),
    };

    public static (string Kind, string Mime)? Describe(string fileName)
    {
        var extension = Path.GetExtension(fileName);
        return extension.Length > 0 && Types.TryGetValue(extension, out var info) ? info : null;
    }

    public static string NormalizeExtension(string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        return extension.Length is > 0 and <= 8 && extension[1..].All(char.IsLetterOrDigit) ? extension : "";
    }

    public static bool SignatureMatches(string extension, ReadOnlySpan<byte> h) =>
        extension.ToLowerInvariant() switch
        {
            ".mp4" or ".m4v" or ".mov" or ".m4a" => At(h, 4, "ftyp") || At(h, 4, "moov") || At(h, 4, "wide") || At(h, 4, "mdat"),
            ".webm" => h.Length >= 4 && h[0] == 0x1A && h[1] == 0x45 && h[2] == 0xDF && h[3] == 0xA3,
            ".mp3" => At(h, 0, "ID3") || (h.Length >= 2 && h[0] == 0xFF && (h[1] & 0xE0) == 0xE0),
            ".aac" => h.Length >= 2 && h[0] == 0xFF && (h[1] == 0xF1 || h[1] == 0xF9),
            ".ogg" or ".oga" => At(h, 0, "OggS"),
            ".wav" => At(h, 0, "RIFF") && At(h, 8, "WAVE"),
            ".pdf" => At(h, 0, "%PDF"),
            ".docx" or ".pptx" or ".xlsx" => h.Length >= 4 && h[0] == 0x50 && h[1] == 0x4B
                && ((h[2] == 0x03 && h[3] == 0x04) || (h[2] == 0x05 && h[3] == 0x06)),
            ".doc" or ".ppt" or ".xls" => h.Length >= 8 && h[0] == 0xD0 && h[1] == 0xCF && h[2] == 0x11 && h[3] == 0xE0,
            ".rtf" => At(h, 0, "{\\rtf"),
            ".jpg" or ".jpeg" => h.Length >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF,
            ".png" => h.Length >= 4 && h[0] == 0x89 && h[1] == 0x50 && h[2] == 0x4E && h[3] == 0x47,
            ".webp" => At(h, 0, "RIFF") && At(h, 8, "WEBP"),
            ".heic" => At(h, 4, "ftyp") && (At(h, 8, "heic") || At(h, 8, "heix") || At(h, 8, "mif1")),
            ".txt" or ".csv" => true,
            _ => false,
        };

    private static bool At(ReadOnlySpan<byte> h, int offset, string ascii)
    {
        if (h.Length < offset + ascii.Length) return false;
        for (var i = 0; i < ascii.Length; i++)
            if (h[offset + i] != ascii[i]) return false;
        return true;
    }
}

/// <summary>
/// Central chat authorization. Every read/write route uses this so a bypassed
/// frontend cannot read a conversation the role is not entitled to.
/// </summary>
public static class ChatAccess
{
    public static async Task<bool> IsAssistantLinkedAsync(AppDbContext db, Guid assistantId, Guid teacherId) =>
        await db.TeachingAssistants.AsNoTracking()
            .AnyAsync(x => x.AssistantId == assistantId && x.TeacherId == teacherId && x.Status == "Active");

    public static async Task<bool> AssistantHasChatPermissionAsync(AppDbContext db, Guid assistantId, Guid teacherId) =>
        await db.AssistantPermissions.AsNoTracking()
            .AnyAsync(x => x.AssistantId == assistantId && x.TeacherId == teacherId
                && x.Permission == TeachingPermissions.ChatManage);

    public static async Task<bool> AssistantCanAccessGroupAsync(AppDbContext db, Guid assistantId, Guid teacherId, Guid groupId)
    {
        var restricted = await db.AssistantGroupAccesses.AsNoTracking()
            .Where(x => x.AssistantId == assistantId && x.TeacherId == teacherId)
            .Select(x => x.GroupId).ToListAsync();
        return restricted.Count == 0 || restricted.Contains(groupId);
    }

    public static async Task<bool> CanAccessAsync(AppDbContext db, Guid userId, string role, Conversation conversation)
    {
        switch (role)
        {
            case "Teacher":
                return conversation.Type == "AdminGroup" || conversation.TeacherId == userId;
            case "Admin":
                return conversation.Type == "AdminGroup"
                    || (conversation.Type == "AdminDirect" && conversation.AdminId == userId);
            case "Assistant":
            {
                if (!await IsAssistantLinkedAsync(db, userId, conversation.TeacherId)) return false;
                if (!await AssistantHasChatPermissionAsync(db, userId, conversation.TeacherId)) return false;
                if (conversation.Type == "TeacherGroup") return true;
                if (conversation.Type != "GroupChat" || conversation.GroupId is null) return false;
                return await AssistantCanAccessGroupAsync(db, userId, conversation.TeacherId, conversation.GroupId.Value);
            }
            case "Student":
            {
                if (conversation.Type == "Direct")
                    return conversation.StudentId == userId
                        && await db.TeacherStudentRequests.AsNoTracking().AnyAsync(x =>
                            x.TeacherId == conversation.TeacherId && x.StudentId == userId
                            && x.Status == "Accepted" && x.UnlinkedAtUtc == null);
                if (conversation.Type == "TeacherGroup")
                    return await db.TeacherStudentRequests.AsNoTracking().AnyAsync(x =>
                        x.TeacherId == conversation.TeacherId && x.StudentId == userId
                        && x.Status == "Accepted" && x.UnlinkedAtUtc == null);
                if (conversation.Type == "GroupChat" && conversation.GroupId is Guid groupId)
                    return await db.GroupMemberships.AsNoTracking().AnyAsync(x =>
                        x.GroupId == groupId && x.StudentId == userId && x.Status == "Active");
                return false;
            }
            default:
                return false;
        }
    }

    /// <summary>Staff means the participant may moderate (not merely read).</summary>
    public static async Task<bool> IsStaffAsync(AppDbContext db, Guid userId, string role, Conversation conversation)
    {
        if (role == "Teacher") return conversation.TeacherId == userId;
        if (role == "Admin") return conversation.Type == "AdminGroup" && conversation.AdminId == userId
                               || conversation.Type == "AdminDirect" && conversation.AdminId == userId;
        if (role == "Assistant")
            return conversation.Type is "TeacherGroup" or "GroupChat"
                && await IsAssistantLinkedAsync(db, userId, conversation.TeacherId)
                && await AssistantHasChatPermissionAsync(db, userId, conversation.TeacherId);
        return false;
    }

    public static async Task<bool> IsMutedAsync(AppDbContext db, Guid conversationId, Guid userId)
    {
        var state = await db.ConversationMemberStates.AsNoTracking()
            .FirstOrDefaultAsync(x => x.ConversationId == conversationId && x.UserId == userId);
        if (state is null || !state.IsMuted) return false;
        return state.MutedUntilUtc is null || state.MutedUntilUtc > DateTime.UtcNow;
    }

    /// <summary>All conversation ids a user may open. Null means the role is unsupported.</summary>
    public static async Task<List<Guid>?> AccessibleConversationIdsAsync(AppDbContext db, Guid userId, string role)
    {
        switch (role)
        {
            case "Teacher":
                return await db.Conversations.AsNoTracking()
                    .Where(x => x.Type == "AdminGroup" || x.TeacherId == userId)
                    .Select(x => x.Id).ToListAsync();
            case "Admin":
                return await db.Conversations.AsNoTracking()
                    .Where(x => x.Type == "AdminGroup" || (x.Type == "AdminDirect" && x.AdminId == userId))
                    .Select(x => x.Id).ToListAsync();
            case "Assistant":
            {
                var link = await db.TeachingAssistants.AsNoTracking()
                    .FirstOrDefaultAsync(x => x.AssistantId == userId && x.Status == "Active");
                if (link is null) return [];
                if (!await AssistantHasChatPermissionAsync(db, userId, link.TeacherId)) return [];
                var restricted = await db.AssistantGroupAccesses.AsNoTracking()
                    .Where(x => x.AssistantId == userId && x.TeacherId == link.TeacherId)
                    .Select(x => x.GroupId).ToListAsync();
                return await db.Conversations.AsNoTracking()
                    .Where(x => x.TeacherId == link.TeacherId
                        && (x.Type == "TeacherGroup"
                            || (x.Type == "GroupChat" && x.GroupId != null
                                && (restricted.Count == 0 || restricted.Contains(x.GroupId.Value)))))
                    .Select(x => x.Id).ToListAsync();
            }
            case "Student":
            {
                var teacherIds = await db.TeacherStudentRequests.AsNoTracking()
                    .Where(x => x.StudentId == userId && x.Status == "Accepted" && x.UnlinkedAtUtc == null)
                    .Select(x => x.TeacherId).Distinct().ToListAsync();
                var groupIds = await db.GroupMemberships.AsNoTracking()
                    .Where(x => x.StudentId == userId && x.Status == "Active")
                    .Select(x => x.GroupId).ToListAsync();
                return await db.Conversations.AsNoTracking()
                    .Where(x => (x.Type == "TeacherGroup" && teacherIds.Contains(x.TeacherId))
                        || (x.Type == "Direct" && x.StudentId == userId && teacherIds.Contains(x.TeacherId))
                        || (x.Type == "GroupChat" && x.GroupId != null && groupIds.Contains(x.GroupId.Value)))
                    .Select(x => x.Id).ToListAsync();
            }
            default:
                return null;
        }
    }

    /// <summary>Participants who should receive a notification for a new message.</summary>
    public static async Task<List<Guid>> RecipientsAsync(AppDbContext db, Conversation conversation)
    {
        switch (conversation.Type)
        {
            case "TeacherGroup":
                return await db.TeacherStudentRequests.AsNoTracking()
                    .Where(x => x.TeacherId == conversation.TeacherId && x.Status == "Accepted" && x.UnlinkedAtUtc == null)
                    .Select(x => x.StudentId).Distinct().ToListAsync();
            case "GroupChat" when conversation.GroupId is Guid groupId:
            {
                var ids = await db.GroupMemberships.AsNoTracking()
                    .Where(x => x.GroupId == groupId && x.Status == "Active")
                    .Select(x => x.StudentId).ToListAsync();
                var assistants = await db.TeachingAssistants.AsNoTracking()
                    .Where(x => x.TeacherId == conversation.TeacherId && x.Status == "Active")
                    .Select(x => x.AssistantId).ToListAsync();
                ids.AddRange(assistants);
                return ids.Distinct().ToList();
            }
            case "AdminGroup":
                return await db.Users.AsNoTracking()
                    .Where(x => x.EmailConfirmed && (x.Role == "Teacher" || x.Role == "Admin"))
                    .Select(x => x.Id).ToListAsync();
            case "Direct":
                return [conversation.TeacherId, conversation.StudentId ?? Guid.Empty];
            case "AdminDirect":
                return [conversation.TeacherId, conversation.AdminId ?? Guid.Empty];
            default:
                return [];
        }
    }

    public static string NormalizeGroupMode(string? mode) =>
        mode is "TeacherOnly" or "Moderated" or "Everyone" ? mode : "Everyone";

    public static string NormalizeAdminMode(string? mode) =>
        mode is "AdminOnly" or "Announcement" or "Everyone" ? mode : "Everyone";
}

public static class GroupChats
{
    public static async Task<Conversation> EnsureAsync(AppDbContext db, TeachingGroup group, Guid? actorId = null)
    {
        var conversation = await db.Conversations
            .FirstOrDefaultAsync(x => x.Type == "GroupChat" && x.GroupId == group.Id);
        if (conversation is not null) return conversation;
        conversation = new Conversation
        {
            Type = "GroupChat",
            TeacherId = group.TeacherId,
            GroupId = group.Id,
            Title = $"شات {group.Name}",
            ChatMode = group.ChatMode is "TeacherOnly" or "Moderated" or "Everyone" ? group.ChatMode : "Everyone",
            CreatedAtUtc = DateTime.UtcNow
        };
        db.Conversations.Add(conversation);
        if (actorId is Guid actor)
            TeachingNotify.ChatAudit(db, conversation.Id, actor, "conversation.created", "GroupChat");
        return conversation;
    }
}
