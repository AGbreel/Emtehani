using System.Security.Claims;
using System.Text.Json;
using Emtehani.Domain.Entities;
using Emtehani.Domain.Services;
using Emtehani.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Emtehani.API;

/// <summary>
/// Announcements for teachers (their own students/groups/courses) and for the
/// platform admin (all teachers or all students). Visibility is resolved on the
/// server from the audience + target ids, never from client supplied flags.
/// </summary>
public static class TeachingCommunicationEndpoints
{
    private static readonly string[] TeacherAudiences = ["Students", "Group", "Course", "Selected"];
    private static readonly string[] AdminAudiences = ["Platform", "Teachers", "Students"];

    public static void MapTeachingCommunicationEndpoints(this WebApplication app)
    {
        // ------------------------------ teacher ------------------------------
        app.MapGet("/api/teaching/announcements", async (
            string? audience, Guid? groupId, Guid? courseId, bool? published, int take, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AnnouncementsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            take = Math.Clamp(take == 0 ? 50 : take, 1, 100);
            var query = db.Announcements.AsNoTracking().Where(x => x.TeacherId == scope.TeacherId);
            if (!string.IsNullOrWhiteSpace(audience)) query = query.Where(x => x.Audience == audience);
            if (groupId is not null) query = query.Where(x => x.GroupId == groupId);
            if (courseId is not null) query = query.Where(x => x.CourseId == courseId);
            if (published is not null) query = query.Where(x => x.IsPublished == published);
            var items = await query.OrderByDescending(x => x.IsPinned).ThenByDescending(x => x.CreatedAtUtc)
                .Take(take).ToListAsync();
            return Results.Ok(new { items = items.Select(View) });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/announcements", async (
            AnnouncementInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AnnouncementsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var block = await TeachingBillingLimits.WriteBlockReasonAsync(db, scope.TeacherId);
            if (block is not null) return TeachingAccess.Bad(block);

            var parsed = await ValidateAsync(db, scope, req);
            if (parsed.Error is not null) return parsed.Error;
            var announcement = new Announcement
            {
                TeacherId = scope.TeacherId,
                Audience = parsed.Audience!,
                GroupId = parsed.GroupId,
                CourseId = parsed.CourseId,
                TargetStudentIdsJson = parsed.TargetStudentIdsJson,
                Title = parsed.Title!,
                Summary = parsed.Summary,
                Body = parsed.Body,
                ImageUrl = parsed.ImageUrl,
                IsPinned = req.IsPinned,
                IsPublished = req.IsPublished,
                PublishAtUtc = parsed.PublishAtUtc,
                ExpiresAtUtc = parsed.ExpiresAtUtc,
                CreatedByUserId = scope.UserId
            };
            db.Announcements.Add(announcement);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "announcement.created",
                "Announcement", announcement.Id.ToString(), announcement.Title);
            await db.SaveChangesAsync();
            await AnnouncementDelivery.DeliverForAsync(db, announcement);
            return Results.Ok(new { id = announcement.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/announcements/{id:guid}", async (
            Guid id, AnnouncementInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AnnouncementsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var announcement = await db.Announcements
                .FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (announcement is null) return TeachingAccess.NotFound("الإعلان غير موجود.");
            var block = await TeachingBillingLimits.WriteBlockReasonAsync(db, scope.TeacherId);
            if (block is not null) return TeachingAccess.Bad(block);

            var parsed = await ValidateAsync(db, scope, req);
            if (parsed.Error is not null) return parsed.Error;
            var wasDelivered = announcement.DeliveredAtUtc is not null;
            announcement.Audience = parsed.Audience!;
            announcement.GroupId = parsed.GroupId;
            announcement.CourseId = parsed.CourseId;
            announcement.TargetStudentIdsJson = parsed.TargetStudentIdsJson;
            announcement.Title = parsed.Title!;
            announcement.Summary = parsed.Summary;
            announcement.Body = parsed.Body;
            announcement.ImageUrl = parsed.ImageUrl;
            announcement.IsPinned = req.IsPinned;
            announcement.IsPublished = req.IsPublished;
            announcement.PublishAtUtc = parsed.PublishAtUtc;
            announcement.ExpiresAtUtc = parsed.ExpiresAtUtc;
            announcement.UpdatedAtUtc = DateTime.UtcNow;
            // Editing an already delivered announcement must never fan out again.
            if (!wasDelivered && announcement.IsPublished)
                announcement.DeliveredAtUtc = null;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "announcement.updated",
                "Announcement", announcement.Id.ToString(), announcement.Title);
            await db.SaveChangesAsync();
            await AnnouncementDelivery.DeliverForAsync(db, announcement);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/announcements/{id:guid}", async (
            Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AnnouncementsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var announcement = await db.Announcements
                .FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (announcement is null) return TeachingAccess.NotFound("الإعلان غير موجود.");
            db.Announcements.Remove(announcement);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "announcement.deleted",
                "Announcement", announcement.Id.ToString(), announcement.Title);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/announcements/{id:guid}/publish", async (
            Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AnnouncementsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var announcement = await db.Announcements
                .FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (announcement is null) return TeachingAccess.NotFound("الإعلان غير موجود.");
            announcement.IsPublished = true;
            announcement.PublishAtUtc = null;
            announcement.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "announcement.published",
                "Announcement", announcement.Id.ToString(), announcement.Title);
            await db.SaveChangesAsync();
            var delivered = await AnnouncementDelivery.DeliverForAsync(db, announcement);
            return Results.Ok(new { ok = true, delivered });
        }).RequireAuthorization().RequireRateLimiting("api");

        // ------------------------------ admin --------------------------------
        app.MapGet("/api/admin/announcements", async (
            string? audience, bool? published, int take, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return TeachingAccess.Deny("هذا الإجراء لإدارة المنصة فقط.");
            take = Math.Clamp(take == 0 ? 50 : take, 1, 100);
            var query = db.Announcements.AsNoTracking().Where(x => x.TeacherId == null);
            if (!string.IsNullOrWhiteSpace(audience)) query = query.Where(x => x.Audience == audience);
            if (published is not null) query = query.Where(x => x.IsPublished == published);
            var items = await query.OrderByDescending(x => x.IsPinned).ThenByDescending(x => x.CreatedAtUtc)
                .Take(take).ToListAsync();
            return Results.Ok(new { items = items.Select(View) });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/admin/announcements", async (
            AnnouncementInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return TeachingAccess.Deny("هذا الإجراء لإدارة المنصة فقط.");
            var parsed = ValidateAdmin(req);
            if (parsed.Error is not null) return parsed.Error;
            var userId = TeachingAccess.UserId(p);
            var announcement = new Announcement
            {
                TeacherId = null,
                Audience = parsed.Audience!,
                Title = parsed.Title!,
                Summary = parsed.Summary,
                Body = parsed.Body,
                ImageUrl = parsed.ImageUrl,
                IsPinned = req.IsPinned,
                IsPublished = req.IsPublished,
                PublishAtUtc = parsed.PublishAtUtc,
                ExpiresAtUtc = parsed.ExpiresAtUtc,
                CreatedByUserId = userId
            };
            db.Announcements.Add(announcement);
            await db.SaveChangesAsync();
            await AnnouncementDelivery.DeliverForAsync(db, announcement);
            return Results.Ok(new { id = announcement.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/admin/announcements/{id:guid}", async (
            Guid id, AnnouncementInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return TeachingAccess.Deny("هذا الإجراء لإدارة المنصة فقط.");
            var announcement = await db.Announcements.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == null);
            if (announcement is null) return TeachingAccess.NotFound("الإعلان غير موجود.");
            var parsed = ValidateAdmin(req);
            if (parsed.Error is not null) return parsed.Error;
            announcement.Audience = parsed.Audience!;
            announcement.Title = parsed.Title!;
            announcement.Summary = parsed.Summary;
            announcement.Body = parsed.Body;
            announcement.ImageUrl = parsed.ImageUrl;
            announcement.IsPinned = req.IsPinned;
            announcement.IsPublished = req.IsPublished;
            announcement.PublishAtUtc = parsed.PublishAtUtc;
            announcement.ExpiresAtUtc = parsed.ExpiresAtUtc;
            announcement.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await AnnouncementDelivery.DeliverForAsync(db, announcement);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/admin/announcements/{id:guid}", async (
            Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return TeachingAccess.Deny("هذا الإجراء لإدارة المنصة فقط.");
            var announcement = await db.Announcements.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == null);
            if (announcement is null) return TeachingAccess.NotFound("الإعلان غير موجود.");
            db.Announcements.Remove(announcement);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/admin/announcements/{id:guid}/publish", async (
            Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return TeachingAccess.Deny("هذا الإجراء لإدارة المنصة فقط.");
            var announcement = await db.Announcements.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == null);
            if (announcement is null) return TeachingAccess.NotFound("الإعلان غير موجود.");
            announcement.IsPublished = true;
            announcement.PublishAtUtc = null;
            announcement.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync();
            var delivered = await AnnouncementDelivery.DeliverForAsync(db, announcement);
            return Results.Ok(new { ok = true, delivered });
        }).RequireAuthorization().RequireRateLimiting("api");

        // ------------------------------ student ------------------------------
        app.MapGet("/api/teaching/my/announcements", async (
            int take, ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null || TeachingAccess.Role(p) != "Student")
                return TeachingAccess.Deny("هذا الإجراء للطلاب فقط.");
            take = Math.Clamp(take == 0 ? 50 : take, 1, 100);
            var teacherIds = await db.TeacherStudentRequests.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Accepted" && x.UnlinkedAtUtc == null)
                .Select(x => x.TeacherId).Distinct().ToListAsync();
            var groupIds = await db.GroupMemberships.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Active")
                .Select(x => x.GroupId).ToListAsync();
            var courseIds = await db.CourseEnrollments.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Active")
                .Select(x => x.CourseId).ToListAsync();
            var now = DateTime.UtcNow;
            var candidates = await db.Announcements.AsNoTracking()
                .Where(x => x.IsPublished
                    && (x.PublishAtUtc == null || x.PublishAtUtc <= now)
                    && (x.ExpiresAtUtc == null || x.ExpiresAtUtc > now))
                .Where(x => x.TeacherId == null || teacherIds.Contains(x.TeacherId.Value))
                .OrderByDescending(x => x.IsPinned).ThenByDescending(x => x.CreatedAtUtc)
                .Take(200).ToListAsync();
            var visible = candidates.Where(x => IsVisibleToStudent(x, userId.Value, groupIds, courseIds)).Take(take).ToList();
            return Results.Ok(new { items = visible.Select(View) });
        }).RequireAuthorization().RequireRateLimiting("api");
    }

    private static bool IsAdmin(ClaimsPrincipal p) => TeachingAccess.Role(p) == "Admin";

    private static bool IsVisibleToStudent(Announcement a, Guid studentId, List<Guid> groupIds, List<Guid> courseIds)
    {
        if (a.TeacherId is null)
            return a.Audience is "Platform" or "Students" or "All";
        return a.Audience switch
        {
            "Students" or "All" => true,
            "Group" => a.GroupId is Guid gid && groupIds.Contains(gid),
            "Course" => a.CourseId is Guid cid && courseIds.Contains(cid),
            "Selected" => AnnouncementDelivery.ParseIds(a.TargetStudentIdsJson).Contains(studentId),
            _ => false
        };
    }

    private static object View(Announcement a) => new
    {
        id = a.Id,
        teacherId = a.TeacherId,
        groupId = a.GroupId,
        courseId = a.CourseId,
        audience = a.Audience,
        title = a.Title,
        summary = a.Summary,
        body = a.Body,
        imageUrl = a.ImageUrl,
        isPublished = a.IsPublished,
        isPinned = a.IsPinned,
        publishAtUtc = a.PublishAtUtc,
        expiresAtUtc = a.ExpiresAtUtc,
        deliveredAtUtc = a.DeliveredAtUtc,
        createdAtUtc = a.CreatedAtUtc,
        updatedAtUtc = a.UpdatedAtUtc
    };

    private static async Task<(string? Audience, Guid? GroupId, Guid? CourseId, string? TargetStudentIdsJson,
        string? Title, string? Summary, string? Body, string? ImageUrl, DateTime? PublishAtUtc,
        DateTime? ExpiresAtUtc, IResult? Error)> ValidateAsync(AppDbContext db, TeachingScope scope, AnnouncementInput req)
    {
        var title = TeachingText.Safe(req.Title, 200);
        if (title.Length == 0) return Bad("عنوان الإعلان مطلوب.");
        var audience = TeacherAudiences.Contains(req.Audience) ? req.Audience! : "Students";
        Guid? groupId = null;
        Guid? courseId = null;
        string? targetJson = null;
        var now = DateTime.UtcNow;

        if (audience == "Group")
        {
            if (req.GroupId is not Guid gid) return Bad("اختر المجموعة المستهدفة.");
            var group = await TeachingAccess.GetGroupAsync(db, scope, gid);
            if (group is null) return Bad("المجموعة غير موجودة أو لا تملك صلاحية عليها.");
            groupId = gid;
        }
        else if (audience == "Course")
        {
            if (req.CourseId is not Guid cid) return Bad("اختر الكورس المستهدف.");
            var exists = await db.TeacherCourses.AsNoTracking()
                .AnyAsync(x => x.Id == cid && x.TeacherId == scope.TeacherId);
            if (!exists) return Bad("الكورس غير موجود.");
            courseId = cid;
        }
        else if (audience == "Selected")
        {
            var ids = (req.StudentIds ?? []).Where(x => x != Guid.Empty).Distinct().Take(500).ToList();
            if (ids.Count == 0) return Bad("اختر طالبًا واحدًا على الأقل.");
            var linked = await db.TeacherStudentRequests.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId && x.Status == "Accepted"
                    && x.UnlinkedAtUtc == null && ids.Contains(x.StudentId))
                .Select(x => x.StudentId).Distinct().ToListAsync();
            if (linked.Count != ids.Count) return Bad("بعض الطلاب المحددين غير مرتبطين بك.");
            targetJson = JsonSerializer.Serialize(linked);
        }

        var (summary, body, image, publishAt, expiresAt, error) = Common(req);
        if (error is not null) return (null, null, null, null, null, null, null, null, null, null, error);
        if (publishAt is not null && publishAt > now.AddYears(2))
            return (null, null, null, null, null, null, null, null, null, null, TeachingAccess.Bad("تاريخ النشر بعيد جدًا."));
        if (expiresAt is not null && (expiresAt <= now || (publishAt is not null && expiresAt <= publishAt)))
            return (null, null, null, null, null, null, null, null, null, null, TeachingAccess.Bad("تاريخ الانتهاء يجب أن يكون بعد النشر."));
        return (audience, groupId, courseId, targetJson, title, summary, body, image, publishAt, expiresAt, null);
    }

    private static (string? Audience, string? Title, string? Summary, string? Body, string? ImageUrl,
        DateTime? PublishAtUtc, DateTime? ExpiresAtUtc, IResult? Error) ValidateAdmin(AnnouncementInput req)
    {
        var title = TeachingText.Safe(req.Title, 200);
        if (title.Length == 0) return (null, null, null, null, null, null, null, TeachingAccess.Bad("عنوان الإعلان مطلوب."));
        var audience = AdminAudiences.Contains(req.Audience) ? req.Audience! : "Platform";
        var (summary, body, image, publishAt, expiresAt, error) = Common(req);
        if (error is not null) return (null, null, null, null, null, null, null, error);
        return (audience, title, summary, body, image, publishAt, expiresAt, null);
    }

    private static (string? Summary, string? Body, string? ImageUrl, DateTime? PublishAtUtc,
        DateTime? ExpiresAtUtc, IResult? Error) Common(AnnouncementInput req)
    {
        var summary = TeachingText.NullIfEmpty(TeachingText.Safe(req.Summary, 500));
        var body = TeachingText.NullIfEmpty(TeachingText.Safe(req.Body, 20000));
        var image = TeachingText.ImageUrl(req.ImageUrl);
        if (image == "invalid") return (null, null, null, null, null, TeachingAccess.Bad("رابط الصورة غير صالح."));
        return (summary, body, image, req.PublishAtUtc?.ToUniversalTime(), req.ExpiresAtUtc?.ToUniversalTime(), null);
    }

    private static (string?, Guid?, Guid?, string?, string?, string?, string?, string?, DateTime?, DateTime?, IResult?) Bad(string message) =>
        (null, null, null, null, null, null, null, null, null, null, TeachingAccess.Bad(message));
}

