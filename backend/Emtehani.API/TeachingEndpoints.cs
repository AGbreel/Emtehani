using System.Security.Claims;
using System.Security.Cryptography;
using Emtehani.Domain.Entities;
using Emtehani.Domain.Services;
using Emtehani.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Emtehani.API;

public static class TeachingEndpoints
{
    public static void MapTeachingEndpoints(this WebApplication app)
    {
        // ----------------------------- assistants -----------------------------
        app.MapGet("/api/teaching/permissions", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null) return TeachingAccess.Deny("هذا الحساب غير مرتبط بمدرس نشط.");
            return Results.Ok(new
            {
                items = TeachingPermissions.All.Select(x => new { key = x.Key, label = x.Label, group = x.Group }),
                granted = TeachingPermissions.All.Where(x => scope.Has(x.Key)).Select(x => x.Key),
                isOwner = scope.IsOwner,
                role = scope.Role
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/assistants", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AssistantsManage);
            if (error is not null) return error;
            var links = await db.TeachingAssistants.AsNoTracking()
                .Where(x => x.TeacherId == scope!.TeacherId)
                .Include(x => x.Assistant)
                .OrderByDescending(x => x.CreatedAtUtc)
                .ToListAsync();
            var ids = links.Select(x => x.AssistantId).ToList();
            var permissions = await db.AssistantPermissions.AsNoTracking()
                .Where(x => x.TeacherId == scope!.TeacherId && ids.Contains(x.AssistantId))
                .ToListAsync();
            var groups = await db.AssistantGroupAccesses.AsNoTracking()
                .Where(x => x.TeacherId == scope!.TeacherId && ids.Contains(x.AssistantId))
                .ToListAsync();
            var items = links.Select(x => new
            {
                id = x.Id,
                assistantId = x.AssistantId,
                name = x.Assistant?.FullName ?? "",
                email = x.Assistant?.Email ?? "",
                status = x.Status,
                createdAtUtc = x.CreatedAtUtc,
                permissions = permissions.Where(pp => pp.AssistantId == x.AssistantId).Select(pp => pp.Permission).ToArray(),
                groupIds = groups.Where(gg => gg.AssistantId == x.AssistantId).Select(gg => gg.GroupId).ToArray()
            });
            return Results.Ok(new { items });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/assistants", async (AssistantCreateRequest req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AssistantsManage);
            if (error is not null) return error;
            if (!scope!.IsOwner) return TeachingAccess.Deny("إضافة المساعدين متاحة لمالك الحساب فقط.");
            var email = (req.Email ?? "").Trim().ToLowerInvariant();
            if (!email.Contains('@') || email.Length > 200) return TeachingAccess.Bad("بريد إلكتروني غير صالح.");
            var (_, plan) = await TeachingBillingLimits.CurrentAsync(db, scope.TeacherId);
            var assistantCount = await db.TeachingAssistants.CountAsync(x => x.TeacherId == scope.TeacherId && x.Status == "Active");
            var limitError = TeachingBillingLimits.LimitReason(plan, "المساعدون", plan?.MaxAssistants ?? 0, assistantCount);
            if (limitError is not null) return TeachingAccess.Bad(limitError);

            var user = await db.Users.FirstOrDefaultAsync(x => x.Email == email);
            string? temporaryPassword = null;
            if (user is null)
            {
                var password = string.IsNullOrWhiteSpace(req.Password) ? GeneratePassword() : req.Password!;
                var passwordError = PasswordIssue(password);
                if (passwordError is not null) return TeachingAccess.Bad(passwordError);
                var salt = Convert.ToBase64String(RandomNumberGenerator.GetBytes(16));
                user = new AppUser
                {
                    FullName = string.IsNullOrWhiteSpace(req.FullName) ? email.Split('@')[0] : req.FullName!.Trim(),
                    NormalizedName = IdentityNormalizer.NormalizeName(string.IsNullOrWhiteSpace(req.FullName) ? email.Split('@')[0] : req.FullName!),
                    Email = email,
                    Role = "Assistant",
                    EmailConfirmed = true,
                    PasswordHash = salt + ":" + Convert.ToBase64String(Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(salt), 120000, HashAlgorithmName.SHA256, 32)),
                    RegistrationSource = "TeacherAssistant"
                };
                db.Users.Add(user);
                temporaryPassword = string.IsNullOrWhiteSpace(req.Password) ? password : null;
            }
            else if (user.Role != "Assistant")
            {
                return TeachingAccess.Bad("هذا البريد مستخدم بحساب من نوع آخر. استخدم بريداً جديداً للمساعد.");
            }
            if (await db.TeachingAssistants.AnyAsync(x => x.TeacherId == scope.TeacherId && x.AssistantId == user.Id))
                return TeachingAccess.Bad("هذا المستخدم مساعد لديك بالفعل.");
            var link = new TeachingAssistant
            {
                TeacherId = scope.TeacherId,
                AssistantId = user.Id,
                Status = "Active"
            };
            db.TeachingAssistants.Add(link);
            await ApplyAssistantPermissions(db, scope.TeacherId, user.Id, req.Permissions, req.GroupIds);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "assistant.added", "TeachingAssistant", link.Id.ToString(), email);
            await db.SaveChangesAsync();
            return Results.Ok(new
            {
                id = link.Id,
                assistantId = user.Id,
                name = user.FullName,
                email = user.Email,
                temporaryPassword,
                message = temporaryPassword is null
                    ? "تم ربط المساعد بحسابه الحالي."
                    : "تم إنشاء حساب المساعد. سلّمه كلمة المرور المؤقتة واطلب منه تغييرها."
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/assistants/{id:guid}", async (Guid id, AssistantUpdateRequest req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AssistantsManage);
            if (error is not null) return error;
            if (!scope!.IsOwner) return TeachingAccess.Deny("تعديل المساعدين متاح لمالك الحساب فقط.");
            var link = await db.TeachingAssistants.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (link is null) return TeachingAccess.NotFound("المساعد غير موجود.");
            if (req.Status is "Active" or "Suspended") link.Status = req.Status;
            link.UpdatedAtUtc = DateTime.UtcNow;
            await ApplyAssistantPermissions(db, scope.TeacherId, link.AssistantId, req.Permissions, req.GroupIds);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "assistant.updated", "TeachingAssistant", link.Id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/assistants/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.AssistantsManage);
            if (error is not null) return error;
            if (!scope!.IsOwner) return TeachingAccess.Deny("إيقاف المساعدين متاح لمالك الحساب فقط.");
            var link = await db.TeachingAssistants.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope.TeacherId);
            if (link is null) return TeachingAccess.NotFound("المساعد غير موجود.");
            link.Status = "Suspended";
            link.UpdatedAtUtc = DateTime.UtcNow;
            await db.AssistantPermissions.Where(x => x.AssistantId == link.AssistantId && x.TeacherId == scope.TeacherId).ExecuteDeleteAsync();
            await db.AssistantGroupAccesses.Where(x => x.AssistantId == link.AssistantId && x.TeacherId == scope.TeacherId).ExecuteDeleteAsync();
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "assistant.suspended", "TeachingAssistant", link.Id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        // ------------------------------ courses -------------------------------
        app.MapGet("/api/teaching/courses", async (ClaimsPrincipal p, AppDbContext db,
            string? search, string? status, int page = 1, int pageSize = 20) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.CoursesView);
            if (error is not null) return error;
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);
            var query = db.TeacherCourses.AsNoTracking().Where(x => x.TeacherId == scope!.TeacherId);
            if (scope!.Role == "Assistant") { /* assistants see the whole catalogue they manage */ }
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(x => x.Title.Contains(term) || (x.Subject != null && x.Subject.Contains(term)));
            }
            if (status == "published") query = query.Where(x => x.IsPublished && !x.IsArchived);
            else if (status == "draft") query = query.Where(x => !x.IsPublished && !x.IsArchived);
            else if (status == "archived") query = query.Where(x => x.IsArchived);
            else query = query.Where(x => !x.IsArchived);
            var total = await query.CountAsync();
            var items = await query.OrderByDescending(x => x.UpdatedAtUtc)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new
                {
                    id = x.Id,
                    title = x.Title,
                    subject = x.Subject,
                    stage = x.Stage,
                    grade = x.Grade,
                    coverUrl = x.CoverUrl,
                    deliveryMode = x.DeliveryMode,
                    isFree = x.IsFree,
                    price = x.Price,
                    oldPrice = x.OldPrice,
                    capacity = x.Capacity,
                    accessDays = x.AccessDays,
                    isPublished = x.IsPublished,
                    isArchived = x.IsArchived,
                    publishAtUtc = x.PublishAtUtc,
                    updatedAtUtc = x.UpdatedAtUtc,
                    units = x.Units.Count,
                    lessons = x.Units.Sum(u => u.Lessons.Count),
                    students = x.Enrollments.Count(e => e.Status == "Active")
                }).ToListAsync();
            return Results.Ok(new { items, total, page, pageSize });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/courses", async (CourseInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.CoursesManage);
            if (error is not null) return error;
            var validation = ValidateCourse(req);
            if (validation is not null) return validation;
            var writeError = await TeachingBillingLimits.WriteBlockReasonAsync(db, scope!.TeacherId);
            if (writeError is not null) return TeachingAccess.Bad(writeError);
            var (_, plan) = await TeachingBillingLimits.CurrentAsync(db, scope.TeacherId);
            var count = await db.TeacherCourses.CountAsync(x => x.TeacherId == scope.TeacherId && !x.IsArchived);
            var limitError = TeachingBillingLimits.LimitReason(plan, "الكورسات", plan?.MaxCourses ?? 0, count);
            if (limitError is not null) return TeachingAccess.Bad(limitError);

            var course = new TeacherCourse { TeacherId = scope.TeacherId };
            ApplyCourse(course, req);
            db.TeacherCourses.Add(course);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "course.created", "TeacherCourse", course.Id.ToString(), course.Title);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = course.Id, message = "تم إنشاء الكورس." });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/courses/{id:guid}", async (Guid id, CourseInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.CoursesManage);
            if (error is not null) return error;
            var validation = ValidateCourse(req);
            if (validation is not null) return validation;
            var course = await db.TeacherCourses.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (course is null) return TeachingAccess.NotFound("الكورس غير موجود.");
            ApplyCourse(course, req);
            course.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope!.TeacherId, scope.UserId, "course.updated", "TeacherCourse", course.Id.ToString(), course.Title);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/courses/{id:guid}/publish", async (Guid id, PublishInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.CoursesManage);
            if (error is not null) return error;
            var course = await db.TeacherCourses.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (course is null) return TeachingAccess.NotFound("الكورس غير موجود.");
            course.IsPublished = req.Publish;
            course.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope!.TeacherId, scope.UserId, req.Publish ? "course.published" : "course.unpublished", "TeacherCourse", course.Id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, isPublished = course.IsPublished });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/courses/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.CoursesManage);
            if (error is not null) return error;
            var course = await db.TeacherCourses.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (course is null) return TeachingAccess.NotFound("الكورس غير موجود.");
            // Soft archive keeps enrollment and progress history.
            course.IsArchived = true;
            course.IsPublished = false;
            course.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope!.TeacherId, scope.UserId, "course.archived", "TeacherCourse", course.Id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true, message = "تم أرشفة الكورس. بيانات الطلاب محفوظة." });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/courses/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.CoursesView);
            if (error is not null) return error;
            var course = await db.TeacherCourses.AsNoTracking()
                .Where(x => x.Id == id && x.TeacherId == scope!.TeacherId)
                .Include(x => x.Units.Where(u => true).OrderBy(u => u.SortOrder))
                    .ThenInclude(u => u.Lessons.OrderBy(l => l.SortOrder))
                        .ThenInclude(l => l.Materials.OrderBy(m => m.SortOrder))
                .FirstOrDefaultAsync();
            if (course is null) return TeachingAccess.NotFound("الكورس غير موجود.");
            var linkedGroups = await db.GroupCourses.AsNoTracking()
                .Where(x => x.CourseId == id && x.TeacherId == scope!.TeacherId)
                .Select(x => x.GroupId).ToListAsync();
            return Results.Ok(new
            {
                course = new
                {
                    id = course.Id,
                    title = course.Title,
                    shortDescription = course.ShortDescription,
                    description = course.Description,
                    subject = course.Subject,
                    stage = course.Stage,
                    grade = course.Grade,
                    coverUrl = course.CoverUrl,
                    introVideoUrl = course.IntroVideoUrl,
                    deliveryMode = course.DeliveryMode,
                    isFree = course.IsFree,
                    price = course.Price,
                    oldPrice = course.OldPrice,
                    capacity = course.Capacity,
                    accessDays = course.AccessDays,
                    isPublished = course.IsPublished,
                    isFeatured = course.IsFeatured,
                    isArchived = course.IsArchived,
                    publishAtUtc = course.PublishAtUtc,
                    createdAtUtc = course.CreatedAtUtc,
                    updatedAtUtc = course.UpdatedAtUtc,
                    linkedGroupIds = linkedGroups
                },
                units = course.Units.Select(u => new
                {
                    id = u.Id,
                    title = u.Title,
                    description = u.Description,
                    sortOrder = u.SortOrder,
                    lessons = u.Lessons.Select(l => new
                    {
                        id = l.Id,
                        title = l.Title,
                        description = l.Description,
                        videoUrl = l.VideoUrl,
                        pdfUrl = l.PdfUrl,
                        durationMinutes = l.DurationMinutes,
                        isFreePreview = l.IsFreePreview,
                        isPublished = l.IsPublished,
                        isArchived = l.IsArchived,
                        publishAtUtc = l.PublishAtUtc,
                        sortOrder = l.SortOrder,
                        materials = l.Materials.Select(m => new
                        {
                            id = m.Id,
                            title = m.Title,
                            kind = m.Kind,
                            url = m.Url,
                            sizeBytes = m.SizeBytes,
                            isFreePreview = m.IsFreePreview,
                            isDownloadable = m.IsDownloadable,
                            isPublished = m.IsPublished,
                            publishAtUtc = m.PublishAtUtc,
                            sortOrder = m.SortOrder
                        })
                    })
                })
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        // units / lessons / materials
        app.MapPost("/api/teaching/courses/{id:guid}/units", async (Guid id, UnitInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.ContentManage);
            if (error is not null) return error;
            if (string.IsNullOrWhiteSpace(req.Title) || req.Title.Trim().Length > 200) return TeachingAccess.Bad("عنوان الوحدة غير صالح.");
            var course = await db.TeacherCourses.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (course is null) return TeachingAccess.NotFound("الكورس غير موجود.");
            var unit = new CourseUnit
            {
                CourseId = id,
                TeacherId = scope!.TeacherId,
                Title = req.Title.Trim(),
                Description = TeachingText.Safe(req.Description, 2000),
                SortOrder = req.SortOrder
            };
            db.CourseUnits.Add(unit);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "unit.created", "CourseUnit", unit.Id.ToString(), unit.Title);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = unit.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/units/{id:guid}", async (Guid id, UnitInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.ContentManage);
            if (error is not null) return error;
            var unit = await db.CourseUnits.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (unit is null) return TeachingAccess.NotFound();
            if (string.IsNullOrWhiteSpace(req.Title) || req.Title.Trim().Length > 200) return TeachingAccess.Bad("عنوان الوحدة غير صالح.");
            unit.Title = req.Title.Trim();
            unit.Description = TeachingText.Safe(req.Description, 2000);
            unit.SortOrder = req.SortOrder;
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/units/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.ContentManage);
            if (error is not null) return error;
            var unit = await db.CourseUnits.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (unit is null) return TeachingAccess.NotFound();
            db.CourseUnits.Remove(unit);
            TeachingNotify.Audit(db, scope!.TeacherId, scope.UserId, "unit.deleted", "CourseUnit", id.ToString(), unit.Title);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/units/{id:guid}/lessons", async (Guid id, LessonInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.ContentManage);
            if (error is not null) return error;
            var unit = await db.CourseUnits.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (unit is null) return TeachingAccess.NotFound("الوحدة غير موجودة.");
            if (string.IsNullOrWhiteSpace(req.Title) || req.Title.Trim().Length > 200) return TeachingAccess.Bad("عنوان الدرس غير صالح.");
            var lesson = new CourseLesson
            {
                UnitId = unit.Id,
                CourseId = unit.CourseId,
                TeacherId = scope!.TeacherId,
                Title = req.Title.Trim(),
                Description = TeachingText.Safe(req.Description, 4000),
                VideoUrl = TeachingText.Safe(req.VideoUrl, 1000),
                PdfUrl = TeachingText.Safe(req.PdfUrl, 1000),
                DurationMinutes = Math.Clamp(req.DurationMinutes, 0, 600),
                IsFreePreview = req.IsFreePreview,
                IsPublished = req.IsPublished,
                PublishAtUtc = req.PublishAtUtc,
                SortOrder = req.SortOrder
            };
            db.CourseLessons.Add(lesson);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "lesson.created", "CourseLesson", lesson.Id.ToString(), lesson.Title);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = lesson.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/lessons/{id:guid}", async (Guid id, LessonInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.ContentManage);
            if (error is not null) return error;
            var lesson = await db.CourseLessons.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (lesson is null) return TeachingAccess.NotFound("الدرس غير موجود.");
            if (string.IsNullOrWhiteSpace(req.Title) || req.Title.Trim().Length > 200) return TeachingAccess.Bad("عنوان الدرس غير صالح.");
            lesson.Title = req.Title.Trim();
            lesson.Description = TeachingText.Safe(req.Description, 4000);
            lesson.VideoUrl = TeachingText.Safe(req.VideoUrl, 1000);
            lesson.PdfUrl = TeachingText.Safe(req.PdfUrl, 1000);
            lesson.DurationMinutes = Math.Clamp(req.DurationMinutes, 0, 600);
            lesson.IsFreePreview = req.IsFreePreview;
            lesson.IsPublished = req.IsPublished;
            lesson.PublishAtUtc = req.PublishAtUtc;
            lesson.SortOrder = req.SortOrder;
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/lessons/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.ContentManage);
            if (error is not null) return error;
            var lesson = await db.CourseLessons.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (lesson is null) return TeachingAccess.NotFound("الدرس غير موجود.");
            lesson.IsArchived = true;
            lesson.IsPublished = false;
            TeachingNotify.Audit(db, scope!.TeacherId, scope.UserId, "lesson.archived", "CourseLesson", id.ToString(), lesson.Title);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/lessons/{id:guid}/materials", async (Guid id, MaterialInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.ContentManage);
            if (error is not null) return error;
            var lesson = await db.CourseLessons.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (lesson is null) return TeachingAccess.NotFound("الدرس غير موجود.");
            var kind = (req.Kind ?? "Link").Trim();
            string[] kinds = ["Video", "Pdf", "Image", "Audio", "Document", "Link", "Other"];
            if (!kinds.Contains(kind, StringComparer.OrdinalIgnoreCase)) return TeachingAccess.Bad("نوع المادة غير مدعوم.");
            var url = (req.Url ?? "").Trim();
            if (url.Length == 0 || url.Length > 1000) return TeachingAccess.Bad("رابط المادة غير صالح.");
            if (!url.StartsWith("http", StringComparison.OrdinalIgnoreCase) && !url.StartsWith('/'))
                return TeachingAccess.Bad("الرابط يجب أن يكون رابطاً كاملاً أو مساراً داخلياً.");
            if (string.IsNullOrWhiteSpace(req.Title) || req.Title.Trim().Length > 200) return TeachingAccess.Bad("عنوان المادة غير صالح.");
            var material = new LessonMaterial
            {
                LessonId = lesson.Id,
                CourseId = lesson.CourseId,
                TeacherId = scope!.TeacherId,
                Kind = kind,
                Title = req.Title.Trim(),
                Url = url,
                StorageKey = TeachingText.Safe(req.StorageKey, 500),
                SizeBytes = req.SizeBytes,
                IsFreePreview = req.IsFreePreview,
                IsDownloadable = req.IsDownloadable,
                IsPublished = req.IsPublished,
                PublishAtUtc = req.PublishAtUtc,
                SortOrder = req.SortOrder
            };
            db.LessonMaterials.Add(material);
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "material.created", "LessonMaterial", material.Id.ToString(), material.Title);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = material.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPut("/api/teaching/materials/{id:guid}", async (Guid id, MaterialInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.ContentManage);
            if (error is not null) return error;
            var material = await db.LessonMaterials.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (material is null) return TeachingAccess.NotFound("المادة غير موجودة.");
            if (string.IsNullOrWhiteSpace(req.Title) || req.Title.Trim().Length > 200) return TeachingAccess.Bad("عنوان المادة غير صالح.");
            var url = (req.Url ?? "").Trim();
            if (url.Length == 0 || url.Length > 1000) return TeachingAccess.Bad("رابط المادة غير صالح.");
            material.Title = req.Title.Trim();
            material.Kind = req.Kind ?? material.Kind;
            material.Url = url;
            material.StorageKey = TeachingText.Safe(req.StorageKey, 500);
            material.SizeBytes = req.SizeBytes;
            material.IsFreePreview = req.IsFreePreview;
            material.IsDownloadable = req.IsDownloadable;
            material.IsPublished = req.IsPublished;
            material.PublishAtUtc = req.PublishAtUtc;
            material.SortOrder = req.SortOrder;
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/materials/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.ContentManage);
            if (error is not null) return error;
            var material = await db.LessonMaterials.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (material is null) return TeachingAccess.NotFound("المادة غير موجودة.");
            db.LessonMaterials.Remove(material);
            TeachingNotify.Audit(db, scope!.TeacherId, scope.UserId, "material.deleted", "LessonMaterial", id.ToString(), material.Title);
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        // manual enrollment
        app.MapPost("/api/teaching/courses/{id:guid}/enrollments", async (Guid id, EnrollmentInput req, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.StudentsUpdate);
            if (error is not null) return error;
            var course = await db.TeacherCourses.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == scope!.TeacherId);
            if (course is null) return TeachingAccess.NotFound("الكورس غير موجود.");
            var student = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == req.StudentId && x.Role == "Student");
            if (student is null) return TeachingAccess.NotFound("الطالب غير موجود.");
            if (!await TeachingAccess.IsLinkedStudentAsync(db, scope!.TeacherId, student.Id))
                return TeachingAccess.Bad("الطالب غير مرتبط بحسابك. أرسل طلب ربط أو دعوة أولاً.");
            var enrollment = await db.CourseEnrollments.FirstOrDefaultAsync(x => x.CourseId == id && x.StudentId == student.Id);
            if (enrollment is null)
            {
                enrollment = new CourseEnrollment { TeacherId = scope.TeacherId, CourseId = id, StudentId = student.Id };
                db.CourseEnrollments.Add(enrollment);
            }
            enrollment.Status = "Active";
            enrollment.StartsAtUtc = req.StartsAtUtc ?? DateTime.UtcNow;
            enrollment.ExpiresAtUtc = req.ExpiresAtUtc ?? (course.AccessDays > 0 ? DateTime.UtcNow.AddDays(course.AccessDays) : null);
            enrollment.AmountPaid = req.AmountPaid;
            enrollment.UpdatedAtUtc = DateTime.UtcNow;
            await TeachingNotify.SendAsync(db, [student.Id], "Course", "System",
                "تم تسجيلك في كورس", course.Title, "courses");
            TeachingNotify.Audit(db, scope.TeacherId, scope.UserId, "enrollment.added", "CourseEnrollment", enrollment.Id.ToString(), student.FullName);
            await db.SaveChangesAsync();
            return Results.Ok(new { id = enrollment.Id });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapDelete("/api/teaching/courses/{id:guid}/enrollments/{studentId:guid}", async (Guid id, Guid studentId, ClaimsPrincipal p, AppDbContext db) =>
        {
            var (scope, error) = await TeachingAccess.RequireAsync(db, p, TeachingPermissions.StudentsUpdate);
            if (error is not null) return error;
            var enrollment = await db.CourseEnrollments.FirstOrDefaultAsync(x => x.CourseId == id && x.StudentId == studentId && x.TeacherId == scope!.TeacherId);
            if (enrollment is null) return TeachingAccess.NotFound();
            enrollment.Status = "Cancelled";
            enrollment.UpdatedAtUtc = DateTime.UtcNow;
            TeachingNotify.Audit(db, scope!.TeacherId, scope.UserId, "enrollment.cancelled", "CourseEnrollment", enrollment.Id.ToString());
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        // ------------------------- student catalogue --------------------------
        app.MapGet("/api/teaching/my/courses", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            if (TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذه الواجهة للطلاب.");
            var userId = TeachingAccess.UserId(p);
            if (userId is null) return Results.Unauthorized();
            var teacherIds = await db.TeacherStudentRequests.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Accepted" && x.UnlinkedAtUtc == null)
                .Select(x => x.TeacherId).ToListAsync();
            var enrollments = await db.CourseEnrollments.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Active")
                .Include(x => x.Student).ToListAsync();
            var groupIds = await db.GroupMemberships.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Active")
                .Select(x => x.GroupId).ToListAsync();
            var groupCourseIds = await db.GroupCourses.AsNoTracking()
                .Where(x => groupIds.Contains(x.GroupId))
                .Select(x => x.CourseId).ToListAsync();
            var courseIds = enrollments.Select(x => x.CourseId).Concat(groupCourseIds).Distinct().ToList();
            var courses = await db.TeacherCourses.AsNoTracking()
                .Where(x => courseIds.Contains(x.Id) && x.IsPublished && !x.IsArchived)
                .Include(x => x.Teacher)
                .OrderByDescending(x => x.UpdatedAtUtc)
                .ToListAsync();
            var lessonCounts = await db.CourseLessons.AsNoTracking()
                .Where(x => courseIds.Contains(x.CourseId) && x.IsPublished && !x.IsArchived)
                .GroupBy(x => x.CourseId)
                .Select(g => new { CourseId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.CourseId, x => x.Count);
            var completed = await db.LessonProgresses.AsNoTracking()
                .Where(x => x.StudentId == userId && courseIds.Contains(x.CourseId) && x.CompletedAtUtc != null)
                .GroupBy(x => x.CourseId)
                .Select(g => new { CourseId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.CourseId, x => x.Count);
            var enrollmentByCourse = enrollments.GroupBy(x => x.CourseId)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.EnrolledAtUtc).First());
            var items = courses.Select(c =>
            {
                var total = lessonCounts.GetValueOrDefault(c.Id);
                var done = completed.GetValueOrDefault(c.Id);
                return new
                {
                    id = c.Id,
                    title = c.Title,
                    shortDescription = c.ShortDescription,
                    subject = c.Subject,
                    coverUrl = c.CoverUrl,
                    teacherName = c.Teacher?.FullName,
                    deliveryMode = c.DeliveryMode,
                    isFree = c.IsFree,
                    price = c.Price,
                    totalLessons = total,
                    completedLessons = done,
                    progressPercent = total == 0 ? 0 : (int)Math.Round(done * 100d / total),
                    expiresAtUtc = enrollmentByCourse.TryGetValue(c.Id, out var e) ? e.ExpiresAtUtc : null,
                    accessViaGroup = !enrollmentByCourse.ContainsKey(c.Id)
                };
            }).ToList();
            var linkedTeachers = await db.Users.AsNoTracking()
                .Where(x => teacherIds.Contains(x.Id))
                .Select(x => new { id = x.Id, name = x.FullName }).ToListAsync();
            return Results.Ok(new { items, linkedTeachers, serverUtc = DateTime.UtcNow });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/catalog", async (ClaimsPrincipal p, AppDbContext db, string? search) =>
        {
            if (TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذه الواجهة للطلاب.");
            var userId = TeachingAccess.UserId(p);
            if (userId is null) return Results.Unauthorized();
            var teacherIds = await db.TeacherStudentRequests.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Accepted" && x.UnlinkedAtUtc == null)
                .Select(x => x.TeacherId).ToListAsync();
            var query = db.TeacherCourses.AsNoTracking()
                .Where(x => teacherIds.Contains(x.TeacherId) && x.IsPublished && !x.IsArchived
                    && (x.PublishAtUtc == null || x.PublishAtUtc <= DateTime.UtcNow));
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(x => x.Title.Contains(term) || (x.Subject != null && x.Subject.Contains(term)));
            }
            var enrolled = await db.CourseEnrollments.AsNoTracking()
                .Where(x => x.StudentId == userId && x.Status == "Active")
                .Select(x => x.CourseId).ToListAsync();
            var items = await query.Include(x => x.Teacher)
                .OrderByDescending(x => x.IsFeatured).ThenByDescending(x => x.UpdatedAtUtc)
                .Take(200)
                .Select(x => new
                {
                    id = x.Id,
                    title = x.Title,
                    shortDescription = x.ShortDescription,
                    subject = x.Subject,
                    stage = x.Stage,
                    grade = x.Grade,
                    coverUrl = x.CoverUrl,
                    teacherName = x.Teacher!.FullName,
                    deliveryMode = x.DeliveryMode,
                    isFree = x.IsFree,
                    price = x.Price,
                    oldPrice = x.OldPrice,
                    lessons = x.Units.Sum(u => u.Lessons.Count)
                }).ToListAsync();
            var itemsWithState = items.Select(x => new
            {
                x.id, x.title, x.shortDescription, x.subject, x.stage, x.grade, x.coverUrl, x.teacherName,
                x.deliveryMode, x.isFree, x.price, x.oldPrice, x.lessons,
                isEnrolled = enrolled.Contains(x.id)
            });
            return Results.Ok(new { items = itemsWithState });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/my/courses/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذه الواجهة للطلاب.");
            var userId = TeachingAccess.UserId(p);
            if (userId is null) return Results.Unauthorized();
            var course = await db.TeacherCourses.AsNoTracking()
                .Where(x => x.Id == id && x.IsPublished && !x.IsArchived)
                .Include(x => x.Teacher)
                .Include(x => x.Units.OrderBy(u => u.SortOrder))
                    .ThenInclude(u => u.Lessons.OrderBy(l => l.SortOrder))
                        .ThenInclude(l => l.Materials.OrderBy(m => m.SortOrder))
                .FirstOrDefaultAsync();
            if (course is null) return TeachingAccess.NotFound("الكورس غير موجود أو غير منشور.");
            var (allowed, basis) = await CourseAccessAsync(db, course, userId.Value);
            var progress = await db.LessonProgresses.AsNoTracking()
                .Where(x => x.StudentId == userId && x.CourseId == id)
                .ToDictionaryAsync(x => x.LessonId);
            var now = DateTime.UtcNow;
            var units = course.Units.Select(u => new
            {
                id = u.Id,
                title = u.Title,
                description = u.Description,
                lessons = u.Lessons.Where(l => !l.IsArchived && l.IsPublished
                        && (l.PublishAtUtc == null || l.PublishAtUtc <= now))
                    .Select(l =>
                    {
                        var unlocked = allowed || l.IsFreePreview;
                        return new
                        {
                            id = l.Id,
                            title = l.Title,
                            description = l.Description,
                            durationMinutes = l.DurationMinutes,
                            isFreePreview = l.IsFreePreview,
                            locked = !unlocked,
                            videoUrl = unlocked ? l.VideoUrl : null,
                            pdfUrl = unlocked ? l.PdfUrl : null,
                            completed = progress.TryGetValue(l.Id, out var pr) && pr.CompletedAtUtc != null,
                            materials = l.Materials.Where(m => m.IsPublished && (m.PublishAtUtc == null || m.PublishAtUtc <= now))
                                .Select(m => new
                                {
                                    id = m.Id,
                                    title = m.Title,
                                    kind = m.Kind,
                                    sizeBytes = m.SizeBytes,
                                    isFreePreview = m.IsFreePreview,
                                    locked = !(allowed || m.IsFreePreview),
                                    downloadable = m.IsDownloadable
                                })
                        };
                    })
            });
            return Results.Ok(new
            {
                course = new
                {
                    id = course.Id,
                    title = course.Title,
                    description = course.Description,
                    shortDescription = course.ShortDescription,
                    subject = course.Subject,
                    coverUrl = course.CoverUrl,
                    introVideoUrl = allowed ? course.IntroVideoUrl : null,
                    teacherName = course.Teacher?.FullName,
                    isFree = course.IsFree,
                    price = course.Price,
                    deliveryMode = course.DeliveryMode
                },
                units,
                access = new { allowed, basis },
                serverUtc = now
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapPost("/api/teaching/lessons/{id:guid}/complete", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (TeachingAccess.Role(p) != "Student") return TeachingAccess.Deny("هذه الواجهة للطلاب.");
            var userId = TeachingAccess.UserId(p);
            if (userId is null) return Results.Unauthorized();
            var lesson = await db.CourseLessons.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.IsPublished && !x.IsArchived);
            if (lesson is null) return TeachingAccess.NotFound("الدرس غير موجود.");
            var course = await db.TeacherCourses.AsNoTracking().FirstOrDefaultAsync(x => x.Id == lesson.CourseId);
            if (course is null) return TeachingAccess.NotFound("الكورس غير موجود.");
            var (allowed, _) = await CourseAccessAsync(db, course, userId.Value);
            if (!allowed && !lesson.IsFreePreview) return TeachingAccess.Deny("لا تملك وصولاً لهذا الدرس.");
            var progress = await db.LessonProgresses.FirstOrDefaultAsync(x => x.LessonId == id && x.StudentId == userId);
            if (progress is null)
            {
                progress = new LessonProgress
                {
                    TeacherId = lesson.TeacherId,
                    CourseId = lesson.CourseId,
                    LessonId = id,
                    StudentId = userId.Value
                };
                db.LessonProgresses.Add(progress);
            }
            progress.CompletedAtUtc ??= DateTime.UtcNow;
            progress.LastSeenAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireAuthorization().RequireRateLimiting("api");

        app.MapGet("/api/teaching/materials/{id:guid}/access", async (Guid id, ClaimsPrincipal p, AppDbContext db, HttpContext http) =>
        {
            var userId = TeachingAccess.UserId(p);
            if (userId is null) return Results.Unauthorized();
            var material = await db.LessonMaterials.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.IsPublished);
            if (material is null) return TeachingAccess.NotFound("المادة غير موجودة.");
            if (material.PublishAtUtc is not null && material.PublishAtUtc > DateTime.UtcNow)
                return TeachingAccess.Deny("لم يحن موعد نشر هذه المادة بعد.");
            var role = TeachingAccess.Role(p);
            var course = await db.TeacherCourses.AsNoTracking().FirstOrDefaultAsync(x => x.Id == material.CourseId);
            if (course is null) return TeachingAccess.NotFound("الكورس غير موجود.");
            var allowed = false;
            if (role == "Teacher" && course.TeacherId == userId) allowed = true;
            else if (role == "Assistant")
            {
                var scope = await TeachingAccess.ResolveAsync(db, p);
                allowed = scope is not null && scope.TeacherId == course.TeacherId && scope.Has(TeachingPermissions.CoursesView);
            }
            else if (role == "Student")
                allowed = material.IsFreePreview || (await CourseAccessAsync(db, course, userId.Value)).Allowed;
            if (!allowed) return TeachingAccess.Deny("لا تملك وصولاً لهذه المادة.");
            var secret = app.Configuration["Jwt:Key"] ?? "development-media-secret";
            var token = TeachingMediaTokens.Create(material.Id, userId.Value, secret, material.Kind == "Video" ? 20 : 10);
            db.ContentAccessLogs.Add(new ContentAccessLog
            {
                TeacherId = material.TeacherId,
                LessonMaterialId = material.Id,
                UserId = userId.Value,
                Action = "Issue",
                IpAddress = http.Connection.RemoteIpAddress?.ToString()
            });
            var watermark = await db.Users.AsNoTracking().Where(x => x.Id == userId).Select(x => new { x.FullName, x.StudentCode }).FirstOrDefaultAsync();
            await db.SaveChangesAsync();
            return Results.Ok(new
            {
                url = $"/api/teaching/media/{material.Id}?token={token}",
                expiresAtUtc = DateTime.UtcNow.AddMinutes(material.Kind == "Video" ? 20 : 10),
                kind = material.Kind,
                watermark = watermark is null ? null : $"{watermark.FullName} · {watermark.StudentCode}",
                downloadable = material.IsDownloadable
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        // Signed redemption: the browser video/iframe cannot send the JWT, so a
        // short-lived, material-bound HMAC token is used instead.
        app.MapGet("/api/teaching/media/{id:guid}", async (Guid id, string? token, AppDbContext db, HttpContext http) =>
        {
            var secret = app.Configuration["Jwt:Key"] ?? "development-media-secret";
            if (!TeachingMediaTokens.TryValidate(token, id, secret, out var userId))
                return Results.Json(new { message = "رابط المحتوى غير صالح أو منتهي. أعد فتح الدرس." }, statusCode: 401);
            var material = await db.LessonMaterials.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.IsPublished);
            if (material is null) return TeachingAccess.NotFound("المادة غير موجودة.");
            // Re-check entitlement at redemption time: a link issued before the enrollment
            // expired must stop working once access is revoked.
            var user = await db.Users.AsNoTracking().Where(x => x.Id == userId).Select(x => new { x.Role }).FirstOrDefaultAsync();
            if (user is null) return Results.Unauthorized();
            var course = await db.TeacherCourses.AsNoTracking().FirstOrDefaultAsync(x => x.Id == material.CourseId);
            if (course is null) return TeachingAccess.NotFound("الكورس غير موجود.");
            bool allowed;
            if (user.Role == "Teacher") allowed = course.TeacherId == userId;
            else if (user.Role == "Assistant")
                allowed = await db.TeachingAssistants.AsNoTracking().AnyAsync(x =>
                        x.AssistantId == userId && x.TeacherId == course.TeacherId && x.Status == "Active")
                    && await db.AssistantPermissions.AsNoTracking().AnyAsync(x =>
                        x.AssistantId == userId && x.TeacherId == course.TeacherId && x.Permission == TeachingPermissions.CoursesView);
            else if (user.Role == "Student")
                allowed = material.IsFreePreview || (await CourseAccessAsync(db, course, userId)).Allowed;
            else allowed = false;
            if (!allowed)
                return Results.Json(new { message = "انتهى وصولك إلى هذا المحتوى. جدّد الاشتراك ثم أعد فتح الدرس." }, statusCode: 403);
            db.ContentAccessLogs.Add(new ContentAccessLog
            {
                TeacherId = material.TeacherId,
                LessonMaterialId = material.Id,
                UserId = userId,
                Action = "Open",
                IpAddress = http.Connection.RemoteIpAddress?.ToString()
            });
            await db.SaveChangesAsync();
            return Results.Redirect(material.Url);
        }).RequireRateLimiting("api");

        // ------------------------------ me/boot -------------------------------
        app.MapGet("/api/teaching/overview", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var scope = await TeachingAccess.ResolveAsync(db, p);
            if (scope is null) return TeachingAccess.Deny("هذا الحساب غير مرتبط بمدرس نشط.");
            var now = DateTime.UtcNow;
            var courseCount = await db.TeacherCourses.CountAsync(x => x.TeacherId == scope.TeacherId && !x.IsArchived);
            var groupCount = await db.TeachingGroups.CountAsync(x => x.TeacherId == scope.TeacherId && x.IsActive);
            var studentCount = await TeachingAccess.LinkedStudentIds(db, scope.TeacherId).CountAsync();
            var sessionCount = await db.GroupSessions.CountAsync(x => x.TeacherId == scope.TeacherId
                && x.StartsAtUtc >= now.Date && x.StartsAtUtc < now.Date.AddDays(1));
            var homeworkCount = await db.HomeworkAssignments.CountAsync(x => x.TeacherId == scope.TeacherId && x.IsPublished);
            var pendingHomework = await db.HomeworkSubmissions.CountAsync(x => x.TeacherId == scope.TeacherId && x.Status != "Reviewed");
            var (sub, plan) = await TeachingBillingLimits.CurrentAsync(db, scope.TeacherId);
            return Results.Ok(new
            {
                role = scope.Role,
                isOwner = scope.IsOwner,
                permissions = TeachingPermissions.All.Where(x => scope.Has(x.Key)).Select(x => x.Key),
                counts = new { courses = courseCount, groups = groupCount, students = studentCount, sessionsToday = sessionCount, homework = homeworkCount, pendingHomework },
                plan = plan is null ? null : new
                {
                    code = plan.Code,
                    name = plan.Name,
                    price = plan.Price,
                    currency = plan.Currency,
                    maxStudents = plan.MaxStudents,
                    maxCourses = plan.MaxCourses,
                    maxGroups = plan.MaxGroups,
                    maxAssistants = plan.MaxAssistants,
                    graceDays = plan.GraceDays
                },
                subscription = sub is null ? null : new { status = sub.Status, endsAtUtc = sub.EndsAtUtc, autoRenew = sub.AutoRenew },
                serverUtc = now
            });
        }).RequireAuthorization().RequireRateLimiting("api");
    }

    // ------------------------------ internals --------------------------------

    public static async Task ApplyAssistantPermissions(AppDbContext db, Guid teacherId, Guid assistantId,
        string[]? permissions, Guid[]? groupIds)
    {
        var requested = (permissions ?? TeachingPermissions.DefaultAssistantPermissions)
            .Where(TeachingPermissions.IsKnown)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        await db.AssistantPermissions
            .Where(x => x.TeacherId == teacherId && x.AssistantId == assistantId && !requested.Contains(x.Permission))
            .ExecuteDeleteAsync();
        var existing = await db.AssistantPermissions.AsNoTracking()
            .Where(x => x.TeacherId == teacherId && x.AssistantId == assistantId)
            .Select(x => x.Permission).ToListAsync();
        foreach (var permission in requested.Except(existing, StringComparer.Ordinal))
            db.AssistantPermissions.Add(new AssistantPermission { TeacherId = teacherId, AssistantId = assistantId, Permission = permission });

        var validGroups = await db.TeachingGroups.AsNoTracking()
            .Where(x => x.TeacherId == teacherId && (groupIds == null || groupIds.Contains(x.Id)))
            .Select(x => x.Id).ToListAsync();
        await db.AssistantGroupAccesses
            .Where(x => x.TeacherId == teacherId && x.AssistantId == assistantId)
            .ExecuteDeleteAsync();
        foreach (var groupId in validGroups)
            db.AssistantGroupAccesses.Add(new AssistantGroupAccess { TeacherId = teacherId, AssistantId = assistantId, GroupId = groupId });
    }

    public static async Task<(bool Allowed, string Basis)> CourseAccessAsync(AppDbContext db, TeacherCourse course, Guid studentId)
    {
        if (course.TeacherId == studentId) return (true, "Owner");
        var enrollment = await db.CourseEnrollments.AsNoTracking()
            .Where(x => x.CourseId == course.Id && x.StudentId == studentId && x.Status == "Active")
            .OrderByDescending(x => x.EnrolledAtUtc).FirstOrDefaultAsync();
        if (enrollment is not null && (enrollment.ExpiresAtUtc is null || enrollment.ExpiresAtUtc > DateTime.UtcNow))
            return (true, "Enrollment");
        var groupIds = await db.GroupMemberships.AsNoTracking()
            .Where(x => x.StudentId == studentId && x.Status == "Active")
            .Select(x => x.GroupId).ToListAsync();
        if (groupIds.Count > 0)
        {
            var now = DateTime.UtcNow;
            var allowedGroup = await db.GroupCourses.AsNoTracking()
                .Where(x => x.CourseId == course.Id && groupIds.Contains(x.GroupId))
                .Join(db.TeachingGroups.AsNoTracking(), link => link.GroupId, group => group.Id, (link, group) => group)
                .AnyAsync(group => group.IsActive && (group.EndDateUtc == null || group.EndDateUtc > now));
            if (allowedGroup) return (true, "Group");
        }
        if (course.IsFree && await TeachingAccess.IsLinkedStudentAsync(db, course.TeacherId, studentId))
            return (true, "Free");
        return (false, "None");
    }

    private static IResult? ValidateCourse(CourseInput req)
    {
        if (string.IsNullOrWhiteSpace(req.Title) || req.Title.Trim().Length is < 3 or > 200)
            return TeachingAccess.Bad("عنوان الكورس يجب أن يكون بين 3 و200 حرف.");
        if (req.Price < 0 || req.OldPrice < 0) return TeachingAccess.Bad("السعر غير صالح.");
        if (req.Capacity is < 1) return TeachingAccess.Bad("عدد الطلاب يجب أن يكون أكبر من صفر.");
        string[] modes = ["Online", "Offline", "Hybrid"];
        if (!modes.Contains(req.DeliveryMode ?? "Online", StringComparer.OrdinalIgnoreCase))
            return TeachingAccess.Bad("نمط الكورس غير صالح.");
        return null;
    }

    private static void ApplyCourse(TeacherCourse course, CourseInput req)
    {
        course.Title = req.Title.Trim();
        course.ShortDescription = TeachingText.Safe(req.ShortDescription, 500);
        course.Description = TeachingText.Safe(req.Description, 4000);
        course.Subject = TeachingText.Safe(req.Subject, 120);
        course.Stage = TeachingText.Safe(req.Stage, 32);
        course.Grade = TeachingText.Safe(req.Grade, 64);
        course.CoverUrl = TeachingText.Safe(req.CoverUrl, 500);
        course.IntroVideoUrl = TeachingText.Safe(req.IntroVideoUrl, 1000);
        course.DeliveryMode = req.DeliveryMode ?? "Online";
        course.IsFree = req.IsFree;
        course.Price = req.Price;
        course.OldPrice = req.OldPrice;
        course.Capacity = req.Capacity;
        course.AccessDays = Math.Clamp(req.AccessDays, 0, 3650);
        course.IsPublished = req.IsPublished;
        course.IsFeatured = req.IsFeatured;
        course.PublishAtUtc = req.PublishAtUtc;
        course.UpdatedAtUtc = DateTime.UtcNow;
    }

    private static string? PasswordIssue(string? password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < 10 || password.Length > 128)
            return "كلمة المرور يجب أن تكون بين 10 و128 حرفاً.";
        if (password != password.Trim()) return "لا تبدأ أو تنتهي كلمة المرور بمسافات.";
        return null;
    }

    private static string GeneratePassword() =>
        "As" + Convert.ToBase64String(RandomNumberGenerator.GetBytes(12)).Replace("+", "a").Replace("/", "b").TrimEnd('=') + "9!";
}

public record AssistantCreateRequest(string Email, string? FullName = null, string? Password = null,
    string[]? Permissions = null, Guid[]? GroupIds = null);

public record AssistantUpdateRequest(string? Status = null, string[]? Permissions = null, Guid[]? GroupIds = null);

public record CourseInput(string Title, string? ShortDescription = null, string? Description = null,
    string? Subject = null, string? Stage = null, string? Grade = null, string? CoverUrl = null,
    string? IntroVideoUrl = null, string DeliveryMode = "Online", bool IsFree = false,
    decimal Price = 0, decimal? OldPrice = null, int? Capacity = null, int AccessDays = 365,
    bool IsPublished = false, bool IsFeatured = false, DateTime? PublishAtUtc = null);

public record UnitInput(string Title, string? Description = null, int SortOrder = 0);

public record LessonInput(string Title, string? Description = null, string? VideoUrl = null,
    string? PdfUrl = null, int DurationMinutes = 0, bool IsFreePreview = false,
    bool IsPublished = true, DateTime? PublishAtUtc = null, int SortOrder = 0);

public record MaterialInput(string Title, string Kind, string Url, string? StorageKey = null,
    long? SizeBytes = null, bool IsFreePreview = false, bool IsDownloadable = true,
    bool IsPublished = true, DateTime? PublishAtUtc = null, int SortOrder = 0);

public record EnrollmentInput(Guid StudentId, DateTime? StartsAtUtc = null,
    DateTime? ExpiresAtUtc = null, decimal AmountPaid = 0);

public record PublishInput(bool Publish);
