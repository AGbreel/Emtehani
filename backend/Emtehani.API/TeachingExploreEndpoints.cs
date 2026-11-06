using System.Security.Claims;
using Emtehani.Domain.Entities;
using Emtehani.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Emtehani.API;

public static class TeachingExploreEndpoints
{
    public static void MapTeachingExploreEndpoints(this WebApplication app)
    {
        // Student-facing discovery: only groups/courses that belong to teachers the
        // student accepted a link with, so one tenant can never enumerate another.
        app.MapGet("/api/teaching/explore/groups", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null || TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذا الإجراء للطلاب فقط.");
            var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId);
            if (user is null) return Results.Unauthorized();

            var teacherIds = await db.TeacherStudentRequests.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Accepted" && x.UnlinkedAtUtc == null)
                .Select(x => x.TeacherId).ToListAsync();
            if (teacherIds.Count == 0) return Results.Ok(new { items = Array.Empty<object>(), linkedTeachers = Array.Empty<object>() });

            var groups = await db.TeachingGroups.AsNoTracking()
                .Where(x => teacherIds.Contains(x.TeacherId) && x.IsActive)
                .Include(x => x.Teacher)
                .OrderBy(x => x.Stage).ThenBy(x => x.Grade).ThenBy(x => x.Name)
                .ToListAsync();
            var groupIds = groups.Select(x => x.Id).ToList();

            var memberships = await db.GroupMemberships.AsNoTracking()
                .Where(x => x.StudentId == userId && groupIds.Contains(x.GroupId))
                .ToListAsync();
            var myStatus = memberships.GroupBy(x => x.GroupId)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.UpdatedAtUtc).First().Status);
            var activeCounts = await db.GroupMemberships.AsNoTracking()
                .Where(x => groupIds.Contains(x.GroupId) && x.Status == "Active")
                .GroupBy(x => x.GroupId)
                .Select(g => new { GroupId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.GroupId, x => x.Count);

            var now = DateTime.UtcNow;
            var upcoming = await db.GroupSessions.AsNoTracking()
                .Where(x => groupIds.Contains(x.GroupId) && x.Status != "Cancelled" && x.EndsAtUtc >= now)
                .OrderBy(x => x.StartsAtUtc).ToListAsync();
            var nextSession = upcoming.GroupBy(x => x.GroupId).ToDictionary(g => g.Key, g => g.First());
            var schedules = await db.GroupSchedules.AsNoTracking()
                .Where(x => groupIds.Contains(x.GroupId) && x.IsActive)
                .OrderBy(x => x.DayOfWeek).ToListAsync();
            var scheduleMap = schedules.GroupBy(x => x.GroupId).ToDictionary(g => g.Key, g => g.ToList());
            var links = await db.GroupCourses.AsNoTracking()
                .Where(x => groupIds.Contains(x.GroupId)).ToListAsync();
            var linkedCourseIds = links.Select(x => x.CourseId).Distinct().ToList();
            var courseTitles = await db.TeacherCourses.AsNoTracking()
                .Where(x => linkedCourseIds.Contains(x.Id))
                .Select(x => new { x.Id, x.Title })
                .ToDictionaryAsync(x => x.Id, x => x.Title);

            var teachers = await db.Users.AsNoTracking()
                .Where(x => teacherIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName })
                .ToListAsync();

            var items = groups.Select(g =>
            {
                myStatus.TryGetValue(g.Id, out var status);
                activeCounts.TryGetValue(g.Id, out var active);
                nextSession.TryGetValue(g.Id, out var session);
                scheduleMap.TryGetValue(g.Id, out var rows);
                var seatsLeft = g.Capacity > 0 ? Math.Max(0, g.Capacity - active) : (int?)null;
                var canJoin = status is not ("Active" or "Suspended")
                    && g.EnrollmentOpen
                    && (g.Capacity <= 0 || active < g.Capacity)
                    && (g.EndDateUtc is null || g.EndDateUtc > now);
                return new
                {
                    id = g.Id,
                    name = g.Name,
                    description = g.Description,
                    subject = g.Subject,
                    stage = g.Stage,
                    grade = g.Grade,
                    academicYear = g.AcademicYear,
                    deliveryMode = g.DeliveryMode,
                    location = g.Location,
                    onlineLink = g.OnlineLink,
                    price = g.Price,
                    paymentType = g.PaymentType,
                    capacity = g.Capacity,
                    activeMembers = active,
                    seatsLeft,
                    teacherId = g.TeacherId,
                    teacherName = g.Teacher?.FullName,
                    enrollmentOpen = g.EnrollmentOpen,
                    myStatus = status,
                    canJoin,
                    matchesProfile = (string.IsNullOrWhiteSpace(user.Stage) || string.Equals(g.Stage, user.Stage, StringComparison.Ordinal))
                        && (string.IsNullOrWhiteSpace(user.Grade) || string.Equals(g.Grade, user.Grade, StringComparison.Ordinal)),
                    nextSessionAtUtc = session?.StartsAtUtc,
                    nextSessionTitle = session?.Title,
                    schedules = rows == null
                        ? Array.Empty<object>()
                        : rows.OrderBy(s => s.StartTime).Select(s => (object)new
                        {
                            dayOfWeek = s.DayOfWeek,
                            startTime = s.StartTime,
                            endTime = s.EndTime,
                            location = s.Location
                        }).ToArray(),
                    courses = links.Where(l => l.GroupId == g.Id).Select(l => new
                    {
                        id = l.CourseId,
                        title = courseTitles.GetValueOrDefault(l.CourseId)
                    })
                };
            }).ToList();

            return Results.Ok(new
            {
                items,
                linkedTeachers = teachers.Select(x => new { id = x.Id, name = x.FullName })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/groups/{id:guid}/join", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null || TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذا الإجراء للطلاب فقط.");
            var group = await db.TeachingGroups.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (group is null || !group.IsActive) return TeachingAccess.NotFound("المجموعة غير متاحة.");
            if (!await TeachingAccess.IsLinkedStudentAsync(db, group.TeacherId, userId.Value))
                return TeachingAccess.Deny("اربط حسابك بالمدرس أولاً من صفحة المدرسين.");
            var membership = await db.GroupMemberships.FirstOrDefaultAsync(x => x.GroupId == id && x.StudentId == userId);
            if (membership is { Status: "Active" }) return Results.Ok(new { ok = true, alreadyMember = true, membershipId = membership.Id });
            if (membership is { Status: "Suspended" }) return TeachingAccess.Deny("عضويتك في هذه المجموعة موقوفة. تواصل مع المدرس.");
            if (!group.EnrollmentOpen) return TeachingAccess.Bad("التسجيل في هذه المجموعة مغلق حالياً.");
            if (group.EndDateUtc is not null && group.EndDateUtc <= DateTime.UtcNow)
                return TeachingAccess.Bad("انتهت مدة هذه المجموعة.");
            var active = await db.GroupMemberships.CountAsync(x => x.GroupId == id && x.Status == "Active");
            if (group.Capacity > 0 && active >= group.Capacity) return TeachingAccess.Bad("المجموعة مكتملة العدد.");

            if (membership is null)
            {
                membership = new GroupMembership { TeacherId = group.TeacherId, GroupId = id, StudentId = userId.Value };
                db.GroupMemberships.Add(membership);
            }
            membership.Status = "Active";
            membership.SuspendedAtUtc = null;
            membership.JoinedAtUtc = membership.JoinedAtUtc == default ? DateTime.UtcNow : membership.JoinedAtUtc;
            membership.UpdatedAtUtc = DateTime.UtcNow;

            var student = await db.Users.AsNoTracking().FirstAsync(x => x.Id == userId);
            await TeachingNotify.SendAsync(db, [group.TeacherId], "Group", "System",
                "طالب جديد انضم للمجموعة", $"{student.FullName} انضم إلى {group.Name}", "groups");
            TeachingNotify.Audit(db, group.TeacherId, userId, "group.member.self-joined",
                "GroupMembership", membership.Id.ToString(), student.FullName);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, alreadyMember = false, membershipId = membership.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/catalog/{id:guid}/join", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null || TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذا الإجراء للطلاب فقط.");
            var now = DateTime.UtcNow;
            var course = await db.TeacherCourses.FirstOrDefaultAsync(x => x.Id == id && x.IsPublished && !x.IsArchived
                && (x.PublishAtUtc == null || x.PublishAtUtc <= now));
            if (course is null) return TeachingAccess.NotFound("الكورس غير متاح.");
            if (!await TeachingAccess.IsLinkedStudentAsync(db, course.TeacherId, userId.Value))
                return TeachingAccess.Deny("اربط حسابك بالمدرس أولاً من صفحة المدرسين.");
            if (!course.IsFree)
                return TeachingAccess.Bad("هذا الكورس مدفوع. تواصل مع المدرس لإتمام التسجيل بعد السداد.");

            var enrollment = await db.CourseEnrollments.FirstOrDefaultAsync(x => x.CourseId == id && x.StudentId == userId);
            if (enrollment is { Status: "Active" } && (enrollment.ExpiresAtUtc is null || enrollment.ExpiresAtUtc > now))
                return Results.Ok(new { ok = true, alreadyEnrolled = true, enrollmentId = enrollment.Id });

            if (enrollment is null)
            {
                enrollment = new CourseEnrollment { TeacherId = course.TeacherId, CourseId = id, StudentId = userId.Value };
                db.CourseEnrollments.Add(enrollment);
            }
            enrollment.Status = "Active";
            enrollment.StartsAtUtc = now;
            enrollment.ExpiresAtUtc = course.AccessDays > 0 ? now.AddDays(course.AccessDays) : null;
            enrollment.AmountPaid = 0;
            enrollment.EnrolledAtUtc = enrollment.EnrolledAtUtc == default ? now : enrollment.EnrolledAtUtc;
            enrollment.UpdatedAtUtc = now;

            var student = await db.Users.AsNoTracking().FirstAsync(x => x.Id == userId);
            await TeachingNotify.SendAsync(db, [course.TeacherId], "Course", "System",
                "طالب جديد سجّل في كورسك", $"{student.FullName} — {course.Title}", "courses");
            TeachingNotify.Audit(db, course.TeacherId, userId, "enrollment.self-joined",
                "CourseEnrollment", enrollment.Id.ToString(), student.FullName);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, alreadyEnrolled = false, enrollmentId = enrollment.Id });
        }).RequireAuthorization().RequireRateLimiting("api");
    }
}
