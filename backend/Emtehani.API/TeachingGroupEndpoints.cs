using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Emtehani.Domain.Entities;
using Emtehani.Domain.Services;
using Emtehani.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Emtehani.API;

/// <summary>
/// Groups, schedules, sessions, attendance (manual + QR) and homework.
/// All tenant-owned rows are filtered by TeacherId derived from the caller.
/// </summary>
public static class TeachingGroupEndpoints
{
    public static void MapTeachingGroupEndpoints(this WebApplication app)
    {
        // -------------------------------- groups --------------------------------
        app.MapGet("/api/teaching/groups", async (string? q, string? stage, bool? active, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.GroupsView))
                return TeachingAccess.Deny("ليس لديك صلاحية لعرض المجموعات.");

            var query = db.TeachingGroups.AsNoTracking().Where(x => x.TeacherId == scope.TeacherId);
            if (!scope.IsOwner && scope.GroupIds.Count > 0)
                query = query.Where(x => scope.GroupIds.Contains(x.Id));
            if (!string.IsNullOrWhiteSpace(stage)) query = query.Where(x => x.Stage == stage);
            if (active.HasValue) query = query.Where(x => x.IsActive == active.Value);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                query = query.Where(x => x.Name.Contains(term) || (x.Subject != null && x.Subject.Contains(term)));
            }

            var groups = await query.OrderByDescending(x => x.IsActive).ThenBy(x => x.Name)
                .Select(x => new
                {
                    x.Id,
                    x.Name,
                    x.Subject,
                    x.Stage,
                    x.Grade,
                    x.DeliveryMode,
                    x.Capacity,
                    x.Price,
                    x.PaymentType,
                    x.IsActive,
                    x.EnrollmentOpen,
                    x.ChatMode,
                    x.StartDateUtc,
                    MemberCount = x.Memberships.Count(m => m.Status == "Active"),
                    SessionCount = x.Sessions.Count()
                })
                .ToListAsync();

            var ids = groups.Select(x => x.Id).ToHashSet();
            var nextByGroup = await db.GroupSessions.AsNoTracking()
                .Where(x => ids.Contains(x.GroupId) && x.Status != "Cancelled" && x.EndsAtUtc >= DateTime.UtcNow)
                .OrderBy(x => x.StartsAtUtc)
                .ToListAsync();
            var nextMap = nextByGroup.GroupBy(x => x.GroupId)
                .ToDictionary(g => g.Key, g => g.First());

