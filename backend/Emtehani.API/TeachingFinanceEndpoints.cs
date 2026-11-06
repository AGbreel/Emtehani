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
/// Two deliberately separate money systems:
///  (1) platform → teacher subscriptions and their payments (admin managed);
///  (2) teacher → student packages, charges, payments and adjustments.
/// Nothing here touches the exam workflow.
/// </summary>
public static class TeachingFinanceEndpoints
{
    public static void MapTeachingFinanceEndpoints(this WebApplication app)
    {
        // =====================================================================
        //  Platform → teacher (admin management + teacher request tracking)
        // =====================================================================
        app.MapGet("/api/admin/plans", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return Results.Forbid();
            var plans = await db.SubscriptionPlans.AsNoTracking()
                .OrderBy(x => x.SortOrder).ThenBy(x => x.Name).ToListAsync();
            var counts = await db.TeacherSubscriptions.AsNoTracking()
                .Where(x => x.Status == "Confirmed")
                .GroupBy(x => x.PlanId)
                .Select(g => new { PlanId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.PlanId, x => x.Count);
            return Results.Ok(new
            {
                items = plans.Select(x => new
                {
                    x.Id, x.Code, x.Name, x.Description, x.IsActive, x.IsDefault, x.IsPublic, x.SortOrder,
                    x.Price, x.Currency, x.BillingPeriodDays, x.TrialDays, x.GraceDays,
                    x.MaxStudents, x.MaxCourses, x.MaxGroups, x.MaxAssistants, x.StorageMb, x.MaxVideoMinutes,
                    x.FeaturesJson,
                    activeSubscriptions = counts.GetValueOrDefault(x.Id)
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/admin/plans", async (PlatformPlanInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return Results.Forbid();
            var code = TeachingText.Safe(req.Code, 40).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(code)) return TeachingAccess.Bad("كود الخطة مطلوب.");
            if (string.IsNullOrWhiteSpace(req.Name)) return TeachingAccess.Bad("اسم الخطة مطلوب.");
            if (await db.SubscriptionPlans.AnyAsync(x => x.Code == code))
                return TeachingAccess.Bad("كود الخطة مستخدم بالفعل.");
            if (req.Price < 0) return TeachingAccess.Bad("السعر لا يمكن أن يكون سالباً.");
            if (req.IsDefault)
            {
                var defaults = await db.SubscriptionPlans.Where(x => x.IsDefault).ToListAsync();
                foreach (var d in defaults) d.IsDefault = false;
            }
            var plan = new SubscriptionPlan
            {
                Code = code,
                Name = TeachingText.Safe(req.Name, 100),
                Description = TeachingText.NullIfEmpty(req.Description),
                IsActive = req.IsActive,
                IsDefault = req.IsDefault,
                IsPublic = req.IsPublic,
                SortOrder = req.SortOrder,
                Price = req.Price,
                Currency = string.IsNullOrWhiteSpace(req.Currency) ? "EGP" : TeachingText.Safe(req.Currency, 8).ToUpperInvariant(),
                BillingPeriodDays = Math.Clamp(req.BillingPeriodDays, 1, 3650),
                TrialDays = Math.Clamp(req.TrialDays, 0, 365),
                GraceDays = Math.Clamp(req.GraceDays, 0, 180),
                MaxStudents = Math.Max(0, req.MaxStudents),
                MaxCourses = Math.Max(0, req.MaxCourses),
                MaxGroups = Math.Max(0, req.MaxGroups),
                MaxAssistants = Math.Max(0, req.MaxAssistants),
                StorageMb = Math.Max(0, req.StorageMb),
                MaxVideoMinutes = Math.Max(0, req.MaxVideoMinutes),
                FeaturesJson = NormalizeFeatures(req.FeaturesJson)
            };
            db.SubscriptionPlans.Add(plan);
            TeachingNotify.Audit(db, Guid.Empty, null, "plan.created", "SubscriptionPlan", plan.Id.ToString(), plan.Code);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = plan.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/admin/plans/{id:guid}", async (Guid id, PlatformPlanInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return Results.Forbid();
            var plan = await db.SubscriptionPlans.FirstOrDefaultAsync(x => x.Id == id);
            if (plan is null) return TeachingAccess.NotFound("الخطة غير موجودة.");
            if (string.IsNullOrWhiteSpace(req.Name)) return TeachingAccess.Bad("اسم الخطة مطلوب.");
            if (req.Price < 0) return TeachingAccess.Bad("السعر لا يمكن أن يكون سالباً.");
            if (req.IsDefault && !plan.IsDefault)
            {
                var defaults = await db.SubscriptionPlans.Where(x => x.IsDefault && x.Id != id).ToListAsync();
                foreach (var d in defaults) d.IsDefault = false;
            }
            plan.Name = TeachingText.Safe(req.Name, 100);
            plan.Description = TeachingText.NullIfEmpty(req.Description);
            plan.IsActive = req.IsActive;
            plan.IsDefault = req.IsDefault;
            plan.IsPublic = req.IsPublic;
            plan.SortOrder = req.SortOrder;
            plan.Price = req.Price;
            plan.Currency = string.IsNullOrWhiteSpace(req.Currency) ? plan.Currency : TeachingText.Safe(req.Currency, 8).ToUpperInvariant();
            plan.BillingPeriodDays = Math.Clamp(req.BillingPeriodDays, 1, 3650);
            plan.TrialDays = Math.Clamp(req.TrialDays, 0, 365);
            plan.GraceDays = Math.Clamp(req.GraceDays, 0, 180);
            plan.MaxStudents = Math.Max(0, req.MaxStudents);
            plan.MaxCourses = Math.Max(0, req.MaxCourses);
            plan.MaxGroups = Math.Max(0, req.MaxGroups);
            plan.MaxAssistants = Math.Max(0, req.MaxAssistants);
            plan.StorageMb = Math.Max(0, req.StorageMb);
            plan.MaxVideoMinutes = Math.Max(0, req.MaxVideoMinutes);
            plan.FeaturesJson = NormalizeFeatures(req.FeaturesJson);
            plan.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, Guid.Empty, null, "plan.updated", "SubscriptionPlan", plan.Id.ToString(), plan.Code);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/admin/subscriptions", async (string? status, string? search, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return Results.Forbid();
            var query = db.TeacherSubscriptions.AsNoTracking().Include(x => x.Teacher).Include(x => x.Plan).AsQueryable();
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.Status == status);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(x => x.Teacher!.FullName.Contains(term) || x.Teacher.Email.Contains(term));
            }
            var rows = await query.OrderByDescending(x => x.UpdatedAtUtc).Take(300).ToListAsync();
            return Results.Ok(new
            {
                items = rows.Select(x => new
                {
                    x.Id, x.TeacherId, TeacherName = x.Teacher?.FullName, x.Teacher?.Email,
                    x.PlanId, PlanCode = x.Plan?.Code, PlanName = x.Plan?.Name,
                    x.Status, x.StartedAtUtc, x.EndsAtUtc, x.ConfirmedAtUtc, x.AutoRenew,
                    x.CancelledAtUtc, x.UpdatedAtUtc,
                    DaysLeft = x.EndsAtUtc is null ? (int?)null : (int)Math.Ceiling((x.EndsAtUtc.Value - DateTime.UtcNow).TotalDays)
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/admin/subscriptions/{id:guid}/activate", async (Guid id, AdminActivateInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return Results.Forbid();
            var subscription = await db.TeacherSubscriptions.Include(x => x.Plan).FirstOrDefaultAsync(x => x.Id == id);
            if (subscription is null) return TeachingAccess.NotFound("الاشتراك غير موجود.");
            var now = DateTime.UtcNow;
            var days = req.Days is > 0 ? req.Days.Value : Math.Max(1, subscription.Plan?.BillingPeriodDays ?? 30);
            var old = await db.TeacherSubscriptions
                .Where(x => x.TeacherId == subscription.TeacherId && x.Id != id && x.Status == "Confirmed")
                .ToListAsync();
            foreach (var item in old)
            {
                item.Status = "Expired";
                item.EndsAtUtc = now;
                item.UpdatedAtUtc = now;
            }
            subscription.Status = "Confirmed";
            subscription.StartedAtUtc = now;
            subscription.EndsAtUtc = now.AddDays(days);
            subscription.ConfirmedAtUtc = now;
            subscription.UpdatedAtUtc = now;
            TeachingNotify.Audit(db, Guid.Empty, null, "subscription.activated", "TeacherSubscription", id.ToString(), $"{days} days");
            await TeachingNotify.SendAsync(db, [subscription.TeacherId], "Subscription", "System",
                "تم تفعيل اشتراكك", $"الخطة: {subscription.Plan?.Name ?? "—"} حتى {subscription.EndsAtUtc:dd/MM/yyyy}", "subscription");
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/admin/subscriptions/{id:guid}/suspend", async (Guid id, CancelInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return Results.Forbid();
            var subscription = await db.TeacherSubscriptions.FirstOrDefaultAsync(x => x.Id == id);
            if (subscription is null) return TeachingAccess.NotFound("الاشتراك غير موجود.");
            subscription.Status = "Suspended";
            subscription.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, Guid.Empty, null, "subscription.suspended", "TeacherSubscription", id.ToString(), req.Reason);
            await TeachingNotify.SendAsync(db, [subscription.TeacherId], "Subscription", "System",
                "تم إيقاف اشتراكك", req.Reason ?? "يرجى التواصل مع إدارة المنصة.", "subscription");
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/admin/subscriptions/{id:guid}/cancel", async (Guid id, CancelInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return Results.Forbid();
            var subscription = await db.TeacherSubscriptions.FirstOrDefaultAsync(x => x.Id == id);
            if (subscription is null) return TeachingAccess.NotFound("الاشتراك غير موجود.");
            subscription.Status = "Cancelled";
            subscription.CancelledAtUtc = DateTime.UtcNow;
            subscription.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, Guid.Empty, null, "subscription.cancelled", "TeacherSubscription", id.ToString(), req.Reason);
            await TeachingNotify.SendAsync(db, [subscription.TeacherId], "Subscription", "System",
                "تم إلغاء اشتراكك", req.Reason ?? "بياناتك محفوظة ويمكنك التجديد لاحقاً.", "subscription");
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/admin/platform-payments", async (string? status, Guid? teacherId, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return Results.Forbid();
            var query = db.PlatformPayments.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.Status == status);
            if (teacherId.HasValue) query = query.Where(x => x.TeacherId == teacherId);
            var rows = await query.OrderByDescending(x => x.CreatedAtUtc).Take(300).ToListAsync();
            var teacherIds = rows.Select(x => x.TeacherId).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => teacherIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName, x.Email }).ToDictionaryAsync(x => x.Id);
            return Results.Ok(new
            {
                items = rows.Select(x =>
                {
                    names.TryGetValue(x.TeacherId, out var teacher);
                    return new
                    {
                        x.Id, x.TeacherId, TeacherName = teacher?.FullName, TeacherEmail = teacher?.Email,
                        x.SubscriptionId, x.Amount, x.Currency, x.Method, x.Reference, x.ReceiptUrl,
                        x.Status, x.AdminNote, x.CreatedAtUtc, x.ReviewedAtUtc
                    };
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/admin/platform-payments/{id:guid}/approve", async (Guid id, AdminReviewInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return Results.Forbid();
            var payment = await db.PlatformPayments.FirstOrDefaultAsync(x => x.Id == id);
            if (payment is null) return TeachingAccess.NotFound("الدفعة غير موجودة.");
            if (payment.Status != "Pending") return TeachingAccess.Bad("تمت مراجعة هذه الدفعة بالفعل.");
            var adminId = TeachingAccess.UserId(p);
            var now = DateTime.UtcNow;
            payment.Status = "Approved";
            payment.AdminNote = TeachingText.NullIfEmpty(req.Note);
            payment.ReviewedAtUtc = now;
            payment.ReviewedByAdminId = adminId;

            var subscription = payment.SubscriptionId is null ? null
                : await db.TeacherSubscriptions.FirstOrDefaultAsync(x => x.Id == payment.SubscriptionId.Value);
            if (subscription is null)
            {
                var fallbackPlan = await db.SubscriptionPlans.AsNoTracking()
                    .Where(x => x.IsActive).OrderBy(x => x.SortOrder).FirstOrDefaultAsync();
                if (fallbackPlan is null) return TeachingAccess.Bad("لا توجد خطة متاحة للتفعيل.");
                subscription = new TeacherSubscription
                {
                    TeacherId = payment.TeacherId, PlanId = fallbackPlan.Id, Status = "Pending",
                    CreatedAtUtc = now, UpdatedAtUtc = now
                };
                db.TeacherSubscriptions.Add(subscription);
                payment.SubscriptionId = subscription.Id;
            }
            var plan = await db.SubscriptionPlans.AsNoTracking().FirstOrDefaultAsync(x => x.Id == subscription.PlanId);
            var periodDays = Math.Max(1, plan?.BillingPeriodDays ?? 30);
            var periods = plan is not null && plan.Price > 0
                ? Math.Max(1, (int)Math.Round((double)(payment.Amount / plan.Price)))
                : 1;

            var active = await db.TeacherSubscriptions
                .Where(x => x.TeacherId == payment.TeacherId && x.Id != subscription.Id && x.Status == "Confirmed")
                .ToListAsync();
            var renewal = active.FirstOrDefault(x => x.PlanId == subscription.PlanId
                && x.EndsAtUtc != null && x.EndsAtUtc > now);
            DateTime start;
            if (renewal is not null && renewal.EndsAtUtc.HasValue)
            {
                start = renewal.EndsAtUtc.Value;
            }
            else
            {
                start = now;
                foreach (var item in active)
                {
                    item.Status = "Expired";
                    item.EndsAtUtc = now;
                    item.UpdatedAtUtc = now;
                }
            }
            subscription.Status = "Confirmed";
            subscription.StartedAtUtc = start;
            subscription.EndsAtUtc = start.AddDays(periodDays * periods);
            subscription.ConfirmedAtUtc = now;
            subscription.RenewedFromSubscriptionId = renewal?.Id ?? active.FirstOrDefault()?.Id;
            subscription.UpdatedAtUtc = now;

            TeachingNotify.Audit(db, Guid.Empty, adminId, "platform-payment.approved", "PlatformPayment", id.ToString(),
                $"plan={plan?.Code}, periods={periods}");
            await TeachingNotify.SendAsync(db, [payment.TeacherId], "Subscription", "Payments",
                "تم تفعيل اشتراكك", $"الخطة: {plan?.Name ?? "—"} حتى {subscription.EndsAtUtc:dd/MM/yyyy}", "subscription");
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, endsAtUtc = subscription.EndsAtUtc });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/admin/platform-payments/{id:guid}/reject", async (Guid id, AdminReviewInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (!IsAdmin(p)) return Results.Forbid();
            var payment = await db.PlatformPayments.FirstOrDefaultAsync(x => x.Id == id);
            if (payment is null) return TeachingAccess.NotFound("الدفعة غير موجودة.");
            if (payment.Status != "Pending") return TeachingAccess.Bad("تمت مراجعة هذه الدفعة بالفعل.");
            payment.Status = "Rejected";
            payment.AdminNote = TeachingText.NullIfEmpty(req.Note);
            payment.ReviewedAtUtc = DateTime.UtcNow;
            payment.ReviewedByAdminId = TeachingAccess.UserId(p);
            if (payment.SubscriptionId is Guid subId)
            {
                var pending = await db.TeacherSubscriptions
                    .FirstOrDefaultAsync(x => x.Id == subId && x.Status == "Pending");
                if (pending is not null)
                {
                    pending.Status = "Rejected";
                    pending.UpdatedAtUtc = DateTime.UtcNow;
                }
            }
            TeachingNotify.Audit(db, Guid.Empty, TeachingAccess.UserId(p), "platform-payment.rejected", "PlatformPayment", id.ToString(), req.Note);
            await TeachingNotify.SendAsync(db, [payment.TeacherId], "Subscription", "Payments",
                "لم يتم تأكيد دفعة الاشتراك", req.Note ?? "يرجى مراجعة بيانات الدفع والمحاولة مرة أخرى.", "subscription");
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        // Teacher-facing subscription history (current subscription is served by /api/teacher/subscription).
        app.MapGet("/api/teacher/subscription/payments", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var teacherId = TeachingAccess.UserId(p);
            if (teacherId is null || TeachingAccess.Role(p) != "Teacher") return Results.Forbid();
            var subscriptions = await db.TeacherSubscriptions.AsNoTracking()
                .Include(x => x.Plan)
                .Where(x => x.TeacherId == teacherId)
                .OrderByDescending(x => x.CreatedAtUtc).Take(60).ToListAsync();
            var payments = await db.PlatformPayments.AsNoTracking()
                .Where(x => x.TeacherId == teacherId)
                .OrderByDescending(x => x.CreatedAtUtc).Take(120).ToListAsync();
            return Results.Ok(new
            {
                subscriptions = subscriptions.Select(x => new
                {
                    x.Id, planCode = x.Plan?.Code, planName = x.Plan?.Name, x.Status,
                    x.StartedAtUtc, x.EndsAtUtc, x.ConfirmedAtUtc, x.CancelledAtUtc, x.AutoRenew, x.CreatedAtUtc
                }),
                payments = payments.Select(x => new
                {
                    x.Id, x.Amount, x.Currency, x.Method, x.Reference, x.ReceiptUrl,
                    x.Status, x.AdminNote, x.CreatedAtUtc, x.ReviewedAtUtc
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        // =====================================================================
        //  Teacher → student: packages, coupons, charges, payments, adjustments
        // =====================================================================
        app.MapGet("/api/teaching/packages", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.PaymentsView)) return TeachingAccess.Deny();
            var packages = await db.StudentPackages.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId)
                .OrderByDescending(x => x.IsActive).ThenBy(x => x.Name).ToListAsync();
            var ids = packages.Select(x => x.Id).ToList();
            var items = await db.PackageItems.AsNoTracking().Where(x => ids.Contains(x.PackageId)).ToListAsync();
            var enrollments = await db.PackageEnrollments.AsNoTracking()
                .Where(x => ids.Contains(x.PackageId))
                .GroupBy(x => x.PackageId)
                .Select(g => new { PackageId = g.Key, Count = g.Count(), Active = g.Count(x => x.Status == "Active") })
                .ToDictionaryAsync(x => x.PackageId);
            return Results.Ok(new
            {
                items = packages.Select(x => new
                {
                    x.Id, x.Name, x.Description, x.Kind, x.Price, x.OldPrice, x.DurationDays,
                    x.SessionsIncluded, x.Capacity, x.IsRecurring, x.IsActive, x.AvailableFromUtc, x.AvailableUntilUtc,
                    Items = items.Where(i => i.PackageId == x.Id).Select(i => new { i.Id, i.ItemType, i.ItemId }),
                    Enrollments = enrollments.GetValueOrDefault(x.Id)?.Count ?? 0,
                    ActiveEnrollments = enrollments.GetValueOrDefault(x.Id)?.Active ?? 0
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/packages", async (PackageInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.PaymentsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            if (string.IsNullOrWhiteSpace(req.Name)) return TeachingAccess.Bad("اسم الباقة مطلوب.");
            var items = await ValidatePackageItemsAsync(db, scope.TeacherId, req.Items);
            if (items.Error is not null) return TeachingAccess.Bad(items.Error);
            var package = new StudentPackage
            {
                TeacherId = scope.TeacherId,
                Name = TeachingText.Safe(req.Name, 150),
                Description = TeachingText.NullIfEmpty(req.Description),
                Kind = NormalizePackageKind(req.Kind),
                Price = Math.Max(0, req.Price),
                OldPrice = req.OldPrice,
                DurationDays = Math.Clamp(req.DurationDays, 1, 3650),
                SessionsIncluded = req.SessionsIncluded,
                Capacity = req.Capacity,
                IsRecurring = req.IsRecurring,
                IsActive = req.IsActive,
                AvailableFromUtc = req.AvailableFromUtc,
                AvailableUntilUtc = req.AvailableUntilUtc
            };
            db.StudentPackages.Add(package);
            foreach (var item in items.Items)
                db.PackageItems.Add(new PackageItem { TeacherId = scope.TeacherId, PackageId = package.Id, ItemType = item.Type, ItemId = item.Id });
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "package.created", "StudentPackage", package.Id.ToString(), package.Name);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = package.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/packages/{id:guid}", async (Guid id, PackageInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.PaymentsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var package = await db.StudentPackages.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (package is null) return TeachingAccess.NotFound("الباقة غير موجودة.");
            if (string.IsNullOrWhiteSpace(req.Name)) return TeachingAccess.Bad("اسم الباقة مطلوب.");
            var items = await ValidatePackageItemsAsync(db, scope.TeacherId, req.Items);
            if (items.Error is not null) return TeachingAccess.Bad(items.Error);
            package.Name = TeachingText.Safe(req.Name, 150);
            package.Description = TeachingText.NullIfEmpty(req.Description);
            package.Kind = NormalizePackageKind(req.Kind);
            package.Price = Math.Max(0, req.Price);
            package.OldPrice = req.OldPrice;
            package.DurationDays = Math.Clamp(req.DurationDays, 1, 3650);
            package.SessionsIncluded = req.SessionsIncluded;
            package.Capacity = req.Capacity;
            package.IsRecurring = req.IsRecurring;
            package.IsActive = req.IsActive;
            package.AvailableFromUtc = req.AvailableFromUtc;
            package.AvailableUntilUtc = req.AvailableUntilUtc;
            package.UpdatedAtUtc = DateTime.UtcNow;
            var existing = await db.PackageItems.Where(x => x.PackageId == id).ToListAsync();
            db.PackageItems.RemoveRange(existing);
            foreach (var item in items.Items)
                db.PackageItems.Add(new PackageItem { TeacherId = scope.TeacherId, PackageId = id, ItemType = item.Type, ItemId = item.Id });
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "package.updated", "StudentPackage", id.ToString(), package.Name);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/packages/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.PaymentsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var package = await db.StudentPackages.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (package is null) return TeachingAccess.NotFound("الباقة غير موجودة.");
            package.IsActive = false;
            package.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "package.deactivated", "StudentPackage", id.ToString(), package.Name);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/coupons", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.PaymentsView)) return TeachingAccess.Deny();
            var items = await db.DiscountCoupons.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId)
                .OrderByDescending(x => x.IsActive).ThenBy(x => x.Code).ToListAsync();
            return Results.Ok(new { items });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/coupons", async (CouponInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.PaymentsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var code = TeachingText.Safe(req.Code, 40).Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(code)) return TeachingAccess.Bad("كود الخصم مطلوب.");
            if (req.Value <= 0) return TeachingAccess.Bad("قيمة الخصم يجب أن تكون أكبر من صفر.");
            if (req.Kind == "Percent" && req.Value > 100) return TeachingAccess.Bad("نسبة الخصم لا تتجاوز 100%.");
            if (await db.DiscountCoupons.AnyAsync(x => x.TeacherId == scope.TeacherId && x.Code == code))
                return TeachingAccess.Bad("كود الخصم مستخدم بالفعل.");
            var coupon = new DiscountCoupon
            {
                TeacherId = scope.TeacherId,
                Code = code,
                Kind = req.Kind == "Fixed" ? "Fixed" : "Percent",
                Value = req.Value,
                MaxUses = req.MaxUses,
                ValidFromUtc = req.ValidFromUtc,
                ValidUntilUtc = req.ValidUntilUtc,
                IsActive = req.IsActive
            };
            db.DiscountCoupons.Add(coupon);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "coupon.created", "DiscountCoupon", coupon.Id.ToString(), code);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = coupon.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/coupons/{id:guid}", async (Guid id, CouponInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.PaymentsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var coupon = await db.DiscountCoupons.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (coupon is null) return TeachingAccess.NotFound("كود الخصم غير موجود.");
            if (req.Value <= 0) return TeachingAccess.Bad("قيمة الخصم يجب أن تكون أكبر من صفر.");
            if (req.Kind == "Percent" && req.Value > 100) return TeachingAccess.Bad("نسبة الخصم لا تتجاوز 100%.");
            coupon.Kind = req.Kind == "Fixed" ? "Fixed" : "Percent";
            coupon.Value = req.Value;
            coupon.MaxUses = req.MaxUses;
            coupon.ValidFromUtc = req.ValidFromUtc;
            coupon.ValidUntilUtc = req.ValidUntilUtc;
            coupon.IsActive = req.IsActive;
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "coupon.updated", "DiscountCoupon", id.ToString(), coupon.Code);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/packages/{id:guid}/enrollments", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.PaymentsView)) return TeachingAccess.Deny();
            var package = await db.StudentPackages.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (package is null) return TeachingAccess.NotFound("الباقة غير موجودة.");
            var rows = await db.PackageEnrollments.AsNoTracking()
                .Where(x => x.PackageId == id)
                .Join(db.Users.AsNoTracking(), e => e.StudentId, u => u.Id,
                    (e, u) => new
                    {
                        e.Id, e.StudentId, Name = u.FullName, u.StudentCode, e.Status,
                        e.EnrolledAtUtc, e.StartsAtUtc, e.ExpiresAtUtc, e.AmountDue, e.AmountPaid,
                        e.CouponCode
                    })
                .OrderBy(x => x.Name).ToListAsync();
            return Results.Ok(new { items = rows });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/packages/{id:guid}/enroll", async (Guid id, PackageEnrollInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.PaymentsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var package = await db.StudentPackages
                .FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (package is null) return TeachingAccess.NotFound("الباقة غير موجودة.");
            if (!package.IsActive) return TeachingAccess.Bad("الباقة غير مفعّلة.");
            var student = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == req.StudentId && x.Role == "Student");
            if (student is null) return TeachingAccess.NotFound("الطالب غير موجود.");
            if (!await TeachingAccess.IsLinkedStudentAsync(db, scope.TeacherId, student.Id))
                return TeachingAccess.Bad("الطالب غير مرتبط بحسابك.");
            if (package.Capacity is > 0)
            {
                var activeCount = await db.PackageEnrollments.CountAsync(x => x.PackageId == id && x.Status == "Active");
                if (activeCount >= package.Capacity) return TeachingAccess.Bad("الباقة وصلت للحد الأقصى.");
            }

            var price = package.Price;
            DiscountCoupon? coupon = null;
            if (!string.IsNullOrWhiteSpace(req.CouponCode))
            {
                var code = req.CouponCode.Trim().ToUpperInvariant();
                coupon = await db.DiscountCoupons
                    .FirstOrDefaultAsync(x => x.TeacherId == scope.TeacherId && x.Code == code && x.IsActive);
                if (coupon is null) return TeachingAccess.Bad("كود الخصم غير صالح.");
                var nowCheck = DateTime.UtcNow;
                if (coupon.ValidFromUtc is not null && coupon.ValidFromUtc > nowCheck)
                    return TeachingAccess.Bad("كود الخصم لم يبدأ بعد.");
                if (coupon.ValidUntilUtc is not null && coupon.ValidUntilUtc < nowCheck)
                    return TeachingAccess.Bad("انتهت صلاحية كود الخصم.");
                if (coupon.MaxUses is > 0 && coupon.UsedCount >= coupon.MaxUses)
                    return TeachingAccess.Bad("تم استهلاك كود الخصم.");
                price = coupon.Kind == "Percent"
                    ? Math.Max(0, price - (price * coupon.Value / 100m))
                    : Math.Max(0, price - coupon.Value);
            }

            var now = DateTime.UtcNow;
            var enrollment = await db.PackageEnrollments
                .FirstOrDefaultAsync(x => x.PackageId == id && x.StudentId == student.Id);
            if (enrollment is null)
            {
                enrollment = new PackageEnrollment
                {
                    PackageId = id, TeacherId = scope.TeacherId, StudentId = student.Id,
                    EnrolledAtUtc = now
                };
                db.PackageEnrollments.Add(enrollment);
            }
            enrollment.Status = "Active";
            enrollment.StartsAtUtc = req.StartsAtUtc ?? now;
            enrollment.ExpiresAtUtc = (req.StartsAtUtc ?? now).AddDays(package.DurationDays);
            enrollment.AmountDue = price;
            enrollment.AmountPaid = Math.Clamp(req.InitialPayment, 0, price);
            enrollment.CouponCode = coupon?.Code;
            enrollment.UpdatedAtUtc = now;
            if (coupon is not null) coupon.UsedCount++;

            // Grant the package contents so the student can actually see them.
            var items = await db.PackageItems.AsNoTracking().Where(x => x.PackageId == id).ToListAsync();
            foreach (var item in items)
            {
                if (item.ItemType == "Course")
                {
                    var ce = await db.CourseEnrollments
                        .FirstOrDefaultAsync(x => x.CourseId == item.ItemId && x.StudentId == student.Id);
                    if (ce is null)
                    {
                        ce = new CourseEnrollment { TeacherId = scope.TeacherId, CourseId = item.ItemId, StudentId = student.Id };
                        db.CourseEnrollments.Add(ce);
                    }
                    ce.Status = "Active";
                    ce.PackageId = id;
                    ce.StartsAtUtc = enrollment.StartsAtUtc;
                    ce.ExpiresAtUtc = enrollment.ExpiresAtUtc;
                    ce.UpdatedAtUtc = now;
                }
                else if (item.ItemType == "Group")
                {
                    var gm = await db.GroupMemberships
                        .FirstOrDefaultAsync(x => x.GroupId == item.ItemId && x.StudentId == student.Id);
                    if (gm is null)
                    {
                        gm = new GroupMembership { TeacherId = scope.TeacherId, GroupId = item.ItemId, StudentId = student.Id };
                        db.GroupMemberships.Add(gm);
                    }
                    gm.Status = "Active";
                    gm.SuspendedAtUtc = null;
                    gm.UpdatedAtUtc = now;
                }
            }

            StudentPayment? payment = null;
            if (enrollment.AmountPaid > 0)
            {
                payment = new StudentPayment
                {
                    TeacherId = scope.TeacherId, StudentId = student.Id, PackageId = id,
                    Amount = enrollment.AmountPaid,
                    Method = string.IsNullOrWhiteSpace(req.Method) ? "Cash" : req.Method,
                    Reference = TeachingText.NullIfEmpty(req.Reference),
                    Notes = "دفعة مبدئية عند التسجيل في الباقة",
                    ReceiptNumber = GenerateReceiptNumber(),
                    ReceivedByUserId = scope.UserId
                };
                db.StudentPayments.Add(payment);
            }

            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "package.enrolled", "PackageEnrollment", enrollment.Id.ToString(), student.FullName);
            await TeachingNotify.SendAsync(db, [student.Id], "Package", "Payments",
                "تم تسجيلك في باقة", $"{package.Name} — المستحق: {enrollment.AmountDue:0.##}", "finance");
            await db.SaveChangesAsync();
            return Results.Ok(new
            {
                id = enrollment.Id,
                amountDue = enrollment.AmountDue,
                amountPaid = enrollment.AmountPaid,
                expiresAtUtc = enrollment.ExpiresAtUtc,
                paymentId = payment?.Id,
                receiptNumber = payment?.ReceiptNumber
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        // ------------------------- charges / payments -------------------------
        app.MapGet("/api/teaching/finance/students", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.PaymentsView)) return TeachingAccess.Deny();
            var linked = await TeachingAccess.LinkedStudentIds(db, scope.TeacherId)
                .Join(db.Users.AsNoTracking(), id => id, u => u.Id,
                    (id, u) => new { u.Id, u.FullName, u.StudentCode, u.StudentPhone })
                .OrderBy(x => x.FullName).ToListAsync();
            var charges = await db.FinancialCharges.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId && !x.IsVoid)
                .GroupBy(x => x.StudentId)
                .Select(g => new { StudentId = g.Key, Total = g.Sum(x => x.Amount) })
                .ToDictionaryAsync(x => x.StudentId, x => x.Total);
            var payments = await db.StudentPayments.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId && !x.IsVoid)
                .GroupBy(x => x.StudentId)
                .Select(g => new { StudentId = g.Key, Total = g.Sum(x => x.Amount) })
                .ToDictionaryAsync(x => x.StudentId, x => x.Total);
            var adjustments = await db.FinancialAdjustments.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId)
                .GroupBy(x => x.StudentId)
                .Select(g => new { StudentId = g.Key, Total = g.Sum(x => x.Amount) })
                .ToDictionaryAsync(x => x.StudentId, x => x.Total);
            return Results.Ok(new
            {
                items = linked.Select(x =>
                {
                    var charged = charges.GetValueOrDefault(x.Id);
                    var paid = payments.GetValueOrDefault(x.Id);
                    var adjusted = adjustments.GetValueOrDefault(x.Id);
                    return new
                    {
                        x.Id, x.FullName, x.StudentCode, x.StudentPhone,
                        Charged = charged, Paid = paid, Adjustments = adjusted,
                        Balance = charged - paid - adjusted
                    };
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/finance/charges", async (Guid? studentId, Guid? groupId, string? status,
            DateTime? from, DateTime? to, int page, int pageSize, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.PaymentsView)) return TeachingAccess.Deny();
            var query = db.FinancialCharges.AsNoTracking().Where(x => x.TeacherId == scope.TeacherId);
            if (studentId.HasValue) query = query.Where(x => x.StudentId == studentId);
            if (groupId.HasValue) query = query.Where(x => x.GroupId == groupId);
            if (from.HasValue) query = query.Where(x => x.DueDateUtc >= from.Value.Date);
            if (to.HasValue) query = query.Where(x => x.DueDateUtc < to.Value.Date.AddDays(1));
            var pageNo = page <= 0 ? 1 : page;
            var size = pageSize is <= 0 or > 200 ? 50 : pageSize;
            var total = await query.CountAsync();
            var rows = await query.OrderByDescending(x => x.CreatedAtUtc)
                .Skip((pageNo - 1) * size).Take(size).ToListAsync();
            var ids = rows.Select(x => x.Id).ToList();
            var paidByCharge = await db.StudentPayments.AsNoTracking()
                .Where(x => !x.IsVoid && x.ChargeId != null && ids.Contains(x.ChargeId.Value))
                .GroupBy(x => x.ChargeId!.Value)
                .Select(g => new { ChargeId = g.Key, Total = g.Sum(x => x.Amount) })
                .ToDictionaryAsync(x => x.ChargeId, x => x.Total);
            var studentIds = rows.Select(x => x.StudentId).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => studentIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName }).ToDictionaryAsync(x => x.Id, x => x.FullName);
            var now = DateTime.UtcNow;
            var items = rows.Select(x =>
            {
                var paid = paidByCharge.GetValueOrDefault(x.Id);
                var outstanding = Math.Max(0, x.Amount - paid);
                var state = x.IsVoid ? "Void" : outstanding <= 0 ? "Paid" : x.DueDateUtc < now ? "Overdue" : "Unpaid";
                return new
                {
                    x.Id, x.StudentId, StudentName = names.GetValueOrDefault(x.StudentId),
                    x.GroupId, x.CourseId, x.PackageId, x.SessionId, x.Kind, x.Amount, x.DueDateUtc,
                    x.Description, x.IsVoid, x.VoidReason, x.CreatedAtUtc, Paid = paid,
                    Outstanding = outstanding, State = state
                };
            }).ToList();
            if (!string.IsNullOrWhiteSpace(status))
                items = items.Where(x => string.Equals(x.State, status, StringComparison.OrdinalIgnoreCase)).ToList();
            return Results.Ok(new { page = pageNo, pageSize = size, total, items });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/finance/charges", async (ChargeInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.PaymentsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            if (req.Amount <= 0) return TeachingAccess.Bad("قيمة المستحق يجب أن تكون أكبر من صفر.");
            var student = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == req.StudentId && x.Role == "Student");
            if (student is null) return TeachingAccess.NotFound("الطالب غير موجود.");
            if (!await TeachingAccess.IsLinkedStudentAsync(db, scope.TeacherId, student.Id))
                return TeachingAccess.Bad("الطالب غير مرتبط بحسابك.");
            var dedupe = string.IsNullOrWhiteSpace(req.DedupeKey) ? "manual:" + Guid.NewGuid().ToString("N") : req.DedupeKey.Trim();
            var duplicate = await db.FinancialCharges
                .FirstOrDefaultAsync(x => x.TeacherId == scope.TeacherId && x.DedupeKey == dedupe && !x.IsVoid);
            if (duplicate is not null) return Results.Ok(new { id = duplicate.Id, duplicate = true });
            var charge = new FinancialCharge
            {
                TeacherId = scope.TeacherId,
                StudentId = student.Id,
                GroupId = req.GroupId,
                CourseId = req.CourseId,
                PackageId = req.PackageId,
                SessionId = req.SessionId,
                Kind = string.IsNullOrWhiteSpace(req.Kind) ? "Manual" : TeachingText.Safe(req.Kind, 40),
                Amount = req.Amount,
                DueDateUtc = req.DueDateUtc ?? DateTime.UtcNow.Date,
                Description = TeachingText.Safe(string.IsNullOrWhiteSpace(req.Description) ? "مستحق" : req.Description, 250),
                DedupeKey = dedupe,
                CreatedByUserId = scope.UserId
            };
            db.FinancialCharges.Add(charge);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "charge.created", "FinancialCharge", charge.Id.ToString(), $"{charge.Amount}");
            await TeachingNotify.SendAsync(db, [student.Id], "Payment", "Payments",
                "مستحق جديد", $"{charge.Description}: {charge.Amount:0.##}", "finance");
            await db.SaveChangesAsync();
            return Results.Ok(new { id = charge.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/finance/charges/{id:guid}/void", async (Guid id, CancelInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.PaymentsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var charge = await db.FinancialCharges.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (charge is null) return TeachingAccess.NotFound("المستحق غير موجود.");
            if (charge.IsVoid) return Results.Ok(new { ok = true });
            if (string.IsNullOrWhiteSpace(req.Reason)) return TeachingAccess.Bad("سبب الإلغاء مطلوب.");
            charge.IsVoid = true;
            charge.VoidReason = TeachingText.Safe(req.Reason, 250);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "charge.voided", "FinancialCharge", id.ToString(), charge.VoidReason);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/finance/payments", async (Guid? studentId, DateTime? from, DateTime? to,
            int page, int pageSize, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.PaymentsView)) return TeachingAccess.Deny();
            var query = db.StudentPayments.AsNoTracking().Where(x => x.TeacherId == scope.TeacherId);
            if (studentId.HasValue) query = query.Where(x => x.StudentId == studentId);
            if (from.HasValue) query = query.Where(x => x.PaidAtUtc >= from.Value.Date);
            if (to.HasValue) query = query.Where(x => x.PaidAtUtc < to.Value.Date.AddDays(1));
            var pageNo = page <= 0 ? 1 : page;
            var size = pageSize is <= 0 or > 200 ? 50 : pageSize;
            var total = await query.CountAsync();
            var rows = await query.OrderByDescending(x => x.PaidAtUtc)
                .Skip((pageNo - 1) * size).Take(size).ToListAsync();
            var studentIds = rows.Select(x => x.StudentId).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => studentIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName }).ToDictionaryAsync(x => x.Id, x => x.FullName);
            return Results.Ok(new
            {
                page = pageNo, pageSize = size, total,
                items = rows.Select(x => new
                {
                    x.Id, x.StudentId, StudentName = names.GetValueOrDefault(x.StudentId),
                    x.GroupId, x.CourseId, x.PackageId, x.ChargeId, x.Amount, x.Method,
                    x.Reference, x.Notes, x.ReceiptNumber, x.PaidAtUtc, x.IsVoid, x.VoidReason
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/finance/payments", async (PaymentInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.PaymentsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            if (req.Amount <= 0) return TeachingAccess.Bad("قيمة الدفعة يجب أن تكون أكبر من صفر.");
            var student = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == req.StudentId && x.Role == "Student");
            if (student is null) return TeachingAccess.NotFound("الطالب غير موجود.");
            if (!await TeachingAccess.IsLinkedStudentAsync(db, scope.TeacherId, student.Id))
                return TeachingAccess.Bad("الطالب غير مرتبط بحسابك.");
            if (req.ChargeId is Guid chargeId)
            {
                var charge = await db.FinancialCharges.AsNoTracking()
                    .FirstOrDefaultAsync(x => x.Id == chargeId && x.TeacherId == scope.TeacherId && !x.IsVoid);
                if (charge is null) return TeachingAccess.NotFound("المستحق غير موجود.");
                if (charge.StudentId != student.Id) return TeachingAccess.Bad("المستحق لا يخص هذا الطالب.");
            }
            var method = string.IsNullOrWhiteSpace(req.Method) ? "Cash" : req.Method.Trim();
            if (!new[] { "Cash", "VodafoneCash", "InstaPay", "BankTransfer", "Online" }.Contains(method))
                return TeachingAccess.Bad("طريقة الدفع غير صالحة.");
            var payment = new StudentPayment
            {
                TeacherId = scope.TeacherId,
                StudentId = student.Id,
                GroupId = req.GroupId,
                CourseId = req.CourseId,
                PackageId = req.PackageId,
                ChargeId = req.ChargeId,
                Amount = req.Amount,
                Method = method,
                Reference = TeachingText.NullIfEmpty(req.Reference),
                Notes = TeachingText.NullIfEmpty(req.Notes),
                ReceiptNumber = GenerateReceiptNumber(),
                ReceivedByUserId = scope.UserId,
                PaidAtUtc = req.PaidAtUtc ?? DateTime.UtcNow
            };
            db.StudentPayments.Add(payment);
            if (req.PackageId is Guid packageId)
            {
                var enrollment = await db.PackageEnrollments
                    .FirstOrDefaultAsync(x => x.PackageId == packageId && x.StudentId == student.Id);
                if (enrollment is not null)
                {
                    enrollment.AmountPaid += payment.Amount;
                    enrollment.UpdatedAtUtc = DateTime.UtcNow;
                }
            }
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "payment.recorded", "StudentPayment", payment.Id.ToString(), $"{payment.Amount} {payment.ReceiptNumber}");
            await TeachingNotify.SendAsync(db, [student.Id], "Payment", "Payments",
                "تم تسجيل دفعة", $"{payment.Amount:0.##} — إيصال {payment.ReceiptNumber}", "finance");
            await db.SaveChangesAsync();
            return Results.Ok(new { id = payment.Id, receiptNumber = payment.ReceiptNumber });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/finance/payments/{id:guid}/void", async (Guid id, CancelInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.PaymentsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var payment = await db.StudentPayments.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (payment is null) return TeachingAccess.NotFound("الدفعة غير موجودة.");
            if (payment.IsVoid) return Results.Ok(new { ok = true });
            if (string.IsNullOrWhiteSpace(req.Reason)) return TeachingAccess.Bad("سبب الإلغاء مطلوب.");
            payment.IsVoid = true;
            payment.VoidReason = TeachingText.Safe(req.Reason, 250);
            if (payment.PackageId is Guid packageId)
            {
                var enrollment = await db.PackageEnrollments
                    .FirstOrDefaultAsync(x => x.PackageId == packageId && x.StudentId == payment.StudentId);
                if (enrollment is not null)
                {
                    enrollment.AmountPaid = Math.Max(0, enrollment.AmountPaid - payment.Amount);
                    enrollment.UpdatedAtUtc = DateTime.UtcNow;
                }
            }
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "payment.voided", "StudentPayment", id.ToString(), payment.VoidReason);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/finance/adjustments", async (Guid? studentId, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.PaymentsView)) return TeachingAccess.Deny();
            var query = db.FinancialAdjustments.AsNoTracking().Where(x => x.TeacherId == scope.TeacherId);
            if (studentId.HasValue) query = query.Where(x => x.StudentId == studentId);
            var rows = await query.OrderByDescending(x => x.CreatedAtUtc).Take(200).ToListAsync();
            var studentIds = rows.Select(x => x.StudentId).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => studentIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName }).ToDictionaryAsync(x => x.Id, x => x.FullName);
            return Results.Ok(new
            {
                items = rows.Select(x => new
                {
                    x.Id, x.StudentId, StudentName = names.GetValueOrDefault(x.StudentId),
                    x.GroupId, x.Kind, x.Amount, x.Reason, x.CreatedAtUtc
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/finance/adjustments", async (AdjustmentInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.PaymentsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            if (req.Amount <= 0) return TeachingAccess.Bad("قيمة التسوية يجب أن تكون أكبر من صفر.");
            if (string.IsNullOrWhiteSpace(req.Reason)) return TeachingAccess.Bad("سبب التسوية مطلوب.");
            var student = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == req.StudentId && x.Role == "Student");
            if (student is null) return TeachingAccess.NotFound("الطالب غير موجود.");
            if (!await TeachingAccess.IsLinkedStudentAsync(db, scope.TeacherId, student.Id))
                return TeachingAccess.Bad("الطالب غير مرتبط بحسابك.");
            var adjustment = new FinancialAdjustment
            {
                TeacherId = scope.TeacherId,
                StudentId = student.Id,
                GroupId = req.GroupId,
                Kind = req.Kind is "Scholarship" or "Refund" or "Correction" ? req.Kind : "Discount",
                Amount = req.Amount,
                Reason = TeachingText.Safe(req.Reason, 250),
                CreatedByUserId = scope.UserId
            };
            db.FinancialAdjustments.Add(adjustment);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "adjustment.created", "FinancialAdjustment", adjustment.Id.ToString(), $"{adjustment.Kind}:{adjustment.Amount}");
            await TeachingNotify.SendAsync(db, [student.Id], "Payment", "Payments",
                "تسوية مالية", $"{adjustment.Kind}: {adjustment.Amount:0.##} — {adjustment.Reason}", "finance");
            await db.SaveChangesAsync();
            return Results.Ok(new { id = adjustment.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        // --------------------------- billing engine ---------------------------
        app.MapPost("/api/teaching/finance/generate", async (BillingGenerateInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.PaymentsManage);
            if (error is not null) return error;
            if (scope is null) return TeachingAccess.Deny();
            var monthStart = ParseMonth(req.Month);
            if (monthStart is null) return TeachingAccess.Bad("صيغة الشهر يجب أن تكون yyyy-MM.");
            var from = monthStart.Value;
            var to = from.AddMonths(1);
            var monthKey = from.ToString("yyyy-MM");

            var groups = await db.TeachingGroups
                .Where(x => x.TeacherId == scope.TeacherId && x.IsActive && x.Price > 0)
                .ToListAsync();
            var groupIds = groups.Select(x => x.Id).ToList();
            var members = await db.GroupMemberships.AsNoTracking()
                .Where(x => groupIds.Contains(x.GroupId) && x.Status == "Active")
                .ToListAsync();
            var existingKeys = await db.FinancialCharges.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId && !x.IsVoid)
                .Select(x => x.DedupeKey)
                .ToListAsync();
            var keys = existingKeys.ToHashSet(StringComparer.Ordinal);
            var created = 0;
            var skipped = 0;
            var notifiedStudents = new HashSet<Guid>();

            foreach (var group in groups.Where(x => x.PaymentType == "Monthly"))
            {
                var dueDay = Math.Clamp(group.MonthlyDueDay, 1, 28);
                var dueDate = new DateTime(from.Year, from.Month, dueDay, 0, 0, 0, DateTimeKind.Utc);
                foreach (var member in members.Where(x => x.GroupId == group.Id))
                {
                    var key = $"group:{group.Id:N}:student:{member.StudentId:N}:month:{monthKey}";
                    if (!keys.Add(key)) { skipped++; continue; }
                    db.FinancialCharges.Add(new FinancialCharge
                    {
                        TeacherId = scope.TeacherId, StudentId = member.StudentId, GroupId = group.Id,
                        Kind = "MonthlySubscription", Amount = group.Price, DueDateUtc = dueDate,
                        Description = $"اشتراك {monthKey} — {group.Name}", DedupeKey = key,
                        CreatedByUserId = scope.UserId
                    });
                    notifiedStudents.Add(member.StudentId);
                    created++;
                }
            }

            // Session-based billing only counts sessions that actually finished.
            var now = DateTime.UtcNow;
            var perSessionGroups = groups.Where(x => x.PaymentType == "PerSession").ToList();
            if (perSessionGroups.Count > 0)
            {
                var perGroupIds = perSessionGroups.Select(x => x.Id).ToList();
                var sessions = await db.GroupSessions.AsNoTracking()
                    .Where(x => perGroupIds.Contains(x.GroupId) && x.StartsAtUtc >= from && x.StartsAtUtc < to)
                    .ToListAsync();
                var completed = sessions.Where(x =>
                    SessionStatusCalculator.Compute(x.StartsAtUtc, x.EndsAtUtc, x.Status,
                        x.ActualStartAtUtc, x.ActualEndAtUtc, now) == SessionStatusCalculator.Completed).ToList();
                var sessionIds = completed.Select(x => x.Id).ToList();
                var attendance = await db.SessionAttendances.AsNoTracking()
                    .Where(x => sessionIds.Contains(x.SessionId)).ToListAsync();
                foreach (var group in perSessionGroups)
                {
                    foreach (var session in completed.Where(x => x.GroupId == group.Id))
                    {
                        var eligible = group.SessionBillingPolicy == "PerScheduledSession"
                            ? members.Where(x => x.GroupId == group.Id).Select(x => x.StudentId).ToList()
                            : attendance.Where(x => x.SessionId == session.Id && x.Status is "Present" or "Late")
                                .Select(x => x.StudentId).ToList();
                        foreach (var studentId in eligible.Distinct())
                        {
                            var key = $"session:{session.Id:N}:student:{studentId:N}";
                            if (!keys.Add(key)) { skipped++; continue; }
                            db.FinancialCharges.Add(new FinancialCharge
                            {
                                TeacherId = scope.TeacherId, StudentId = studentId, GroupId = group.Id,
                                SessionId = session.Id, Kind = "PerSession", Amount = group.Price,
                                DueDateUtc = session.StartsAtUtc.Date,
                                Description = $"حصة {session.StartsAtUtc:dd/MM/yyyy} — {group.Name}",
                                DedupeKey = key, CreatedByUserId = scope.UserId
                            });
                            notifiedStudents.Add(studentId);
                            created++;
                        }
                    }
                }
            }

            if (created > 0)
            {
                TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "billing.generated", "FinancialCharge", null, $"{monthKey}: +{created}");
                await TeachingNotify.SendAsync(db, notifiedStudents, "Payment", "Payments",
                    "مستحقات جديدة", $"تم إصدار مستحقات شهر {monthKey}.", "finance");
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { created, skipped, month = monthKey });
        }).RequireAuthorization().RequireRateLimiting("api");

        // ----------------------------- reporting ------------------------------
        app.MapGet("/api/teaching/finance/summary", async (DateTime? from, DateTime? to, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.PaymentsView)) return TeachingAccess.Deny();
            var start = (from ?? new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc));
            var end = (to ?? DateTime.UtcNow.Date).Date.AddDays(1);
            var charges = await db.FinancialCharges.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId).ToListAsync();
            var payments = await db.StudentPayments.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId).ToListAsync();
            var adjustments = await db.FinancialAdjustments.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId).ToListAsync();
            var enrollments = await db.PackageEnrollments.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId).ToListAsync();
            var now = DateTime.UtcNow;

            var liveCharges = charges.Where(x => !x.IsVoid).ToList();
            var livePayments = payments.Where(x => !x.IsVoid).ToList();
            var totalCharged = liveCharges.Sum(x => x.Amount);
            var totalPaid = livePayments.Sum(x => x.Amount);
            var totalAdjusted = adjustments.Sum(x => x.Amount);
            var outstanding = Math.Max(0, totalCharged - totalPaid - totalAdjusted);
            var overdue = liveCharges.Where(x => x.DueDateUtc < now.Date).Sum(x => x.Amount)
                - livePayments.Where(x => x.ChargeId != null).Sum(x => x.Amount);
            var paidByStudent = livePayments.GroupBy(x => x.StudentId).ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
            var chargedByStudent = liveCharges.GroupBy(x => x.StudentId).ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
            var adjustedByStudent = adjustments.GroupBy(x => x.StudentId).ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
            var debtors = chargedByStudent.Keys
                .Select(id => new
                {
                    StudentId = id,
                    Balance = chargedByStudent.GetValueOrDefault(id) - paidByStudent.GetValueOrDefault(id) - adjustedByStudent.GetValueOrDefault(id)
                })
                .Where(x => x.Balance > 0)
                .OrderByDescending(x => x.Balance)
                .Take(10)
                .ToList();
            var debtorIds = debtors.Select(x => x.StudentId).ToList();
            var debtorNames = await db.Users.AsNoTracking().Where(x => debtorIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName, x.StudentCode }).ToDictionaryAsync(x => x.Id);

            var rangeCharges = liveCharges.Where(x => x.CreatedAtUtc >= start && x.CreatedAtUtc < end).ToList();
            var rangePayments = livePayments.Where(x => x.PaidAtUtc >= start && x.PaidAtUtc < end).ToList();
            return Results.Ok(new
            {
                from = start, to = end.AddDays(-1),
                totalCharged,
                totalPaid,
                totalAdjusted,
                outstanding,
                overdue = Math.Max(0, overdue),
                packageOutstanding = enrollments.Where(x => x.Status == "Active")
                    .Sum(x => Math.Max(0, x.AmountDue - x.AmountPaid)),
                range = new
                {
                    charged = rangeCharges.Sum(x => x.Amount),
                    collected = rangePayments.Sum(x => x.Amount),
                    paymentsCount = rangePayments.Count,
                    chargesCount = rangeCharges.Count
                },
                byMethod = rangePayments.GroupBy(x => x.Method)
                    .Select(g => new { method = g.Key, amount = g.Sum(x => x.Amount), count = g.Count() })
                    .OrderByDescending(x => x.amount),
                debtors = debtors.Select(x =>
                {
                    debtorNames.TryGetValue(x.StudentId, out var s);
                    return new { x.StudentId, StudentName = s?.FullName, StudentCode = s?.StudentCode, x.Balance };
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/finance/students/{studentId:guid}", async (Guid studentId, ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.PaymentsView)) return TeachingAccess.Deny();
            var student = await db.Users.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == studentId && x.Role == "Student");
            if (student is null) return TeachingAccess.NotFound("الطالب غير موجود.");
            if (!await TeachingAccess.IsLinkedStudentAsync(db, scope.TeacherId, studentId))
                return TeachingAccess.Deny("الطالب غير مرتبط بحسابك.");
            var charges = await db.FinancialCharges.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId && x.StudentId == studentId)
                .OrderByDescending(x => x.CreatedAtUtc).Take(300).ToListAsync();
            var payments = await db.StudentPayments.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId && x.StudentId == studentId)
                .OrderByDescending(x => x.PaidAtUtc).Take(300).ToListAsync();
            var adjustments = await db.FinancialAdjustments.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId && x.StudentId == studentId)
                .OrderByDescending(x => x.CreatedAtUtc).Take(100).ToListAsync();
            var enrollments = await db.PackageEnrollments.AsNoTracking()
                .Where(x => x.TeacherId == scope.TeacherId && x.StudentId == studentId)
                .OrderByDescending(x => x.EnrolledAtUtc).Take(100).ToListAsync();
            var paidByCharge = payments.Where(x => !x.IsVoid && x.ChargeId != null)
                .GroupBy(x => x.ChargeId!.Value).ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
            var charged = charges.Where(x => !x.IsVoid).Sum(x => x.Amount);
            var paid = payments.Where(x => !x.IsVoid).Sum(x => x.Amount);
            var adjusted = adjustments.Sum(x => x.Amount);
            return Results.Ok(new
            {
                student = new { student.Id, student.FullName, student.StudentCode, student.StudentPhone, student.ParentPhone },
                summary = new
                {
                    charged, paid, adjusted,
                    balance = charged - paid - adjusted,
                    packageOutstanding = enrollments.Where(x => x.Status == "Active").Sum(x => Math.Max(0, x.AmountDue - x.AmountPaid))
                },
                charges = charges.Select(x => new
                {
                    x.Id, x.Kind, x.Amount, x.DueDateUtc, x.Description, x.IsVoid, x.VoidReason,
                    x.CreatedAtUtc, Paid = paidByCharge.GetValueOrDefault(x.Id)
                }),
                payments = payments.Select(x => new
                {
                    x.Id, x.Amount, x.Method, x.Reference, x.Notes, x.ReceiptNumber,
                    x.PaidAtUtc, x.IsVoid, x.VoidReason, x.ChargeId
                }),
                adjustments = adjustments.Select(x => new { x.Id, x.Kind, x.Amount, x.Reason, x.CreatedAtUtc }),
                packages = enrollments.Select(x => new
                {
                    x.Id, x.PackageId, x.Status, x.EnrolledAtUtc, x.StartsAtUtc, x.ExpiresAtUtc,
                    x.AmountDue, x.AmountPaid, x.CouponCode
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/my/finance", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null || TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذا الإجراء للطلاب فقط.");
            var charges = await db.FinancialCharges.AsNoTracking()
                .Where(x => x.StudentId == userId)
                .OrderByDescending(x => x.CreatedAtUtc).Take(300).ToListAsync();
            var payments = await db.StudentPayments.AsNoTracking()
                .Where(x => x.StudentId == userId && !x.IsVoid)
                .OrderByDescending(x => x.PaidAtUtc).Take(300).ToListAsync();
            var adjustments = await db.FinancialAdjustments.AsNoTracking()
                .Where(x => x.StudentId == userId)
                .OrderByDescending(x => x.CreatedAtUtc).Take(100).ToListAsync();
            var enrollments = await db.PackageEnrollments.AsNoTracking()
                .Where(x => x.StudentId == userId)
                .OrderByDescending(x => x.EnrolledAtUtc).Take(50).ToListAsync();
            var teacherIds = charges.Select(x => x.TeacherId)
                .Concat(payments.Select(x => x.TeacherId))
                .Concat(enrollments.Select(x => x.TeacherId))
                .Distinct().ToList();
            var teachers = await db.Users.AsNoTracking().Where(x => teacherIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName }).ToDictionaryAsync(x => x.Id, x => x.FullName);
            var paidByCharge = payments.Where(x => x.ChargeId != null)
                .GroupBy(x => x.ChargeId!.Value).ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
            IReadOnlyList<object> ledger = charges.Select(c => (object)new
            {
                Id = c.Id,
                TeacherName = teachers.GetValueOrDefault(c.TeacherId),
                c.Kind,
                c.Amount,
                c.DueDateUtc,
                c.Description,
                c.IsVoid,
                Paid = paidByCharge.GetValueOrDefault(c.Id),
                Outstanding = c.IsVoid ? 0 : Math.Max(0, c.Amount - paidByCharge.GetValueOrDefault(c.Id))
            }).ToList();
            var charged = charges.Where(x => !x.IsVoid).Sum(x => x.Amount);
            var paid = payments.Sum(x => x.Amount);
            var adjusted = adjustments.Sum(x => x.Amount);
            return Results.Ok(new
            {
                summary = new
                {
                    charged, paid, adjusted,
                    balance = charged - paid - adjusted,
                    packageOutstanding = enrollments.Where(x => x.Status == "Active").Sum(x => Math.Max(0, x.AmountDue - x.AmountPaid))
                },
                ledger,
                payments = payments.Select(x => new
                {
                    x.Id, TeacherName = teachers.GetValueOrDefault(x.TeacherId),
                    x.Amount, x.Method, x.Reference, x.Notes, x.ReceiptNumber, x.PaidAtUtc
                }),
                adjustments = adjustments.Select(x => new
                {
                    x.Id, TeacherName = teachers.GetValueOrDefault(x.TeacherId),
                    x.Kind, x.Amount, x.Reason, x.CreatedAtUtc
                }),
                packages = enrollments.Select(x => new
                {
                    x.Id, TeacherName = teachers.GetValueOrDefault(x.TeacherId),
                    x.PackageId, x.Status, x.StartsAtUtc, x.ExpiresAtUtc, x.AmountDue, x.AmountPaid
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        // ------------------------------- exports ------------------------------
        app.MapGet("/api/teaching/finance/charges.csv", async (DateTime? from, DateTime? to, Guid? studentId,
            ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.ReportsView)) return TeachingAccess.Deny();
            var query = db.FinancialCharges.AsNoTracking().Where(x => x.TeacherId == scope.TeacherId);
            if (from.HasValue) query = query.Where(x => x.CreatedAtUtc >= from.Value.Date);
            if (to.HasValue) query = query.Where(x => x.CreatedAtUtc < to.Value.Date.AddDays(1));
            if (studentId.HasValue) query = query.Where(x => x.StudentId == studentId);
            var rows = await query.OrderByDescending(x => x.CreatedAtUtc).Take(5000).ToListAsync();
            var ids = rows.Select(x => x.Id).ToList();
            var paidByCharge = await db.StudentPayments.AsNoTracking()
                .Where(x => !x.IsVoid && x.ChargeId != null && ids.Contains(x.ChargeId.Value))
                .GroupBy(x => x.ChargeId!.Value)
                .Select(g => new { ChargeId = g.Key, Total = g.Sum(x => x.Amount) })
                .ToDictionaryAsync(x => x.ChargeId, x => x.Total);
            var studentIds = rows.Select(x => x.StudentId).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => studentIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName, x.StudentCode }).ToDictionaryAsync(x => x.Id);
            var sb = new StringBuilder();
            sb.AppendLine("الطالب,الكود,النوع,المبلغ,المدفوع,المتبقي,تاريخ الاستحقاق,الوصف,ملغى,سبب الإلغاء");
            foreach (var r in rows)
            {
                names.TryGetValue(r.StudentId, out var s);
                var paid = paidByCharge.GetValueOrDefault(r.Id);
                sb.AppendLine(string.Join(',',
                    TeachingText.Csv(s?.FullName), TeachingText.Csv(s?.StudentCode), TeachingText.Csv(r.Kind),
                    r.Amount.ToString(CultureInfo.InvariantCulture), paid.ToString(CultureInfo.InvariantCulture),
                    Math.Max(0, r.Amount - paid).ToString(CultureInfo.InvariantCulture),
                    TeachingText.Csv(r.DueDateUtc.ToString("yyyy-MM-dd")), TeachingText.Csv(r.Description),
                    r.IsVoid ? "نعم" : "لا", TeachingText.Csv(r.VoidReason)));
            }
            return TeachingText.CsvFile(sb.ToString(), "charges.csv");
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/finance/payments.csv", async (DateTime? from, DateTime? to, Guid? studentId,
            ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null || !scope.Has(TeachingPermissions.ReportsView)) return TeachingAccess.Deny();
            var query = db.StudentPayments.AsNoTracking().Where(x => x.TeacherId == scope.TeacherId);
            if (from.HasValue) query = query.Where(x => x.PaidAtUtc >= from.Value.Date);
            if (to.HasValue) query = query.Where(x => x.PaidAtUtc < to.Value.Date.AddDays(1));
            if (studentId.HasValue) query = query.Where(x => x.StudentId == studentId);
            var rows = await query.OrderByDescending(x => x.PaidAtUtc).Take(5000).ToListAsync();
            var studentIds = rows.Select(x => x.StudentId).Distinct().ToList();
            var names = await db.Users.AsNoTracking().Where(x => studentIds.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName, x.StudentCode }).ToDictionaryAsync(x => x.Id);
            var sb = new StringBuilder();
            sb.AppendLine("الإيصال,الطالب,الكود,المبلغ,طريقة الدفع,المرجع,التاريخ,ملغاة,سبب الإلغاء");
            foreach (var r in rows)
            {
                names.TryGetValue(r.StudentId, out var s);
                sb.AppendLine(string.Join(',',
                    TeachingText.Csv(r.ReceiptNumber), TeachingText.Csv(s?.FullName), TeachingText.Csv(s?.StudentCode),
                    r.Amount.ToString(CultureInfo.InvariantCulture), TeachingText.Csv(r.Method),
                    TeachingText.Csv(r.Reference), TeachingText.Csv(r.PaidAtUtc.ToString("yyyy-MM-dd HH:mm")),
                    r.IsVoid ? "نعم" : "لا", TeachingText.Csv(r.VoidReason)));
            }
            return TeachingText.CsvFile(sb.ToString(), "payments.csv");
        }).RequireAuthorization().RequireRateLimiting("api");
    }

    // -------------------------------- helpers ---------------------------------

    private static bool IsAdmin(ClaimsPrincipal p) => TeachingAccess.Role(p) == "Admin";

    private static string NormalizePackageKind(string? kind) =>
        kind is "Course" or "Group" or "Bundle" or "Sessions" ? kind : "Course";

    private static string NormalizeFeatures(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return "[]";
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            return doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array ? json : "[]";
        }
        catch
        {
            return "[]";
        }
    }

    private static DateTime? ParseMonth(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        return DateTime.TryParseExact(value.Trim() + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed)
            ? new DateTime(parsed.Year, parsed.Month, 1, 0, 0, 0, DateTimeKind.Utc)
            : null;
    }

    internal static string GenerateReceiptNumber() =>
        $"RCPT-{DateTime.UtcNow:yyyyMMddHHmmss}-{Convert.ToHexString(RandomNumberGenerator.GetBytes(3))}";

    private static async Task<(List<(string Type, Guid Id)> Items, string? Error)> ValidatePackageItemsAsync(
        AppDbContext db, Guid teacherId, IEnumerable<PackageItemInput>? requested)
    {
        var items = new List<(string, Guid)>();
        foreach (var item in (requested ?? []).DistinctBy(x => (x.ItemType, x.ItemId)))
        {
            if (item.ItemType == "Course")
            {
                if (!await db.TeacherCourses.AsNoTracking().AnyAsync(x => x.Id == item.ItemId && x.TeacherId == teacherId))
                    return ([], "أحد الكورسات المختارة غير موجود.");
                items.Add(("Course", item.ItemId));
            }
            else if (item.ItemType == "Group")
            {
                if (!await db.TeachingGroups.AsNoTracking().AnyAsync(x => x.Id == item.ItemId && x.TeacherId == teacherId))
                    return ([], "إحدى المجموعات المختارة غير موجودة.");
                items.Add(("Group", item.ItemId));
            }
            else
            {
                return ([], "نوع عنصر الباقة غير صالح.");
            }
        }
        return (items, null);
    }
}

