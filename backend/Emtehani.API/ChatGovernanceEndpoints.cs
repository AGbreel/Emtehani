using System.Security.Claims;
using Emtehani.Domain.Entities;
using Emtehani.Domain.Services;
using Emtehani.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Emtehani.API;

/// <summary>
/// Server-enforced chat governance. Modes, deletion, pinning, moderation and
/// muting are all validated here regardless of what the UI displays.
/// </summary>
public static class ChatGovernanceEndpoints
{
    public static void MapChatGovernanceEndpoints(this WebApplication app)
    {
        app.MapGet("/api/chat/conversations/{id:guid}/control", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null) return Results.Unauthorized();
            var role = TeachingAccess.Role(p);
            var conversation = await db.Conversations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (conversation is null) return TeachingAccess.NotFound("المحادثة غير موجودة.");
            if (!await ChatAccess.CanAccessAsync(db, userId.Value, role, conversation)) return Results.Forbid();
            var canManage = await CanManageAsync(db, userId.Value, role, conversation);
            var muted = canManage
                ? await db.ConversationMemberStates.AsNoTracking()
                    .Where(x => x.ConversationId == id && x.IsMuted
                        && (x.MutedUntilUtc == null || x.MutedUntilUtc > DateTime.UtcNow))
                    .ToListAsync()
                : [];
            var mutedIds = muted.Select(x => x.UserId).ToList();
            var names = await db.Users.AsNoTracking().Where(x => mutedIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName }).ToDictionaryAsync(x => x.Id, x => x.FullName);
            return Results.Ok(new
            {
                id = conversation.Id,
                type = conversation.Type,
                chatMode = conversation.ChatMode,
                canManage,
                isStaff = await ChatAccess.IsStaffAsync(db, userId.Value, role, conversation),
                isMuted = await ChatAccess.IsMutedAsync(db, id, userId.Value),
                allowedModes = conversation.Type switch
                {
                    "AdminGroup" => new[] { "AdminOnly", "Everyone", "Announcement" },
                    "GroupChat" or "TeacherGroup" => new[] { "TeacherOnly", "Everyone", "Moderated" },
                    _ => Array.Empty<string>()
                },
                mutedMembers = muted.Select(x => new
                {
                    x.UserId, Name = names.GetValueOrDefault(x.UserId), x.MutedUntilUtc, x.MutedByUserId
                }),
                lastPolicyChangedAtUtc = conversation.LastPolicyChangedAtUtc
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/chat/conversations/{id:guid}/mode", async (Guid id, ChatModeInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null) return Results.Unauthorized();
            var role = TeachingAccess.Role(p);
            var conversation = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id);
            if (conversation is null) return TeachingAccess.NotFound("المحادثة غير موجودة.");
            if (!await CanManageAsync(db, userId.Value, role, conversation))
                return TeachingAccess.Deny("لا تملك صلاحية تغيير إعدادات المحادثة.");

            string mode;
            if (conversation.Type == "AdminGroup")
            {
                mode = ChatAccess.NormalizeAdminMode(req.Mode);
                if (req.Mode is not ("AdminOnly" or "Everyone" or "Announcement"))
                    return TeachingAccess.Bad("وضع المحادثة غير صالح لهذه المجموعة.");
            }
            else if (conversation.Type is "GroupChat" or "TeacherGroup")
            {
                mode = ChatAccess.NormalizeGroupMode(req.Mode);
                if (req.Mode is not ("TeacherOnly" or "Everyone" or "Moderated"))
                    return TeachingAccess.Bad("وضع المحادثة غير صالح.");
            }
            else
            {
                return TeachingAccess.Bad("هذا النوع من المحادثات لا يدعم أوضاع الإرسال.");
            }

            var previous = conversation.ChatMode;
            conversation.ChatMode = mode;
            conversation.LastPolicyChangedAtUtc = DateTime.UtcNow;
            conversation.LastPolicyChangedByUserId = userId;
            TeachingNotify.ChatAudit(db, id, userId, "mode.changed", $"{previous} -> {mode}");
            if (conversation.Type == "AdminGroup")
            {
                var teachers = await db.Users.AsNoTracking()
                    .Where(x => x.Role == "Teacher" && x.EmailConfirmed).Select(x => x.Id).ToListAsync();
                await TeachingNotify.SendAsync(db, teachers, "Chat", "Messages",
                    "تم تغيير إعدادات مجموعة المدرسين", ModeLabel(mode), "chat", id);
            }
            else
            {
                var recipients = await ChatAccess.RecipientsAsync(db, conversation);
                recipients.Remove(userId.Value);
                await TeachingNotify.SendAsync(db, recipients, "Chat", "Messages",
                    "تم تغيير إعدادات المحادثة", ModeLabel(mode), "chat", id);
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, chatMode = mode });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/chat/conversations/{id:guid}/messages/{messageId:guid}/delete", async (Guid id, Guid messageId, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (userId, role, conversation, error) = await ResolveManageableAsync(db, id, p);
            if (error is not null) return error;
            var message = await db.ConversationMessages
                .FirstOrDefaultAsync(x => x.Id == messageId && x.ConversationId == id);
            if (message is null) return TeachingAccess.NotFound("الرسالة غير موجودة.");
            if (message.IsDeleted) return Results.Ok(new { ok = true });
            message.IsDeleted = true;
            message.DeletedAtUtc = DateTime.UtcNow;
            message.DeletedByUserId = userId;
            TeachingNotify.ChatAudit(db, id, userId, "message.deleted", messageId.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/chat/conversations/{id:guid}/messages/{messageId:guid}/pin", async (Guid id, Guid messageId, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (userId, role, conversation, error) = await ResolveManageableAsync(db, id, p);
            if (error is not null) return error;
            var message = await db.ConversationMessages
                .FirstOrDefaultAsync(x => x.Id == messageId && x.ConversationId == id && !x.IsDeleted);
            if (message is null) return TeachingAccess.NotFound("الرسالة غير موجودة.");
            message.IsPinned = !message.IsPinned;
            message.PinnedAtUtc = message.IsPinned ? DateTime.UtcNow : null;
            message.PinnedByUserId = message.IsPinned ? userId : null;
            TeachingNotify.ChatAudit(db, id, userId, message.IsPinned ? "message.pinned" : "message.unpinned", messageId.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, isPinned = message.IsPinned });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/chat/conversations/{id:guid}/pinned", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null) return Results.Unauthorized();
            var role = TeachingAccess.Role(p);
            var conversation = await db.Conversations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (conversation is null) return TeachingAccess.NotFound("المحادثة غير موجودة.");
            if (!await ChatAccess.CanAccessAsync(db, userId.Value, role, conversation)) return Results.Forbid();
            var rows = await db.ConversationMessages.AsNoTracking()
                .Where(x => x.ConversationId == id && x.IsPinned && !x.IsDeleted)
                .OrderByDescending(x => x.PinnedAtUtc).Take(50).ToListAsync();
            var senderIds = rows.Select(x => x.SenderId).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => senderIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName }).ToDictionaryAsync(x => x.Id, x => x.FullName);
            return Results.Ok(new
            {
                items = rows.Select(x => new
                {
                    x.Id, x.SenderId, SenderName = names.GetValueOrDefault(x.SenderId),
                    x.Body, x.AttachmentUrl, x.SentAtUtc, x.PinnedAtUtc
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/chat/conversations/{id:guid}/pending", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (userId, role, conversation, error) = await ResolveManageableAsync(db, id, p);
            if (error is not null) return error;
            var rows = await db.ConversationMessages.AsNoTracking()
                .Where(x => x.ConversationId == id && !x.IsApproved && !x.IsDeleted)
                .OrderBy(x => x.SentAtUtc).Take(200).ToListAsync();
            var senderIds = rows.Select(x => x.SenderId).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => senderIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName }).ToDictionaryAsync(x => x.Id, x => x.FullName);
            return Results.Ok(new
            {
                items = rows.Select(x => new
                {
                    x.Id, x.SenderId, SenderName = names.GetValueOrDefault(x.SenderId),
                    x.Body, x.AttachmentUrl, x.SentAtUtc
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/chat/conversations/{id:guid}/messages/{messageId:guid}/approve", async (Guid id, Guid messageId, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (userId, role, conversation, error) = await ResolveManageableAsync(db, id, p);
            if (error is not null) return error;
            var message = await db.ConversationMessages
                .FirstOrDefaultAsync(x => x.Id == messageId && x.ConversationId == id && !x.IsDeleted);
            if (message is null) return TeachingAccess.NotFound("الرسالة غير موجودة.");
            if (message.IsApproved) return Results.Ok(new { ok = true });
            message.IsApproved = true;
            message.ApprovedAtUtc = DateTime.UtcNow;
            message.ApprovedByUserId = userId;
            if (conversation.LastMessageAtUtc is null || message.SentAtUtc > conversation.LastMessageAtUtc)
            {
                conversation.LastMessageAtUtc = message.SentAtUtc;
                conversation.LastMessagePreview = message.Body.Length > 0
                    ? (message.Body.Length > 280 ? message.Body[..280] : message.Body)
                    : "📷 صورة";
            }
            TeachingNotify.ChatAudit(db, id, userId, "message.approved", messageId.ToString());
            var recipients = await ChatAccess.RecipientsAsync(db, conversation);
            recipients.Remove(message.SenderId);
            var title = conversation.Type switch
            {
                "AdminGroup" => "مجموعة المدرسين",
                "TeacherGroup" => "مجموعة طلاب المعلم",
                "GroupChat" => "مجموعة المجموعة الدراسية",
                "Direct" => "محادثة مباشرة",
                "AdminDirect" => "محادثة مع الإدارة",
                _ => "المحادثة"
            };
            await TeachingNotify.SendAsync(db, recipients, "Message", "Messages",
                "رسالة معتمدة في " + title, message.Body, "chat", id);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/chat/conversations/{id:guid}/messages/{messageId:guid}/reject", async (Guid id, Guid messageId, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (userId, role, conversation, error) = await ResolveManageableAsync(db, id, p);
            if (error is not null) return error;
            var message = await db.ConversationMessages
                .FirstOrDefaultAsync(x => x.Id == messageId && x.ConversationId == id && !x.IsDeleted);
            if (message is null) return TeachingAccess.NotFound("الرسالة غير موجودة.");
            message.IsDeleted = true;
            message.DeletedAtUtc = DateTime.UtcNow;
            message.DeletedByUserId = userId;
            TeachingNotify.ChatAudit(db, id, userId, "message.rejected", messageId.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/chat/conversations/{id:guid}/members/{memberId:guid}/mute", async (Guid id, Guid memberId, MuteInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (userId, role, conversation, error) = await ResolveManageableAsync(db, id, p);
            if (error is not null) return error;
            if (memberId == userId) return TeachingAccess.Bad("لا يمكنك كتم نفسك.");
            if (!await IsParticipantAsync(db, conversation, memberId))
                return TeachingAccess.Bad("العضو غير موجود في هذه المحادثة.");
            var state = await db.ConversationMemberStates
                .FirstOrDefaultAsync(x => x.ConversationId == id && x.UserId == memberId);
            if (state is null)
            {
                state = new ConversationMemberState { ConversationId = id, UserId = memberId };
                db.ConversationMemberStates.Add(state);
            }
            state.IsMuted = req.Muted;
            state.MutedUntilUtc = req.Muted && req.Minutes is > 0
                ? DateTime.UtcNow.AddMinutes(Math.Clamp(req.Minutes.Value, 1, 60 * 24 * 30))
                : null;
            state.MutedByUserId = req.Muted ? userId : null;
            state.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.ChatAudit(db, id, userId, req.Muted ? "member.muted" : "member.unmuted",
                $"{memberId} {(req.Muted ? $"until {state.MutedUntilUtc:O}" : "forever-removed")} {req.Reason}".Trim());
            if (req.Muted)
                await TeachingNotify.SendAsync(db, [memberId], "Chat", "Messages",
                    "تم كتمك في المحادثة", req.Reason ?? "لا يمكنك الإرسال حتى يتم رفع الكتم.", "chat", id);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, muted = state.IsMuted, mutedUntilUtc = state.MutedUntilUtc });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/chat/conversations/{id:guid}/search", async (Guid id, string? q, ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null) return Results.Unauthorized();
            var role = TeachingAccess.Role(p);
            var conversation = await db.Conversations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (conversation is null) return TeachingAccess.NotFound("المحادثة غير موجودة.");
            if (!await ChatAccess.CanAccessAsync(db, userId.Value, role, conversation)) return Results.Forbid();
            var term = (q ?? "").Trim();
            if (term.Length < 2) return TeachingAccess.Bad("اكتب حرفين على الأقل للبحث.");
            var staff = await ChatAccess.IsStaffAsync(db, userId.Value, role, conversation);
            var query = db.ConversationMessages.AsNoTracking()
                .Where(x => x.ConversationId == id && !x.IsDeleted && x.Body.Contains(term));
            if (!staff) query = query.Where(x => x.IsApproved);
            var rows = await query.OrderByDescending(x => x.SentAtUtc).Take(100).ToListAsync();
            var senderIds = rows.Select(x => x.SenderId).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => senderIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName }).ToDictionaryAsync(x => x.Id, x => x.FullName);
            return Results.Ok(new
            {
                items = rows.Select(x => new
                {
                    x.Id, x.SenderId, SenderName = names.GetValueOrDefault(x.SenderId),
                    x.Body, x.SentAtUtc, x.IsPinned
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/chat/conversations/{id:guid}/audit", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (userId, role, conversation, error) = await ResolveManageableAsync(db, id, p);
            if (error is not null) return error;
            var rows = await db.ChatAuditLogs.AsNoTracking()
                .Where(x => x.ConversationId == id)
                .OrderByDescending(x => x.CreatedAtUtc).Take(200).ToListAsync();
            var actorIds = rows.Where(x => x.ActorUserId != null)
                .Select(x => x.ActorUserId!.Value).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => actorIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName }).ToDictionaryAsync(x => x.Id, x => x.FullName);
            return Results.Ok(new
            {
                items = rows.Select(x => new
                {
                    x.Id, x.Action, x.Details, x.CreatedAtUtc,
                    ActorId = x.ActorUserId,
                    ActorName = x.ActorUserId is null ? "النظام" : names.GetValueOrDefault(x.ActorUserId.Value, "مستخدم")
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");
    }

    private static string ModeLabel(string mode) => mode switch
    {
        "TeacherOnly" => "أصبحت المحادثة للمعلم فقط",
        "Moderated" => "أصبحت رسائل الطلاب تحتاج موافقة المعلم",
        "AdminOnly" => "أصبحت المحادثة للإدارة فقط",
        "Announcement" => "أصبح وضع الإعلانات مفعّلاً",
        _ => "أصبحت المحادثة متاحة للجميع"
    };

    private static async Task<(Guid UserId, string Role, Conversation Conversation, IResult? Error)> ResolveManageableAsync(
        AppDbContext db, Guid id, ClaimsPrincipal p)
    {
        var userId = TeachingAccess.UserId(p);
        if (userId is null) return (Guid.Empty, "", new Conversation(), Results.Unauthorized());
        var role = TeachingAccess.Role(p);
        var conversation = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id);
        if (conversation is null) return (Guid.Empty, role, new Conversation(), TeachingAccess.NotFound("المحادثة غير موجودة."));
        if (!await CanManageAsync(db, userId.Value, role, conversation))
            return (Guid.Empty, role, conversation, TeachingAccess.Deny("لا تملك صلاحية إدارة هذه المحادثة."));
        return (userId.Value, role, conversation, null);
    }

    private static async Task<bool> CanManageAsync(AppDbContext db, Guid userId, string role, Conversation conversation)
    {
        if (role == "Admin") return conversation.Type is "AdminGroup" or "AdminDirect";
        if (role == "Teacher")
            return conversation.TeacherId == userId
                && conversation.Type is "GroupChat" or "TeacherGroup" or "Direct";
        if (role == "Assistant")
        {
            if (conversation.Type is not ("GroupChat" or "TeacherGroup")) return false;
            if (!await ChatAccess.IsAssistantLinkedAsync(db, userId, conversation.TeacherId)) return false;
            if (!await ChatAccess.AssistantHasChatPermissionAsync(db, userId, conversation.TeacherId)) return false;
            if (conversation.Type == "GroupChat" && conversation.GroupId is Guid groupId)
                return await ChatAccess.AssistantCanAccessGroupAsync(db, userId, conversation.TeacherId, groupId);
            return true;
        }
        return false;
    }

    private static async Task<bool> IsParticipantAsync(AppDbContext db, Conversation conversation, Guid memberId)
    {
        if (conversation.TeacherId == memberId && conversation.Type != "AdminGroup") return true;
        switch (conversation.Type)
        {
            case "TeacherGroup":
                return await db.TeacherStudentRequests.AsNoTracking().AnyAsync(x =>
                    x.TeacherId == conversation.TeacherId && x.StudentId == memberId
                    && x.Status == "Accepted" && x.UnlinkedAtUtc == null);
            case "GroupChat" when conversation.GroupId is Guid groupId:
                if (await db.GroupMemberships.AsNoTracking().AnyAsync(x =>
                        x.GroupId == groupId && x.StudentId == memberId && x.Status == "Active")) return true;
                return await db.TeachingAssistants.AsNoTracking().AnyAsync(x =>
                    x.AssistantId == memberId && x.TeacherId == conversation.TeacherId && x.Status == "Active");
            case "AdminGroup":
                return await db.Users.AsNoTracking().AnyAsync(x =>
                    x.Id == memberId && (x.Role == "Admin" || x.Role == "Teacher"));
            case "Direct":
                return conversation.StudentId == memberId || conversation.TeacherId == memberId;
            case "AdminDirect":
                return conversation.AdminId == memberId || conversation.TeacherId == memberId;
            default:
                return false;
        }
    }
}

public sealed record ChatModeInput(string Mode);
public sealed record MuteInput(bool Muted, int? Minutes, string? Reason);