            return Results.Ok(new
            {
                items = groups.Select(g =>
                {
                    nextMap.TryGetValue(g.Id, out var next);
                    return new
                    {
                        g.Id, g.Name, g.Subject, g.Stage, g.Grade, g.DeliveryMode, g.Capacity,
                        g.Price, g.PaymentType, g.IsActive, g.EnrollmentOpen, g.ChatMode,
                        g.StartDateUtc, g.MemberCount, g.SessionCount,
                        NextSessionAtUtc = next?.StartsAtUtc,
                        NextSessionTitle = next?.Title
                    };
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/groups", async (GroupInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.GroupsCreate);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            if (string.IsNullOrWhiteSpace(req.Name)) return TeachingAccess.Bad("اسم المجموعة مطلوب.");
            if (string.IsNullOrWhiteSpace(req.Subject)) return TeachingAccess.Bad("المادة مطلوبة.");
            if (!new[] { "Online", "Offline", "Hybrid" }.Contains(req.DeliveryMode))
                return TeachingAccess.Bad("نوع المجموعة غير صالح.");
            if (!new[] { "Monthly", "PerSession" }.Contains(req.PaymentType))
                return TeachingAccess.Bad("نوع الدفع غير صالح.");

            var block = await TeachingBillingLimits.WriteBlockReasonAsync(db, scope!.TeacherId);
            if (block is not null) return TeachingAccess.Bad(block);
            var (_, plan) = await TeachingBillingLimits.CurrentAsync(db, scope.TeacherId);
            if (plan is not null)
            {
                var count = await db.TeachingGroups.CountAsync(x => x.TeacherId == scope.TeacherId && x.IsActive);
                var limit = TeachingBillingLimits.LimitReason(plan, "المجموعات", plan.MaxGroups, count);
                if (limit is not null) return TeachingAccess.Bad(limit);
            }

            var group = new TeachingGroup
            {
                TeacherId = scope.TeacherId,
                Name = TeachingText.Safe(req.Name, 150),
                Description = TeachingText.NullIfEmpty(req.Description),
                Subject = TeachingText.Safe(req.Subject, 100),
                Stage = TeachingText.NullIfEmpty(req.Stage),
                Grade = TeachingText.NullIfEmpty(req.Grade),
                AcademicYear = TeachingText.NullIfEmpty(req.AcademicYear),
                DeliveryMode = req.DeliveryMode,
                Capacity = req.Capacity is > 0 and <= 500 ? req.Capacity : 20,
                Location = TeachingText.NullIfEmpty(req.Location),
                OnlineLink = TeachingText.NullIfEmpty(req.OnlineLink),
                Price = Math.Max(0, req.Price),
                PaymentType = req.PaymentType,
                MonthlyDueDay = Math.Clamp(req.MonthlyDueDay, 1, 28),
                SessionBillingPolicy = req.SessionBillingPolicy == "PerScheduledSession" ? "PerScheduledSession" : "PerAttendedSession",
                StartDateUtc = req.StartDate ?? DateTime.UtcNow.Date,
                EndDateUtc = req.EndDate,
                EnrollmentOpen = req.EnrollmentOpen,
                LateGraceMinutes = Math.Clamp(req.LateGraceMinutes, 0, 120),
                QrValidityMinutes = Math.Clamp(req.QrValidityMinutes, 1, 30),
                ChatMode = NormalizeChatMode(req.ChatMode)
            };
            db.TeachingGroups.Add(group);
            await GroupChats.EnsureAsync(db, group, scope.UserId);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "group.created", "TeachingGroup", group.Id.ToString(), group.Name);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = group.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/groups/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.GroupsView))
                return TeachingAccess.Deny("ليس لديك صلاحية لعرض المجموعات.");
            var group = await TeachingAccess.GetGroupAsync(db, scope, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");

            var members = await db.GroupMemberships.AsNoTracking()
                .Where(x => x.GroupId == id && x.Status != "Left")
                .Join(db.Users.AsNoTracking(), m => m.StudentId, u => u.Id,
                    (m, u) => new
                    {
                        m.Id, m.StudentId, Name = u.FullName, u.StudentCode, u.StudentPhone, u.ParentPhone,
                        m.Status, m.JoinedAtUtc, m.SuspendedAtUtc, m.Note
                    })
                .OrderBy(x => x.Name)
                .ToListAsync();
            var schedules = await db.GroupSchedules.AsNoTracking()
                .Where(x => x.GroupId == id)
                .OrderBy(x => x.DayOfWeek).ThenBy(x => x.StartTime)
                .ToListAsync();
            var sessions = await db.GroupSessions.AsNoTracking()
                .Where(x => x.GroupId == id && x.StartsAtUtc >= DateTime.UtcNow.AddDays(-14))
                .OrderBy(x => x.StartsAtUtc)
                .Take(60)
                .ToListAsync();
            var courses = await db.GroupCourses.AsNoTracking()
                .Where(x => x.GroupId == id)
                .Join(db.TeacherCourses.AsNoTracking(), gc => gc.CourseId, c => c.Id,
                    (gc, c) => new { c.Id, c.Title, c.CoverUrl, c.IsPublished })
                .ToListAsync();

            var chat = await db.Conversations.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Type == "GroupChat" && x.GroupId == id);

            return Results.Ok(new
            {
                group.Id, group.TeacherId, group.Name, group.Description, group.Subject, group.Stage,
                group.Grade, group.AcademicYear, group.DeliveryMode, group.Capacity, group.Location,
                group.OnlineLink, group.Price, group.PaymentType, group.MonthlyDueDay,
                group.SessionBillingPolicy, group.StartDateUtc, group.EndDateUtc, group.EnrollmentOpen,
                group.IsActive, group.LateGraceMinutes, group.QrValidityMinutes, group.ChatMode,
                Members = members,
                Schedules = schedules.Select(s => SessionView(s, DateTime.UtcNow)),
                Sessions = sessions.Select(s => SessionView(s, DateTime.UtcNow)),
                Courses = courses,
                ChatConversationId = chat?.Id
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/groups/{id:guid}", async (Guid id, GroupInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.GroupsUpdate);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope!, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            if (string.IsNullOrWhiteSpace(req.Name)) return TeachingAccess.Bad("اسم المجموعة مطلوب.");
            if (!new[] { "Online", "Offline", "Hybrid" }.Contains(req.DeliveryMode))
                return TeachingAccess.Bad("نوع المجموعة غير صالح.");
            if (!new[] { "Monthly", "PerSession" }.Contains(req.PaymentType))
                return TeachingAccess.Bad("نوع الدفع غير صالح.");

            group.Name = TeachingText.Safe(req.Name, 150);
            group.Description = TeachingText.NullIfEmpty(req.Description);
            group.Subject = TeachingText.Safe(req.Subject, 100);
            group.Stage = TeachingText.NullIfEmpty(req.Stage);
            group.Grade = TeachingText.NullIfEmpty(req.Grade);
            group.AcademicYear = TeachingText.NullIfEmpty(req.AcademicYear);
            group.DeliveryMode = req.DeliveryMode;
            group.Capacity = req.Capacity is > 0 and <= 500 ? req.Capacity : group.Capacity;
            group.Location = TeachingText.NullIfEmpty(req.Location);
            group.OnlineLink = TeachingText.NullIfEmpty(req.OnlineLink);
            group.Price = Math.Max(0, req.Price);
            group.PaymentType = req.PaymentType;
            group.MonthlyDueDay = Math.Clamp(req.MonthlyDueDay, 1, 28);
            group.SessionBillingPolicy = req.SessionBillingPolicy == "PerScheduledSession" ? "PerScheduledSession" : "PerAttendedSession";
            group.StartDateUtc = req.StartDate ?? group.StartDateUtc;
            group.EndDateUtc = req.EndDate;
            group.EnrollmentOpen = req.EnrollmentOpen;
            group.IsActive = req.IsActive;
            group.LateGraceMinutes = Math.Clamp(req.LateGraceMinutes, 0, 120);
            group.QrValidityMinutes = Math.Clamp(req.QrValidityMinutes, 1, 30);
            var newMode = NormalizeChatMode(req.ChatMode);
            if (newMode != group.ChatMode)
            {
                group.ChatMode = newMode;
                var chat = await GroupChats.EnsureAsync(db, group, scope.UserId);
                chat.ChatMode = newMode;
                chat.LastPolicyChangedAtUtc = DateTime.UtcNow;
                chat.LastPolicyChangedByUserId = scope.UserId;
                TeachingNotify.ChatAudit(db, chat.Id, scope.UserId, "mode.changed", newMode);
            }
            group.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "group.updated", "TeachingGroup", group.Id.ToString(), group.Name);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/groups/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.GroupsDelete);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope!, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            // Soft stop: data and history are preserved.
            group.IsActive = false;
            group.EnrollmentOpen = false;
            group.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "group.archived", "TeachingGroup", group.Id.ToString(), group.Name);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        // group ↔ course links
        app.MapPost("/api/teaching/groups/{id:guid}/courses", async (Guid id, GroupCourseInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.GroupsUpdate);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope!, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            var course = await db.TeacherCourses.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == req.CourseId && x.TeacherId == scope.TeacherId);
            if (course is null) return TeachingAccess.NotFound("الكورس غير موجود.");
            if (await db.GroupCourses.AnyAsync(x => x.GroupId == id && x.CourseId == req.CourseId))
                return Results.Ok(new { ok = true });
            db.GroupCourses.Add(new GroupCourse { TeacherId = scope.TeacherId, GroupId = id, CourseId = req.CourseId });
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "group.course.linked", "TeachingGroup", id.ToString(), course.Title);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/groups/{id:guid}/courses/{courseId:guid}", async (Guid id, Guid courseId, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.GroupsUpdate);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope!, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            var link = await db.GroupCourses.FirstOrDefaultAsync(x => x.GroupId == id && x.CourseId == courseId && x.TeacherId == scope.TeacherId);
            if (link is null) return TeachingAccess.NotFound();
            db.GroupCourses.Remove(link);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "group.course.unlinked", "TeachingGroup", id.ToString(), courseId.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        // ------------------------------ members ---------------------------------
        app.MapGet("/api/teaching/groups/{id:guid}/members", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.GroupsView))
                return TeachingAccess.Deny("ليس لديك صلاحية لعرض المجموعات.");
            var group = await TeachingAccess.GetGroupAsync(db, scope, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            var items = await db.GroupMemberships.AsNoTracking()
                .Where(x => x.GroupId == id && x.Status != "Left")
                .Join(db.Users.AsNoTracking(), m => m.StudentId, u => u.Id,
                    (m, u) => new
                    {
                        m.Id, m.StudentId, Name = u.FullName, u.StudentCode, u.Email,
                        u.StudentPhone, u.ParentPhone, u.ParentName, m.Status,
                        m.JoinedAtUtc, m.SuspendedAtUtc, m.Note
                    })
                .OrderBy(x => x.Name)
                .ToListAsync();
            return Results.Ok(new { items });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/groups/{id:guid}/members", async (Guid id, MemberInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.GroupsUpdate);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope!, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            var student = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == req.StudentId && x.Role == "Student");
            if (student is null) return TeachingAccess.NotFound("الطالب غير موجود.");
            if (!await TeachingAccess.IsLinkedStudentAsync(db, scope.TeacherId, student.Id))
                return TeachingAccess.Bad("الطالب غير مرتبط بحسابك. أرسل طلب ربط أو دعوة أولاً.");
            var active = await db.GroupMemberships.CountAsync(x => x.GroupId == id && x.Status == "Active");
            if (group.Capacity > 0 && active >= group.Capacity)
                return TeachingAccess.Bad("المجموعة وصلت للحد الأقصى من الأعضاء.");
            var membership = await db.GroupMemberships.FirstOrDefaultAsync(x => x.GroupId == id && x.StudentId == student.Id);
            if (membership is null)
            {
                membership = new GroupMembership { TeacherId = scope.TeacherId, GroupId = id, StudentId = student.Id };
                db.GroupMemberships.Add(membership);
            }
            membership.Status = "Active";
            membership.SuspendedAtUtc = null;
            membership.Note = TeachingText.NullIfEmpty(req.Note);
            membership.UpdatedAtUtc = DateTime.UtcNow;
            await TeachingNotify.SendAsync(db, [student.Id], "Group", "System", "تم إضافتك لمجموعة", group.Name, "groups");
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "group.member.added", "GroupMembership", membership.Id.ToString(), student.FullName);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = membership.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/groups/{id:guid}/members/{studentId:guid}", async (Guid id, Guid studentId, MemberUpdateInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.GroupsUpdate);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope!, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            var membership = await db.GroupMemberships.FirstOrDefaultAsync(x => x.GroupId == id && x.StudentId == studentId && x.TeacherId == scope.TeacherId);
            if (membership is null) return TeachingAccess.NotFound("العضوية غير موجودة.");
            if (!new[] { "Active", "Suspended", "Left" }.Contains(req.Status))
                return TeachingAccess.Bad("حالة العضوية غير صالحة.");
            var previous = membership.Status;
            membership.Status = req.Status;
            membership.SuspendedAtUtc = req.Status == "Suspended" ? DateTime.UtcNow : null;
            membership.Note = TeachingText.NullIfEmpty(req.Note);
            membership.UpdatedAtUtc = DateTime.UtcNow;
            if (req.Status == "Active" && previous != "Active")
            {
                await TeachingNotify.SendAsync(db, [studentId], "Group", "System",
                    previous == "Pending" ? "تم قبول انضمامك للمجموعة" : "تم تفعيل عضويتك في المجموعة",
                    group.Name, "groups");
            }
            else if (req.Status == "Left" && previous == "Pending")
            {
                await TeachingNotify.SendAsync(db, [studentId], "Group", "System",
                    "لم يتم قبول طلب الانضمام", group.Name, "groups");
            }
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "group.member." + req.Status.ToLowerInvariant(), "GroupMembership", membership.Id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/groups/{id:guid}/members/{studentId:guid}", async (Guid id, Guid studentId, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.GroupsUpdate);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope!, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            var membership = await db.GroupMemberships.FirstOrDefaultAsync(x => x.GroupId == id && x.StudentId == studentId && x.TeacherId == scope.TeacherId);
            if (membership is null) return TeachingAccess.NotFound("العضوية غير موجودة.");
            membership.Status = "Left";
            membership.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "group.member.removed", "GroupMembership", membership.Id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        // ------------------------------ schedules -------------------------------
        app.MapGet("/api/teaching/groups/{id:guid}/schedules", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.GroupsView))
                return TeachingAccess.Deny("ليس لديك صلاحية لعرض المجموعات.");
            var group = await TeachingAccess.GetGroupAsync(db, scope, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            var items = await db.GroupSchedules.AsNoTracking().Where(x => x.GroupId == id)
                .OrderBy(x => x.DayOfWeek).ThenBy(x => x.StartTime).ToListAsync();
            return Results.Ok(new { items = items.Select(s => SessionView(s, DateTime.UtcNow)) });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/groups/{id:guid}/schedules", async (Guid id, ScheduleInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.SessionsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope!, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            if (req.DayOfWeek is < 0 or > 6) return TeachingAccess.Bad("يوم الأسبوع غير صالح.");
            if (!TryParseTime(req.StartTime, out var start) || !TryParseTime(req.EndTime, out var end))
                return TeachingAccess.Bad("وقت البداية والنهاية مطلوبان بصيغة HH:mm.");
            if (end <= start) return TeachingAccess.Bad("وقت النهاية يجب أن يكون بعد البداية.");
            var schedule = new GroupSchedule
            {
                TeacherId = scope.TeacherId, GroupId = id, DayOfWeek = req.DayOfWeek,
                StartTime = start, EndTime = end, Location = TeachingText.NullIfEmpty(req.Location),
                IsActive = req.IsActive
            };
            db.GroupSchedules.Add(schedule);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "schedule.created", "GroupSchedule", schedule.Id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { id = schedule.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/schedules/{id:guid}", async (Guid id, ScheduleInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.SessionsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var schedule = await db.GroupSchedules.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (schedule is null) return TeachingAccess.NotFound("الموعد غير موجود.");
            if (!scope!.CanAccessGroup(schedule.GroupId)) return TeachingAccess.Deny();
            if (req.DayOfWeek is < 0 or > 6) return TeachingAccess.Bad("يوم الأسبوع غير صالح.");
            if (!TryParseTime(req.StartTime, out var start) || !TryParseTime(req.EndTime, out var end) || end <= start)
                return TeachingAccess.Bad("أوقات الموعد غير صالحة.");
            schedule.DayOfWeek = req.DayOfWeek;
            schedule.StartTime = start;
            schedule.EndTime = end;
            schedule.Location = TeachingText.NullIfEmpty(req.Location);
            schedule.IsActive = req.IsActive;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "schedule.updated", "GroupSchedule", id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/schedules/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.SessionsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var schedule = await db.GroupSchedules.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (schedule is null) return TeachingAccess.NotFound("الموعد غير موجود.");
            if (!scope!.CanAccessGroup(schedule.GroupId)) return TeachingAccess.Deny();
            db.GroupSchedules.Remove(schedule);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "schedule.deleted", "GroupSchedule", id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        // ------------------------------- sessions -------------------------------
        app.MapGet("/api/teaching/sessions", async (Guid? groupId, DateTime? from, DateTime? to, string? status, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.SessionsView))
                return TeachingAccess.Deny("ليس لديك صلاحية لعرض الحصص.");
            var query = db.GroupSessions.AsNoTracking().Where(x => x.TeacherId == scope.TeacherId);
            if (groupId.HasValue)
            {
                if (!scope.CanAccessGroup(groupId.Value)) return TeachingAccess.Deny();
                query = query.Where(x => x.GroupId == groupId.Value);
            }
            else if (!scope.IsOwner && scope.GroupIds.Count > 0)
            {
                query = query.Where(x => scope.GroupIds.Contains(x.GroupId));
            }
            var start = from ?? DateTime.UtcNow.Date.AddDays(-7);
            var end = to ?? DateTime.UtcNow.Date.AddDays(30);
            query = query.Where(x => x.EndsAtUtc >= start && x.StartsAtUtc <= end);

            var rows = await query.OrderBy(x => x.StartsAtUtc).Take(500).ToListAsync();
            var groupIds = rows.Select(x => x.GroupId).Distinct().ToList();
            var groupNames = await db.TeachingGroups.AsNoTracking()
                .Where(g => groupIds.Contains(g.Id))
                .ToDictionaryAsync(g => g.Id, g => g.Name);
            var now = DateTime.UtcNow;
            var items = rows.Select(s =>
            {
                var view = SessionView(s, now);
                groupNames.TryGetValue(s.GroupId, out var name);
                return new
                {
                    s.Id, s.GroupId, GroupName = name, s.Title, s.DeliveryMode, s.Location, s.OnlineLink,
                    view.StartsAtUtc, view.EndsAtUtc, view.Status, view.DisplayStatus, s.Notes,
                    s.CancellationReason, s.AttendanceOpenedAtUtc, s.AttendanceClosedAtUtc
                };
            });
            if (!string.IsNullOrWhiteSpace(status))
                items = items.Where(x => string.Equals(x.Status, status, StringComparison.OrdinalIgnoreCase));
            return Results.Ok(new { items = items.ToList() });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/groups/{id:guid}/sessions", async (Guid id, SessionInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.SessionsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope!, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            var result = BuildTimes(req.Date, req.StartTime, req.EndTime);
            if (result.Error is not null) return TeachingAccess.Bad(result.Error);

            var session = new GroupSession
            {
                TeacherId = scope.TeacherId,
                GroupId = id,
                Title = TeachingText.Safe(string.IsNullOrWhiteSpace(req.Title) ? group.Name : req.Title, 150),
                DeliveryMode = string.IsNullOrWhiteSpace(req.DeliveryMode) ? group.DeliveryMode : req.DeliveryMode,
                ScheduledDateUtc = result.Date,
                StartTime = result.Start,
                EndTime = result.End,
                StartsAtUtc = result.StartsAtUtc,
                EndsAtUtc = result.EndsAtUtc,
                Location = TeachingText.NullIfEmpty(req.Location) ?? group.Location,
                OnlineLink = TeachingText.NullIfEmpty(req.OnlineLink) ?? group.OnlineLink,
                Notes = TeachingText.NullIfEmpty(req.Notes)
            };
            db.GroupSessions.Add(session);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "session.created", "GroupSession", session.Id.ToString(), session.Title);
            await db.SaveChangesAsync();

            var studentIds = await ActiveMemberIdsAsync(db, id);
            await TeachingNotify.SendAsync(db, studentIds, "Session", "Sessions",
                "حصة جديدة: " + group.Name, session.StartsAtUtc.ToString("dd/MM/yyyy HH:mm"), "sessions");
            await db.SaveChangesAsync();
            return Results.Ok(new { id = session.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/groups/{id:guid}/sessions/generate", async (Guid id, GenerateSessionsInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.SessionsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope!, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            var from = (req.FromDate ?? DateTime.UtcNow.Date).Date;
            var to = (req.ToDate ?? from.AddDays(28)).Date;
            if (to < from) return TeachingAccess.Bad("نطاق التاريخ غير صالح.");
            if ((to - from).TotalDays > 180) return TeachingAccess.Bad("الحد الأقصى لتوليد الحصص 180 يوماً.");

            var schedules = await db.GroupSchedules.AsNoTracking()
                .Where(x => x.GroupId == id && x.IsActive).ToListAsync();
            if (schedules.Count == 0) return TeachingAccess.Bad("لا توجد مواعيد أسبوعية لتوليد الحصص.");

            var existing = await db.GroupSessions.AsNoTracking()
                .Where(x => x.GroupId == id && x.ScheduledDateUtc >= from && x.ScheduledDateUtc <= to)
                .Select(x => new { x.ScheduledDateUtc, x.StartTime })
                .ToListAsync();
            var seen = existing.Select(x => (x.ScheduledDateUtc.Date, x.StartTime)).ToHashSet();

            var created = 0;
            for (var date = from; date <= to; date = date.AddDays(1))
            {
                foreach (var schedule in schedules.Where(s => (int)date.DayOfWeek == s.DayOfWeek))
                {
                    if (!seen.Add((date, schedule.StartTime))) continue;
                    var start = date.Add(schedule.StartTime);
                    var end = date.Add(schedule.EndTime);
                    if (end <= start) end = end.AddDays(1);
                    db.GroupSessions.Add(new GroupSession
                    {
                        TeacherId = scope.TeacherId,
                        GroupId = id,
                        ScheduleId = schedule.Id,
                        Title = group.Name,
                        DeliveryMode = group.DeliveryMode,
                        ScheduledDateUtc = date,
                        StartTime = schedule.StartTime,
                        EndTime = schedule.EndTime,
                        StartsAtUtc = start,
                        EndsAtUtc = end,
                        Location = schedule.Location ?? group.Location,
                        OnlineLink = group.OnlineLink
                    });
                    created++;
                }
            }
            if (created > 0)
                TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "session.generated", "TeachingGroup", id.ToString(), $"{created} sessions");
            await db.SaveChangesAsync();
            return Results.Ok(new { created });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/sessions/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.SessionsView)) return TeachingAccess.Deny();
            var session = await db.GroupSessions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (session is null) return TeachingAccess.NotFound("الحصة غير موجودة.");
            if (!scope.CanAccessGroup(session.GroupId)) return TeachingAccess.Deny();
            var group = await db.TeachingGroups.AsNoTracking().FirstOrDefaultAsync(x => x.Id == session.GroupId);
            var attendance = await db.SessionAttendances.AsNoTracking().Where(x => x.SessionId == id).ToListAsync();
            return Results.Ok(new
            {
                session = SessionView(session, DateTime.UtcNow),
                Group = group is null ? null : new { group.Id, group.Name, group.Subject, group.Stage, group.Grade, group.LateGraceMinutes },
                Attendance = attendance.Select(a => new { a.StudentId, a.Status, a.CheckInAtUtc, a.Method, a.Note, a.UpdatedAtUtc })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/sessions/{id:guid}", async (Guid id, SessionInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.SessionsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var session = await db.GroupSessions.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (session is null) return TeachingAccess.NotFound("الحصة غير موجودة.");
            if (!scope!.CanAccessGroup(session.GroupId)) return TeachingAccess.Deny();
            if (session.Status == "Cancelled") return TeachingAccess.Bad("لا يمكن تعديل حصة ملغاة.");
            var result = BuildTimes(req.Date ?? session.ScheduledDateUtc, req.StartTime ?? session.StartTime.ToString(@"hh\:mm"), req.EndTime ?? session.EndTime.ToString(@"hh\:mm"));
            if (result.Error is not null) return TeachingAccess.Bad(result.Error);
            session.ScheduledDateUtc = result.Date;
            session.StartTime = result.Start;
            session.EndTime = result.End;
            session.StartsAtUtc = result.StartsAtUtc;
            session.EndsAtUtc = result.EndsAtUtc;
            if (!string.IsNullOrWhiteSpace(req.Title)) session.Title = TeachingText.Safe(req.Title, 150);
            if (!string.IsNullOrWhiteSpace(req.DeliveryMode)) session.DeliveryMode = req.DeliveryMode;
            session.Location = TeachingText.NullIfEmpty(req.Location) ?? session.Location;
            session.OnlineLink = TeachingText.NullIfEmpty(req.OnlineLink) ?? session.OnlineLink;
            session.Notes = TeachingText.NullIfEmpty(req.Notes);
            session.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "session.updated", "GroupSession", id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/sessions/{id:guid}/reschedule", async (Guid id, RescheduleInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.SessionsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var session = await db.GroupSessions.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (session is null) return TeachingAccess.NotFound("الحصة غير موجودة.");
            if (!scope!.CanAccessGroup(session.GroupId)) return TeachingAccess.Deny();
            if (session.Status == "Cancelled") return TeachingAccess.Bad("لا يمكن إعادة جدولة حصة ملغاة.");
            var result = BuildTimes(req.Date, req.StartTime, req.EndTime);
            if (result.Error is not null) return TeachingAccess.Bad(result.Error);

            var old = $"{session.StartsAtUtc:O}";
            session.ScheduledDateUtc = result.Date;
            session.StartTime = result.Start;
            session.EndTime = result.End;
            session.StartsAtUtc = result.StartsAtUtc;
            session.EndsAtUtc = result.EndsAtUtc;
            session.Notes = string.IsNullOrWhiteSpace(req.Reason) ? session.Notes : TeachingText.Safe("إعادة جدولة: " + req.Reason, 500);
            session.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "session.rescheduled", "GroupSession", id.ToString(), $"{old} -> {session.StartsAtUtc:O}");
            await db.SaveChangesAsync();
            var studentIds = await ActiveMemberIdsAsync(db, session.GroupId);
            await TeachingNotify.SendAsync(db, studentIds, "Session", "Sessions",
                "تم تغيير موعد الحصة", session.StartsAtUtc.ToString("dd/MM/yyyy HH:mm"), "sessions");
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/sessions/{id:guid}/cancel", async (Guid id, CancelInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.SessionsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var session = await db.GroupSessions.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (session is null) return TeachingAccess.NotFound("الحصة غير موجودة.");
            if (!scope!.CanAccessGroup(session.GroupId)) return TeachingAccess.Deny();
            session.Status = "Cancelled";
            session.CancellationReason = TeachingText.NullIfEmpty(req.Reason);
            session.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "session.cancelled", "GroupSession", id.ToString(), session.CancellationReason);
            await db.SaveChangesAsync();
            var studentIds = await ActiveMemberIdsAsync(db, session.GroupId);
            await TeachingNotify.SendAsync(db, studentIds, "Session", "Sessions", "تم إلغاء حصة", session.CancellationReason ?? session.Title, "sessions");
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/sessions/{id:guid}/start", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.SessionsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var session = await db.GroupSessions.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (session is null) return TeachingAccess.NotFound("الحصة غير موجودة.");
            if (!scope!.CanAccessGroup(session.GroupId)) return TeachingAccess.Deny();
            if (session.Status == "Cancelled") return TeachingAccess.Bad("الحصة ملغاة.");
            session.ActualStartAtUtc = DateTime.UtcNow;
            session.Status = "InProgress";
            session.AttendanceOpenedAtUtc ??= DateTime.UtcNow;
            session.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "session.started", "GroupSession", id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/sessions/{id:guid}/end", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.SessionsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var session = await db.GroupSessions.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (session is null) return TeachingAccess.NotFound("الحصة غير موجودة.");
            if (!scope!.CanAccessGroup(session.GroupId)) return TeachingAccess.Deny();
            session.ActualEndAtUtc = DateTime.UtcNow;
            session.Status = "Completed";
            session.AttendanceClosedAtUtc ??= DateTime.UtcNow;
            session.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "session.ended", "GroupSession", id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        // ------------------------------ attendance ------------------------------
        app.MapGet("/api/teaching/sessions/{id:guid}/attendance", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.SessionsView)) return TeachingAccess.Deny();
            var session = await db.GroupSessions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (session is null) return TeachingAccess.NotFound("الحصة غير موجودة.");
            if (!scope.CanAccessGroup(session.GroupId)) return TeachingAccess.Deny();
            var group = await db.TeachingGroups.AsNoTracking().FirstOrDefaultAsync(x => x.Id == session.GroupId);
            var members = await db.GroupMemberships.AsNoTracking()
                .Where(x => x.GroupId == session.GroupId && x.Status == "Active")
                .Join(db.Users.AsNoTracking(), m => m.StudentId, u => u.Id,
                    (m, u) => new { m.StudentId, Name = u.FullName, u.StudentCode, u.StudentPhone })
                .ToListAsync();
            var records = await db.SessionAttendances.AsNoTracking().Where(x => x.SessionId == id).ToListAsync();
            var byStudent = records.ToDictionary(x => x.StudentId);
            var items = members.Select(m =>
            {
                byStudent.TryGetValue(m.StudentId, out var record);
                return new
                {
                    m.StudentId, m.Name, m.StudentCode, m.StudentPhone,
                    Status = record?.Status ?? "Absent",
                    record?.CheckInAtUtc, Method = record?.Method ?? "Manual",
                    record?.Note, record?.UpdatedAtUtc
                };
            }).OrderBy(x => x.Name).ToList();
            return Results.Ok(new
            {
                session = SessionView(session, DateTime.UtcNow),
                Group = group is null ? null : new { group.Id, group.Name, group.LateGraceMinutes, group.QrValidityMinutes },
                items
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/sessions/{id:guid}/attendance", async (Guid id, AttendanceInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AttendanceManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var session = await db.GroupSessions.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (session is null) return TeachingAccess.NotFound("الحصة غير موجودة.");
            if (!scope!.CanAccessGroup(session.GroupId)) return TeachingAccess.Deny();
            if (session.Status == "Cancelled") return TeachingAccess.Bad("لا يمكن تسجيل حضور لحصة ملغاة.");
            var valid = new[] { "Present", "Absent", "Late", "Excused" };
            var memberIds = (await ActiveMemberIdsAsync(db, session.GroupId)).ToHashSet();
            var existing = await db.SessionAttendances.Where(x => x.SessionId == id).ToListAsync();
            var changes = 0;
            foreach (var entry in req.Entries ?? [])
            {
                if (!memberIds.Contains(entry.StudentId)) continue;
                if (!valid.Contains(entry.Status)) return TeachingAccess.Bad("حالة حضور غير صالحة: " + entry.Status);
                var record = existing.FirstOrDefault(x => x.StudentId == entry.StudentId);
                var oldStatus = record?.Status ?? "Absent";
                if (record is null)
                {
                    record = new SessionAttendance
                    {
                        TeacherId = scope.TeacherId, GroupId = session.GroupId, SessionId = id,
                        StudentId = entry.StudentId
                    };
                    db.SessionAttendances.Add(record);
                    existing.Add(record);
                }
                if (oldStatus != entry.Status || (record.Note ?? "") != (entry.Note ?? ""))
                {
                    db.AttendanceAuditLogs.Add(new AttendanceAuditLog
                    {
                        TeacherId = scope.TeacherId, SessionId = id, StudentId = entry.StudentId,
                        AttendanceId = record.Id, ChangedByUserId = scope.UserId,
                        OldStatus = oldStatus, NewStatus = entry.Status,
                        Reason = TeachingText.NullIfEmpty(entry.Reason)
                    });
                    changes++;
                }
                record.Status = entry.Status;
                record.Note = TeachingText.NullIfEmpty(entry.Note);
                record.Method = "Manual";
                record.RecordedByUserId = scope.UserId;
                record.CheckInAtUtc = entry.Status is "Present" or "Late" ? DateTime.UtcNow : null;
                record.UpdatedAtUtc = DateTime.UtcNow;
            }
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "attendance.saved", "GroupSession", id.ToString(), $"{changes} changes");
            await db.SaveChangesAsync();
            return Results.Ok(new { saved = changes });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/sessions/{id:guid}/attendance/open", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AttendanceManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var session = await db.GroupSessions.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (session is null) return TeachingAccess.NotFound("الحصة غير موجودة.");
            if (!scope!.CanAccessGroup(session.GroupId)) return TeachingAccess.Deny();
            if (session.Status == "Cancelled") return TeachingAccess.Bad("الحصة ملغاة.");
            session.AttendanceOpenedAtUtc = DateTime.UtcNow;
            session.AttendanceClosedAtUtc = null;
            session.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "attendance.opened", "GroupSession", id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/sessions/{id:guid}/attendance/close", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AttendanceManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var session = await db.GroupSessions.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (session is null) return TeachingAccess.NotFound("الحصة غير موجودة.");
            if (!scope!.CanAccessGroup(session.GroupId)) return TeachingAccess.Deny();
            session.AttendanceClosedAtUtc = DateTime.UtcNow;
            session.UpdatedAtUtc = DateTime.UtcNow;
            var tokens = await db.AttendanceQrTokens.Where(x => x.SessionId == id && x.RevokedAtUtc == null).ToListAsync();
            foreach (var token in tokens) token.RevokedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "attendance.closed", "GroupSession", id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/sessions/{id:guid}/attendance/qr", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AttendanceManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var session = await db.GroupSessions.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (session is null) return TeachingAccess.NotFound("الحصة غير موجودة.");
            if (!scope!.CanAccessGroup(session.GroupId)) return TeachingAccess.Deny();
            if (session.Status == "Cancelled") return TeachingAccess.Bad("الحصة ملغاة.");
            var group = await db.TeachingGroups.AsNoTracking().FirstOrDefaultAsync(x => x.Id == session.GroupId);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            var now = DateTime.UtcNow;
            if (now < session.StartsAtUtc.AddMinutes(-15) || now > session.EndsAtUtc)
                return TeachingAccess.Bad("رمز الحضور يُفتح في وقت الحصة فقط.");
            var active = await db.AttendanceQrTokens
                .Where(x => x.SessionId == id && x.RevokedAtUtc == null && x.ExpiresAtUtc > now)
                .ToListAsync();
            foreach (var old in active) old.RevokedAtUtc = now;
            var raw = Convert.ToHexString(RandomNumberGenerator.GetBytes(20)).ToLowerInvariant();
            var minutes = Math.Clamp(group.QrValidityMinutes, 1, 30);
            var expiresAt = now.AddMinutes(minutes);
            if (expiresAt > session.EndsAtUtc) expiresAt = session.EndsAtUtc;
            var token = new AttendanceQrToken
            {
                TeacherId = scope.TeacherId, SessionId = id,
                TokenHash = TeachingMediaTokens.HashQrToken(raw),
                ExpiresAtUtc = expiresAt,
                CreatedByUserId = scope.UserId
            };
            db.AttendanceQrTokens.Add(token);
            session.AttendanceOpenedAtUtc ??= now;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "attendance.qr.issued", "GroupSession", id.ToString(), minutes + "m");
            await db.SaveChangesAsync();
            return Results.Ok(new { token = raw, expiresAtUtc = token.ExpiresAtUtc, validityMinutes = minutes, sessionTitle = session.Title, startsAtUtc = session.StartsAtUtc, endsAtUtc = session.EndsAtUtc });
        }).RequireAuthorization().RequireRateLimiting("api");

        // One-tap group QR: resolves the live session for the group and issues a token
        // that can never outlive that session.
        app.MapPost("/api/teaching/groups/{id:guid}/attendance/qr", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AttendanceManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope!, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            if (!scope!.CanAccessGroup(id)) return TeachingAccess.Deny();
            var now = DateTime.UtcNow;
            var session = await db.GroupSessions
                .Where(x => x.GroupId == id && x.Status != "Cancelled"
                    && x.StartsAtUtc <= now.AddMinutes(15) && x.EndsAtUtc >= now)
                .OrderBy(x => x.StartsAtUtc)
                .FirstOrDefaultAsync();
            if (session is null) return TeachingAccess.Bad("لا توجد حصة جارية الآن. افتح رمز الحضور في وقت الحصة.");
            var active = await db.AttendanceQrTokens
                .Where(x => x.SessionId == session.Id && x.RevokedAtUtc == null && x.ExpiresAtUtc > now)
                .ToListAsync();
            foreach (var old in active) old.RevokedAtUtc = now;
            var raw = Convert.ToHexString(RandomNumberGenerator.GetBytes(20)).ToLowerInvariant();
            var minutes = Math.Clamp(group.QrValidityMinutes, 1, 30);
            var expiresAt = now.AddMinutes(minutes);
            if (expiresAt > session.EndsAtUtc) expiresAt = session.EndsAtUtc;
            db.AttendanceQrTokens.Add(new AttendanceQrToken
            {
                TeacherId = scope.TeacherId, SessionId = session.Id,
                TokenHash = TeachingMediaTokens.HashQrToken(raw),
                ExpiresAtUtc = expiresAt,
                CreatedByUserId = scope.UserId
            });
            session.AttendanceOpenedAtUtc ??= now;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "attendance.qr.issued", "GroupSession", session.Id.ToString(), "group");
            await db.SaveChangesAsync();
            return Results.Ok(new { token = raw, sessionId = session.Id, sessionTitle = session.Title, expiresAtUtc = expiresAt, validityMinutes = minutes, startsAtUtc = session.StartsAtUtc, endsAtUtc = session.EndsAtUtc });
        }).RequireAuthorization().RequireRateLimiting("api");

        // Student redeems the QR token. A teacher-side raw token is never stored.
        app.MapPost("/api/teaching/attendance/qr", async (QrRedeemInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null || TeachingAccess.Role(p) != "Student")
                return TeachingAccess.Deny("هذا الإجراء للطلاب فقط.");
            if (string.IsNullOrWhiteSpace(req.Token)) return TeachingAccess.Bad("رمز QR مطلوب.");
            var hash = TeachingMediaTokens.HashQrToken(req.Token.Trim().ToLowerInvariant());
            var now = DateTime.UtcNow;
            var token = await db.AttendanceQrTokens.AsNoTracking()
                .Where(x => x.TokenHash == hash && x.RevokedAtUtc == null && x.ExpiresAtUtc > now)
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefaultAsync();
            if (token is null) return TeachingAccess.Bad("رمز الحضور غير صالح أو انتهت صلاحيته.");
            var session = await db.GroupSessions.FirstOrDefaultAsync(x => x.Id == token.SessionId && x.TeacherId == token.TeacherId);
            if (session is null || session.Status == "Cancelled") return TeachingAccess.Bad("الحصة غير متاحة.");
            if (now < session.StartsAtUtc.AddMinutes(-15) || now > session.EndsAtUtc)
                return TeachingAccess.Bad("تسجيل الحضور بـQR متاح أثناء وقت الحصة فقط.");
            if (session.AttendanceClosedAtUtc is not null) return TeachingAccess.Bad("تم إغلاق تسجيل الحضور لهذه الحصة.");
            var isMember = await db.GroupMemberships.AsNoTracking()
                .AnyAsync(x => x.GroupId == session.GroupId && x.StudentId == userId && x.Status == "Active");
            if (!isMember) return TeachingAccess.Deny("أنت لست عضواً في هذه المجموعة.");
            var group = await db.TeachingGroups.AsNoTracking().FirstOrDefaultAsync(x => x.Id == session.GroupId);
            var grace = group?.LateGraceMinutes ?? 10;
            var late = now > session.StartsAtUtc.AddMinutes(grace);
            var record = await db.SessionAttendances
                .FirstOrDefaultAsync(x => x.SessionId == session.Id && x.StudentId == userId);
            var oldStatus = record?.Status ?? "Absent";
            if (record is null)
            {
                record = new SessionAttendance
                {
                    TeacherId = session.TeacherId, GroupId = session.GroupId,
                    SessionId = session.Id, StudentId = userId.Value
                };
                db.SessionAttendances.Add(record);
            }
            record.Status = late ? "Late" : "Present";
            record.Method = "Qr";
            record.CheckInAtUtc = now;
            record.RecordedByUserId = userId;
            record.UpdatedAtUtc = now;
            if (oldStatus != record.Status)
            {
                db.AttendanceAuditLogs.Add(new AttendanceAuditLog
                {
                    TeacherId = session.TeacherId, SessionId = session.Id, StudentId = userId.Value,
                    AttendanceId = record.Id, ChangedByUserId = userId,
                    OldStatus = oldStatus, NewStatus = record.Status, Reason = "QR check-in"
                });
            }
            await db.SaveChangesAsync();
            return Results.Ok(new
            {
                ok = true, status = record.Status, checkInAtUtc = now,
                sessionTitle = session.Title, startsAtUtc = session.StartsAtUtc
            });
        }).RequireAuthorization().RequireRateLimiting("join");

        app.MapGet("/api/teaching/groups/{id:guid}/attendance/report", async (Guid id, DateTime? from, DateTime? to, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.ReportsView)) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            var start = (from ?? DateTime.UtcNow.Date.AddDays(-30)).Date;
            var end = (to ?? DateTime.UtcNow.Date).Date.AddDays(1);
            var sessions = await db.GroupSessions.AsNoTracking()
                .Where(x => x.GroupId == id && x.StartsAtUtc >= start && x.StartsAtUtc < end)
                .ToListAsync();
            var sessionIds = sessions.Select(x => x.Id).ToList();
            var members = await db.GroupMemberships.AsNoTracking()
                .Where(x => x.GroupId == id && x.Status == "Active")
                .Join(db.Users.AsNoTracking(), m => m.StudentId, u => u.Id,
                    (m, u) => new { m.StudentId, Name = u.FullName, u.StudentCode })
                .ToListAsync();
            var records = await db.SessionAttendances.AsNoTracking()
                .Where(x => sessionIds.Contains(x.SessionId)).ToListAsync();
            var counted = sessions.Where(s =>
            {
                var status = SessionStatusCalculator.Compute(s.StartsAtUtc, s.EndsAtUtc, s.Status, s.ActualStartAtUtc, s.ActualEndAtUtc, DateTime.UtcNow);
                return status is "Completed" or "InProgress";
            }).Select(x => x.Id).ToHashSet();

            var items = members.Select(m =>
            {
                var mine = records.Where(r => r.StudentId == m.StudentId && counted.Contains(r.SessionId)).ToList();
                var present = mine.Count(x => x.Status == "Present");
                var late = mine.Count(x => x.Status == "Late");
                var excused = mine.Count(x => x.Status == "Excused");
                var absent = Math.Max(0, counted.Count - present - late - excused);
                var total = counted.Count;
                return new
                {
                    m.StudentId, m.Name, m.StudentCode, TotalSessions = total,
                    Present = present, Late = late, Absent = absent, Excused = excused,
                    AttendancePercent = total == 0 ? 0 : Math.Round((present + late) * 100m / total, 1)
                };
            }).OrderBy(x => x.Name).ToList();
            return Results.Ok(new
            {
                groupId = id, groupName = group.Name, from = start, to = end.AddDays(-1),
                totalSessions = counted.Count, items
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/groups/{id:guid}/attendance/report.csv", async (Guid id, DateTime? from, DateTime? to, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.ReportsView)) return TeachingAccess.Deny();
            var group = await TeachingAccess.GetGroupAsync(db, scope, id);
            if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            var start = (from ?? DateTime.UtcNow.Date.AddDays(-30)).Date;
            var end = (to ?? DateTime.UtcNow.Date).Date.AddDays(1);
            var sessions = await db.GroupSessions.AsNoTracking()
                .Where(x => x.GroupId == id && x.StartsAtUtc >= start && x.StartsAtUtc < end).ToListAsync();
            var counted = sessions.Where(s =>
                SessionStatusCalculator.Compute(s.StartsAtUtc, s.EndsAtUtc, s.Status, s.ActualStartAtUtc, s.ActualEndAtUtc, DateTime.UtcNow) is "Completed" or "InProgress")
                .Select(x => x.Id).ToHashSet();
            var members = await db.GroupMemberships.AsNoTracking()
                .Where(x => x.GroupId == id && x.Status == "Active")
                .Join(db.Users.AsNoTracking(), m => m.StudentId, u => u.Id,
                    (m, u) => new { m.StudentId, Name = u.FullName, u.StudentCode }).ToListAsync();
            var records = await db.SessionAttendances.AsNoTracking()
                .Where(x => counted.Contains(x.SessionId)).ToListAsync();
            var sb = new StringBuilder();
            sb.AppendLine("الطالب,الكود,إجمالي الحصص,حاضر,متأخر,غائب,بعذر,نسبة الحضور");
            foreach (var m in members.OrderBy(x => x.Name))
            {
                var mine = records.Where(r => r.StudentId == m.StudentId).ToList();
                var present = mine.Count(x => x.Status == "Present");
                var late = mine.Count(x => x.Status == "Late");
                var excused = mine.Count(x => x.Status == "Excused");
                var absent = Math.Max(0, counted.Count - present - late - excused);
                var percent = counted.Count == 0 ? 0 : Math.Round((present + late) * 100m / counted.Count, 1);
                sb.AppendLine(string.Join(',', TeachingText.Csv(m.Name), TeachingText.Csv(m.StudentCode),
                    counted.Count, present, late, absent, excused, percent));
            }
            return TeachingText.CsvFile(sb.ToString(), $"attendance-{group.Name}.csv");
        }).RequireAuthorization().RequireRateLimiting("api");

        // -------------------------- student-facing views ------------------------
        app.MapGet("/api/teaching/my/groups", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null || TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذا الإجراء للطلاب فقط.");
            var memberships = await db.GroupMemberships.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status != "Left")
                .Join(db.TeachingGroups.AsNoTracking(), m => m.GroupId, g => g.Id,
                    (m, g) => new { m.Status, m.JoinedAtUtc, Group = g })
                .OrderBy(x => x.Group.Name)
                .ToListAsync();
            var groupIds = memberships.Select(x => x.Group.Id).ToList();
            var teacherIds = memberships.Select(x => x.Group.TeacherId).Distinct().ToList();
            var teachers = await db.Users.AsNoTracking().Where(u => teacherIds.Contains(u.Id))
                .Select(u => new { u.Id, u.FullName }).ToDictionaryAsync(x => x.Id, x => x.FullName);
            var next = await db.GroupSessions.AsNoTracking()
                .Where(x => groupIds.Contains(x.GroupId) && x.Status != "Cancelled" && x.EndsAtUtc >= DateTime.UtcNow)
                .OrderBy(x => x.StartsAtUtc).ToListAsync();
            var nextMap = next.GroupBy(x => x.GroupId).ToDictionary(g => g.Key, g => g.First());
            var chats = await db.Conversations.AsNoTracking()
                .Where(x => x.Type == "GroupChat" && x.GroupId != null && groupIds.Contains(x.GroupId.Value))
                .ToListAsync();
            var chatMap = chats.Where(x => x.GroupId.HasValue).GroupBy(x => x.GroupId!.Value)
                .ToDictionary(g => g.Key, g => g.First().Id);

            return Results.Ok(new
            {
                items = memberships.Select(m =>
                {
                    nextMap.TryGetValue(m.Group.Id, out var session);
                    teachers.TryGetValue(m.Group.TeacherId, out var teacherName);
                    chatMap.TryGetValue(m.Group.Id, out var chatId);
                    return new
                    {
                        m.Group.Id, m.Group.Name, m.Group.Subject, m.Group.Stage, m.Group.Grade,
                        m.Group.DeliveryMode, m.Group.Location, m.Group.OnlineLink,
                        TeacherName = teacherName, m.JoinedAtUtc, m.Status,
                        NextSessionAtUtc = session?.StartsAtUtc, NextSessionTitle = session?.Title,
                        ChatConversationId = chatId == Guid.Empty ? (Guid?)null : chatId
                    };
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/my/sessions", async (DateTime? from, DateTime? to, ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null || TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذا الإجراء للطلاب فقط.");
            var groupIds = await db.GroupMemberships.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Active")
                .Select(x => x.GroupId).ToListAsync();
            var start = from ?? DateTime.UtcNow.Date.AddDays(-7);
            var end = to ?? DateTime.UtcNow.Date.AddDays(30);
            var sessions = await db.GroupSessions.AsNoTracking()
                .Where(x => groupIds.Contains(x.GroupId) && x.EndsAtUtc >= start && x.StartsAtUtc <= end)
                .OrderBy(x => x.StartsAtUtc).Take(300).ToListAsync();
            var groupNames = await db.TeachingGroups.AsNoTracking().Where(g => groupIds.Contains(g.Id))
                .ToDictionaryAsync(g => g.Id, g => g.Name);
            var sessionIds = sessions.Select(x => x.Id).ToList();
            var mine = await db.SessionAttendances.AsNoTracking()
                .Where(x => x.StudentId == userId && sessionIds.Contains(x.SessionId))
                .ToDictionaryAsync(x => x.SessionId, x => x.Status);
            var now = DateTime.UtcNow;
            return Results.Ok(new
            {
                items = sessions.Select(s =>
                {
                    var view = SessionView(s, now);
                    groupNames.TryGetValue(s.GroupId, out var name);
                    mine.TryGetValue(s.Id, out var status);
                    return new
                    {
                        s.Id, s.GroupId, GroupName = name, s.Title, s.DeliveryMode, s.Location, s.OnlineLink,
                        view.StartsAtUtc, view.EndsAtUtc, view.Status, view.DisplayStatus,
                        MyAttendance = status
                    };
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/my/attendance", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null || TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذا الإجراء للطلاب فقط.");
            var groupIds = await db.GroupMemberships.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Active")
                .Select(x => x.GroupId).ToListAsync();
            var groups = await db.TeachingGroups.AsNoTracking().Where(g => groupIds.Contains(g.Id))
                .Select(g => new { g.Id, g.Name }).ToDictionaryAsync(g => g.Id, g => g.Name);
            var records = await db.SessionAttendances.AsNoTracking()
                .Where(x => x.StudentId == userId).OrderByDescending(x => x.UpdatedAtUtc).Take(200).ToListAsync();
            var sessionIds = records.Select(x => x.SessionId).ToList();
            var sessions = await db.GroupSessions.AsNoTracking().Where(s => sessionIds.Contains(s.Id))
                .ToDictionaryAsync(s => s.Id);
            var items = records.Select(r =>
            {
                sessions.TryGetValue(r.SessionId, out var session);
                groups.TryGetValue(r.GroupId, out var groupName);
                return new
                {
                    r.SessionId, GroupName = groupName, SessionTitle = session?.Title,
                    StartsAtUtc = session?.StartsAtUtc, r.Status, r.CheckInAtUtc, r.Method, r.Note
                };
            });
            var totals = new
            {
                Present = records.Count(x => x.Status == "Present"),
                Late = records.Count(x => x.Status == "Late"),
                Absent = records.Count(x => x.Status == "Absent"),
                Excused = records.Count(x => x.Status == "Excused")
            };
            return Results.Ok(new { totals, items });
        }).RequireAuthorization().RequireRateLimiting("api");

        // -------------------------------- homework -------------------------------
        app.MapGet("/api/teaching/homework", async (Guid? groupId, Guid? courseId, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.HomeworkView)) return TeachingAccess.Deny();
            var query = db.HomeworkAssignments.AsNoTracking().Where(x => x.TeacherId == scope.TeacherId);
            if (groupId.HasValue)
            {
                if (!scope.CanAccessGroup(groupId.Value)) return TeachingAccess.Deny();
                query = query.Where(x => x.GroupId == groupId);
            }
            else if (!scope.IsOwner && scope.GroupIds.Count > 0)
            {
                query = query.Where(x => x.GroupId == null || scope.GroupIds.Contains(x.GroupId.Value));
            }
            if (courseId.HasValue) query = query.Where(x => x.CourseId == courseId);
            var rows = await query.OrderByDescending(x => x.CreatedAtUtc).Take(200)
                .Select(x => new
                {
                    x.Id, x.Title, x.Prompt, x.CourseId, x.GroupId, x.LessonId, x.DueAtUtc,
                    x.AllowLateSubmission, x.MaxPoints, x.IsPublished, x.CreatedAtUtc,
                    SubmissionCount = x.Submissions.Count,
                    ReviewedCount = x.Submissions.Count(s => s.Status == "Reviewed")
                }).ToListAsync();
            return Results.Ok(new { items = rows });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/homework", async (HomeworkInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.HomeworkManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            if (string.IsNullOrWhiteSpace(req.Title)) return TeachingAccess.Bad("عنوان الواجب مطلوب.");
            if (req.GroupId is null && req.CourseId is null) return TeachingAccess.Bad("حدد مجموعة أو كورس للواجب.");
            if (req.GroupId.HasValue)
            {
                var group = await TeachingAccess.GetGroupAsync(db, scope!, req.GroupId.Value);
                if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            }
            if (req.CourseId.HasValue)
            {
                var course = await db.TeacherCourses.AsNoTracking()
                    .FirstOrDefaultAsync(x => x.Id == req.CourseId && x.TeacherId == scope!.TeacherId);
                if (course is null) return TeachingAccess.NotFound("الكورس غير موجود.");
            }
            var homework = new HomeworkAssignment
            {
                TeacherId = scope!.TeacherId,
                GroupId = req.GroupId,
                CourseId = req.CourseId,
                LessonId = req.LessonId,
                Title = TeachingText.Safe(req.Title, 180),
                Prompt = TeachingText.Safe(req.Prompt, 4000),
                DueAtUtc = req.DueAtUtc,
                AllowLateSubmission = req.AllowLateSubmission,
                MaxPoints = req.MaxPoints <= 0 ? 10 : req.MaxPoints,
                IsPublished = req.IsPublished
            };
            db.HomeworkAssignments.Add(homework);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "homework.created", "HomeworkAssignment", homework.Id.ToString(), homework.Title);
            await db.SaveChangesAsync();
            if (homework.IsPublished)
            {
                var studentIds = await TargetStudentIdsAsync(db, scope.TeacherId, homework.GroupId, homework.CourseId);
                await TeachingNotify.SendAsync(db, studentIds, "Homework", "Announcements",
                    "واجب جديد: " + homework.Title,
                    homework.DueAtUtc is null ? "بدون موعد تسليم" : "التسليم قبل " + homework.DueAtUtc.Value.ToString("dd/MM/yyyy HH:mm"),
                    "homework");
                await db.SaveChangesAsync();
            }
            return Results.Ok(new { id = homework.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/homework/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.HomeworkView)) return TeachingAccess.Deny();
            var homework = await db.HomeworkAssignments.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (homework is null) return TeachingAccess.NotFound("الواجب غير موجود.");
            if (homework.GroupId.HasValue && !scope.CanAccessGroup(homework.GroupId.Value)) return TeachingAccess.Deny();
            var submissions = await db.HomeworkSubmissions.AsNoTracking()
                .Where(x => x.AssignmentId == id)
                .Join(db.Users.AsNoTracking(), s => s.StudentId, u => u.Id,
                    (s, u) => new
                    {
                        s.Id, s.StudentId, StudentName = u.FullName, u.StudentCode,
                        s.AnswerText, s.AttachmentUrl, s.Status, s.Grade, s.Feedback,
                        s.SubmittedAtUtc, s.ReviewedAtUtc
                    })
                .OrderBy(x => x.StudentName).ToListAsync();
            var targeted = await TargetStudentIdsAsync(db, scope.TeacherId, homework.GroupId, homework.CourseId);
            return Results.Ok(new
            {
                homework.Id, homework.Title, homework.Prompt, homework.CourseId, homework.GroupId,
                homework.LessonId, homework.DueAtUtc, homework.AllowLateSubmission, homework.MaxPoints,
                homework.IsPublished, homework.CreatedAtUtc,
                TargetCount = targeted.Count,
                Submissions = submissions
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/homework/{id:guid}", async (Guid id, HomeworkInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.HomeworkManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var homework = await db.HomeworkAssignments.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (homework is null) return TeachingAccess.NotFound("الواجب غير موجود.");
            if (homework.GroupId.HasValue && !scope!.CanAccessGroup(homework.GroupId.Value)) return TeachingAccess.Deny();
            if (string.IsNullOrWhiteSpace(req.Title)) return TeachingAccess.Bad("عنوان الواجب مطلوب.");
            if (req.GroupId is null && req.CourseId is null) return TeachingAccess.Bad("حدد مجموعة أو كورس للواجب.");
            if (req.GroupId.HasValue)
            {
                var group = await TeachingAccess.GetGroupAsync(db, scope!, req.GroupId.Value);
                if (group is null) return TeachingAccess.NotFound("المجموعة غير موجودة.");
            }
            if (req.CourseId.HasValue && !await db.TeacherCourses.AsNoTracking()
                    .AnyAsync(x => x.Id == req.CourseId && x.TeacherId == scope!.TeacherId))
                return TeachingAccess.NotFound("الكورس غير موجود.");
            homework.Title = TeachingText.Safe(req.Title, 180);
            homework.Prompt = TeachingText.Safe(req.Prompt, 4000);
            homework.GroupId = req.GroupId;
            homework.CourseId = req.CourseId;
            homework.LessonId = req.LessonId;
            homework.DueAtUtc = req.DueAtUtc;
            homework.AllowLateSubmission = req.AllowLateSubmission;
            homework.MaxPoints = req.MaxPoints <= 0 ? homework.MaxPoints : req.MaxPoints;
            homework.IsPublished = req.IsPublished;
            homework.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "homework.updated", "HomeworkAssignment", id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/homework/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.HomeworkManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var homework = await db.HomeworkAssignments.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (homework is null) return TeachingAccess.NotFound("الواجب غير موجود.");
            if (homework.GroupId.HasValue && !scope!.CanAccessGroup(homework.GroupId.Value)) return TeachingAccess.Deny();
            db.HomeworkAssignments.Remove(homework);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "homework.deleted", "HomeworkAssignment", id.ToString(), homework.Title);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/my/homework", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null || TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذا الإجراء للطلاب فقط.");
            var groupIds = await db.GroupMemberships.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Active").Select(x => x.GroupId).ToListAsync();
            var courseIds = await db.CourseEnrollments.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Active").Select(x => x.CourseId).ToListAsync();
            var rows = await db.HomeworkAssignments.AsNoTracking()
                .Where(x => x.IsPublished && (
                    (x.GroupId != null && groupIds.Contains(x.GroupId.Value)) ||
                    (x.CourseId != null && courseIds.Contains(x.CourseId.Value))))
                .OrderBy(x => x.DueAtUtc == null).ThenBy(x => x.DueAtUtc).ThenByDescending(x => x.CreatedAtUtc)
                .Take(200).ToListAsync();
            var ids = rows.Select(x => x.Id).ToList();
            var mine = await db.HomeworkSubmissions.AsNoTracking()
                .Where(x => x.StudentId == userId && ids.Contains(x.AssignmentId))
                .ToDictionaryAsync(x => x.AssignmentId);
            var now = DateTime.UtcNow;
            return Results.Ok(new
            {
                items = rows.Select(x =>
                {
                    mine.TryGetValue(x.Id, out var submission);
                    return new
                    {
                        x.Id, x.Title, x.Prompt, x.DueAtUtc, x.AllowLateSubmission, x.MaxPoints,
                        x.GroupId, x.CourseId, x.CreatedAtUtc,
                        Submission = submission is null ? null : new
                        {
                            submission.Id, submission.Status, submission.Grade,
                            submission.Feedback, submission.SubmittedAtUtc, submission.ReviewedAtUtc
                        },
                        IsOverdue = x.DueAtUtc.HasValue && x.DueAtUtc < now,
                        CanStillSubmit = x.DueAtUtc is null || x.DueAtUtc >= now || x.AllowLateSubmission
                    };
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/homework/{id:guid}/submit", async (Guid id, HomeworkSubmitInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null || TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذا الإجراء للطلاب فقط.");
            var homework = await db.HomeworkAssignments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.IsPublished);
            if (homework is null) return TeachingAccess.NotFound("الواجب غير موجود.");
            var targeted = await TargetStudentIdsAsync(db, homework.TeacherId, homework.GroupId, homework.CourseId);
            if (!targeted.Contains(userId.Value)) return TeachingAccess.Deny("هذا الواجب غير موجه لك.");
            if (string.IsNullOrWhiteSpace(req.AnswerText) && string.IsNullOrWhiteSpace(req.AttachmentUrl))
                return TeachingAccess.Bad("أدخل إجابة أو أرفق ملفاً.");
            var now = DateTime.UtcNow;
            var late = homework.DueAtUtc.HasValue && now > homework.DueAtUtc.Value;
            if (late && !homework.AllowLateSubmission) return TeachingAccess.Bad("انتهى وقت تسليم الواجب.");
            var submission = await db.HomeworkSubmissions
                .FirstOrDefaultAsync(x => x.AssignmentId == id && x.StudentId == userId);
            if (submission is not null && submission.Status == "Reviewed")
                return TeachingAccess.Bad("تم تصحيح الواجب بالفعل. راجع ملاحظات المعلم.");
            if (submission is null)
            {
                submission = new HomeworkSubmission
                {
                    AssignmentId = id, TeacherId = homework.TeacherId, StudentId = userId.Value
                };
                db.HomeworkSubmissions.Add(submission);
            }
            submission.AnswerText = TeachingText.Safe(req.AnswerText, 8000);
            submission.AttachmentUrl = TeachingText.NullIfEmpty(req.AttachmentUrl);
            submission.Status = late ? "Late" : "Submitted";
            submission.SubmittedAtUtc = now;
            await TeachingNotify.SendAsync(db, [homework.TeacherId], "Homework", "Announcements",
                "تسليم واجب: " + homework.Title, "من الطالب", "homework");
            await db.SaveChangesAsync();
            return Results.Ok(new { id = submission.Id, status = submission.Status });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/homework/submissions/{submissionId:guid}/grade", async (Guid submissionId, HomeworkGradeInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.HomeworkManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var submission = await db.HomeworkSubmissions
                .FirstOrDefaultAsync(x => x.Id == submissionId && x.TeacherId == scope!.TeacherId);
            if (submission is null) return TeachingAccess.NotFound("التسليم غير موجود.");
            var homework = await db.HomeworkAssignments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == submission.AssignmentId);
            if (homework is null) return TeachingAccess.NotFound("الواجب غير موجود.");
            if (homework.GroupId.HasValue && !scope!.CanAccessGroup(homework.GroupId.Value)) return TeachingAccess.Deny();
            if (req.Grade < 0 || req.Grade > homework.MaxPoints.DataRound())
                return TeachingAccess.Bad($"الدرجة يجب أن تكون بين 0 و{homework.MaxPoints}.");
            submission.Grade = req.Grade;
            submission.Feedback = TeachingText.NullIfEmpty(req.Feedback);
            submission.Status = "Reviewed";
            submission.ReviewedAtUtc = DateTime.UtcNow;
            submission.ReviewedByUserId = scope!.UserId;
            await TeachingNotify.SendAsync(db, [submission.StudentId], "Homework", "Announcements",
                "تم تصحيح واجبك", $"{homework.Title}: {req.Grade}/{homework.MaxPoints}", "homework");
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "homework.graded", "HomeworkSubmission", submissionId.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/homework/{id:guid}/submissions.csv", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.ReportsView)) return TeachingAccess.Deny();
            var homework = await db.HomeworkAssignments.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (homework is null) return TeachingAccess.NotFound("الواجب غير موجود.");
            var rows = await db.HomeworkSubmissions.AsNoTracking().Where(x => x.AssignmentId == id)
                .Join(db.Users.AsNoTracking(), s => s.StudentId, u => u.Id,
                    (s, u) => new { StudentName = u.FullName, u.StudentCode, s.Status, s.Grade, s.SubmittedAtUtc })
                .ToListAsync();
            var sb = new StringBuilder();
            sb.AppendLine("الطالب,الكود,الحالة,الدرجة,وقت التسليم");
            foreach (var r in rows.OrderBy(x => x.StudentName))
                sb.AppendLine(string.Join(',', TeachingText.Csv(r.StudentName), TeachingText.Csv(r.StudentCode),
                    TeachingText.Csv(r.Status), r.Grade?.ToString(CultureInfo.InvariantCulture) ?? "",
                    TeachingText.Csv(r.SubmittedAtUtc.ToString("yyyy-MM-dd HH:mm"))));
            return TeachingText.CsvFile(sb.ToString(), $"homework-{homework.Title}.csv");
        }).RequireAuthorization().RequireRateLimiting("api");
    }

    // ------------------------------- helpers -----------------------------------

    private static string NormalizeChatMode(string? mode) =>
        mode is "TeacherOnly" or "Moderated" or "Everyone" ? mode : "Everyone";

    private static object SessionView(GroupSchedule s, DateTime now) => new
    {
        s.Id, s.GroupId, s.DayOfWeek, StartTime = s.StartTime.ToString(@"hh\:mm"),
        EndTime = s.EndTime.ToString(@"hh\:mm"), s.Location, s.IsActive
    };

    /// <summary>Derived status plus the lifecycle timestamps the UI needs.</summary>
    private static SessionViewDto SessionView(GroupSession s, DateTime now)
    {
        var status = SessionStatusCalculator.Compute(s.StartsAtUtc, s.EndsAtUtc, s.Status,
            s.ActualStartAtUtc, s.ActualEndAtUtc, now);
        return new SessionViewDto(s.Id, s.GroupId, s.ScheduleId, s.Title, s.DeliveryMode, s.Location,
            s.OnlineLink, s.StartsAtUtc, s.EndsAtUtc, s.ScheduledDateUtc, s.ActualStartAtUtc,
            s.ActualEndAtUtc, status, SessionStatusCalculator.Display(status), s.Notes,
            s.CancellationReason, s.AttendanceOpenedAtUtc, s.AttendanceClosedAtUtc);
    }

    private sealed record BuiltTimes(DateTime Date, TimeSpan Start, TimeSpan End, DateTime StartsAtUtc, DateTime EndsAtUtc, string? Error);

    private static BuiltTimes BuildTimes(DateTime? date, string? startText, string? endText)
    {
        var day = (date ?? DateTime.UtcNow.Date).Date;
        if (!TryParseTime(startText, out var start) || !TryParseTime(endText, out var end))
            return new BuiltTimes(day, TimeSpan.Zero, TimeSpan.Zero, default, default, "وقت البداية والنهاية مطلوبان بصيغة HH:mm.");
        if (end <= start) end = end.Add(TimeSpan.FromDays(1));
        return new BuiltTimes(day, start, end, day.Add(start), day.Add(end), null);
    }

    internal static bool TryParseTime(string? value, out TimeSpan time)
    {
        time = default;
        if (string.IsNullOrWhiteSpace(value)) return false;
        return TimeSpan.TryParse(value.Trim(), CultureInfo.InvariantCulture, out time)
            && time >= TimeSpan.Zero && time < TimeSpan.FromDays(1);
    }

    private static async Task<List<Guid>> ActiveMemberIdsAsync(AppDbContext db, Guid groupId) =>
        await db.GroupMemberships.AsNoTracking()
            .Where(x => x.GroupId == groupId && x.Status == "Active")
            .Select(x => x.StudentId).ToListAsync();

    /// <summary>Students targeted by a homework row, resolved from its group and/or course.</summary>
    internal static async Task<List<Guid>> TargetStudentIdsAsync(AppDbContext db, Guid teacherId, Guid? groupId, Guid? courseId)
    {
        var ids = new HashSet<Guid>();
        if (groupId.HasValue)
            foreach (var id in await ActiveMemberIdsAsync(db, groupId.Value)) ids.Add(id);
        if (courseId.HasValue)
        {
            var now = DateTime.UtcNow;
            var enrolled = await db.CourseEnrollments.AsNoTracking()
                .Where(x => x.TeacherId == teacherId && x.CourseId == courseId && x.Status == "Active"
                    && (x.ExpiresAtUtc == null || x.ExpiresAtUtc > now))
                .Select(x => x.StudentId).ToListAsync();
            foreach (var id in enrolled) ids.Add(id);
        }
        return ids.ToList();
    }
}