public sealed record PlatformPlanInput(
    string Code, string Name, string? Description, bool IsActive, bool IsDefault, bool IsPublic,
    int SortOrder, decimal Price, string? Currency, int BillingPeriodDays, int TrialDays, int GraceDays,
    int MaxStudents, int MaxCourses, int MaxGroups, int MaxAssistants, int StorageMb, int MaxVideoMinutes,
    string? FeaturesJson);

public sealed record AdminActivateInput(int? Days);
public sealed record AdminReviewInput(string? Note);

public sealed record PackageItemInput(string ItemType, Guid ItemId);
public sealed record PackageInput(
    string Name, string? Description, string Kind, decimal Price, decimal? OldPrice, int DurationDays,
    int? SessionsIncluded, int? Capacity, bool IsRecurring, bool IsActive,
    DateTime? AvailableFromUtc, DateTime? AvailableUntilUtc, List<PackageItemInput>? Items);

public sealed record CouponInput(string Code, string Kind, decimal Value, int? MaxUses,
    DateTime? ValidFromUtc, DateTime? ValidUntilUtc, bool IsActive = true);

public sealed record PackageEnrollInput(Guid StudentId, string? CouponCode, DateTime? StartsAtUtc,
    decimal InitialPayment, string? Method, string? Reference);

public sealed record ChargeInput(Guid StudentId, decimal Amount, Guid? GroupId, Guid? CourseId,
    Guid? PackageId, Guid? SessionId, string? Kind, DateTime? DueDateUtc, string? Description, string? DedupeKey);

public sealed record PaymentInput(Guid StudentId, decimal Amount, string? Method, string? Reference,
    string? Notes, Guid? GroupId, Guid? CourseId, Guid? PackageId, Guid? ChargeId, DateTime? PaidAtUtc);

public sealed record AdjustmentInput(Guid StudentId, decimal Amount, string Kind, string Reason, Guid? GroupId);
public sealed record BillingGenerateInput(string? Month);
