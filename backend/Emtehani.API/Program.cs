using System.Net;
using System.Net.Mail;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Emtehani.Infrastructure;
using Emtehani.Infrastructure.Persistence;
using Emtehani.Domain.Entities;
using Emtehani.Application.Contracts;
using System.Threading.RateLimiting;
using System.Security.Cryptography;
using Emtehani.Domain.Services;
var builder = WebApplication.CreateBuilder(args);
var isProduction = builder.Environment.IsProduction();
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
builder.Services.AddInfrastructure(builder.Configuration);

var configuredOrigins = builder.Configuration["FrontendOrigin"];
if (string.IsNullOrWhiteSpace(configuredOrigins))
{
    if (isProduction)
        throw new InvalidOperationException("FrontendOrigin must be configured as an absolute HTTPS origin in Production.");
    configuredOrigins = "http://localhost:5173";
}
var allowedOrigins = configuredOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .Select(origin => origin.TrimEnd('/'))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();
if (allowedOrigins.Length == 0 || allowedOrigins.Any(origin => !IsValidOrigin(origin, requireHttps: isProduction)))
    throw new InvalidOperationException("FrontendOrigin must contain only valid absolute origins (HTTPS is required in Production), without paths, queries, or wildcards.");
builder.Services.AddCors(o => o.AddPolicy("frontend", p => p
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .WithExposedHeaders("Retry-After")
    .SetPreflightMaxAge(TimeSpan.FromMinutes(10))));