public sealed record GroupInput(
    string Name, string? Description, string Subject, string? Stage, string? Grade, string? AcademicYear,
    string DeliveryMode, int Capacity, string? Location, string? OnlineLink, decimal Price,
    string PaymentType, int MonthlyDueDay, string SessionBillingPolicy, DateTime? StartDate, DateTime? EndDate,
    bool EnrollmentOpen, bool IsActive, int LateGraceMinutes, int QrValidityMinutes, string ChatMode);

public sealed record GroupCourseInput(Guid CourseId);
public sealed record MemberInput(Guid StudentId, string? Note);
public sealed record MemberUpdateInput(string Status, string? Note);
public sealed record ScheduleInput(int DayOfWeek, string StartTime, string EndTime, string? Location, bool IsActive = true);
public sealed record SessionInput(DateTime? Date, string? StartTime, string? EndTime, string? Title,
    string? DeliveryMode, string? Location, string? OnlineLink, string? Notes);
public sealed record GenerateSessionsInput(DateTime? FromDate, DateTime? ToDate);
public sealed record RescheduleInput(DateTime Date, string StartTime, string EndTime, string? Reason);
public sealed record CancelInput(string? Reason);
public sealed record AttendanceEntryInput(Guid StudentId, string Status, string? Note, string? Reason);
public sealed record AttendanceInput(List<AttendanceEntryInput>? Entries);
public sealed record QrRedeemInput(string Token);
public sealed record HomeworkInput(string Title, string? Prompt, Guid? GroupId, Guid? CourseId, Guid? LessonId,
    DateTime? DueAtUtc, bool AllowLateSubmission, decimal MaxPoints, bool IsPublished);
public sealed record HomeworkSubmitInput(string? AnswerText, string? AttachmentUrl);
public sealed record HomeworkGradeInput(decimal Grade, string? Feedback);

internal static class TeachingDecimalExtensions
{
    /// <summary>Rounds a max-points bound to two decimals for validation messages.</summary>
    public static decimal DataRound(this decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}

internal sealed record SessionViewDto(
    Guid Id, Guid GroupId, Guid? ScheduleId, string Title, string DeliveryMode, string? Location,
    string? OnlineLink, DateTime StartsAtUtc, DateTime EndsAtUtc, DateTime ScheduledDateUtc,
    DateTime? ActualStartAtUtc, DateTime? ActualEndAtUtc, string Status, string DisplayStatus,
    string? Notes, string? CancellationReason, DateTime? AttendanceOpenedAtUtc,
    DateTime? AttendanceClosedAtUtc);