/// <summary>Fans an announcement out to its audience at most once.</summary>
public static class AnnouncementDelivery
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static DateTime _lastDueScanUtc = DateTime.MinValue;

    public static async Task<int> DeliverForAsync(AppDbContext db, Announcement announcement)
    {
        if (!announcement.IsPublished) return 0;
        if (announcement.DeliveredAtUtc is not null) return 0;
        var now = DateTime.UtcNow;
        if (announcement.PublishAtUtc is not null && announcement.PublishAtUtc > now) return 0;
        if (announcement.ExpiresAtUtc is not null && announcement.ExpiresAtUtc <= now) return 0;

        var recipients = await ResolveRecipientsAsync(db, announcement);
        if (announcement.CreatedByUserId is Guid creator) recipients.Remove(creator);
        var body = string.IsNullOrWhiteSpace(announcement.Summary)
            ? (announcement.Body ?? "")
            : announcement.Summary!;
        await TeachingNotify.SendAsync(db, recipients, "Announcement", "Announcements",
            announcement.Title, body, "announcements", null, announcement.Id);
        announcement.DeliveredAtUtc = now;
        await db.SaveChangesAsync();
        return recipients.Count;
    }

    /// <summary>Publishes any scheduled announcement whose time has arrived (throttled).</summary>
    public static async Task ScanDueAsync(AppDbContext db)
    {
        var now = DateTime.UtcNow;
        if (now - _lastDueScanUtc < TimeSpan.FromSeconds(30)) return;
        if (!await Gate.WaitAsync(0)) return;
        try
        {
            if (now - _lastDueScanUtc < TimeSpan.FromSeconds(30)) return;
            _lastDueScanUtc = now;
            var due = await db.Announcements
                .Where(x => x.IsPublished && x.DeliveredAtUtc == null
                    && (x.PublishAtUtc == null || x.PublishAtUtc <= now)
                    && (x.ExpiresAtUtc == null || x.ExpiresAtUtc > now))
                .OrderBy(x => x.CreatedAtUtc)
                .Take(25)
                .ToListAsync();
            foreach (var announcement in due)
                await DeliverForAsync(db, announcement);
        }
        finally
        {
            Gate.Release();
        }
    }

    public static async Task<List<Guid>> ResolveRecipientsAsync(AppDbContext db, Announcement announcement)
    {
        if (announcement.TeacherId is null || announcement.TeacherId == Guid.Empty)
        {
            var users = db.Users.AsNoTracking().Where(x => x.EmailConfirmed);
            return announcement.Audience switch
            {
                "Teachers" => await users.Where(x => x.Role == "Teacher").Select(x => x.Id).ToListAsync(),
                "Students" => await users.Where(x => x.Role == "Student").Select(x => x.Id).ToListAsync(),
                _ => await users.Where(x => x.Role == "Teacher" || x.Role == "Student")
                    .Select(x => x.Id).ToListAsync()
            };
        }

        var teacherId = announcement.TeacherId.Value;
        switch (announcement.Audience)
        {
            case "Group" when announcement.GroupId is Guid groupId:
                return await db.GroupMemberships.AsNoTracking()
                    .Where(x => x.GroupId == groupId && x.TeacherId == teacherId && x.Status == "Active")
                    .Select(x => x.StudentId).Distinct().ToListAsync();
            case "Course" when announcement.CourseId is Guid courseId:
                return await db.CourseEnrollments.AsNoTracking()
                    .Where(x => x.CourseId == courseId && x.TeacherId == teacherId && x.Status == "Active")
                    .Select(x => x.StudentId).Distinct().ToListAsync();
            case "Selected":
            {
                var ids = ParseIds(announcement.TargetStudentIdsJson);
                if (ids.Count == 0) return [];
                return await db.TeacherStudentRequests.AsNoTracking()
                    .Where(x => x.TeacherId == teacherId && x.Status == "Accepted"
                        && x.UnlinkedAtUtc == null && ids.Contains(x.StudentId))
                    .Select(x => x.StudentId).Distinct().ToListAsync();
            }
            default:
                return await TeachingAccess.LinkedStudentIds(db, teacherId).Distinct().ToListAsync();
        }
    }

    public static List<Guid> ParseIds(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return (JsonSerializer.Deserialize<List<Guid>>(json) ?? [])
                .Where(x => x != Guid.Empty).Distinct().ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }
}

public sealed record AnnouncementInput(
    string Title,
    string? Summary = null,
    string? Body = null,
    string? ImageUrl = null,
    string? Audience = null,
    Guid? GroupId = null,
    Guid? CourseId = null,
    Guid[]? StudentIds = null,
    bool IsPinned = false,
    bool IsPublished = true,
    DateTime? PublishAtUtc = null,
    DateTime? ExpiresAtUtc = null);