var configuredPublicApiUrl = builder.Configuration["PublicApiUrl"];
if (isProduction)
{
    if (!IsValidOrigin(configuredPublicApiUrl, requireHttps: true))
        throw new InvalidOperationException("PublicApiUrl must be configured as an absolute HTTPS origin in Production.");
}
else if (!IsValidOrigin(configuredPublicApiUrl, requireHttps: false))
{
    configuredPublicApiUrl = "http://localhost:5000";
}
builder.Configuration["PublicApiUrl"] = configuredPublicApiUrl!.TrimEnd('/');

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});
var jwtKey = builder.Configuration["Jwt:Key"] ?? Environment.GetEnvironmentVariable("JWT_KEY");
if (string.IsNullOrWhiteSpace(jwtKey))
{
    if (!builder.Environment.IsDevelopment())
        throw new InvalidOperationException("Jwt:Key or JWT_KEY must be configured outside Development.");
    jwtKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
}
if (Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Jwt:Key must contain at least 32 bytes.");
builder.Configuration["Jwt:Key"] = jwtKey;
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "Emtehani";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "Emtehani.Client";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.SaveToken = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = jwtIssuer,
        ValidateAudience = true,
        ValidAudience = jwtAudience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidateLifetime = true,
        RequireExpirationTime = true,
        RequireSignedTokens = true,
        ClockSkew = TimeSpan.FromSeconds(30),
        NameClaimType = ClaimTypes.Name,
        RoleClaimType = ClaimTypes.Role
    };
});
builder.Services.AddAuthorization(); builder.Services.AddEndpointsApiExplorer(); builder.Services.AddSwaggerGen();
builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>();
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    var apiPermitLimit = Math.Max(1, builder.Configuration.GetValue("RateLimiting:ApiPermitLimit", 120));
    var authPermitLimit = Math.Max(1, builder.Configuration.GetValue("RateLimiting:AuthPermitLimit", 60));
    var joinPermitLimit = Math.Max(1, builder.Configuration.GetValue("RateLimiting:JoinPermitLimit", 10));
    static string ClientKey(HttpContext context, bool perUser)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (perUser && !string.IsNullOrWhiteSpace(userId)) return "user:" + userId;
        return "ip:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown");
    }
    static RateLimitPartition<string> Fixed(HttpContext context, int permitLimit, bool perUser = false) =>
        RateLimitPartition.GetFixedWindowLimiter(
            ClientKey(context, perUser),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permitLimit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true });
    o.AddPolicy("api", context => Fixed(context, apiPermitLimit));
    o.AddPolicy("auth", context => Fixed(context, authPermitLimit));
    // Code guessing is limited per authenticated account, not just per shared IP.
    o.AddPolicy("join", context => Fixed(context, joinPermitLimit, perUser: true));
    o.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.HttpContext.Response.Headers.RetryAfter = Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture);
        else
            context.HttpContext.Response.Headers.RetryAfter = "60";
        context.HttpContext.Response.ContentType = "application/problem+json; charset=utf-8";
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            status = StatusCodes.Status429TooManyRequests,
            title = "طلبات كثيرة خلال وقت قصير.",
            message = "انتظر دقيقة ثم حاول مرة أخرى."
        }, cancellationToken);
    };
});
builder.Services.AddProblemDetails();
var swaggerEnabled = builder.Configuration.GetValue("Swagger:Enabled", builder.Environment.IsDevelopment());
builder.WebHost.ConfigureKestrel(o =>
{
    o.Limits.MaxRequestBodySize = 2 * 1024 * 1024;
    o.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(30);
    o.Limits.KeepAliveTimeout = TimeSpan.FromMinutes(2);
});
var app = builder.Build();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();
    await ExamWorkflowSchema.EnsureAsync(db);
}
app.UseForwardedHeaders();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    context.Response.Headers["X-Permitted-Cross-Domain-Policies"] = "none";
    context.Response.Headers["Cross-Origin-Opener-Policy"] = "same-origin";
    if (context.Request.Path.StartsWithSegments("/api"))
        context.Response.Headers["Cache-Control"] = "no-store";
    await next();
});
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    var exception = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
    var isConcurrency = exception is DbUpdateConcurrencyException
        || exception is DbUpdateException { InnerException: Npgsql.PostgresException { SqlState: "40001" } }
        || exception is Npgsql.PostgresException { SqlState: "40001" };
    var isBadRequest = exception is BadHttpRequestException
        || exception is JsonException
        || exception is InvalidOperationException && exception.Message.Contains("Implicit body", StringComparison.Ordinal);
    var isUniqueViolation = exception is DbUpdateException { InnerException: not null } dbEx && IsUniqueViolation(dbEx.InnerException);
    var status = isConcurrency ? StatusCodes.Status409Conflict
        : isBadRequest ? StatusCodes.Status400BadRequest
        : isUniqueViolation ? StatusCodes.Status409Conflict
        : StatusCodes.Status500InternalServerError;
    if (status >= 500)
        app.Logger.LogError(exception, "Unhandled API exception. TraceId: {TraceId}", context.TraceIdentifier);
    else
        app.Logger.LogWarning(exception, "Rejected API request with status {Status}. TraceId: {TraceId}", status, context.TraceIdentifier);

    context.Response.StatusCode = status;
    context.Response.ContentType = "application/problem+json; charset=utf-8";
    await context.Response.WriteAsJsonAsync(new
    {
        type = "https://tools.ietf.org/html/rfc9110#section-15.6.1",
        title = status switch
        {
            StatusCodes.Status409Conflict => "لم يتم اعتماد التغيير بسبب تعارض في الحالة الحالية.",
            StatusCodes.Status400BadRequest => "الطلب غير صالح أو ناقص البيانات.",
            _ => "تعذر إكمال العملية بسبب مشكلة مؤقتة في الخادم."
        },
        message = status switch
        {
            StatusCodes.Status409Conflict => "انتظر لحظة ثم حدّث الصفحة وأعد المحاولة؛ لم يتم تأكيد أي تغيير.",
            StatusCodes.Status400BadRequest => "راجع البيانات المرسلة ثم أعد المحاولة.",
            _ => "احتفظ بالصفحة مفتوحة وحاول مرة أخرى. إذا تكررت المشكلة، أرسل رقم البلاغ للدعم."
        },
        status,
        traceId = context.TraceIdentifier
    });
}));
if (swaggerEnabled) { app.UseSwagger(); app.UseSwaggerUI(); }
app.UseCors("frontend");
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.MapHealthChecks("/health");
app.MapGet("/api", () => Results.Ok(new { service = "Emtehani API", version = "1.0" }));
string Hash(string password, string salt) => Convert.ToBase64String(Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(salt), 120000, HashAlgorithmName.SHA256, 32));
string Salt() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(16));
string UserId(ClaimsPrincipal p) => p.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
static bool IsValidOrigin(string? value, bool requireHttps)
{
    if (string.IsNullOrWhiteSpace(value) || value.Contains('*', StringComparison.Ordinal) || !Uri.TryCreate(value, UriKind.Absolute, out var uri))
        return false;
    if (uri.Scheme != Uri.UriSchemeHttps && (!requireHttps && uri.Scheme != Uri.UriSchemeHttp)) return false;
    if (requireHttps && uri.Scheme != Uri.UriSchemeHttps) return false;
    return string.IsNullOrEmpty(uri.UserInfo)
        && (string.IsNullOrEmpty(uri.AbsolutePath) || uri.AbsolutePath == "/")
        && string.IsNullOrEmpty(uri.Query)
        && string.IsNullOrEmpty(uri.Fragment);
}
static bool FixedTimeEquals(string left, string right)
{
    var leftBytes = Encoding.UTF8.GetBytes(left);
    var rightBytes = Encoding.UTF8.GetBytes(right);
    return leftBytes.Length == rightBytes.Length && CryptographicOperations.FixedTimeEquals(leftBytes, rightBytes);
}
static bool IsUniqueViolation(Exception? ex) => ex switch
{
    Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 } => true,
    Npgsql.PostgresException { SqlState: "23505" } => true,
    _ => false
};
async Task Audit(AppDbContext db, Guid? actor, string action, string type, string? id, string? details = null)
{
    try
    {
        db.AuditEvents.Add(new AuditEvent { ActorId = actor, Action = action, EntityType = type, EntityId = id, Details = details });
        await db.SaveChangesAsync();
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Audit write failed for {Action} {EntityType} {EntityId}.", action, type, id);
    }
}
async Task<string> NewStudentCode(AppDbContext db)
{
    string code;
    do { code = RandomNumberGenerator.GetInt32(100000, 1_000_000).ToString(); }
    while (await db.Users.AnyAsync(x => x.StudentCode == code) || await db.ExamParticipants.AnyAsync(x => x.Code == code));
    return code;
}
static long SubmissionLockKey(Guid submissionId)
{
    Span<byte> bytes = stackalloc byte[16];
    submissionId.TryWriteBytes(bytes);
    return BitConverter.ToInt64(bytes[..8]);
}
async Task AcquireSubmissionLock(AppDbContext db, Guid submissionId)
{
    if (db.Database.IsNpgsql())
    {
        var key = SubmissionLockKey(submissionId);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({key})");
        return;
    }

    if (db.Database.IsSqlServer())
    {
        var resource = $"submission:{submissionId}";
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @result int;
            EXEC @result = sp_getapplock
                @Resource = {resource},
                @LockMode = 'Exclusive',
                @LockOwner = 'Transaction',
                @LockTimeout = 30000;
            IF @result < 0
                THROW 51000, 'Could not acquire the submission lock.', 1;
            """);
    }
}
static int? RemainingSeconds(Submission? submission, Exam exam, DateTime now)
{
    if (submission is null) return null;
    if (submission.Status != "InProgress") return 0;
    var reference = exam.Status == "Paused" && exam.PausedAtUtc.HasValue ? exam.PausedAtUtc.Value : now;
    return Math.Max(0, (int)(ExamGrader.Deadline(submission, exam.DurationMinutes, exam.AvailableUntilUtc) - reference).TotalSeconds);
}
async Task<TeacherStudentRequest?> ActiveTeacherStudentLink(AppDbContext db, Guid teacherId, Guid studentId) =>
    await db.TeacherStudentRequests.FirstOrDefaultAsync(x => x.TeacherId == teacherId && x.StudentId == studentId
        && x.Status == "Accepted" && x.UnlinkedAtUtc == null);
async Task<string?> ExamAccessRestriction(AppDbContext db, Guid examId, Guid studentId)
{
    var examInfo = await db.Exams.AsNoTracking()
        .Where(x => x.Id == examId)
        .Select(x => new { x.TeacherId, x.Stage, x.Grade })
        .FirstOrDefaultAsync();
    if (examInfo is null) return "الامتحان غير موجود.";
    var student = await db.Users.AsNoTracking()
        .Where(x => x.Id == studentId && x.Role == "Student")
        .Select(x => new { x.Stage, x.Grade })
        .FirstOrDefaultAsync();
    if (student is null) return "حساب الطالب غير موجود.";
    if (!EducationCatalog.Matches(examInfo.Stage, examInfo.Grade, student.Stage, student.Grade))
        return "هذا الامتحان غير متاح لمرحلتك التعليمية أو صفك الدراسي.";
    var relationship = await db.TeacherStudentRequests.AsNoTracking()
        .Where(x => x.TeacherId == examInfo.TeacherId && x.StudentId == studentId && x.Status == "Accepted")
        .Select(x => new { x.UnlinkedAtUtc, x.SuspendedAtUtc })
        .FirstOrDefaultAsync();
    if (relationship is null)
        return "أنت غير مسجل مع مدرس هذا الامتحان.";
    if (relationship.UnlinkedAtUtc.HasValue)
        return "تم فك ارتباطك بهذا المدرس. تواصل معه لإعادة التسجيل.";
    if (relationship.SuspendedAtUtc.HasValue)
        return "تم إيقاف وصولك إلى امتحانات هذا المدرس. تواصل معه لإعادة التفعيل.";
    if (await db.TeacherStudentExamBans.AnyAsync(x => x.ExamId == examId && x.StudentId == studentId))
        return "تم منعك من دخول هذا الامتحان من قبل المدرس.";
    return null;
}
async Task<bool> IsEligibleForExam(AppDbContext db, Guid examId, Guid studentId) =>
    await ExamAccessRestriction(db, examId, studentId) is null;
// Ending an exam only stops attempts and finalizes submissions. Students still cannot
// see scores or answer keys until the owning teacher explicitly publishes the results.
static bool ResultsReleased(Exam exam) =>
    exam.Status == "Finished" && exam.ResultsPublishedAtUtc.HasValue;
async Task CloseExam(AppDbContext db, Exam exam, DateTime now)
{
    await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted);
    var submissionIds = await db.Submissions.AsNoTracking()
        .Where(x => x.ExamId == exam.Id && x.Status == "InProgress")
        .Select(x => x.Id)
        .ToListAsync();
    var questions = await db.Questions.AsNoTracking().Where(x => x.ExamId == exam.Id).ToListAsync();
    foreach (var submissionId in submissionIds)
    {
        await AcquireSubmissionLock(db, submissionId);
        var submission = await db.Submissions.Include(x => x.Answers)
            .FirstOrDefaultAsync(x => x.Id == submissionId && x.Status == "InProgress");
        if (submission is null) continue;
        ExamGrader.Grade(submission, questions);
        submission.SubmittedAtUtc = now;
        var participant = await db.ExamParticipants.FirstOrDefaultAsync(x => x.ExamId == exam.Id && x.StudentId == submission.StudentId);
        if (participant is not null) { participant.Status = "Submitted"; participant.LastSeenAtUtc = now; }
    }
    await db.ExamParticipants
        .Where(x => x.ExamId == exam.Id && (x.Status == "Waiting" || x.Status == "Active"))
        .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.Status, "Submitted"));
    exam.Status = "Finished";
    exam.PausedAtUtc = null;
    await db.SaveChangesAsync();
    await tx.CommitAsync();
}
async Task<List<ExamParticipantView>> ParticipantViews(AppDbContext db, Exam exam, DateTime now)
{
    var participants = await db.ExamParticipants.AsNoTracking().Include(x => x.Student).Where(x => x.ExamId == exam.Id).OrderBy(x => x.Student!.FullName).ToListAsync();
    var submissions = await db.Submissions.AsNoTracking().Where(x => x.ExamId == exam.Id).ToListAsync();
    var latestByStudent = submissions.GroupBy(x => x.StudentId).ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.AttemptNumber).First());
    return participants.Select(participant =>
    {
        latestByStudent.TryGetValue(participant.StudentId, out var submission);
        var status = participant.Status;
        if (submission is not null)
        {
            if (submission.Status == "InProgress" && (exam.Status is "Active" or "Paused")) status = "Active";
            else if (submission.Status is "Submitted" or "Reviewed" or "NeedsReview" or "Processing" or "Abandoned") status = "Submitted";
        }
        if ((status is "Active" or "Waiting") && participant.LastSeenAtUtc.HasValue && now - participant.LastSeenAtUtc.Value > TimeSpan.FromSeconds(45)) status = "Disconnected";
        if (status == "Active" && !participant.LastSeenAtUtc.HasValue) status = "Disconnected";
        return new ExamParticipantView(
            participant.Id,
            participant.Student?.FullName ?? "طالب",
            participant.Student?.Email ?? "",
            participant.Code,
            status,
            participant.JoinedAtUtc,
            participant.LastSeenAtUtc,
            submission?.SubmittedAtUtc,
            submission is null || submission.Status == "InProgress" ? null : submission.Score,
            submission is null ? null : submission.MaxScore,
            RemainingSeconds(submission, exam, now));
    }).ToList();
}
async Task<bool> SendVerificationEmail(AppUser user, string verifyToken)
{
    var smtpHost = builder.Configuration["Email:SmtpHost"];
    if (string.IsNullOrWhiteSpace(smtpHost)) return false;
    var verifyUrl = $"{(builder.Configuration["PublicApiUrl"] ?? "http://localhost:5000").TrimEnd('/')}/api/auth/verify-email?token={Uri.EscapeDataString(verifyToken)}";
    try
    {
        using var mail = new MailMessage(builder.Configuration["Email:From"] ?? "no-reply@localhost", user.Email, "تأكيد البريد الإلكتروني - امتحاني",
            $"<div dir='rtl' style='font-family:Arial'><h2>أهلاً {WebUtility.HtmlEncode(user.FullName)}</h2><p>لتفعيل حسابك، اضغط على الرابط التالي:</p><p><a href='{verifyUrl}'>تأكيد البريد الإلكتروني</a></p><p>الرابط صالح لمدة 24 ساعة.</p></div>") { IsBodyHtml = true };
        using var client = new SmtpClient(smtpHost, int.TryParse(builder.Configuration["Email:SmtpPort"], out var port) ? port : 587) { EnableSsl = bool.TryParse(builder.Configuration["Email:EnableSsl"], out var ssl) && ssl };
        var username = builder.Configuration["Email:Username"]; var password = builder.Configuration["Email:Password"];
        if (!string.IsNullOrWhiteSpace(username)) client.Credentials = new NetworkCredential(username, password);
        await client.SendMailAsync(mail);
        return true;
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Verification email delivery failed.");
        return false;
    }
}
async Task<bool> SendPasswordResetEmail(AppUser user, string resetToken)
{
    var smtpHost = builder.Configuration["Email:SmtpHost"];
    if (string.IsNullOrWhiteSpace(smtpHost)) return false;
    var resetUrl = $"{allowedOrigins[0]}/?resetToken={Uri.EscapeDataString(resetToken)}";
    try
    {
        using var mail = new MailMessage(builder.Configuration["Email:From"] ?? "no-reply@localhost", user.Email, "إعادة تعيين كلمة المرور - امتحاني",
            $"<div dir='rtl' style='font-family:Arial'><h2>أهلاً {WebUtility.HtmlEncode(user.FullName)}</h2><p>لإعادة تعيين كلمة المرور، اضغط على الرابط التالي:</p><p><a href='{resetUrl}'>إعادة تعيين كلمة المرور</a></p><p>الرابط صالح لمدة ساعة واحدة. إذا لم تطلب ذلك، تجاهل الرسالة.</p></div>") { IsBodyHtml = true };
        using var client = new SmtpClient(smtpHost, int.TryParse(builder.Configuration["Email:SmtpPort"], out var smtpPort) ? smtpPort : 587) { EnableSsl = bool.TryParse(builder.Configuration["Email:EnableSsl"], out var ssl) && ssl };
        var username = builder.Configuration["Email:Username"]; var password = builder.Configuration["Email:Password"];
        if (!string.IsNullOrWhiteSpace(username)) client.Credentials = new NetworkCredential(username, password);
        await client.SendMailAsync(mail);
        return true;
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Password reset email delivery failed.");
        return false;
    }
}
async Task FinalizeExpired(AppDbContext db)
{
    const int FinalizeGraceMinutes = 5;
    var now = DateTime.UtcNow;
    var candidates = await db.Submissions
        .AsNoTracking()
        .Where(x => x.Status == "InProgress" && x.Exam != null)
        .Select(x => new { x.Id, x.StartedAtUtc, x.ExtraTimeSeconds, x.Exam!.DurationMinutes, x.Exam.AvailableUntilUtc })
        .ToListAsync();
    var expiredIds = candidates
        .Where(x =>
        {
            var effective = ExamGrader.Deadline(new Submission { StartedAtUtc = x.StartedAtUtc, ExtraTimeSeconds = x.ExtraTimeSeconds }, x.DurationMinutes, x.AvailableUntilUtc);
            var cappedByWindow = x.AvailableUntilUtc.HasValue && effective == x.AvailableUntilUtc.Value;
            return now >= effective.AddMinutes(cappedByWindow ? 0 : FinalizeGraceMinutes);
        })
        .Select(x => x.Id)
        .ToList();
    if (expiredIds.Count == 0) return;
    await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted);
    foreach (var submissionId in expiredIds)
    {
        await AcquireSubmissionLock(db, submissionId);
        var submission = await db.Submissions
            .Include(x => x.Answers)
            .Include(x => x.Exam)
            .FirstOrDefaultAsync(x => x.Id == submissionId && x.Status == "InProgress");
        if (submission?.Exam is null) continue;
        var deadline = ExamGrader.Deadline(submission, submission.Exam.DurationMinutes, submission.Exam.AvailableUntilUtc);
        var cappedByWindow = submission.Exam.AvailableUntilUtc.HasValue && deadline == submission.Exam.AvailableUntilUtc.Value;
        if (now < deadline.AddMinutes(cappedByWindow ? 0 : FinalizeGraceMinutes)) continue;
        var questions = await db.Questions.AsNoTracking().Where(x => x.ExamId == submission.ExamId).ToListAsync();
        ExamGrader.Grade(submission, questions);
        submission.SubmittedAtUtc = deadline;
        var participant = await db.ExamParticipants.FirstOrDefaultAsync(x => x.ExamId == submission.ExamId && x.StudentId == submission.StudentId);
        if (participant is not null) { participant.Status = "Submitted"; participant.LastSeenAtUtc = now; }
    }
    await db.SaveChangesAsync();
    await tx.CommitAsync();
}
app.MapPost("/api/auth/register", async (RegisterRequest req, AppDbContext db, Emtehani.Application.Abstractions.ITokenService tokens) =>
{
  if (req is null || string.IsNullOrWhiteSpace(req.FullName) || string.IsNullOrWhiteSpace(req.Email) ||
      string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8 || req.Password.Length > 128 ||
      req.FullName.Trim().Length is < 3 or > 120 || req.Email.Trim().Length > 254 || !req.Email.Contains('@'))
    return Results.BadRequest(new { message = "أدخل الاسم والبريد الصحيح وكلمة مرور بين 8 و128 حرفاً." });

  var email = req.Email.Trim().ToLowerInvariant();
  var role = string.Equals(req.Role, "Teacher", StringComparison.OrdinalIgnoreCase) ? "Teacher" : "Student";
  var stage = req.Stage?.Trim();
  var grade = req.Grade?.Trim();
  if (role == "Student" && !EducationCatalog.IsValid(stage, grade))
    return Results.BadRequest(new { message = "اختر المرحلة التعليمية والصف الدراسي المناسب لها." });
  if (role == "Teacher") { stage = null; grade = null; }
  if (await db.Users.AnyAsync(x => x.Email == email))
    return Results.Conflict(new { message = "البريد مستخدم بالفعل." });

  var salt = Salt();
  var smtpHost = builder.Configuration["Email:SmtpHost"];
  var smtpUsername = builder.Configuration["Email:Username"];
  var smtpPassword = builder.Configuration["Email:Password"];
  var smtpConfigured = !string.IsNullOrWhiteSpace(smtpHost)
      && !string.IsNullOrWhiteSpace(smtpUsername)
      && !string.IsNullOrWhiteSpace(smtpPassword);
  var autoConfirmWithoutSmtp = builder.Configuration.GetValue("Auth:AutoConfirmWithoutSmtp", app.Environment.IsDevelopment());
  if (!smtpConfigured)
  {
    if (!autoConfirmWithoutSmtp)
      return Results.Problem(statusCode: 503, title: "خدمة تأكيد البريد غير مهيأة. يرجى التواصل مع إدارة المنصة.", extensions: new Dictionary<string, object?> { ["message"] = "خدمة البريد الإلكتروني غير متاحة حاليًا." });
    var newUser = new AppUser { FullName = req.FullName.Trim(), Email = email, Role = role, Stage = stage, Grade = grade, EmailConfirmed = true, PasswordHash = salt + ":" + Hash(req.Password, salt) };
    if (role == "Student") newUser.StudentCode = await NewStudentCode(db);
    db.Users.Add(newUser);
    await db.SaveChangesAsync();
    return Results.Ok(new { message = "تم إنشاء الحساب وتفعيله تلقائيًا. يمكنك تسجيل الدخول الآن.", studentCode = newUser.StudentCode });
  }
  var verifyToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
  var user = new AppUser { FullName = req.FullName.Trim(), Email = email, Role = role, Stage = stage, Grade = grade, EmailConfirmed = false, EmailVerificationToken = verifyToken, EmailVerificationExpiresUtc = DateTime.UtcNow.AddHours(24), PasswordHash = salt + ":" + Hash(req.Password, salt) };
  if (role == "Student") user.StudentCode = await NewStudentCode(db);
  db.Users.Add(user);
  await db.SaveChangesAsync();
  if (!await SendVerificationEmail(user, verifyToken))
  {
    db.Users.Remove(user); await db.SaveChangesAsync();
    return Results.Problem(statusCode: 503, title: "تعذر إرسال رسالة التأكيد.", extensions: new Dictionary<string, object?> { ["message"] = "لم نتمكن من إرسال رسالة التأكيد. تحقق من إعدادات البريد وحاول مرة أخرى." });
  }
  return Results.Ok(new { message = "تم إنشاء الحساب. افتح بريدك الإلكتروني واضغط على رابط التأكيد قبل تسجيل الدخول.", studentCode = user.StudentCode });
}).RequireRateLimiting("auth");
app.MapGet("/api/auth/verify-email", async (string token, AppDbContext db) =>
{
  if (string.IsNullOrWhiteSpace(token)) return Results.BadRequest("رابط التأكيد غير صالح.");
  var user = await db.Users.FirstOrDefaultAsync(x => x.EmailVerificationToken == token);
  if (user is null) return Results.BadRequest("رابط التأكيد غير صالح أو سبق استخدامه.");
  if (user.EmailVerificationExpiresUtc < DateTime.UtcNow) return Results.BadRequest("انتهت صلاحية رابط التأكيد. اطلب إعادة إرسال رسالة التأكيد.");
  user.EmailConfirmed = true; user.EmailVerificationToken = null; user.EmailVerificationExpiresUtc = null;
  await db.SaveChangesAsync();
  return Results.Content("<html lang='ar' dir='rtl'><meta charset='utf-8'><body style='font-family:Arial;text-align:center;padding:4rem'><h1>تم تأكيد بريدك الإلكتروني بنجاح</h1><p>يمكنك الآن العودة إلى منصة امتحاني وتسجيل الدخول.</p></body></html>", "text/html; charset=utf-8");
}).RequireRateLimiting("auth");
app.MapPost("/api/auth/resend-verification", async (ResendVerificationRequest req, AppDbContext db) =>
{
    var message = "إذا كان البريد مسجلاً وغير مؤكد، فسنرسل رابط تأكيد جديداً.";
    if (req is null || string.IsNullOrWhiteSpace(req.Email) || !req.Email.Contains('@')) return Results.BadRequest(new { message = "أدخل بريداً إلكترونياً صحيحاً." });
    var email = req.Email.Trim().ToLowerInvariant();
    var user = await db.Users.FirstOrDefaultAsync(x => x.Email == email && !x.EmailConfirmed);
    if (user is not null)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        user.EmailVerificationToken = token;
        user.EmailVerificationExpiresUtc = DateTime.UtcNow.AddHours(24);
        await db.SaveChangesAsync();
        await SendVerificationEmail(user, token);
    }
    return Results.Ok(new { message });
}).RequireRateLimiting("auth");
app.MapPost("/api/auth/forgot-password", async (ForgotPasswordRequest req, AppDbContext db) =>
{
    var generic = "إذا كان البريد مسجلاً فسيصلك رابط لإعادة تعيين كلمة المرور.";
    if (req is null || string.IsNullOrWhiteSpace(req.Email) || !req.Email.Contains('@'))
        return Results.BadRequest(new { message = "أدخل بريداً إلكترونياً صحيحاً." });
    var email = req.Email.Trim().ToLowerInvariant();
    var user = await db.Users.FirstOrDefaultAsync(x => x.Email == email);
    if (user is null) return Results.Ok(new { message = generic });
    var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    user.PasswordResetToken = token;
    user.PasswordResetExpiresUtc = DateTime.UtcNow.AddHours(1);
    await db.SaveChangesAsync();
    var sent = await SendPasswordResetEmail(user, token);
    if (!sent && app.Environment.IsDevelopment())
        return Results.Ok(new { message = generic, resetToken = token });
    return Results.Ok(new { message = generic });
}).RequireRateLimiting("auth");
app.MapPost("/api/auth/reset-password", async (ResetPasswordRequest req, AppDbContext db) =>
{
    if (req is null || string.IsNullOrWhiteSpace(req.Token) || string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8 || req.Password.Length > 128)
        return Results.BadRequest(new { message = "رابط إعادة التعيين غير صالح أو كلمة المرور غير مطابقة للشروط." });
    var user = await db.Users.FirstOrDefaultAsync(x => x.PasswordResetToken == req.Token);
    if (user is null || user.PasswordResetExpiresUtc < DateTime.UtcNow)
        return Results.BadRequest(new { message = "رابط إعادة التعيين غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً." });
    var salt = Salt();
    user.PasswordHash = salt + ":" + Hash(req.Password, salt);
    user.PasswordResetToken = null;
    user.PasswordResetExpiresUtc = null;
    await db.SaveChangesAsync();
    await Audit(db, user.Id, "auth.password.reset", "AppUser", user.Id.ToString());
    return Results.Ok(new { message = "تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن." });
}).RequireRateLimiting("auth");
app.MapPost("/api/auth/login", async (LoginRequest req, AppDbContext db, Emtehani.Application.Abstractions.ITokenService tokens) =>
{
  if (req is null || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrEmpty(req.Password))
    return Results.BadRequest(new { message = "أدخل البريد الإلكتروني وكلمة المرور." });
  var email = req.Email.Trim().ToLowerInvariant();
  var user = await db.Users.SingleOrDefaultAsync(x => x.Email == email);
  if (user is null) return Results.Unauthorized();
  var parts = user.PasswordHash.Split(':');
  if (parts.Length != 2 || !FixedTimeEquals(Hash(req.Password, parts[0]), parts[1])) return Results.Unauthorized();
  if (!user.EmailConfirmed) return Results.Json(new { message = "لازم تأكد بريدك الإلكتروني الأول. افتح رسالة التأكيد اللي وصلتك على بريدك ثم جرّب تسجيل الدخول." }, statusCode: StatusCodes.Status403Forbidden);
  if (user.Role == "Student" && string.IsNullOrWhiteSpace(user.StudentCode))
  {
      user.StudentCode = await NewStudentCode(db);
      await db.SaveChangesAsync();
  }
  var t = tokens.Create(user);
   return Results.Ok(new AuthResponse(t.Token, user.FullName, user.Email, user.Role, t.ExpiresAtUtc, user.StudentCode, user.Stage, user.Grade));
}).RequireRateLimiting("auth");
app.MapGet("/api/auth/me", async (ClaimsPrincipal p, AppDbContext db) =>
{
    var userId = p.FindFirstValue(ClaimTypes.NameIdentifier);

    if (!Guid.TryParse(userId, out var id))
        return Results.Unauthorized();

    var user = await db.Users
        .Where(x => x.Id == id)
        .Select(x => new
        {
            x.Id,
            x.FullName,
            x.Email,
            x.Role,
            x.Stage,
            x.Grade
        })
        .FirstOrDefaultAsync();

    return user is null
        ? Results.NotFound()
        : Results.Ok(user);
})
.RequireAuthorization();
app.MapPut("/api/auth/profile/education", async (EducationProfileRequest req, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Student") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var studentId)) return Results.Unauthorized();
    var stage = req?.Stage?.Trim();
    var grade = req?.Grade?.Trim();
    if (!EducationCatalog.IsValid(stage, grade))
        return Results.BadRequest(new { message = "اختر المرحلة التعليمية والصف الدراسي المناسب لها." });
    var student = await db.Users.FirstOrDefaultAsync(x => x.Id == studentId && x.Role == "Student");
    if (student is null) return Results.Unauthorized();
    student.Stage = stage;
    student.Grade = grade;
    await db.SaveChangesAsync();
    await Audit(db, studentId, "student.education.updated", "AppUser", studentId.ToString());
    return Results.Ok(new { stage = student.Stage, grade = student.Grade });
}).RequireAuthorization();


app.MapPost("/api/exams", async (ExamCreateRequest req, ClaimsPrincipal p, AppDbContext db) =>
{
  if (req is null || req.Questions is null || req.Questions.Count == 0 || req.DurationMinutes < 1 || req.DurationMinutes > 300 || req.MaxAttempts < 1 || req.MaxAttempts > 20 || string.IsNullOrWhiteSpace(req.Title))
    return Results.BadRequest(new { message = "بيانات الامتحان غير مكتملة أو المدة خارج النطاق." });
  var availableFrom = req.AvailableFromUtc?.ToUniversalTime();
  var availableUntil = req.AvailableUntilUtc?.ToUniversalTime();
  if (availableFrom.HasValue && availableUntil.HasValue && availableUntil <= availableFrom)
    return Results.BadRequest(new { message = "نهاية فترة الإتاحة يجب أن تكون بعد بدايتها." });
  var validTypes = new[] { "MultipleChoice", "TrueFalse", "ShortAnswer", "Essay", "FillBlank", "Matching" };
  if (req.Questions.Any(q => q is null || string.IsNullOrWhiteSpace(q.Text) || q.Points <= 0 || string.IsNullOrWhiteSpace(q.Type) || !validTypes.Contains(q.Type) ||
    (q.Type == "MultipleChoice" && ((q.Options?.Distinct(StringComparer.OrdinalIgnoreCase).Count() ?? 0) < 2 || string.IsNullOrWhiteSpace(q.CorrectAnswer) || !(q.Options ?? []).Contains(q.CorrectAnswer, StringComparer.OrdinalIgnoreCase))) ||
    (q.Type == "TrueFalse" && !new[] { "صح", "خطأ" }.Contains(q.CorrectAnswer ?? "")) ||
    ((q.Type is "ShortAnswer" or "FillBlank") && string.IsNullOrWhiteSpace(q.CorrectAnswer)) ||
    (q.Type == "Matching" && ((q.Options?.Length ?? 0) < 2 || (q.Options ?? []).Any(option => !option.Contains("||", StringComparison.Ordinal))))))
    return Results.BadRequest(new { message = "راجع نصوص الأسئلة والدرجات والاختيارات والإجابات الصحيحة." });
  if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
  if (!Guid.TryParse(UserId(p), out var uid)) return Results.Unauthorized();
  var stage = req.Stage?.Trim();
  var grade = req.Grade?.Trim();
  if (!EducationCatalog.IsValid(stage, grade))
    return Results.BadRequest(new { message = "اختر المرحلة التعليمية والصف الدراسي المناسبين للامتحان." });
  var code = RandomNumberGenerator.GetInt32(100000, 1_000_000).ToString(); while (await db.Exams.AnyAsync(x => x.JoinCode == code)) code = RandomNumberGenerator.GetInt32(100000, 1_000_000).ToString();
  var e = new Exam { TeacherId = uid, Title = req.Title.Trim(), Description = req.Description, DurationMinutes = req.DurationMinutes, MaxAttempts = Math.Clamp(req.MaxAttempts, 1, 20), AllowResumeAfterFocusLoss = req.AllowResumeAfterFocusLoss, JoinCode = code, ScheduledAtUtc = req.ScheduledAtUtc?.ToUniversalTime(), AvailableFromUtc = availableFrom, AvailableUntilUtc = availableUntil, Stage = stage, Grade = grade, Status = "Draft", Questions = req.Questions.Select((q, i) => new Question { Text = q.Text, Type = q.Type, OptionsJson = JsonSerializer.Serialize(q.Options ?? []), CorrectAnswer = q.Type == "Matching" ? string.Join(",", Enumerable.Range(0, q.Options?.Length ?? 0)) : q.CorrectAnswer, Points = q.Points, SortOrder = i }).ToList() };
  db.Exams.Add(e); await db.SaveChangesAsync(); await Audit(db, uid, "exam.created", "Exam", e.Id.ToString()); return Results.Created($"/api/exams/{e.Id}", new { e.Id, e.Title, e.Description, e.DurationMinutes, e.JoinCode, e.IsPublished, e.Status, e.ScheduledAtUtc, e.AvailableFromUtc, e.AvailableUntilUtc, e.Stage, e.Grade, questionCount = e.Questions.Count });
}).RequireAuthorization().RequireRateLimiting("api");
app.MapGet("/api/exams", async (ClaimsPrincipal p, AppDbContext db, string? search, string? status, int page = 1, int pageSize = 10) =>
{
  page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100); var q = db.Exams.AsNoTracking().AsQueryable();

var userId = p.FindFirstValue(ClaimTypes.NameIdentifier);

if (p.FindFirstValue(ClaimTypes.Role) == "Teacher")
{
    if (!Guid.TryParse(userId, out var teacherId))
        return Results.Unauthorized();

    q = q.Where(x => x.TeacherId == teacherId);
}
else
{
    if (!Guid.TryParse(userId, out var studentId2)) return Results.Unauthorized();
    var studentProfile = await db.Users.AsNoTracking()
        .Where(x => x.Id == studentId2 && x.Role == "Student")
        .Select(x => new { x.Stage, x.Grade })
        .FirstOrDefaultAsync();
    if (studentProfile is null) return Results.Unauthorized();
    var studentStage = studentProfile.Stage;
    var studentGrade = studentProfile.Grade;
    q = q.Where(x => x.IsPublished &&
        db.TeacherStudentRequests.Any(r => r.TeacherId == x.TeacherId && r.StudentId == studentId2
            && r.Status == "Accepted" && r.UnlinkedAtUtc == null && r.SuspendedAtUtc == null)
        && !db.TeacherStudentExamBans.Any(b => b.ExamId == x.Id && b.StudentId == studentId2)
        && (x.Stage == null || x.Stage == studentStage)
        && (x.Grade == null || x.Grade == studentGrade));
}
  if (!string.IsNullOrWhiteSpace(search)) q = q.Where(x => x.Title.Contains(search));
  if (!string.IsNullOrWhiteSpace(status) && status != "All") q = q.Where(x => x.Status == status);
  var total = await q.CountAsync(); var canSeeJoinCode = p.FindFirstValue(ClaimTypes.Role) == "Teacher";
  var items = await q.OrderByDescending(x => x.CreatedAtUtc).Skip((page - 1) * pageSize).Take(pageSize).Select(x => new { x.Id, x.Title, x.Description, x.DurationMinutes, x.MaxAttempts, x.AllowResumeAfterFocusLoss, TeacherName = db.Users.Where(u => u.Id == x.TeacherId).Select(u => u.FullName).FirstOrDefault(), JoinCode = canSeeJoinCode ? x.JoinCode : null, x.IsPublished, x.Status, x.ScheduledAtUtc, x.AvailableFromUtc, x.AvailableUntilUtc, x.Stage, x.Grade, x.CreatedAtUtc, QuestionCount = x.Questions.Count, ParticipantCount = x.Participants.Count }).ToListAsync();
  return Results.Ok(new { items, page, pageSize, total });
}).RequireAuthorization();
app.MapGet("/api/exams/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{
    if (!Guid.TryParse(UserId(p), out var userId)) return Results.Unauthorized();
    var role = p.FindFirstValue(ClaimTypes.Role);
    var exam = await db.Exams.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
    if (exam is null) return Results.NotFound();
    if (role == "Teacher" && exam.TeacherId != userId) return Results.Forbid();
    if (role != "Teacher")
    {
        if (!exam.IsPublished) return Results.NotFound();
        var restriction = await ExamAccessRestriction(db, id, userId);
        if (restriction is not null)
            return Results.Json(new { message = restriction }, statusCode: StatusCodes.Status403Forbidden);
    }
    return Results.Ok(new
    {
        exam.Id, exam.Title, exam.Description, exam.DurationMinutes, exam.MaxAttempts,
        exam.AllowResumeAfterFocusLoss, exam.IsPublished, exam.Status, exam.ScheduledAtUtc, exam.AvailableFromUtc, exam.AvailableUntilUtc, exam.Stage, exam.Grade, exam.ResultsPublishedAtUtc, exam.CreatedAtUtc,
        ResultsAvailable = exam.Status == "Finished" && exam.ResultsPublishedAtUtc.HasValue,
        JoinCode = role == "Teacher" ? exam.JoinCode : null,
        QuestionCount = await db.Questions.CountAsync(x => x.ExamId == id),
        ParticipantCount = await db.ExamParticipants.CountAsync(x => x.ExamId == id)
    });
}).RequireAuthorization();

app.MapPut("/api/exams/{id:guid}/publish", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher")
        return Results.Forbid();
    if (!Guid.TryParse(p.FindFirstValue(ClaimTypes.NameIdentifier), out var teacherId))
        return Results.Unauthorized();
    var exam = await db.Exams.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId);
    if (exam is null)
        return Results.NotFound();
    if (exam.IsPublished && (exam.Status is "Active" or "Paused"))
        return Results.Conflict(new { message = "أوقف الامتحان أو أنهِ الجلسة قبل إلغاء نشره." });
    exam.IsPublished = !exam.IsPublished;
    exam.Status = exam.IsPublished
        ? exam.ScheduledAtUtc > DateTime.UtcNow ? "Scheduled" : "Waiting"
        : "Draft";
    await db.SaveChangesAsync();
    await Audit(db, teacherId, exam.IsPublished ? "exam.published" : "exam.unpublished", "Exam", id.ToString());
    return Results.Ok(new { exam.Id, exam.IsPublished, exam.Status, exam.JoinCode });
}).RequireAuthorization();

app.MapPut("/api/exams/{id:guid}/availability", async (Guid id, ExamAvailabilityRequest req, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
    var exam = await db.Exams.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId);
    if (exam is null) return Results.NotFound();
    var from = req?.AvailableFromUtc?.ToUniversalTime();
    var until = req?.AvailableUntilUtc?.ToUniversalTime();
    if (from.HasValue && until.HasValue && until <= from)
        return Results.BadRequest(new { message = "نهاية فترة الإتاحة يجب أن تكون بعد بدايتها." });
    exam.AvailableFromUtc = from;
    exam.AvailableUntilUtc = until;
    await db.SaveChangesAsync();
    await Audit(db, teacherId, "exam.availability.updated", "Exam", id.ToString());
    return Results.Ok(new { exam.Id, exam.AvailableFromUtc, exam.AvailableUntilUtc });
}).RequireAuthorization();

// --- Student/teacher enrollment ---
app.MapGet("/api/teachers", async (ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Student") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var studentId)) return Results.Unauthorized();
    var teachers = await db.Users.AsNoTracking().Where(t => t.Role == "Teacher" && t.EmailConfirmed)
        .Select(t => new { t.Id, t.FullName, ExamCount = db.Exams.Count(e => e.TeacherId == t.Id && e.IsPublished) })
        .ToListAsync();
    var requests = await db.TeacherStudentRequests.AsNoTracking()
        .Where(r => r.StudentId == studentId)
        .Select(r => new { r.TeacherId, r.Status, r.CreatedAtUtc, r.UnlinkedAtUtc })
        .ToListAsync();
    var map = requests.GroupBy(r => r.TeacherId).ToDictionary(g => g.Key, g =>
    {
        var row = g.OrderByDescending(_ => _.Status == "Accepted").ThenByDescending(_ => _.CreatedAtUtc).First();
        return row.Status == "Accepted" && row.UnlinkedAtUtc.HasValue ? "Unlinked" : row.Status;
    });
    return Results.Ok(teachers.Select(t => new { t.Id, t.FullName, t.ExamCount, RequestStatus = map.TryGetValue(t.Id, out var s) ? s : null }));
}).RequireAuthorization();

app.MapPost("/api/teachers/{teacherId:guid}/request", async (Guid teacherId, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Student") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var studentId)) return Results.Unauthorized();
    var teacher = await db.Users.FirstOrDefaultAsync(t => t.Id == teacherId && t.Role == "Teacher" && t.EmailConfirmed);
    if (teacher is null) return Results.NotFound(new { message = "المدرس غير موجود." });
    var existing = await db.TeacherStudentRequests.FirstOrDefaultAsync(r => r.TeacherId == teacherId && r.StudentId == studentId);
    if (existing is not null)
    {
        if (existing.Status == "Accepted" && existing.UnlinkedAtUtc is null)
            return Results.Conflict(new { message = "لديك طلب تسجيل بالفعل مع هذا المدرس.", status = existing.Status });
        if (existing.Status == "Accepted" && existing.UnlinkedAtUtc.HasValue)
        {
            existing.Status = "Pending";
            existing.CreatedAtUtc = DateTime.UtcNow;
            existing.DecidedAtUtc = null;
            existing.UnlinkedAtUtc = null;
            existing.SuspendedAtUtc = null;
            await db.SaveChangesAsync();
            await Audit(db, studentId, "teacher.request.reopened", "TeacherStudentRequest", teacherId.ToString());
            return Results.Ok(new { message = "تم إرسال طلب التسجيل من جديد. انتظر موافقة المدرس.", status = "Pending" });
        }
        return existing.Status == "Rejected"
            ? Results.Conflict(new { message = "تم رفض طلبك سابقاً. تواصل مع المدرس." })
            : Results.Conflict(new { message = "لديك طلب تسجيل بالفعل مع هذا المدرس.", status = existing.Status });
    }
    db.TeacherStudentRequests.Add(new TeacherStudentRequest { TeacherId = teacherId, StudentId = studentId });
    await db.SaveChangesAsync();
    await Audit(db, studentId, "teacher.request.created", "TeacherStudentRequest", teacherId.ToString());
    return Results.Ok(new { message = "تم إرسال طلب التسجيل. انتظر موافقة المدرس.", status = "Pending" });
}).RequireAuthorization().RequireRateLimiting("api");

app.MapGet("/api/teacher/requests", async (ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
    var rows = await db.TeacherStudentRequests.AsNoTracking()
        .Where(r => r.TeacherId == teacherId)
        .OrderByDescending(r => r.CreatedAtUtc)
        .Select(r => new { r.Id, r.Status, r.CreatedAtUtc, r.DecidedAtUtc, StudentName = r.Student!.FullName, StudentEmail = r.Student.Email })
        .ToListAsync();
    return Results.Ok(rows);
}).RequireAuthorization();

app.MapPut("/api/teacher/requests/{id:guid}", async (Guid id, TeacherJoinDecisionRequest req, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
    var action = (req?.Action ?? "").Trim().ToLowerInvariant();
    if (action is not ("accept" or "reject")) return Results.BadRequest(new { message = "إجراء غير معروف." });
    var request = await db.TeacherStudentRequests.FirstOrDefaultAsync(r => r.Id == id && r.TeacherId == teacherId);
    if (request is null) return Results.NotFound();
    if (request.Status != "Pending") return Results.Conflict(new { message = "تم البت في هذا الطلب مسبقاً." });
    request.Status = action == "accept" ? "Accepted" : "Rejected";
    request.DecidedAtUtc = DateTime.UtcNow;
    if (action == "accept")
    {
        request.UnlinkedAtUtc = null;
        request.SuspendedAtUtc = null;
    }
    await db.SaveChangesAsync();
    await Audit(db, teacherId, $"teacher.request.{request.Status.ToLowerInvariant()}", "TeacherStudentRequest", id.ToString());
    return Results.Ok(new { request.Id, request.Status });
}).RequireAuthorization();

app.MapGet("/api/teacher/students", async (ClaimsPrincipal p, AppDbContext db, string? search, string? stage, string? grade) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();

    var rows = await db.TeacherStudentRequests.AsNoTracking()
        .Where(r => r.TeacherId == teacherId && r.Status == "Accepted" && r.UnlinkedAtUtc == null)
        .Select(r => new
        {
            RelationshipId = r.Id,
            r.StudentId,
            FullName = r.Student!.FullName,
            Email = r.Student.Email,
            Stage = r.Student.Stage,
            Grade = r.Student.Grade,
            r.CreatedAtUtc,
            r.DecidedAtUtc,
            r.SuspendedAtUtc
        })
        .ToListAsync();

    var bans = await db.TeacherStudentExamBans.AsNoTracking()
        .Where(b => b.TeacherId == teacherId)
        .Select(b => new
        {
            b.StudentId,
            b.ExamId,
            b.CreatedAtUtc,
            ExamTitle = db.Exams.Where(e => e.Id == b.ExamId).Select(e => e.Title).FirstOrDefault()
        })
        .ToListAsync();
    var bannedByStudent = bans
        .GroupBy(b => b.StudentId)
        .ToDictionary(
            group => group.Key,
            group => group.OrderByDescending(b => b.CreatedAtUtc)
                .Select(b => (b.ExamId, ExamTitle: b.ExamTitle ?? "", b.CreatedAtUtc))
                .ToList());

    var term = (search ?? "").Trim();
    var requestedStage = string.IsNullOrWhiteSpace(stage) ? null : stage.Trim();
    var requestedGrade = string.IsNullOrWhiteSpace(grade) ? null : grade.Trim();
    var filtered = rows
        .Where(r => requestedStage is null || string.Equals(r.Stage, requestedStage, StringComparison.Ordinal))
        .Where(r => requestedGrade is null || string.Equals(r.Grade, requestedGrade, StringComparison.Ordinal))
        .Where(r => term.Length == 0
            || r.FullName.Contains(term, StringComparison.OrdinalIgnoreCase)
            || r.Email.Contains(term, StringComparison.OrdinalIgnoreCase))
        .OrderBy(r => r.FullName, StringComparer.Ordinal)
        .Select(r =>
        {
            var studentBans = bannedByStudent.GetValueOrDefault(r.StudentId);
            studentBans ??= [];
            var isSuspended = r.SuspendedAtUtc.HasValue;
            return new
            {
                relationshipId = r.RelationshipId,
                studentId = r.StudentId,
                fullName = r.FullName,
                email = r.Email,
                stage = r.Stage,
                grade = r.Grade,
                linkedAtUtc = r.DecidedAtUtc ?? r.CreatedAtUtc,
                suspendedAtUtc = r.SuspendedAtUtc,
                status = isSuspended ? "Suspended" : studentBans.Count > 0 ? "Banned" : "Active",
                bannedExamCount = studentBans.Count,
                bannedExams = studentBans.Select(b => new
                {
                    examId = b.ExamId,
                    examTitle = b.ExamTitle,
                    bannedAtUtc = b.CreatedAtUtc
                }).ToList()
            };
        })
        .ToList();

    var suspendedCount = rows.Count(r => r.SuspendedAtUtc.HasValue);
    var bannedCount = rows.Count(r => !r.SuspendedAtUtc.HasValue && bannedByStudent.ContainsKey(r.StudentId));
    return Results.Ok(new
    {
        items = filtered,
        total = filtered.Count,
        summary = new
        {
            total = rows.Count,
            active = rows.Count - suspendedCount - bannedCount,
            banned = bannedCount,
            suspended = suspendedCount
        },
        serverUtc = DateTime.UtcNow
    });
}).RequireAuthorization();

app.MapGet("/api/teacher/students/{studentId:guid}", async (Guid studentId, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();

    var relationship = await db.TeacherStudentRequests.AsNoTracking()
        .Where(r => r.TeacherId == teacherId && r.StudentId == studentId
            && r.Status == "Accepted" && r.UnlinkedAtUtc == null)
        .Select(r => new
        {
            r.Id,
            r.StudentId,
            FullName = r.Student!.FullName,
            Email = r.Student.Email,
            StudentStage = r.Student.Stage,
            StudentGrade = r.Student.Grade,
            r.CreatedAtUtc,
            r.DecidedAtUtc,
            r.SuspendedAtUtc
        })
        .FirstOrDefaultAsync();
    if (relationship is null)
        return Results.NotFound(new { message = "هذا الطالب غير مرتبط بك." });

    var exams = await db.Exams.AsNoTracking()
        .Where(x => x.TeacherId == teacherId && x.Status != "Finished")
        .OrderByDescending(x => x.CreatedAtUtc)
        .Select(x => new
        {
            x.Id,
            x.Title,
            x.Description,
            x.Status,
            x.IsPublished,
            x.Stage,
            x.Grade,
            x.CreatedAtUtc,
            x.AvailableFromUtc,
            x.AvailableUntilUtc
        })
        .ToListAsync();
    var examIds = exams.Select(x => x.Id).ToList();
    var bans = await db.TeacherStudentExamBans.AsNoTracking()
        .Where(b => b.TeacherId == teacherId && b.StudentId == studentId)
        .Select(b => new { b.ExamId, b.CreatedAtUtc })
        .ToListAsync();
    var attempts = await db.Submissions.AsNoTracking()
        .Where(s => s.StudentId == studentId && examIds.Contains(s.ExamId))
        .Select(s => new { s.ExamId, s.Status, s.AttemptNumber, s.StartedAtUtc, s.SubmittedAtUtc, s.Score, s.MaxScore })
        .ToListAsync();

    var banByExam = bans.ToDictionary(b => b.ExamId);
    var examItems = exams.Select(x =>
    {
        var ownAttempts = attempts.Where(a => a.ExamId == x.Id).ToList();
        var latest = ownAttempts.OrderByDescending(a => a.AttemptNumber).FirstOrDefault();
        var isBanned = banByExam.TryGetValue(x.Id, out var ban);
        var educationMatches = EducationCatalog.Matches(x.Stage, x.Grade, relationship.StudentStage, relationship.StudentGrade);
        var isAvailable = !relationship.SuspendedAtUtc.HasValue
            && !isBanned
            && educationMatches
            && x.IsPublished
            && x.Status != "Draft";
        return new
        {
            examId = x.Id,
            examTitle = x.Title,
            examDescription = x.Description,
            examStatus = x.Status,
            isPublished = x.IsPublished,
            stage = x.Stage,
            grade = x.Grade,
            createdAtUtc = x.CreatedAtUtc,
            availableFromUtc = x.AvailableFromUtc,
            availableUntilUtc = x.AvailableUntilUtc,
            isBanned,
            bannedAtUtc = isBanned ? ban!.CreatedAtUtc : (DateTime?)null,
            educationMatches,
            isAvailable,
            attemptsCount = ownAttempts.Count,
            latestAttemptStatus = latest?.Status,
            latestAttemptAtUtc = latest is null ? (DateTime?)null : latest.SubmittedAtUtc ?? latest.StartedAtUtc,
            latestScore = latest?.Score,
            latestMaxScore = latest?.MaxScore
        };
    }).ToList();

    var bannedExamCount = bans.Count;
    var status = relationship.SuspendedAtUtc.HasValue ? "Suspended" : bannedExamCount > 0 ? "Banned" : "Active";
    return Results.Ok(new
    {
        relationshipId = relationship.Id,
        studentId = relationship.StudentId,
        fullName = relationship.FullName,
        email = relationship.Email,
        stage = relationship.StudentStage,
        grade = relationship.StudentGrade,
        linkedAtUtc = relationship.DecidedAtUtc ?? relationship.CreatedAtUtc,
        suspendedAtUtc = relationship.SuspendedAtUtc,
        status,
        bannedExamCount,
        attemptsCount = attempts.Count,
        submittedAttempts = attempts.Count(a => a.Status != "InProgress"),
        availableExamCount = examItems.Count(x => x.isAvailable),
        exams = examItems,
        serverUtc = DateTime.UtcNow
    });
}).RequireAuthorization();

app.MapPost("/api/teacher/students/{studentId:guid}/exam-bans", async (Guid studentId, TeacherStudentExamBanRequest? req, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
    if (req is null || req.ExamId == Guid.Empty)
        return Results.BadRequest(new { message = "اختر الامتحان الذي تريد منع الطالب منه." });

    var relationship = await ActiveTeacherStudentLink(db, teacherId, studentId);
    if (relationship is null)
        return Results.NotFound(new { message = "هذا الطالب غير مرتبط بك." });
    var exam = await db.Exams.FirstOrDefaultAsync(x => x.Id == req.ExamId && x.TeacherId == teacherId);
    if (exam is null)
        return Results.NotFound(new { message = "هذا الامتحان ليس ضمن امتحاناتك." });

    var existing = await db.TeacherStudentExamBans
        .FirstOrDefaultAsync(x => x.ExamId == exam.Id && x.StudentId == studentId);
    if (existing is not null)
        return Results.Ok(new
        {
            examId = exam.Id,
            examTitle = exam.Title,
            isBanned = true,
            alreadyBanned = true,
            message = "الطالب ممنوع من هذا الامتحان بالفعل."
        });

    var ban = new TeacherStudentExamBan { TeacherId = teacherId, StudentId = studentId, ExamId = exam.Id };
    db.TeacherStudentExamBans.Add(ban);
    try
    {
        await db.SaveChangesAsync();
    }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex.InnerException))
    {
        db.Entry(ban).State = EntityState.Detached;
        return Results.Ok(new
        {
            examId = exam.Id,
            examTitle = exam.Title,
            isBanned = true,
            alreadyBanned = true,
            message = "الطالب ممنوع من هذا الامتحان بالفعل."
        });
    }
    await Audit(db, teacherId, "teacher.student.exam-banned", "TeacherStudentExamBan", ban.Id.ToString(),
        $"student={studentId}; exam={exam.Id}");
    return Results.Ok(new
    {
        examId = exam.Id,
        examTitle = exam.Title,
        isBanned = true,
        alreadyBanned = false,
        message = "تم منع الطالب من هذا الامتحان. بقيت المحاولات والنتائج السابقة محفوظة."
    });
}).RequireAuthorization();

app.MapDelete("/api/teacher/students/{studentId:guid}/exam-bans/{examId:guid}", async (Guid studentId, Guid examId, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();

    var relationship = await ActiveTeacherStudentLink(db, teacherId, studentId);
    if (relationship is null)
        return Results.NotFound(new { message = "هذا الطالب غير مرتبط بك." });
    var exam = await db.Exams.FirstOrDefaultAsync(x => x.Id == examId && x.TeacherId == teacherId);
    if (exam is null)
        return Results.NotFound(new { message = "هذا الامتحان ليس ضمن امتحاناتك." });

    var ban = await db.TeacherStudentExamBans
        .FirstOrDefaultAsync(x => x.ExamId == exam.Id && x.StudentId == studentId);
    var removed = ban is not null;
    if (ban is not null)
    {
        db.TeacherStudentExamBans.Remove(ban);
        await db.SaveChangesAsync();
        await Audit(db, teacherId, "teacher.student.exam-unbanned", "TeacherStudentExamBan", ban.Id.ToString(),
            $"student={studentId}; exam={exam.Id}");
    }
    return Results.Ok(new
    {
        examId = exam.Id,
        examTitle = exam.Title,
        isBanned = false,
        removed,
        message = removed ? "تم رفع المنع عن هذا الامتحان." : "لم يكن الطالب ممنوعاً من هذا الامتحان."
    });
}).RequireAuthorization();

app.MapPost("/api/teacher/students/{studentId:guid}/suspend", async (Guid studentId, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();

    var relationship = await ActiveTeacherStudentLink(db, teacherId, studentId);
    if (relationship is null)
        return Results.NotFound(new { message = "هذا الطالب غير مرتبط بك." });
    if (relationship.SuspendedAtUtc.HasValue)
        return Results.Ok(new
        {
            studentId,
            status = "Suspended",
            suspendedAtUtc = relationship.SuspendedAtUtc,
            alreadySuspended = true,
            message = "الطالب موقوف عن جميع امتحاناتك بالفعل."
        });

    relationship.SuspendedAtUtc = DateTime.UtcNow;
    await db.SaveChangesAsync();
    await Audit(db, teacherId, "teacher.student.suspended", "TeacherStudentRequest", relationship.Id.ToString(),
        $"student={studentId}");
    return Results.Ok(new
    {
        studentId,
        status = "Suspended",
        suspendedAtUtc = relationship.SuspendedAtUtc,
        alreadySuspended = false,
        message = "تم إيقاف الطالب عن جميع امتحاناتك. لن يبدأ أو يستكمل أي محاولة حتى إعادة تفعيله."
    });
}).RequireAuthorization();

app.MapPost("/api/teacher/students/{studentId:guid}/reactivate", async (Guid studentId, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();

    var relationship = await ActiveTeacherStudentLink(db, teacherId, studentId);
    if (relationship is null)
        return Results.NotFound(new { message = "هذا الطالب غير مرتبط بك." });
    if (!relationship.SuspendedAtUtc.HasValue)
        return Results.Ok(new
        {
            studentId,
            status = "Active",
            alreadyActive = true,
            message = "الطالب غير موقوف بالفعل."
        });

    relationship.SuspendedAtUtc = null;
    await db.SaveChangesAsync();
    await Audit(db, teacherId, "teacher.student.reactivated", "TeacherStudentRequest", relationship.Id.ToString(),
        $"student={studentId}");
    return Results.Ok(new
    {
        studentId,
        status = "Active",
        alreadyActive = false,
        message = "تمت إعادة تفعيل الطالب. عادت امتحاناتك المتاحة له وفق المرحلة والصف."
    });
}).RequireAuthorization();

app.MapDelete("/api/teacher/students/{studentId:guid}", async (Guid studentId, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();

    var relationship = await ActiveTeacherStudentLink(db, teacherId, studentId);
    if (relationship is null)
        return Results.NotFound(new { message = "هذا الطالب غير مرتبط بك." });

    await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted);
    relationship.UnlinkedAtUtc = DateTime.UtcNow;
    relationship.SuspendedAtUtc = null;
    var bans = await db.TeacherStudentExamBans
        .Where(x => x.TeacherId == teacherId && x.StudentId == studentId)
        .ToListAsync();
    db.TeacherStudentExamBans.RemoveRange(bans);
    await db.SaveChangesAsync();
    await tx.CommitAsync();
    await Audit(db, teacherId, "teacher.student.unlinked", "TeacherStudentRequest", relationship.Id.ToString(),
        $"student={studentId}; removedExamBans={bans.Count}");
    return Results.Ok(new
    {
        studentId,
        unlinked = true,
        removedExamBans = bans.Count,
        message = "تم فك ارتباط الطالب بك فقط. لم يُحذف حسابه أو بياناته أو نتائجه السابقة، وعلاقته بمدرسين آخرين لم تتأثر."
    });
}).RequireAuthorization();

app.MapGet("/api/teacher/overview", async (ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
    var examIds = db.Exams.Where(x => x.TeacherId == teacherId).Select(x => x.Id);
    var totalExams = await examIds.CountAsync();
    var publishedExams = await db.Exams.CountAsync(x => x.TeacherId == teacherId && x.IsPublished);
    var activeExams = await db.Exams.CountAsync(x => x.TeacherId == teacherId && (x.Status == "Active" || x.Status == "Paused"));
    var participantCount = await db.ExamParticipants.CountAsync(x => examIds.Contains(x.ExamId));
    var studentsReached = await db.ExamParticipants.Where(x => examIds.Contains(x.ExamId)).Select(x => x.StudentId).Distinct().CountAsync();
    var pendingReview = await db.Submissions.CountAsync(x => examIds.Contains(x.ExamId) && x.Status == "NeedsReview");
    var submitted = await db.Submissions.CountAsync(x => examIds.Contains(x.ExamId) && x.Status != "InProgress");
    var recent = await db.Exams.Where(x => x.TeacherId == teacherId).OrderByDescending(x => x.CreatedAtUtc).Take(5)
        .Select(x => new { x.Id, x.Title, x.Description, x.Status, x.IsPublished, x.CreatedAtUtc, x.DurationMinutes, ParticipantCount = x.Participants.Count, QuestionCount = x.Questions.Count }).ToListAsync();
    var live = await db.Exams.Where(x => x.TeacherId == teacherId && (x.Status == "Active" || x.Status == "Paused")).OrderByDescending(x => x.ScheduledAtUtc).Take(6)
        .Select(x => new { x.Id, x.Title, x.Status, x.ScheduledAtUtc, ParticipantCount = x.Participants.Count }).ToListAsync();
    return Results.Ok(new { totalExams, publishedExams, activeExams, participantCount, studentsReached, pendingReview, submitted, recent, live, serverUtc = DateTime.UtcNow });
}).RequireAuthorization();

app.MapPost("/api/exams/{id:guid}/participants/generate", async (Guid id, ExamParticipantGenerateRequest? req, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
    var exam = await db.Exams.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId);
    if (exam is null) return Results.NotFound();
    if (exam.Status is "Active" or "Paused") return Results.Conflict(new { message = "لا يمكن إنشاء أكواد طلاب بعد بدء الجلسة." });
    var studentsQuery = db.Users.Where(x => x.Role == "Student"
        && db.TeacherStudentRequests.Any(r => r.TeacherId == teacherId && r.StudentId == x.Id
            && r.Status == "Accepted" && r.UnlinkedAtUtc == null && r.SuspendedAtUtc == null)
        && !db.TeacherStudentExamBans.Any(b => b.ExamId == id && b.StudentId == x.Id));
    if (!string.IsNullOrWhiteSpace(exam.Stage))
    {
        var examStage = exam.Stage;
        studentsQuery = studentsQuery.Where(x => x.Stage == examStage);
    }
    if (!string.IsNullOrWhiteSpace(exam.Grade))
    {
        var examGrade = exam.Grade;
        studentsQuery = studentsQuery.Where(x => x.Grade == examGrade);
    }
    var requestedStudentIds = req?.StudentIds;
    if (requestedStudentIds is { Length: > 0 }) studentsQuery = studentsQuery.Where(x => requestedStudentIds.Contains(x.Id));
    var students = await studentsQuery.Select(x => new { x.Id, x.FullName }).ToListAsync();
    if (students.Count == 0) return Results.Conflict(new { message = "لا يوجد طلاب مسجلون لديك ومطابقون لمرحلة الامتحان وصفه." });
    var existing = await db.ExamParticipants.Where(x => x.ExamId == id).Select(x => x.StudentId).ToListAsync();
    var existingSet = existing.ToHashSet();
    var usedCodes = (await db.ExamParticipants.Select(x => x.Code).ToListAsync())
        .Concat(await db.Users.Where(x => x.StudentCode != "").Select(x => x.StudentCode).ToListAsync())
        .ToHashSet(StringComparer.Ordinal);
    var generated = 0;
    foreach (var student in students.Where(x => !existingSet.Contains(x.Id)))
    {
        string code;
        do { code = RandomNumberGenerator.GetInt32(100000, 1_000_000).ToString(); } while (usedCodes.Contains(code));
        usedCodes.Add(code);
        db.ExamParticipants.Add(new ExamParticipant { ExamId = exam.Id, StudentId = student.Id, Code = code, Status = "Invited" });
        generated++;
    }
    await db.SaveChangesAsync();
    await Audit(db, teacherId, "exam.participants.generated", "Exam", id.ToString(), $"count={generated}");
    return Results.Ok(new { generated, total = existing.Count + generated });
}).RequireAuthorization();

app.MapGet("/api/exams/{id:guid}/participants", async (Guid id, ClaimsPrincipal p, AppDbContext db, int page = 1, int pageSize = 25) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
    var exam = await db.Exams.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId);
    if (exam is null) return Results.NotFound();
    var now = DateTime.UtcNow;
    page = Math.Max(1, page);
    pageSize = Math.Clamp(pageSize, 1, 100);
    var views = await ParticipantViews(db, exam, now);
    return Results.Ok(new
    {
        examStatus = exam.Status,
        serverUtc = now,
        page,
        pageSize,
        total = views.Count,
        items = views.Skip((page - 1) * pageSize).Take(pageSize).ToList()
    });
}).RequireAuthorization();

app.MapPost("/api/exams/{id:guid}/participants/{participantId:guid}/regenerate", async (Guid id, Guid participantId, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
    var exam = await db.Exams.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId);
    if (exam is null) return Results.NotFound();
    var participant = await db.ExamParticipants.FirstOrDefaultAsync(x => x.Id == participantId && x.ExamId == id);
    if (participant is null) return Results.NotFound();
    if (participant.JoinedAtUtc.HasValue || participant.Status is "Active" or "Submitted")
        return Results.Conflict(new { message = "لا يمكن تغيير كود طالب دخل الامتحان بالفعل." });
    participant.Code = await NewStudentCode(db);
    await db.SaveChangesAsync();
    await Audit(db, teacherId, "exam.participant-code.regenerated", "ExamParticipant", participant.Id.ToString());
    return Results.Ok(new { participant.Id, participant.Code });
}).RequireAuthorization();

app.MapGet("/api/exams/{id:guid}/participants/export", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
    var exam = await db.Exams.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId);
    if (exam is null) return Results.NotFound();
    var rows = await ParticipantViews(db, exam, DateTime.UtcNow);
    static string Esc(string? value)
    {
        var text = (value ?? "").Replace("\r", " ").Replace("\n", " ");
        var trimmed = text.TrimStart();
        if (trimmed.Length > 0 && "=+-@".Contains(trimmed[0])) text = "'" + text;
        return "\"" + text.Replace("\"", "\"\"") + "\"";
    }
    var csv = "Student,Email,Code,Status,JoinedAt,SubmittedAt,Score,MaxScore\r\n" + string.Join("\r\n", rows.Select(x => string.Join(",",
        Esc(x.StudentName), Esc(x.Email), Esc(x.Code), Esc(x.Status), Esc(x.JoinedAtUtc?.ToString("O")), Esc(x.SubmittedAtUtc?.ToString("O")),
        x.Score?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "", x.MaxScore?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "")));
    await Audit(db, teacherId, "exam.participants.exported", "Exam", id.ToString());
    return Results.File(System.Text.Encoding.UTF8.GetPreamble().Concat(System.Text.Encoding.UTF8.GetBytes(csv)).ToArray(), "text/csv; charset=utf-8", $"exam-{id}-student-codes.csv");
}).RequireAuthorization();

app.MapPut("/api/exams/{id:guid}/state", async (Guid id, ExamStateRequest req, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
    var exam = await db.Exams.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId);
    if (exam is null) return Results.NotFound();
    var action = (req?.Action ?? "").Trim().ToLowerInvariant();
    var now = DateTime.UtcNow;
    switch (action)
    {
        case "open":
            if (exam.Status == "Finished") return Results.Conflict(new { message = "هذه الجلسة منتهية. أنشئ امتحاناً جديداً لبدء جلسة أخرى." });
            exam.Status = "Active"; exam.IsPublished = true; exam.PausedAtUtc = null;
            await Audit(db, teacherId, "exam.opened", "Exam", id.ToString());
            break;
        case "pause":
            if (exam.Status != "Active") return Results.Conflict(new { message = "لا يمكن إيقاف الامتحان إلا أثناء الجلسة النشطة." });
            exam.Status = "Paused"; exam.PausedAtUtc = now;
            await Audit(db, teacherId, "exam.paused", "Exam", id.ToString());
            break;
        case "resume":
            if (exam.Status != "Paused") return Results.Conflict(new { message = "الجلسة ليست متوقفة حالياً." });
            var pausedSeconds = exam.PausedAtUtc.HasValue ? Math.Max(0, (int)(now - exam.PausedAtUtc.Value).TotalSeconds) : 0;
            var activeSubmissions = await db.Submissions.Where(x => x.ExamId == id && x.Status == "InProgress").ToListAsync();
            foreach (var submission in activeSubmissions) submission.ExtraTimeSeconds += pausedSeconds;
            exam.Status = "Active"; exam.PausedAtUtc = null;
            await db.SaveChangesAsync();
            await Audit(db, teacherId, "exam.resumed", "Exam", id.ToString(), $"pausedSeconds={pausedSeconds}");
            break;
        case "close":
            await CloseExam(db, exam, now);
            await Audit(db, teacherId, "exam.closed", "Exam", id.ToString());
            break;
        default:
            return Results.BadRequest(new { message = "إجراء غير معروف. استخدم open أو pause أو resume أو close." });
    }
    await db.SaveChangesAsync();
    return Results.Ok(new { exam.Id, exam.Status, serverUtc = now });
}).RequireAuthorization();

app.MapPost("/api/exams/{id:guid}/results/publish", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
    await FinalizeExpired(db);
    var exam = await db.Exams.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId);
    if (exam is null) return Results.NotFound();
    if (exam.Status != "Finished")
        return Results.Conflict(new { message = "أنهِ جلسة الامتحان أولاً قبل نشر النتائج." });
    if (exam.ResultsPublishedAtUtc.HasValue)
        return Results.Ok(new { exam.Id, exam.Status, exam.ResultsPublishedAtUtc, alreadyPublished = true });
    if (await db.Submissions.AnyAsync(x => x.ExamId == id && x.Status == "NeedsReview"))
        return Results.Conflict(new { message = "لا يمكن نشر النتائج قبل إكمال تصحيح جميع الأسئلة المقالية." });
    if (await db.Submissions.AnyAsync(x => x.ExamId == id && (x.Status == "Processing" || x.Status == "InProgress")))
        return Results.Conflict(new { message = "توجد محاولات قيد المعالجة. أعد المحاولة بعد لحظات." });
    exam.ResultsPublishedAtUtc = DateTime.UtcNow;
    await db.SaveChangesAsync();
    await Audit(db, teacherId, "results.published", "Exam", id.ToString());
    return Results.Ok(new { exam.Id, exam.Status, exam.ResultsPublishedAtUtc, alreadyPublished = false });
}).RequireAuthorization();

app.MapPost("/api/exams/enter-code", async (StudentCodeRequest req, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Student") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var studentId)) return Results.Unauthorized();
    var code = (req?.Code ?? "").Trim();
    if (code.Length != 6 || !code.All(char.IsDigit)) return Results.BadRequest(new { message = "أدخل كود الطالب المكوّن من 6 أرقام." });
    var student = await db.Users.FirstOrDefaultAsync(x => x.Id == studentId && x.Role == "Student");
    if (student is null) return Results.Unauthorized();
    if (string.IsNullOrWhiteSpace(student.StudentCode))
    {
        student.StudentCode = await NewStudentCode(db);
        await db.SaveChangesAsync();
    }

    // Only a code explicitly assigned to this student (or the student's own permanent code) is accepted.
    var ownPermanentCode = FixedTimeEquals(code, student.StudentCode);
    ExamParticipant? participant;
    if (ownPermanentCode)
    {
        var studentStage = student.Stage;
        var studentGrade = student.Grade;
        var publishedExam = await db.Exams
            .Where(x => x.IsPublished && x.Status != "Draft" && x.Status != "Finished"
                && db.TeacherStudentRequests.Any(r => r.TeacherId == x.TeacherId && r.StudentId == studentId
                    && r.Status == "Accepted" && r.UnlinkedAtUtc == null && r.SuspendedAtUtc == null)
                && !db.TeacherStudentExamBans.Any(b => b.ExamId == x.Id && b.StudentId == studentId)
                && (x.Stage == null || x.Stage == studentStage)
                && (x.Grade == null || x.Grade == studentGrade))
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync();
        if (publishedExam is null) return Results.Conflict(new { message = "لا يوجد امتحان منشور متاح حالياً." });
        participant = await db.ExamParticipants.Include(x => x.Exam)
            .FirstOrDefaultAsync(x => x.ExamId == publishedExam.Id && x.StudentId == studentId);
        if (participant is null)
        {
            var nowJoined = DateTime.UtcNow;
            participant = new ExamParticipant { ExamId = publishedExam.Id, StudentId = studentId, Code = student.StudentCode, Status = "Waiting", JoinedAtUtc = nowJoined, LastSeenAtUtc = nowJoined, Exam = publishedExam };
            db.ExamParticipants.Add(participant);
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex.InnerException))
            {
                // A concurrent request created the same participant; use the winner.
                db.Entry(participant).State = EntityState.Detached;
                participant = await db.ExamParticipants.Include(x => x.Exam)
                    .FirstOrDefaultAsync(x => x.ExamId == publishedExam.Id && x.StudentId == studentId);
                if (participant is null)
                    return Results.Conflict(new { message = "تعذر الانضمام للامتحان بسبب طلب متزامن. أعد المحاولة بعد لحظة." });
            }
        }
        else if (string.IsNullOrWhiteSpace(participant.Code))
        {
            participant.Code = student.StudentCode;
        }
    }
    else
    {
        participant = await db.ExamParticipants.Include(x => x.Exam)
            .FirstOrDefaultAsync(x => x.Code == code && x.StudentId == studentId);
        if (participant is null)
            return Results.NotFound(new { message = "كود الطالب غير صحيح. تأكد من الكود الذي أرسله المدرس." });
    }
    if (participant.StudentId != studentId || (!ownPermanentCode && !FixedTimeEquals(code, participant.Code)))
        return Results.NotFound(new { message = "كود الطالب غير صحيح. تأكد من الكود الذي أرسله المدرس." });
    if (participant.Exam is null)
        return Results.NotFound(new { message = "كود الطالب غير صحيح. تأكد من الكود الذي أرسله المدرس." });
    var exam = participant.Exam;
    if (!exam.IsPublished || exam.Status == "Draft")
        return Results.Conflict(new { message = "لم يبدأ الامتحان بعد. انتظر تعليمات المدرس." });
    if (exam.Status == "Finished")
        return Results.Conflict(new { message = "انتهت جلسة هذا الامتحان. تواصل مع المدرس." });
    var restriction = await ExamAccessRestriction(db, exam.Id, studentId);
    if (restriction is not null)
        return Results.Json(new { message = restriction }, statusCode: StatusCodes.Status403Forbidden);
    var now = DateTime.UtcNow;
    participant.JoinedAtUtc ??= now;
    participant.LastSeenAtUtc = now;
    if (participant.Status is "Invited" or "Absent") participant.Status = "Waiting";
    await db.SaveChangesAsync();
    var submission = await db.Submissions.Where(x => x.ExamId == exam.Id && x.StudentId == studentId).OrderByDescending(x => x.AttemptNumber).FirstOrDefaultAsync();
    var teacherName = await db.Users.Where(x => x.Id == exam.TeacherId).Select(x => x.FullName).FirstOrDefaultAsync();
    return Results.Ok(new
    {
        examId = exam.Id, examTitle = exam.Title, examDescription = exam.Description, teacherName,
        durationMinutes = exam.DurationMinutes, scheduledAtUtc = exam.ScheduledAtUtc, examStatus = exam.Status,
        participantStatus = participant.Status, joinedAtUtc = participant.JoinedAtUtc, submissionId = submission?.Id,
        remainingSeconds = RemainingSeconds(submission, exam, now), serverUtc = now, maxAttempts = exam.MaxAttempts,
        questionCount = await db.Questions.CountAsync(x => x.ExamId == exam.Id),
        studentCode = student.StudentCode
    });
}).RequireAuthorization().RequireRateLimiting("join");

app.MapGet("/api/exams/available", async (ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Student") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var studentId)) return Results.Unauthorized();
    await FinalizeExpired(db);
    var now = DateTime.UtcNow;
    var studentProfile = await db.Users.AsNoTracking()
        .Where(x => x.Id == studentId && x.Role == "Student")
        .Select(x => new { x.Stage, x.Grade })
        .FirstOrDefaultAsync();
    if (studentProfile is null) return Results.Unauthorized();
    var studentStage = studentProfile.Stage;
    var studentGrade = studentProfile.Grade;

    // Only published, non-draft, non-finished exams are discoverable. Draft/unpublished exams
    // must never appear here, and no join codes or answer keys are included in the payload.
    // Students only see exams for teachers they are enrolled with and whose stage/grade match.
    var exams = await db.Exams.AsNoTracking()
        .Where(x => x.IsPublished && x.Status != "Draft" && x.Status != "Finished"
            && db.TeacherStudentRequests.Any(r => r.TeacherId == x.TeacherId && r.StudentId == studentId
                && r.Status == "Accepted" && r.UnlinkedAtUtc == null && r.SuspendedAtUtc == null)
            && !db.TeacherStudentExamBans.Any(b => b.ExamId == x.Id && b.StudentId == studentId)
            && (x.Stage == null || x.Stage == studentStage)
            && (x.Grade == null || x.Grade == studentGrade))
        .OrderByDescending(x => x.Status == "Active" || x.Status == "Paused")
        .ThenBy(x => x.ScheduledAtUtc ?? x.CreatedAtUtc)
        .Select(x => new
        {
            x.Id,
            x.Title,
            x.Description,
            x.DurationMinutes,
            x.MaxAttempts,
            x.Status,
            x.ScheduledAtUtc,
            x.AvailableFromUtc,
            x.AvailableUntilUtc,
            x.PausedAtUtc,
            x.Stage,
            x.Grade,
            x.CreatedAtUtc,
            TeacherName = db.Users.Where(u => u.Id == x.TeacherId).Select(u => u.FullName).FirstOrDefault(),
            QuestionCount = x.Questions.Count,
            TotalPoints = x.Questions.Sum(q => (decimal?)q.Points) ?? 0
        })
        .ToListAsync();

    if (exams.Count == 0)
        return Results.Ok(new { serverUtc = now, items = Array.Empty<object>() });

    var examIds = exams.Select(x => x.Id).ToList();
    var submissions = await db.Submissions.AsNoTracking()
        .Where(x => x.StudentId == studentId && examIds.Contains(x.ExamId))
        .Select(x => new { x.Id, x.ExamId, x.Status, x.StartedAtUtc, x.IsExceptionAttempt, x.ExtraTimeSeconds, x.AttemptNumber })
        .ToListAsync();
    var participants = await db.ExamParticipants.AsNoTracking()
        .Where(x => x.StudentId == studentId && examIds.Contains(x.ExamId))
        .Select(x => new { x.ExamId, x.Status, x.JoinedAtUtc })
        .ToListAsync();

    var items = new List<object>();
    foreach (var exam in exams)
    {
        var ownAttempts = submissions.Where(x => x.ExamId == exam.Id).ToList();
        var active = ownAttempts.Where(x => x.Status == "InProgress").OrderByDescending(x => x.AttemptNumber).FirstOrDefault();
        var attemptsUsed = ownAttempts.Count(x => x.Status != "InProgress" && !x.IsExceptionAttempt);

        // A student with no remaining attempts must not see the exam again, unless an
        // in-progress attempt exists that they are allowed to resume.
        if (active is null && attemptsUsed >= exam.MaxAttempts) continue;

        var participant = participants.FirstOrDefault(x => x.ExamId == exam.Id);
        int? remainingSeconds = null;
        if (active is not null)
        {
            var reference = exam.Status == "Paused" && exam.PausedAtUtc.HasValue ? exam.PausedAtUtc.Value : now;
            var deadline = active.StartedAtUtc.AddMinutes(exam.DurationMinutes).AddSeconds(active.ExtraTimeSeconds);
            remainingSeconds = Math.Max(0, (int)(deadline - reference).TotalSeconds);
        }

        items.Add(new
        {
            examId = exam.Id,
            examTitle = exam.Title,
            examDescription = exam.Description,
            teacherName = exam.TeacherName,
            durationMinutes = exam.DurationMinutes,
            examStatus = exam.Status,
            scheduledAtUtc = exam.ScheduledAtUtc,
            stage = exam.Stage,
            grade = exam.Grade,
            questionCount = exam.QuestionCount,
            totalPoints = exam.TotalPoints,
            maxAttempts = exam.MaxAttempts,
            attemptsUsed,
            attemptsRemaining = Math.Max(0, exam.MaxAttempts - attemptsUsed),
            hasActiveAttempt = active is not null,
            remainingSeconds,
            participantStatus = participant?.Status,
            joinedAtUtc = participant?.JoinedAtUtc,
            isNew = participant is null
        });
    }

    return Results.Ok(new { serverUtc = now, items });
}).RequireAuthorization();

app.MapPost("/api/exams/{id:guid}/enter", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Student") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var studentId)) return Results.Unauthorized();
    await FinalizeExpired(db);
    var now = DateTime.UtcNow;
    var exam = await db.Exams.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
    if (exam is null || !exam.IsPublished || exam.Status == "Draft")
        return Results.NotFound(new { message = "الامتحان غير متاح أو لم يُنشر بعد." });
    if (exam.Status == "Finished")
        return Results.Conflict(new { message = "انتهت جلسة هذا الامتحان. تواصل مع المدرس." });

    var restriction = await ExamAccessRestriction(db, exam.Id, studentId);
    if (restriction is not null)
        return Results.Json(new { message = restriction }, statusCode: StatusCodes.Status403Forbidden);

    var submissions = await db.Submissions.AsNoTracking()
        .Where(x => x.ExamId == id && x.StudentId == studentId)
        .OrderByDescending(x => x.AttemptNumber)
        .ToListAsync();
    var active = submissions.FirstOrDefault(x => x.Status == "InProgress");
    var attemptsUsed = submissions.Count(x => x.Status != "InProgress" && !x.IsExceptionAttempt);
    if (active is null && attemptsUsed >= exam.MaxAttempts)
        return Results.Conflict(new { message = "لقد استنفدت عدد المحاولات المتاحة لهذا الامتحان." });

    var participant = await db.ExamParticipants.FirstOrDefaultAsync(x => x.ExamId == id && x.StudentId == studentId);
    if (participant is null)
    {
        // ExamParticipants.Code is unique across all exams, so each auto-enrollment gets
        // its own participant code. A concurrent click may win the race; use that row.
        for (var attempt = 0; attempt < 3 && participant is null; attempt++)
        {
            var candidate = new ExamParticipant
            {
                ExamId = id,
                StudentId = studentId,
                Code = await NewStudentCode(db),
                Status = "Waiting",
                JoinedAtUtc = now,
                LastSeenAtUtc = now
            };
            db.ExamParticipants.Add(candidate);
            try
            {
                await db.SaveChangesAsync();
                participant = candidate;
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex.InnerException))
            {
                db.Entry(candidate).State = EntityState.Detached;
                participant = await db.ExamParticipants.FirstOrDefaultAsync(x => x.ExamId == id && x.StudentId == studentId);
                if (participant is null) db.ChangeTracker.Clear();
            }
        }
        if (participant is null)
            return Results.Conflict(new { message = "تعذر الانضمام للامتحان بسبب طلب متزامن. أعد المحاولة بعد لحظة." });
    }

    participant.JoinedAtUtc ??= now;
    participant.LastSeenAtUtc = now;
    if (participant.Status is "Invited" or "Absent") participant.Status = "Waiting";
    // Entering a fresh attempt after a previous submission is legitimate when attempts
    // remain. Keeping the participant waiting lets the lobby start the next attempt.
    if (active is null && participant.Status == "Submitted") participant.Status = "Waiting";
    await db.SaveChangesAsync();

    var teacherName = await db.Users.Where(x => x.Id == exam.TeacherId).Select(x => x.FullName).FirstOrDefaultAsync();
    var questionCount = await db.Questions.CountAsync(x => x.ExamId == id);
    int? remainingSeconds = null;
    if (active is not null)
    {
        var reference = exam.Status == "Paused" && exam.PausedAtUtc.HasValue ? exam.PausedAtUtc.Value : now;
        var deadline = active.StartedAtUtc.AddMinutes(exam.DurationMinutes).AddSeconds(active.ExtraTimeSeconds);
        remainingSeconds = Math.Max(0, (int)(deadline - reference).TotalSeconds);
    }

    return Results.Ok(new
    {
        examId = exam.Id,
        examTitle = exam.Title,
        examDescription = exam.Description,
        teacherName,
        durationMinutes = exam.DurationMinutes,
        scheduledAtUtc = exam.ScheduledAtUtc,
        examStatus = exam.Status,
        participantStatus = participant.Status,
        joinedAtUtc = participant.JoinedAtUtc,
        submissionId = active?.Id,
        remainingSeconds,
        serverUtc = now,
        maxAttempts = exam.MaxAttempts,
        attemptsUsed,
        attemptsRemaining = Math.Max(0, exam.MaxAttempts - attemptsUsed),
        questionCount
    });
}).RequireAuthorization().RequireRateLimiting("join");

app.MapGet("/api/exams/{id:guid}/session", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Student") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var studentId)) return Results.Unauthorized();
    var participant = await db.ExamParticipants.Include(x => x.Exam).FirstOrDefaultAsync(x => x.ExamId == id && x.StudentId == studentId);
    if (participant?.Exam is null) return Results.Forbid();
    var exam = participant.Exam;
    var restriction = await ExamAccessRestriction(db, exam.Id, studentId);
    if (restriction is not null) return Results.Json(new { message = restriction }, statusCode: StatusCodes.Status403Forbidden);
    var now = DateTime.UtcNow;
    participant.JoinedAtUtc ??= now;
    if (participant.Status == "Invited") participant.Status = "Waiting";
    participant.LastSeenAtUtc = now;
    await db.SaveChangesAsync();
    var submission = await db.Submissions.Where(x => x.ExamId == exam.Id && x.StudentId == studentId).OrderByDescending(x => x.AttemptNumber).FirstOrDefaultAsync();
    var teacherName = await db.Users.Where(x => x.Id == exam.TeacherId).Select(x => x.FullName).FirstOrDefaultAsync();
    return Results.Ok(new
    {
        examId = exam.Id, examTitle = exam.Title, examDescription = exam.Description, teacherName,
        durationMinutes = exam.DurationMinutes, scheduledAtUtc = exam.ScheduledAtUtc, examStatus = exam.Status,
        participantStatus = participant.Status, joinedAtUtc = participant.JoinedAtUtc, submissionId = submission?.Id,
        remainingSeconds = RemainingSeconds(submission, exam, now), serverUtc = now, maxAttempts = exam.MaxAttempts,
        questionCount = await db.Questions.CountAsync(x => x.ExamId == exam.Id)
    });
}).RequireAuthorization();

app.MapGet("/api/exams/{id:guid}/paper", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Student") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var studentId)) return Results.Unauthorized();
    var exam = await db.Exams.Include(x => x.Questions).FirstOrDefaultAsync(x => x.Id == id && x.IsPublished);
    if (exam is null) return Results.NotFound();
    if (exam.Status is "Draft" or "Scheduled" or "Waiting") return Results.Conflict(new { message = "لم يبدأ الامتحان بعد. انتظر تعليمات المدرس." });
    if (exam.Status == "Finished") return Results.Conflict(new { message = "انتهت جلسة الامتحان." });
    var participant = await db.ExamParticipants.FirstOrDefaultAsync(x => x.ExamId == id && x.StudentId == studentId);
    if (participant is null || participant.Status == "Invited") return Results.Forbid();
    var restriction = await ExamAccessRestriction(db, exam.Id, studentId);
    if (restriction is not null) return Results.Json(new { message = restriction }, statusCode: StatusCodes.Status403Forbidden);
    var submission = await db.Submissions.Include(x => x.Answers).FirstOrDefaultAsync(x => x.ExamId == id && x.StudentId == studentId && x.Status == "InProgress");
    if (submission is null) return Results.Conflict(new { message = "لا توجد محاولة نشطة لهذا الامتحان. ابدأ المحاولة من غرفة الانتظار." });
    var now = DateTime.UtcNow;
    participant.LastSeenAtUtc = now;
    await db.SaveChangesAsync();
    return Results.Ok(new
    {
        examId = exam.Id, examTitle = exam.Title, examDescription = exam.Description, examStatus = exam.Status,
        durationMinutes = exam.DurationMinutes, allowResumeAfterFocusLoss = exam.AllowResumeAfterFocusLoss,
        submission = new { submission.Id, submission.StartedAtUtc, submission.ExtraTimeSeconds, submission.MaxScore },
        remainingSeconds = RemainingSeconds(submission, exam, now), serverUtc = now,
        answers = submission.Answers.Select(a => new { a.QuestionId, a.AnswerText }),
        questions = exam.Questions.OrderBy(q => q.SortOrder).Select(q => new
        {
            q.Id, q.Text, q.Type, q.Points,
            options = q.Type == "TrueFalse" ? new[] { "صح", "خطأ" } : JsonSerializer.Deserialize<string[]>(q.OptionsJson)
        })
    });
}).RequireAuthorization();

app.MapGet("/api/exams/{id:guid}/live", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{
    if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
    if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
    var exam = await db.Exams.FirstOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId);
    if (exam is null) return Results.NotFound();
    var now = DateTime.UtcNow;
    var items = await ParticipantViews(db, exam, now);
    return Results.Ok(new
    {
        examId = exam.Id, examTitle = exam.Title, examStatus = exam.Status, resultsPublishedAtUtc = exam.ResultsPublishedAtUtc, serverUtc = now,
        counts = new { total = items.Count, waiting = items.Count(x => x.Status is "Waiting" or "Invited"), active = items.Count(x => x.Status == "Active"), submitted = items.Count(x => x.Status == "Submitted"), disconnected = items.Count(x => x.Status == "Disconnected") },
        items
    });
}).RequireAuthorization();

app.MapGet("/api/exams/join/{code}", async (string code, ClaimsPrincipal p, AppDbContext db) => {
    if (!Guid.TryParse(UserId(p), out var userId)) return Results.Unauthorized();
    var e = await db.Exams.Include(x => x.Questions).FirstOrDefaultAsync(x => x.JoinCode == code && x.IsPublished);
    if (e is null) return Results.NotFound();
    var role = p.FindFirstValue(ClaimTypes.Role);
    if (role == "Teacher")
    {
        if (e.TeacherId != userId) return Results.NotFound();
    }
    else if (role == "Student")
    {
        var isParticipant = await db.ExamParticipants.AnyAsync(x => x.ExamId == e.Id && x.StudentId == userId && x.Status != "Invited");
        if (!isParticipant || e.Status is "Draft" or "Scheduled" or "Waiting" or "Finished") return Results.NotFound();
        if (!await IsEligibleForExam(db, e.Id, userId)) return Results.NotFound();
    }
    else return Results.NotFound();
    return Results.Ok(new { e.Id, e.Title, e.Description, e.DurationMinutes, e.Status,
        Questions = e.Questions.OrderBy(q => q.SortOrder).Select(q => new
        { q.Id, q.Text, q.Type, Options = q.Type == "TrueFalse" ? new[] { "صح", "خطأ" } :
        JsonSerializer.Deserialize<string[]>(q.OptionsJson), q.Points }) });
}).RequireAuthorization().RequireRateLimiting("join");

app.MapPost("/api/exams/{id:guid}/start", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{
  await FinalizeExpired(db);
  if (p.FindFirstValue(ClaimTypes.Role) != "Student") return Results.Forbid();
  if (!Guid.TryParse(UserId(p), out var uid)) return Results.Unauthorized();
  var e = await db.Exams.Include(x => x.Questions).FirstOrDefaultAsync(x => x.Id == id && x.IsPublished); if (e is null) return Results.NotFound();
  if (e.Status == "Paused") return Results.Conflict(new { message = "الامتحان متوقف مؤقتاً من قبل المدرس. انتظر استئناف الجلسة." });
  if (e.Status != "Active") return Results.Conflict(new { message = "لم يفتح المدرس الجلسة بعد. انتظر في غرفة الانتظار حتى يبدأ الامتحان." });
  var participant = await db.ExamParticipants.FirstOrDefaultAsync(x => x.ExamId == id && x.StudentId == uid);
  if (participant is null || participant.Status == "Invited")
    return Results.Forbid();
  var restriction = await ExamAccessRestriction(db, e.Id, uid);
  if (restriction is not null) return Results.Json(new { message = restriction }, statusCode: StatusCodes.Status403Forbidden);
  var now = DateTime.UtcNow;
  if (e.AvailableFromUtc.HasValue && now < e.AvailableFromUtc.Value)
    return Results.Conflict(new { message = "لم يحن وقت إتاحة هذا الامتحان بعد. حاول في الموعد المحدد." });
  if (e.AvailableUntilUtc.HasValue && now >= e.AvailableUntilUtc.Value)
    return Results.Conflict(new { message = "انتهت فترة إتاحة هذا الامتحان ولا يمكن بدء محاولة جديدة." });
  var existing = await db.Submissions.FirstOrDefaultAsync(s => s.ExamId == id && s.StudentId == uid && s.Status == "InProgress");
  if (existing is not null)
  {
    if (!e.AllowResumeAfterFocusLoss && existing.FocusLossDetected) return Results.Conflict(new { message = "تم إيقاف استكمال المحاولة بعد مغادرة الامتحان وفقاً لإعدادات المدرس. تواصل مع المدرس إذا كان الخروج بسبب ظرف طارئ." });
    participant.Status = "Active"; participant.LastSeenAtUtc = now; await db.SaveChangesAsync();
    return Results.Ok(new { existing.Id, existing.StartedAtUtc, e.DurationMinutes, existing.ExtraTimeSeconds, remainingSeconds = RemainingSeconds(existing, e, now), serverUtc = now, examStatus = e.Status });
  }
  var attemptsUsed = await db.Submissions.CountAsync(s => s.ExamId == id && s.StudentId == uid && s.Status != "InProgress" && !s.IsExceptionAttempt);
  var attemptNumber = await db.Submissions.CountAsync(s => s.ExamId == id && s.StudentId == uid) + 1;
  if (attemptsUsed >= e.MaxAttempts) return Results.Conflict(new { message = "لقد استنفدت عدد المحاولات المتاحة لهذا الامتحان." });
  var sub = new Submission { ExamId = id, StudentId = uid, AttemptNumber = attemptNumber, MaxScore = e.Questions.Sum(q => q.Points), StartedAtUtc = now };
  try
  {
    db.Submissions.Add(sub);
    participant.Status = "Active"; participant.JoinedAtUtc ??= now; participant.LastSeenAtUtc = now;
    await db.SaveChangesAsync();
  }
  catch (DbUpdateException ex) when (IsUniqueViolation(ex.InnerException))
  {
    db.ChangeTracker.Clear();
    var raced = await db.Submissions.FirstOrDefaultAsync(s => s.ExamId == id && s.StudentId == uid && s.Status == "InProgress");
    return raced is null
      ? Results.Conflict(new { message = "تعذر بدء المحاولة بسبب محاولة أخرى قيد التنفيذ. أعد المحاولة بعد لحظة." })
      : Results.Ok(new { raced.Id, raced.StartedAtUtc, e.DurationMinutes, raced.ExtraTimeSeconds, remainingSeconds = RemainingSeconds(raced, e, now), serverUtc = now, examStatus = e.Status });
  }
  await Audit(db, uid, "submission.started", "Submission", sub.Id.ToString());
  return Results.Ok(new { sub.Id, sub.StartedAtUtc, e.DurationMinutes, sub.ExtraTimeSeconds, remainingSeconds = RemainingSeconds(sub, e, now), serverUtc = now, examStatus = e.Status });
}).RequireAuthorization().RequireRateLimiting("api");
app.MapPut("/api/submissions/{id:guid}/answers", async (Guid id, SubmitRequest req, ClaimsPrincipal p, AppDbContext db) =>
{
  if (p.FindFirstValue(ClaimTypes.Role) != "Student") return Results.Forbid();
  if (!Guid.TryParse(UserId(p), out var uid)) return Results.Unauthorized();
  await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted);
  await AcquireSubmissionLock(db, id);
  var sub = await db.Submissions.Include(s => s.Answers).FirstOrDefaultAsync(s => s.Id == id && s.StudentId == uid);
  if (sub is null) return Results.NotFound();
  if (sub.Status != "InProgress") return Results.Conflict(new { message = "تم تسليم هذه المحاولة بالفعل؛ لم يعد حفظ الإجابات متاحاً." });
  var examInfo = await db.Exams.Where(e => e.Id == sub.ExamId).Select(e => new { e.DurationMinutes, e.Status, e.AvailableUntilUtc }).FirstOrDefaultAsync();
  if (examInfo is null) return Results.NotFound();
  var restriction = await ExamAccessRestriction(db, sub.ExamId, uid);
  if (restriction is not null) return Results.Json(new { message = restriction }, statusCode: StatusCodes.Status403Forbidden);
  if (examInfo.Status is "Paused" or "Finished") return Results.Conflict(new { message = examInfo.Status == "Paused" ? "الامتحان متوقف مؤقتاً. ستُستأنف الجلسة عند سماح المدرس." : "انتهت الجلسة؛ لم تعد الإجابات قابلة للتعديل." });
  if (DateTime.UtcNow >= ExamGrader.Deadline(sub, examInfo.DurationMinutes, examInfo.AvailableUntilUtc)) return Results.BadRequest(new { message = "انتهى وقت الامتحان؛ تم إيقاف حفظ الإجابات الجديدة." });
  if (req.FocusLossDetected && !sub.FocusLossDetected) { sub.FocusLossCount++; sub.FocusLossDetected = true; }
  var validQuestionIds = await db.Questions.Where(q => q.ExamId == sub.ExamId).Select(q => q.Id).ToListAsync();
  foreach (var a in (req.Answers ?? []).Where(a => validQuestionIds.Contains(a.QuestionId)).GroupBy(a => a.QuestionId).Select(g => g.Last()))
  {
    var answer = sub.Answers.FirstOrDefault(x => x.QuestionId == a.QuestionId);
    if (answer is null)
    {
      sub.Answers.Add(new SubmissionAnswer { Id = Guid.Empty, SubmissionId = sub.Id, QuestionId = a.QuestionId, AnswerText = a.AnswerText ?? "" });
    }
    else answer.AnswerText = a.AnswerText ?? "";
  }
  await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(new { saved = true, sub.FocusLossDetected, serverUtc = DateTime.UtcNow });
}).RequireAuthorization();
app.MapPost("/api/submissions/{id:guid}/submit", async (Guid id, SubmitRequest? req, ClaimsPrincipal p, AppDbContext db) =>
{
  if (p.FindFirstValue(ClaimTypes.Role) != "Student") return Results.Forbid();
  if (!Guid.TryParse(UserId(p), out var uid)) return Results.Unauthorized();
  await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted);
  await AcquireSubmissionLock(db, id);
  var access = await db.Submissions.AsNoTracking()
      .Where(s => s.Id == id && s.StudentId == uid)
      .Select(s => new { s.ExamId, s.Status })
      .FirstOrDefaultAsync();
  if (access is null) return Results.NotFound();
  // Checks restrictions before claiming the attempt, otherwise a banned student would
  // leave the submission stuck in Processing after a rejected submit request.
  if (access.Status == "InProgress")
  {
    var restriction = await ExamAccessRestriction(db, access.ExamId, uid);
    if (restriction is not null) return Results.Json(new { message = restriction }, statusCode: StatusCodes.Status403Forbidden);
  }
  var claimed = await db.Submissions
      .Where(s => s.Id == id && s.StudentId == uid && s.Status == "InProgress")
      .ExecuteUpdateAsync(setters => setters.SetProperty(s => s.Status, "Processing"));
  if (claimed == 0)
  {
    var alreadySubmitted = await db.Submissions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id && s.StudentId == uid);
    if (alreadySubmitted is null) return Results.NotFound();
    if (alreadySubmitted.Status == "Processing")
      return Results.Conflict(new { message = "التسليم قيد المعالجة بالفعل. انتظر لحظة ثم حدّث الصفحة." });
    if (alreadySubmitted.Status == "InProgress")
      return Results.Conflict(new { message = "تعذر قفل المحاولة. أعد المحاولة بعد لحظة." });
    var alreadyExam = await db.Exams.Where(e => e.Id == alreadySubmitted.ExamId)
        .Select(e => new { e.Status, e.ResultsPublishedAtUtc }).FirstOrDefaultAsync();
    var alreadyResultsAvailable = alreadyExam?.Status == "Finished" && alreadyExam.ResultsPublishedAtUtc.HasValue;
    return Results.Ok(new { alreadySubmitted.Id, Score = alreadyResultsAvailable ? alreadySubmitted.Score : (decimal?)null, MaxScore = alreadyResultsAvailable ? alreadySubmitted.MaxScore : (decimal?)null, alreadySubmitted.Status, ResultsAvailable = alreadyResultsAvailable });
  }
  var sub = await db.Submissions.Include(s => s.Answers).FirstOrDefaultAsync(s => s.Id == id && s.StudentId == uid);
  if (sub is null) return Results.NotFound();
  var timing = await db.Exams.Where(e => e.Id == sub.ExamId).Select(e => new { e.DurationMinutes, e.AvailableUntilUtc, e.Status, e.ResultsPublishedAtUtc }).FirstOrDefaultAsync();
  if (timing is null) return Results.NotFound();
  var deadline = ExamGrader.Deadline(sub, timing.DurationMinutes, timing.AvailableUntilUtc);
  var isLate = DateTime.UtcNow >= deadline;
  var qs = await db.Questions.Where(q => q.ExamId == sub.ExamId).ToListAsync();
  // Accept the client's latest draft only before the deadline. A late request must not change answers.
  if (!isLate)
  {
    var validQuestionIds = qs.Select(q => q.Id).ToHashSet();
    foreach (var input in (req?.Answers ?? new List<AnswerInput>()).Where(a => validQuestionIds.Contains(a.QuestionId)).GroupBy(a => a.QuestionId).Select(g => g.Last()))
    {
      var existing = sub.Answers.FirstOrDefault(a => a.QuestionId == input.QuestionId);
      if (existing is null)
        sub.Answers.Add(new SubmissionAnswer { Id = Guid.Empty, SubmissionId = sub.Id, QuestionId = input.QuestionId, AnswerText = input.AnswerText ?? "" });
      else
        existing.AnswerText = input.AnswerText ?? "";
    }
    if (req?.FocusLossDetected == true && !sub.FocusLossDetected) sub.FocusLossCount++;
    if (req?.FocusLossDetected == true) sub.FocusLossDetected = true;
  }
  ExamGrader.Grade(sub, qs);
  sub.SubmittedAtUtc = isLate ? deadline : DateTime.UtcNow;
  var participant = await db.ExamParticipants.FirstOrDefaultAsync(x => x.ExamId == sub.ExamId && x.StudentId == uid);
  if (participant is not null) { participant.Status = "Submitted"; participant.LastSeenAtUtc = DateTime.UtcNow; }
  await db.SaveChangesAsync(); await tx.CommitAsync();
  await Audit(db, uid, "submission.submitted", "Submission", id.ToString(), isLate ? "late=true" : null);
  var resultsAvailable = timing.Status == "Finished" && timing.ResultsPublishedAtUtc.HasValue;
  return Results.Ok(new { sub.Id, Score = resultsAvailable ? sub.Score : (decimal?)null, MaxScore = resultsAvailable ? sub.MaxScore : (decimal?)null, sub.Status, ResultsAvailable = resultsAvailable });
}).RequireAuthorization();
app.MapGet("/api/results/mine", async (ClaimsPrincipal p, AppDbContext db) =>
{
  await FinalizeExpired(db);
  if (!Guid.TryParse(UserId(p), out var studentId)) return Results.Unauthorized();
  var submissions = await db.Submissions.Where(s => s.StudentId == studentId && s.Status != "InProgress" && s.Status != "Abandoned").OrderByDescending(s => s.SubmittedAtUtc).Select(s => new { s.Id, s.ExamId, ExamTitle = s.Exam!.Title, TeacherName = db.Users.Where(u => u.Id == s.Exam.TeacherId).Select(u => u.FullName).FirstOrDefault(), Subject = s.Exam.Description, ResultsAvailable = s.Exam.Status == "Finished" && s.Exam.ResultsPublishedAtUtc != null, Score = s.Exam.Status == "Finished" && s.Exam.ResultsPublishedAtUtc != null && (s.Status == "Submitted" || s.Status == "Reviewed") ? s.Score : (decimal?)null, MaxScore = s.Exam.Status == "Finished" && s.Exam.ResultsPublishedAtUtc != null ? s.MaxScore : (decimal?)null, s.Status, s.SubmittedAtUtc, s.StartedAtUtc, s.AttemptNumber, s.FocusLossDetected, s.FocusLossCount, s.CopyAttemptCount, s.ScreenshotAttemptCount }).ToListAsync();
  return Results.Ok(submissions.Select(s => new { s.Id, s.ExamId, s.ExamTitle, s.TeacherName, s.Subject, s.ResultsAvailable, s.Score, s.MaxScore, s.Status, s.SubmittedAtUtc, s.StartedAtUtc, DurationSeconds = s.SubmittedAtUtc.HasValue ? (int)(s.SubmittedAtUtc.Value - s.StartedAtUtc).TotalSeconds : (int?)null, s.AttemptNumber, s.FocusLossDetected, s.FocusLossCount, s.CopyAttemptCount, s.ScreenshotAttemptCount }).ToList());
}).RequireAuthorization();
app.MapGet("/api/exams/{id:guid}/results", async (Guid id, ClaimsPrincipal p, AppDbContext db, int page = 1, int pageSize = 25) =>
{
  if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid(); page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);

var userId = p.FindFirstValue(ClaimTypes.NameIdentifier);

if (!Guid.TryParse(userId, out var teacherId))
    return Results.Unauthorized();

var exam = await db.Exams.FirstOrDefaultAsync(
    x => x.Id == id && x.TeacherId == teacherId);

if (exam is null)
    return Results.NotFound();
  await FinalizeExpired(db);
  var q = db.Submissions.Where(s => s.ExamId == id && s.Status != "InProgress"); var total = await q.CountAsync(); var items = await q.OrderByDescending(s => s.SubmittedAtUtc).Skip((page - 1) * pageSize).Take(pageSize).Select(s => new { s.Id, Student = s.Student!.FullName, Email = s.Student.Email, s.Score, s.MaxScore, s.Status, s.SubmittedAtUtc, s.FocusLossDetected, s.IsExceptionAttempt }).ToListAsync(); return Results.Ok(new { items, page, pageSize, total });
}).RequireAuthorization();
app.MapPost("/api/submissions/{id:guid}/grant-extra-attempt", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{
  if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
  if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
  await FinalizeExpired(db);
  await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted);
  await AcquireSubmissionLock(db, id);
  var submission = await db.Submissions.Include(x => x.Exam).FirstOrDefaultAsync(x => x.Id == id);
  if (submission is null) return Results.NotFound(new { message = "لم نعثر على محاولة الطالب المطلوبة." });
  if (submission.Exam?.TeacherId != teacherId) return Results.Forbid();
  if (submission.Status == "Processing") return Results.Conflict(new { message = "التسليم قيد المعالجة. انتظر لحظة ثم أعد المحاولة." });
  if (submission.Status == "InProgress" && !submission.FocusLossDetected) return Results.Conflict(new { message = "الطالب لديه محاولة مفتوحة ولم يُرصد خروجه منها. لا يمكن منح استثناء في هذه الحالة." });
  if (submission.IsExceptionAttempt) return Results.Conflict(new { message = "تم منح محاولة إضافية لهذه المحاولة بالفعل. حدّث القائمة قبل المحاولة مرة أخرى." });
  if (submission.Status != "InProgress") {
    var latest = await db.Submissions.Where(x => x.ExamId == submission.ExamId && x.StudentId == submission.StudentId && x.Status != "InProgress").OrderByDescending(x => x.SubmittedAtUtc).Select(x => x.Id).FirstOrDefaultAsync();
    if (latest != submission.Id) return Results.Conflict(new { message = "يمكن منح الاستثناء للمحاولة الأخيرة فقط." });
  }
  submission.IsExceptionAttempt = true;
  if (submission.Status == "InProgress") { submission.Status = "Abandoned"; submission.SubmittedAtUtc = DateTime.UtcNow; }
  await db.SaveChangesAsync();
  await tx.CommitAsync();
  await Audit(db, teacherId, "submission.extra-attempt-granted", "Submission", id.ToString());
  return Results.Ok(new { message = "تم منح الطالب محاولة إضافية استثنائية واحدة.", submissionId = id });
}).RequireAuthorization();

app.MapPut("/api/submissions/{id:guid}/answers/{answerId:guid}/grade", async (Guid id, Guid answerId, EssayGradeRequest req, ClaimsPrincipal p, AppDbContext db) =>
{
  if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();
  if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized();
  if (req is null || (req.Feedback?.Length ?? 0) > 2000) return Results.BadRequest(new { message = "بيانات التصحيح غير صالحة." });
  await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted);
  await AcquireSubmissionLock(db, id);
  var sub = await db.Submissions.Include(s => s.Answers).FirstOrDefaultAsync(s => s.Id == id);
  if (sub is null) return Results.NotFound();
  var exam = await db.Exams.FirstOrDefaultAsync(e => e.Id == sub.ExamId && e.TeacherId == teacherId);
  if (exam is null) return Results.Forbid();
  if (sub.Status is not ("NeedsReview" or "Reviewed")) return Results.BadRequest(new { message = "لا يمكن تعديل درجة محاولة غير مسلّمة." });
  var a = sub.Answers.FirstOrDefault(x => x.Id == answerId && x.SubmissionId == id);
  if (a is null)
  {
    // Repair legacy submissions whose essay answer row was never materialised.
    var questionList = await db.Questions.Where(x => x.ExamId == sub.ExamId).ToListAsync();
    ExamGrader.EnsureAnswers(sub, questionList);
    await db.SaveChangesAsync();
    a = sub.Answers.FirstOrDefault(x => x.Id == answerId && x.SubmissionId == id);
  }
  if (a is null) return Results.NotFound(new { message = "لم نعثر على إجابة هذا السؤال في المحاولة." });
  var q = await db.Questions.FirstOrDefaultAsync(x => x.Id == a.QuestionId && x.ExamId == sub.ExamId);
  if (q is null) return Results.NotFound();
  if (q.Type != "Essay") return Results.BadRequest(new { message = "يمكن تصحيح الأسئلة المقالية فقط." });
  if (req.AwardedPoints < 0 || req.AwardedPoints > q.Points) return Results.BadRequest(new { message = "الدرجة خارج النطاق." });
  var previousPoints = a.AwardedPoints;
  a.AwardedPoints = req.AwardedPoints;
  a.TeacherFeedback = req.Feedback;
  sub.Score = sub.Answers.Sum(x => x.AwardedPoints ?? 0);
  sub.MaxScore = await db.Questions.Where(x => x.ExamId == sub.ExamId).SumAsync(x => x.Points);
  var essayQuestionIds = await db.Questions.Where(x => x.ExamId == sub.ExamId && x.Type == "Essay").Select(x => x.Id).ToListAsync();
  var gradedIds = sub.Answers.Where(x => x.AwardedPoints != null).Select(x => x.QuestionId).ToHashSet();
  sub.Status = essayQuestionIds.Any(qid => !gradedIds.Contains(qid)) ? "NeedsReview" : "Reviewed";
  await db.SaveChangesAsync();
  await tx.CommitAsync();
  await Audit(db, teacherId, "essay.graded", "Submission", id.ToString(), $"old={previousPoints}; new={req.AwardedPoints}");
  return Results.Ok(new { sub.Score, sub.MaxScore, sub.Status });
}).RequireAuthorization();
app.MapGet("/api/exams/{id:guid}/review", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{
  if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid();

var userId = p.FindFirstValue(ClaimTypes.NameIdentifier);

if (!Guid.TryParse(userId, out var teacherId))
    return Results.Unauthorized();

var exam = await db.Exams.FirstOrDefaultAsync(
    e => e.Id == id && e.TeacherId == teacherId);

if (exam is null)
    return Results.NotFound();
  await FinalizeExpired(db);
  var rows = await db.Submissions.AsNoTracking().Where(s => s.ExamId == id && s.Status == "NeedsReview").Select(s => new { s.Id, Student = s.Student!.FullName, s.Score, s.MaxScore, Answers = s.Answers.Select(a => new { a.Id, a.QuestionId, a.AnswerText, a.AwardedPoints, a.TeacherFeedback, Question = a.Question!.Text, Points = a.Question.Points, Type = a.Question.Type }).ToList() }).ToListAsync();
  return Results.Ok(rows);
}).RequireAuthorization();
app.MapGet("/api/exams/{id:guid}/export", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{

if (p.FindFirstValue(ClaimTypes.Role) != "Teacher")
    return Results.Forbid();

var userId = p.FindFirstValue(ClaimTypes.NameIdentifier);

if (!Guid.TryParse(userId, out var teacherId))
    return Results.Unauthorized();

var exam = await db.Exams.FirstOrDefaultAsync(
    e => e.Id == id && e.TeacherId == teacherId);

if (exam is null)
    return Results.NotFound();
  await FinalizeExpired(db);
  var rows = await db.Submissions.Where(s => s.ExamId == id && s.Status != "InProgress").Select(s => new { s.Student!.FullName, s.Student.Email, s.Score, s.MaxScore, s.Status, s.SubmittedAtUtc }).ToListAsync();
  static string Esc(string? x)
  {
    var value = (x ?? "").Replace("\r", " ").Replace("\n", " ");
    if (value.Length > 0 && "=+-@".Contains(value.TrimStart()[0])) value = "'" + value;
    return "\"" + value.Replace("\"", "\"\"") + "\"";
  }
  var csv = "Student,Email,Score,MaxScore,Status,SubmittedAtUtc\r\n" + string.Join("\r\n", rows.Select(x => string.Join(",", new[] { Esc(x.FullName), Esc(x.Email), x.Score.ToString(System.Globalization.CultureInfo.InvariantCulture), x.MaxScore.ToString(System.Globalization.CultureInfo.InvariantCulture), Esc(x.Status), Esc(x.SubmittedAtUtc?.ToString("O")) })));
  await Audit(db, teacherId, "results.exported", "Exam", id.ToString()); return Results.File(System.Text.Encoding.UTF8.GetPreamble().Concat(System.Text.Encoding.UTF8.GetBytes(csv)).ToArray(), "text/csv; charset=utf-8", $"exam-{id}-results.csv");
}).RequireAuthorization();

if (!app.Environment.IsProduction())
{
    app.MapPost("/api/admin/reset", async (ClaimsPrincipal p, AppDbContext db) =>
    {
        var role = p.FindFirstValue(ClaimTypes.Role);
        if (role != "Admin") return Results.Forbid();
        if (!Guid.TryParse(UserId(p), out var actorId)) return Results.Unauthorized();
        var activeSubmissions = await db.Submissions
            .Where(s => s.Status == "InProgress")
            .Select(s => s.Id)
            .ToListAsync();
        foreach (var id in activeSubmissions)
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM \"Answers\" WHERE \"SubmissionId\" = '{id}'");
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM \"Submissions\" WHERE \"Id\" = '{id}'");
        }
        var activeParticipants = await db.ExamParticipants
            .Where(p => new[] { "Waiting", "Active", "Invited" }.Contains(p.Status))
            .Select(p => p.Id)
            .ToListAsync();
        foreach (var id in activeParticipants)
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"DELETE FROM \"ExamParticipants\" WHERE \"Id\" = '{id}'");
        }
        await Audit(db, actorId, "admin.reset", "Admin", null, $"clearedSubmissions={activeSubmissions.Count}, clearedParticipants={activeParticipants.Count}");
        return Results.Ok(new { message = "تم إعادة تعيين البيانات النشطة بنجاح.", clearedSubmissions = activeSubmissions.Count, clearedParticipants = activeParticipants.Count });
    }).RequireAuthorization();
}

app.MapGet("/api/audit", async (ClaimsPrincipal p, AppDbContext db, int page = 1, int pageSize = 50) => { if (p.FindFirstValue(ClaimTypes.Role) != "Teacher") return Results.Forbid(); if (!Guid.TryParse(UserId(p), out var teacherId)) return Results.Unauthorized(); page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100); var q = db.AuditEvents.AsNoTracking().Where(x => x.ActorId == teacherId).OrderByDescending(x => x.AtUtc); var total = await q.CountAsync(); return Results.Ok(new { items = await q.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(), page, pageSize, total }); }).RequireAuthorization();

app.MapPost("/api/submissions/{id:guid}/events", async (Guid id, SubmissionEventRequest req, ClaimsPrincipal p, AppDbContext db) =>
{
  if (p.FindFirstValue(ClaimTypes.Role) != "Student") return Results.Forbid();
  if (!Guid.TryParse(UserId(p), out var uid)) return Results.Unauthorized();
  var eventType = (req.Type ?? "").Trim().ToLowerInvariant();
  if (eventType is not ("focus-loss" or "copy" or "screenshot"))
    return Results.BadRequest(new { message = "نوع الحدث غير معروف." });
  await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted);
  await AcquireSubmissionLock(db, id);
  var sub = await db.Submissions.FirstOrDefaultAsync(s => s.Id == id && s.StudentId == uid && s.Status == "InProgress");
  if (sub is null) return Results.NotFound(new { message = "المحاولة غير موجودة أو تم إنهاؤها." });
  var restriction = await ExamAccessRestriction(db, sub.ExamId, uid);
  if (restriction is not null) return Results.Json(new { message = restriction }, statusCode: StatusCodes.Status403Forbidden);
  switch (eventType) {
    case "focus-loss": sub.FocusLossCount++; sub.FocusLossDetected = true; break;
    case "copy": sub.CopyAttemptCount++; break;
    case "screenshot": sub.ScreenshotAttemptCount++; break;
  }
  await db.SaveChangesAsync();
  await tx.CommitAsync();
  await Audit(db, uid, "exam.event." + eventType, "Submission", id.ToString());
  return Results.Ok(new { recorded = true });
}).RequireAuthorization();

app.MapGet("/api/submissions/{id:guid}/review", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
{
  if (!Guid.TryParse(UserId(p), out var uid)) return Results.Unauthorized();
  var role = p.FindFirstValue(ClaimTypes.Role);
  if (role is not ("Student" or "Teacher")) return Results.Forbid();
  await FinalizeExpired(db);
  var sub = await db.Submissions.Include(s => s.Exam).Include(s => s.Student).Include(s => s.Answers).FirstOrDefaultAsync(s => s.Id == id);
  if (sub is null) return Results.NotFound(new { message = "المحاولة المطلوبة غير موجودة." });
  if (role == "Student" ? sub.StudentId != uid : sub.Exam!.TeacherId != uid) return Results.Forbid();
  var qs = await db.Questions.Where(q => q.ExamId == sub.ExamId).OrderBy(q => q.SortOrder).ToListAsync();
  if (role == "Teacher") { ExamGrader.EnsureAnswers(sub, qs); await db.SaveChangesAsync(); }
  var elapsed = (int)((sub.SubmittedAtUtc ?? DateTime.UtcNow) - sub.StartedAtUtc).TotalSeconds;
  var resultsAvailable = ResultsReleased(sub.Exam!);
  // Ending the exam is not enough: students only see scores and answer keys after the
  // owning teacher explicitly publishes results once grading is complete.
  var canSeeResults = role == "Teacher" || resultsAvailable;
  return Results.Ok(new { sub.Id, sub.ExamId, ExamTitle = sub.Exam!.Title, TeacherName = await db.Users.Where(u => u.Id == sub.Exam.TeacherId).Select(u => u.FullName).FirstOrDefaultAsync(), StudentName = sub.Student!.FullName, sub.Status, ResultsAvailable = resultsAvailable, Score = canSeeResults ? sub.Score : (decimal?)null, MaxScore = canSeeResults ? sub.MaxScore : (decimal?)null, sub.StartedAtUtc, sub.SubmittedAtUtc, DurationSeconds = elapsed, sub.AttemptNumber, sub.FocusLossCount, sub.CopyAttemptCount, sub.ScreenshotAttemptCount, Answers = qs.Select(q => { var a = sub.Answers.FirstOrDefault(x => x.QuestionId == q.Id); return new { Id = a?.Id, QuestionId = q.Id, q.Text, q.Type, Options = JsonSerializer.Deserialize<string[]>(q.OptionsJson), CorrectAnswer = canSeeResults ? q.CorrectAnswer : null, q.Points, StudentAnswer = a?.AnswerText ?? "", AwardedPoints = canSeeResults ? a?.AwardedPoints : null, TeacherFeedback = canSeeResults ? a?.TeacherFeedback : null }; }) });
}).RequireAuthorization();

app.Run();
