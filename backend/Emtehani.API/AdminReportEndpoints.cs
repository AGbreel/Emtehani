using System.Globalization;
using System.Security.Claims;
using System.Text;
using Emtehani.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Emtehani.API;

/// <summary>
/// Platform-level reporting for the admin dashboard. Everything is aggregated from
/// the two separate money systems (platform→teacher and teacher→student) without
/// mixing their totals into one misleading number.
/// </summary>
public static class AdminReportEndpoints
{
    public static void MapAdminReportEndpoints(this WebApplication app)
    {
        app.MapGet("/api/admin/reports/overview", async (DateTime? from, DateTime? to, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return TeachingAccess.Deny("هذا الإجراء لإدارة المنصة فقط.");
            var start = (from ?? new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc));
            var end = (to ?? DateTime.UtcNow.Date).Date.AddDays(1);
            var now = DateTime.UtcNow;

            var users = await db.Users.AsNoTracking()
                .Where(x => x.Role == "Teacher" || x.Role == "Student")
                .Select(x => new { x.Id, x.FullName, x.Email, x.Role, x.CreatedAtUtc })
                .ToListAsync();
            var subscriptions = await db.TeacherSubscriptions.AsNoTracking()
                .Include(x => x.Plan)
                .ToListAsync();
            var plans = await db.SubscriptionPlans.AsNoTracking().OrderBy(x => x.SortOrder).ToListAsync();
            var platformPayments = await db.PlatformPayments.AsNoTracking().ToListAsync();
            var studentPayments = await db.StudentPayments.AsNoTracking().Where(x => !x.IsVoid).ToListAsync();
            var groups = await db.TeachingGroups.AsNoTracking()
                .Select(x => new { x.Id, x.TeacherId, x.IsActive, x.CreatedAtUtc }).ToListAsync();
            var courses = await db.TeacherCourses.AsNoTracking()
                .Select(x => new { x.Id, x.TeacherId, x.IsArchived, x.CreatedAtUtc }).ToListAsync();
            var links = await db.TeacherStudentRequests.AsNoTracking()
                .Where(x => x.Status == "Accepted" && x.UnlinkedAtUtc == null)
                .Select(x => new { x.TeacherId, x.StudentId }).ToListAsync();

            var activeSubs = subscriptions.Where(x => x.Status == "Confirmed"
                && (x.EndsAtUtc == null || x.EndsAtUtc > now)).ToList();
            var approvedPlatform = platformPayments
                .Where(x => x.Status == "Approved" && x.ReviewedAtUtc is not null
                    && x.ReviewedAtUtc >= start && x.ReviewedAtUtc < end).ToList();
            var rangeStudentPayments = studentPayments
                .Where(x => x.PaidAtUtc >= start && x.PaidAtUtc < end).ToList();

            var byPlan = plans.Select(plan =>
            {
                var planSubs = activeSubs.Where(x => x.PlanId == plan.Id).ToList();
                return new
                {
                    planId = plan.Id,
                    plan.Code,
                    plan.Name,
                    plan.Price,
                    plan.Currency,
                    activeCount = planSubs.Count,
                    monthlyValue = planSubs.Count * plan.Price
                };
            }).ToList();

            var teachers = users.Where(x => x.Role == "Teacher").ToList();
            var studentRevenueByTeacher = rangeStudentPayments
                .GroupBy(x => x.TeacherId)
                .ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
            var topTeachers = teachers.Select(t =>
            {
                var teacherSub = activeSubs.Where(x => x.TeacherId == t.Id)
                    .OrderByDescending(x => x.EndsAtUtc).FirstOrDefault();
                return new
                {
                    teacherId = t.Id,
                    teacherName = t.FullName,
                    email = t.Email,
                    students = links.Count(x => x.TeacherId == t.Id),
                    groups = groups.Count(x => x.TeacherId == t.Id && x.IsActive),
                    courses = courses.Count(x => x.TeacherId == t.Id && !x.IsArchived),
                    planName = teacherSub?.Plan?.Name,
                    revenue = studentRevenueByTeacher.GetValueOrDefault(t.Id)
                };
            }).OrderByDescending(x => x.revenue).Take(8).ToList();

            var trendStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-5);
            var revenueTrend = Enumerable.Range(0, 6).Select(offset =>
            {
                var cursor = trendStart.AddMonths(offset);
                var next = cursor.AddMonths(1);
                return new
                {
                    month = cursor.ToString("yyyy-MM"),
                    platform = platformPayments.Where(x => x.Status == "Approved"
                        && x.ReviewedAtUtc >= cursor && x.ReviewedAtUtc < next).Sum(x => x.Amount),
                    students = studentPayments.Where(x => x.PaidAtUtc >= cursor && x.PaidAtUtc < next).Sum(x => x.Amount)
                };
            }).ToList();

            return Results.Ok(new
            {
                from = start,
                to = end.AddDays(-1),
                totals = new
                {
                    teachers = teachers.Count,
                    students = users.Count(x => x.Role == "Student"),
                    activeSubscriptions = activeSubs.Count,
                    pendingPlatformPayments = platformPayments.Count(x => x.Status == "Pending"),
                    groups = groups.Count(x => x.IsActive),
                    courses = courses.Count(x => !x.IsArchived),
                    platformRevenue = approvedPlatform.Sum(x => x.Amount),
                    studentPayments = rangeStudentPayments.Sum(x => x.Amount),
                    newTeachers = teachers.Count(x => x.CreatedAtUtc >= start && x.CreatedAtUtc < end),
                    newStudents = users.Count(x => x.Role == "Student" && x.CreatedAtUtc >= start && x.CreatedAtUtc < end)
                },
                byPlan,
                topTeachers,
                revenueTrend
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/admin/reports/teachers", async (
            string? search, string? status, int page, int pageSize, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return TeachingAccess.Deny("هذا الإجراء لإدارة المنصة فقط.");
            var pageNo = page <= 0 ? 1 : page;
            var size = pageSize is <= 0 or > 100 ? 25 : pageSize;
            var now = DateTime.UtcNow;

            var query = db.Users.AsNoTracking().Where(x => x.Role == "Teacher");
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(x => x.FullName.Contains(term) || x.Email.Contains(term));
            }
            var teacherRows = await query.OrderByDescending(x => x.CreatedAtUtc).ToListAsync();
            var total = teacherRows.Count;
            var pageIds = teacherRows.Skip((pageNo - 1) * size).Take(size).Select(x => x.Id).ToList();

            var subscriptions = await db.TeacherSubscriptions.AsNoTracking()
                .Include(x => x.Plan)
                .Where(x => pageIds.Contains(x.TeacherId))
                .ToListAsync();
            var links = await db.TeacherStudentRequests.AsNoTracking()
                .Where(x => pageIds.Contains(x.TeacherId) && x.Status == "Accepted" && x.UnlinkedAtUtc == null)
                .Select(x => new { x.TeacherId, x.StudentId }).ToListAsync();
            var groups = await db.TeachingGroups.AsNoTracking()
                .Where(x => pageIds.Contains(x.TeacherId) && x.IsActive)
                .Select(x => x.TeacherId).ToListAsync();
            var courses = await db.TeacherCourses.AsNoTracking()
                .Where(x => pageIds.Contains(x.TeacherId) && !x.IsArchived)
                .Select(x => x.TeacherId).ToListAsync();
            var payments = await db.StudentPayments.AsNoTracking()
                .Where(x => pageIds.Contains(x.TeacherId) && !x.IsVoid)
                .Select(x => new { x.TeacherId, x.Amount }).ToListAsync();

            var items = teacherRows.Skip((pageNo - 1) * size).Take(size).Select(teacher =>
            {
                var sub = subscriptions.Where(x => x.TeacherId == teacher.Id)
                    .OrderByDescending(x => x.Status == "Confirmed" && (x.EndsAtUtc == null || x.EndsAtUtc > now))
                    .ThenByDescending(x => x.EndsAtUtc)
                    .FirstOrDefault();
                return new
                {
                    teacher.Id,
                    teacher.FullName,
                    teacher.Email,
                    teacher.CreatedAtUtc,
                    planName = sub?.Plan?.Name,
                    planCode = sub?.Plan?.Code,
                    subscriptionStatus = sub?.Status,
                    endsAtUtc = sub?.EndsAtUtc,
                    daysLeft = sub?.EndsAtUtc is null ? (int?)null : (int)Math.Ceiling((sub.EndsAtUtc.Value - now).TotalDays),
                    students = links.Count(x => x.TeacherId == teacher.Id),
                    groups = groups.Count(x => x == teacher.Id),
                    courses = courses.Count(x => x == teacher.Id),
                    collected = payments.Where(x => x.TeacherId == teacher.Id).Sum(x => x.Amount)
                };
            }).ToList();

            if (!string.IsNullOrWhiteSpace(status))
                items = items.Where(x => string.Equals(x.subscriptionStatus, status, StringComparison.OrdinalIgnoreCase)).ToList();

            return Results.Ok(new { page = pageNo, pageSize = size, total, items });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/admin/reports/subscriptions.csv", async (DateTime? from, DateTime? to, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return TeachingAccess.Deny("هذا الإجراء لإدارة المنصة فقط.");
            var start = (from ?? DateTime.UtcNow.Date.AddDays(-90)).Date;
            var end = (to ?? DateTime.UtcNow.Date).Date.AddDays(1);
            var rows = await db.TeacherSubscriptions.AsNoTracking()
                .Include(x => x.Teacher)
                .Include(x => x.Plan)
                .Where(x => x.CreatedAtUtc >= start && x.CreatedAtUtc < end)
                .OrderByDescending(x => x.CreatedAtUtc).Take(5000).ToListAsync();
            var sb = new StringBuilder();
            sb.AppendLine("المدرس,البريد,الخطة,الحالة,يبدأ,ينتهي,تم التأكيد,أُنشئ");
            foreach (var row in rows)
            {
                sb.AppendLine(string.Join(',',
                    TeachingText.Csv(row.Teacher?.FullName),
                    TeachingText.Csv(row.Teacher?.Email),
                    TeachingText.Csv(row.Plan?.Name ?? row.Plan?.Code),
                    TeachingText.Csv(row.Status),
                    TeachingText.Csv(row.StartedAtUtc?.ToString("yyyy-MM-dd")),
                    TeachingText.Csv(row.EndsAtUtc?.ToString("yyyy-MM-dd")),
                    TeachingText.Csv(row.ConfirmedAtUtc?.ToString("yyyy-MM-dd")),
                    TeachingText.Csv(row.CreatedAtUtc.ToString("yyyy-MM-dd"))));
            }
            return TeachingText.CsvFile(sb.ToString(), "platform-subscriptions.csv");
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/admin/reports/platform-payments.csv", async (DateTime? from, DateTime? to, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return TeachingAccess.Deny("هذا الإجراء لإدارة المنصة فقط.");
            var start = (from ?? DateTime.UtcNow.Date.AddDays(-90)).Date;
            var end = (to ?? DateTime.UtcNow.Date).Date.AddDays(1);
            var rows = await db.PlatformPayments.AsNoTracking()
                .Where(x => x.CreatedAtUtc >= start && x.CreatedAtUtc < end)
                .OrderByDescending(x => x.CreatedAtUtc).Take(5000).ToListAsync();
            var teacherIds = rows.Select(x => x.TeacherId).Distinct().ToList();
            var teachers = await db.Users.AsNoTracking().Where(x => teacherIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName, x.Email }).ToDictionaryAsync(x => x.Id);
            var sb = new StringBuilder();
            sb.AppendLine("المدرس,البريد,المبلغ,العملة,الطريقة,المرجع,الحالة,ملاحظة الإدارة,أُنشئ,تمت المراجعة");
            foreach (var row in rows)
            {
                teachers.TryGetValue(row.TeacherId, out var teacher);
                sb.AppendLine(string.Join(',',
                    TeachingText.Csv(teacher?.FullName),
                    TeachingText.Csv(teacher?.Email),
                    row.Amount.ToString(CultureInfo.InvariantCulture),
                    TeachingText.Csv(row.Currency),
                    TeachingText.Csv(row.Method),
                    TeachingText.Csv(row.Reference),
                    TeachingText.Csv(row.Status),
                    TeachingText.Csv(row.AdminNote),
                    TeachingText.Csv(row.CreatedAtUtc.ToString("yyyy-MM-dd HH:mm")),
                    TeachingText.Csv(row.ReviewedAtUtc?.ToString("yyyy-MM-dd HH:mm"))));
            }
            return TeachingText.CsvFile(sb.ToString(), "platform-payments.csv");
        }).RequireAuthorization().RequireRateLimiting("api");
    }

    private static bool IsAdmin(ClaimsPrincipal p) => TeachingAccess.Role(p) == "Admin";
}
