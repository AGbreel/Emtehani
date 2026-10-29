using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Nodes;
using Emtehani.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Emtehani.Tests;

public class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string _databasePath = Path.Combine(Path.GetTempPath(), $"emtehani-tests-{Guid.NewGuid():N}.db");
    internal const string TestJwtKey = "emtehani-test-jwt-key-for-local-development-only-32ch";

    protected virtual string EnvironmentName => "Development";

    protected virtual void ConfigureTestSettings(IWebHostBuilder builder)
    {
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(EnvironmentName);
        ConfigureTestSettings(builder);
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["FrontendOrigin"] = "http://localhost:5173",
                ["PublicApiUrl"] = "http://localhost:5000",
                ["Auth:AutoConfirmWithoutSmtp"] = "true",
                ["Email:SmtpHost"] = "",
                ["Email:Username"] = "",
                ["Email:Password"] = "",
                ["Jwt:Key"] = TestJwtKey,
                ["RateLimiting:ApiPermitLimit"] = "10000",
                ["RateLimiting:AuthPermitLimit"] = "10000"
            });
            ConfigureTestConfiguration(config);
        });
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<AppDbContext>>();
            services.RemoveAll<AppDbContext>();
            services.AddDbContext<AppDbContext>(options => options.UseSqlite($"Data Source={_databasePath};Default Timeout=30"));
            services.Replace(ServiceDescriptor.Singleton<Emtehani.Application.Abstractions.ITokenService>(
                new FixedTokenService(TestJwtKey)));
            // Override JWT validation to use the test key
            var jwtKeyBytes = Encoding.UTF8.GetBytes(TestJwtKey);
            services.Configure<JwtBearerOptions>(Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme, options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = "Emtehani",
                    ValidateAudience = true,
                    ValidAudience = "Emtehani.Client",
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(jwtKeyBytes),
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30)
                };
            });
        });
    }

    protected virtual void ConfigureTestConfiguration(IConfigurationBuilder config)
    {
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;
        SqliteConnection.ClearAllPools();
        try { File.Delete(_databasePath); } catch (IOException) { }
    }
}

public sealed class FixedTokenService(string jwtKey) : Emtehani.Application.Abstractions.ITokenService
{
    public (string Token, DateTime ExpiresAtUtc) Create(Emtehani.Domain.Entities.AppUser user)
    {
        var expiry = DateTime.UtcNow.AddHours(8);
        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.FullName),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role)
        };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = handler.CreateToken(new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Issuer = "Emtehani",
            Audience = "Emtehani.Client",
            Expires = expiry,
            SigningCredentials = creds
        });
        return (handler.WriteToken(token), expiry);
    }
}

public sealed class ProductionStartupFactory : ApiFactory
{
    protected override string EnvironmentName => "Production";

    protected override void ConfigureTestSettings(IWebHostBuilder builder)
    {
        builder.UseSetting("FrontendOrigin", "https://emtehani.example.test");
        builder.UseSetting("PublicApiUrl", "https://api.emtehani.example.test");
        builder.UseSetting("Jwt:Key", "cHJvZHVjdGlvbi1zdGFydHVwLXRlc3Qta2V5LTAxMjM0NTY3ODlhYmNkZWY=");
        builder.UseSetting("Auth:AutoConfirmWithoutSmtp", "false");
    }
}

public sealed class RegistrationTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task TeacherRegistration_WithoutInviteCode_Succeeds()
    {
        var client = factory.CreateClient();
        var email = $"teacher-open-{Guid.NewGuid():N}@example.test";
        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "مدرس تسجيل مفتوح",
            email,
            password = "Passw0rd!",
            role = "Teacher"
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = JsonNode.Parse(await login.Content.ReadAsStringAsync());
        Assert.Equal("Teacher", auth!["role"]!.GetValue<string>());
        Assert.True(string.IsNullOrWhiteSpace(auth["studentCode"]?.GetValue<string>()));
    }

    [Fact]
    public async Task ProductionTeacherRegistration_WithoutInviteCode_Succeeds()
    {
        using var productionFactory = new ProductionStartupFactory();
        var client = productionFactory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "مدرس إنتاج",
            email = $"teacher-production-{Guid.NewGuid():N}@example.test",
            password = "Passw0rd!",
            role = "Teacher"
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task ProductionStartup_AllowsHealthCheck()
    {
        using var productionFactory = new ProductionStartupFactory();
        var client = productionFactory.CreateClient();
        var health = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
    }
}

public sealed class ApiIntegrationTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string DefaultStage = "ثانوي";
    private const string DefaultGrade = "الصف الثالث الثانوي";

    private static string Email(string prefix) => $"{prefix}-{Guid.NewGuid():N}@example.test";

    private static async Task<JsonNode> ReadJson(HttpResponseMessage response)
        => JsonNode.Parse(await response.Content.ReadAsStringAsync()) ?? throw new InvalidOperationException("Empty response.");

    private static Guid GuidValue(JsonNode? node) => Guid.Parse(node!.GetValue<string>());

    private async Task<(HttpClient Client, JsonNode Auth)> RegisterAndLogin(string email, string role, string name, string? stage = null, string? grade = null)
    {
        var client = factory.CreateClient();
        var isStudent = role == "Student";
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = name,
            email,
            password = "Passw0rd!",
            role,
            stage = isStudent ? stage ?? DefaultStage : null,
            grade = isStudent ? grade ?? DefaultGrade : null
        });
        Assert.True(register.StatusCode == HttpStatusCode.OK, $"{register.StatusCode}: {await register.Content.ReadAsStringAsync()}");
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await ReadJson(login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());
        return (client, auth);
    }

    private async Task<Guid> CreatePublishedExam(HttpClient teacher, string stage = DefaultStage, string grade = DefaultGrade)
    {
        var create = await teacher.PostAsJsonAsync("/api/exams", new
        {
            title = "اختبار تكاملي",
            description = "وصف",
            durationMinutes = 30,
            maxAttempts = 1,
            allowResumeAfterFocusLoss = true,
            stage,
            grade,
            questions = new object[]
            {
                new { text = "٢ + ٢", type = "MultipleChoice", options = new[] { "3", "4" }, correctAnswer = "4", points = 2 },
                new { text = "السماء زرقاء", type = "TrueFalse", options = Array.Empty<string>(), correctAnswer = "صح", points = 1 }
            }
        });
        Assert.True(create.StatusCode == HttpStatusCode.Created,
            $"{(int)create.StatusCode} {create.StatusCode}: {await create.Content.ReadAsStringAsync()} | {string.Join(",", create.Headers.WwwAuthenticate)}");
        var exam = await ReadJson(create);
        Assert.NotNull(exam["joinCode"]);
        var examId = GuidValue(exam["id"]);
        var publish = await teacher.PutAsync($"/api/exams/{examId}/publish", null);
        Assert.Equal(HttpStatusCode.OK, publish.StatusCode);
        return examId;
    }

    private static async Task OpenExam(HttpClient teacher, Guid examId)
    {
        var open = await teacher.PutAsync($"/api/exams/{examId}/state", JsonContent.Create(new { action = "open" }));
        Assert.Equal(HttpStatusCode.OK, open.StatusCode);
    }

    private async Task<Guid> CreateCustomExam(HttpClient teacher, string title, int maxAttempts = 1, bool publish = true, string stage = DefaultStage, string grade = DefaultGrade)
    {
        var create = await teacher.PostAsJsonAsync("/api/exams", new
        {
            title,
            description = $"وصف {title}",
            durationMinutes = 30,
            maxAttempts,
            allowResumeAfterFocusLoss = true,
            stage,
            grade,
            questions = new object[]
            {
                new { text = "٢ + ٢", type = "MultipleChoice", options = new[] { "3", "4" }, correctAnswer = "4", points = 2 },
                new { text = "السماء زرقاء", type = "TrueFalse", options = Array.Empty<string>(), correctAnswer = "صح", points = 1 }
            }
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var examId = GuidValue((await ReadJson(create))["id"]);
        if (publish)
        {
            var response = await teacher.PutAsync($"/api/exams/{examId}/publish", null);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        return examId;
    }

    private static async Task<Guid> StartAttempt(HttpClient student, Guid examId)
    {
        var start = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        return GuidValue((await ReadJson(start))["id"]);
    }

    private static async Task SubmitAttempt(HttpClient student, Guid examId, Guid submissionId)
    {
        var paper = await student.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/paper");
        var answers = paper!["questions"]!.AsArray().Select(question => new
        {
            questionId = GuidValue(question!["id"]),
            answerText = question["type"]!.GetValue<string>() == "MultipleChoice" ? "4" : "صح"
        }).ToArray();
        var submit = await student.PostAsJsonAsync($"/api/submissions/{submissionId}/submit", new { answers, focusLossDetected = false });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
    }

    private static async Task PublishResults(HttpClient teacher, Guid examId)
    {
        var response = await teacher.PostAsync($"/api/exams/{examId}/results/publish", null);
        Assert.True(response.StatusCode == HttpStatusCode.OK,
            $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
    }

    private static string StudentCode(JsonNode auth) => auth["studentCode"]!.GetValue<string>();

    private static async Task EnrollStudent(HttpClient teacher, HttpClient student)
    {
        var teacherMe = await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me");
        var studentMe = await student.GetFromJsonAsync<JsonNode>("/api/auth/me");
        var requested = await student.PostAsync($"/api/teachers/{GuidValue(teacherMe!["id"])}/request", null);
        Assert.Equal(HttpStatusCode.OK, requested.StatusCode);
        var requests = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/requests");
        var email = studentMe!["email"]!.GetValue<string>();
        var row = requests!.AsArray().First(item => item!["studentEmail"]!.GetValue<string>() == email && item["status"]!.GetValue<string>() == "Pending");
        var accepted = await teacher.PutAsJsonAsync($"/api/teacher/requests/{GuidValue(row!["id"])}", new { action = "accept" });
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
    }

    [Fact]
    public async Task Registration_AssignsUniqueSixDigitStudentCodeToEachStudent()
    {
        var (_, firstAuth) = await RegisterAndLogin(Email("code-one"), "Student", "طالب كود أول");
        var (_, secondAuth) = await RegisterAndLogin(Email("code-two"), "Student", "طالب كود ثان");
        var (_, teacherAuth) = await RegisterAndLogin(Email("code-teacher"), "Teacher", "مدرس بلا كود");

        var first = StudentCode(firstAuth);
        var second = StudentCode(secondAuth);
        Assert.Matches("^[0-9]{6}$", first);
        Assert.Matches("^[0-9]{6}$", second);
        Assert.NotEqual(first, second);
        Assert.True(string.IsNullOrWhiteSpace(teacherAuth["studentCode"]?.GetValue<string>()));
    }

    [Fact]
    public async Task Student_CanJoinStartSubmitAndResubmitIdempotently()
    {
        var teacherEmail = Email("teacher");
        var studentEmail = Email("student");
        var (teacher, _) = await RegisterAndLogin(teacherEmail, "Teacher", "مدرس تكاملي");
        var (student, studentAuth) = await RegisterAndLogin(studentEmail, "Student", "طالب تكاملي");
        await EnrollStudent(teacher, student);
        var examId = await CreatePublishedExam(teacher);
        var studentCode = StudentCode(studentAuth);

        var joined = await student.PostAsJsonAsync("/api/exams/enter-code", new { code = studentCode });
        Assert.Equal(HttpStatusCode.OK, joined.StatusCode);
        var joinedResult = await ReadJson(joined);
        Assert.Equal(examId, GuidValue(joinedResult["examId"]));
        Assert.Equal("Waiting", joinedResult["participantStatus"]!.GetValue<string>());

        await OpenExam(teacher, examId);
        var start = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var started = await ReadJson(start);
        var submissionId = GuidValue(started["id"]);

        var paper = await student.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/paper");
        var questions = paper!["questions"]!.AsArray();
        Assert.Equal(2, questions.Count);
        var answers = questions.Select(question => new
        {
            questionId = GuidValue(question!["id"]),
            answerText = question["type"]!.GetValue<string>() == "MultipleChoice" ? "4" : "صح"
        }).ToArray();

        var save = await student.PutAsJsonAsync($"/api/submissions/{submissionId}/answers", new { answers, focusLossDetected = false });
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);

        var submit = await student.PostAsJsonAsync($"/api/submissions/{submissionId}/submit", new { answers, focusLossDetected = false });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
        var submitted = await ReadJson(submit);
        Assert.False(submitted["resultsAvailable"]!.GetValue<bool>());
        Assert.True(submitted["score"] is null);
        Assert.True(submitted["maxScore"] is null);

        var again = await student.PostAsJsonAsync($"/api/submissions/{submissionId}/submit", new { answers, focusLossDetected = false });
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(submissionId, GuidValue((await ReadJson(again))["id"]));

        var hiddenReview = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.False(hiddenReview!["resultsAvailable"]!.GetValue<bool>());
        Assert.True(hiddenReview["score"] is null);
        Assert.True(hiddenReview["maxScore"] is null);
        Assert.All(hiddenReview["answers"]!.AsArray(), answer =>
        {
            Assert.True(answer!["correctAnswer"] is null);
            Assert.True(answer["awardedPoints"] is null);
            Assert.True(answer["teacherFeedback"] is null);
        });

        var close = await teacher.PutAsJsonAsync($"/api/exams/{examId}/state", new { action = "close" });
        Assert.Equal(HttpStatusCode.OK, close.StatusCode);

        var hiddenAfterClose = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.False(hiddenAfterClose!["resultsAvailable"]!.GetValue<bool>());
        Assert.True(hiddenAfterClose["score"] is null);
        Assert.True(hiddenAfterClose["answers"]![0]!["correctAnswer"] is null);

        await PublishResults(teacher, examId);

        var review = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.Equal(3, review!["score"]!.GetValue<double>());
        Assert.Equal("Reviewed", review["status"]!.GetValue<string>());
        Assert.True(review["resultsAvailable"]!.GetValue<bool>());
        Assert.Equal("4", review["answers"]![0]!["correctAnswer"]!.GetValue<string>());
        Assert.Equal(2, review["answers"]![0]!["awardedPoints"]!.GetValue<double>());
    }

    [Fact]
    public async Task GrantExtraAttempt_RejectsDuplicateGrant_AndAllowsGrantForNextAttempt()
    {
        var (teacher, _) = await RegisterAndLogin(Email("grant-teacher"), "Teacher", "مدرس منح المحاولات");
        var (otherTeacher, _) = await RegisterAndLogin(Email("grant-other-teacher"), "Teacher", "مدرس آخر");
        var (student, studentAuth) = await RegisterAndLogin(Email("grant-student"), "Student", "طالب منح المحاولات");
        await EnrollStudent(teacher, student);
        var examId = await CreatePublishedExam(teacher);
        var studentCode = StudentCode(studentAuth);

        var joined = await student.PostAsJsonAsync("/api/exams/enter-code", new { code = studentCode });
        Assert.Equal(HttpStatusCode.OK, joined.StatusCode);
        await OpenExam(teacher, examId);

        var firstStart = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, firstStart.StatusCode);
        var firstAttempt = GuidValue((await ReadJson(firstStart))["id"]);

        var paperResponse = await student.GetAsync($"/api/exams/{examId}/paper");
        Assert.Equal(HttpStatusCode.OK, paperResponse.StatusCode);
        var paper = await ReadJson(paperResponse);
        var answers = paper["questions"]!.AsArray().Select(question => new
        {
            questionId = GuidValue(question!["id"]),
            answerText = question["type"]!.GetValue<string>() == "MultipleChoice" ? "4" : "صح"
        }).ToArray();

        var firstSubmit = await student.PostAsJsonAsync($"/api/submissions/{firstAttempt}/submit", new { answers, focusLossDetected = false });
        Assert.Equal(HttpStatusCode.OK, firstSubmit.StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden, (await otherTeacher.PostAsync($"/api/submissions/{firstAttempt}/grant-extra-attempt", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsync($"/api/submissions/{firstAttempt}/grant-extra-attempt", null)).StatusCode);

        var firstGrant = await teacher.PostAsync($"/api/submissions/{firstAttempt}/grant-extra-attempt", null);
        Assert.Equal(HttpStatusCode.OK, firstGrant.StatusCode);

        var results = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/results?page=1&pageSize=100");
        var firstRow = results!["items"]!.AsArray().Single(x => GuidValue(x!["id"]) == firstAttempt)!;
        Assert.True(firstRow["isExceptionAttempt"]!.GetValue<bool>());

        var duplicate = await teacher.PostAsync($"/api/submissions/{firstAttempt}/grant-extra-attempt", null);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        var duplicateBody = await ReadJson(duplicate);
        Assert.Contains("بالفعل", duplicateBody["message"]!.GetValue<string>());

        var secondStart = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, secondStart.StatusCode);
        var secondAttempt = GuidValue((await ReadJson(secondStart))["id"]);
        Assert.NotEqual(firstAttempt, secondAttempt);

        var secondSubmit = await student.PostAsJsonAsync($"/api/submissions/{secondAttempt}/submit", new { answers, focusLossDetected = false });
        Assert.Equal(HttpStatusCode.OK, secondSubmit.StatusCode);

        var secondGrant = await teacher.PostAsync($"/api/submissions/{secondAttempt}/grant-extra-attempt", null);
        Assert.Equal(HttpStatusCode.OK, secondGrant.StatusCode);

        var secondDuplicate = await teacher.PostAsync($"/api/submissions/{secondAttempt}/grant-extra-attempt", null);
        Assert.Equal(HttpStatusCode.Conflict, secondDuplicate.StatusCode);
    }

    [Fact]
    public async Task AutosaveAfterSubmit_IsRejectedAndDoesNotChangePersistedAnswers()
    {
        var (teacher, _) = await RegisterAndLogin(Email("late-save-teacher"), "Teacher", "مدرس حفظ متأخر");
        var (student, studentAuth) = await RegisterAndLogin(Email("late-save-student"), "Student", "طالب حفظ متأخر");
        await EnrollStudent(teacher, student);
        var examId = await CreatePublishedExam(teacher);
        var studentCode = StudentCode(studentAuth);

        var joined = await student.PostAsJsonAsync("/api/exams/enter-code", new { code = studentCode });
        Assert.Equal(HttpStatusCode.OK, joined.StatusCode);
        await OpenExam(teacher, examId);

        var start = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var submissionId = GuidValue((await ReadJson(start))["id"]);

        var paper = await student.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/paper");
        var questions = paper!["questions"]!.AsArray();
        var answers = questions.Select(question => new
        {
            questionId = GuidValue(question!["id"]),
            answerText = question["type"]!.GetValue<string>() == "MultipleChoice" ? "4" : "صح"
        }).ToArray();

        var submit = await student.PostAsJsonAsync($"/api/submissions/{submissionId}/submit", new { answers, focusLossDetected = false });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);

        var lateAnswers = questions.Select(question => new
        {
            questionId = GuidValue(question!["id"]),
            answerText = question["type"]!.GetValue<string>() == "MultipleChoice" ? "3" : "خطأ"
        }).ToArray();
        var lateSave = await student.PutAsJsonAsync($"/api/submissions/{submissionId}/answers", new { answers = lateAnswers, focusLossDetected = false });
        Assert.Equal(HttpStatusCode.Conflict, lateSave.StatusCode);

        var review = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.True(review!["score"] is null);
        Assert.True(review["answers"]![0]!["correctAnswer"] is null);
        Assert.Equal("4", review["answers"]![0]!["studentAnswer"]!.GetValue<string>());
        Assert.Equal("صح", review["answers"]![1]!["studentAnswer"]!.GetValue<string>());

        await teacher.PutAsJsonAsync($"/api/exams/{examId}/state", new { action = "close" });
        var hiddenAfterClose = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.False(hiddenAfterClose!["resultsAvailable"]!.GetValue<bool>());
        Assert.True(hiddenAfterClose["score"] is null);

        await PublishResults(teacher, examId);

        var released = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.Equal(3, released!["score"]!.GetValue<double>());
        Assert.Equal("4", released["answers"]![0]!["correctAnswer"]!.GetValue<string>());
        Assert.Equal("صح", released["answers"]![1]!["correctAnswer"]!.GetValue<string>());
    }

    [Fact]
    public async Task UnauthorizedUsers_CannotReviewGradeOrExportAnotherUsersSubmission()
    {
        var (teacher, _) = await RegisterAndLogin(Email("access-teacher"), "Teacher", "مدرس الصلاحيات");
        var (student, studentAuth) = await RegisterAndLogin(Email("access-student"), "Student", "طالب الصلاحيات");
        await EnrollStudent(teacher, student);
        var (otherTeacher, _) = await RegisterAndLogin(Email("access-other-teacher"), "Teacher", "مدرس آخر");
        var (otherStudent, _) = await RegisterAndLogin(Email("access-other-student"), "Student", "طالب آخر");
        var examId = await CreatePublishedExam(teacher);
        var studentCode = StudentCode(studentAuth);

        var joined = await student.PostAsJsonAsync("/api/exams/enter-code", new { code = studentCode });
        Assert.Equal(HttpStatusCode.OK, joined.StatusCode);
        await OpenExam(teacher, examId);

        var start = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var submissionId = GuidValue((await ReadJson(start))["id"]);

        var paper = await student.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/paper");
        var answers = paper!["questions"]!.AsArray().Select(question => new
        {
            questionId = GuidValue(question!["id"]),
            answerText = question["type"]!.GetValue<string>() == "MultipleChoice" ? "4" : "صح"
        }).ToArray();
        var submit = await student.PostAsJsonAsync($"/api/submissions/{submissionId}/submit", new { answers, focusLossDetected = false });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);

        var studentReview = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        var answerId = GuidValue(studentReview!["answers"]![0]!["id"]);

        Assert.Equal(HttpStatusCode.Forbidden, (await otherTeacher.GetAsync($"/api/submissions/{submissionId}/review")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await otherStudent.GetAsync($"/api/submissions/{submissionId}/review")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync($"/api/submissions/{submissionId}/review")).StatusCode);

        var otherTeacherGrade = await otherTeacher.PutAsJsonAsync($"/api/submissions/{submissionId}/answers/{answerId}/grade",
            new { awardedPoints = 1, feedback = "محاولة غير مصرح بها" });
        Assert.Equal(HttpStatusCode.Forbidden, otherTeacherGrade.StatusCode);
        var otherStudentGrade = await otherStudent.PutAsJsonAsync($"/api/submissions/{submissionId}/answers/{answerId}/grade",
            new { awardedPoints = 1, feedback = "محاولة غير مصرح بها" });
        Assert.Equal(HttpStatusCode.Forbidden, otherStudentGrade.StatusCode);

        Assert.True((await otherTeacher.GetAsync($"/api/exams/{examId}/export")).StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden);
        Assert.True((await otherTeacher.GetAsync($"/api/exams/{examId}/participants/export")).StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync($"/api/exams/{examId}/export")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync($"/api/exams/{examId}/participants/export")).StatusCode);
    }

    [Fact]
    public async Task EssayReview_ReturnsSubmissionAnswerIdThatCanBeGraded()
    {
        var teacherEmail = Email("essay-teacher");
        var studentEmail = Email("essay-student");
        var (teacher, _) = await RegisterAndLogin(teacherEmail, "Teacher", "مدرس مقالي");
        var (student, studentAuth) = await RegisterAndLogin(studentEmail, "Student", "طالب مقالي");
        await EnrollStudent(teacher, student);

        var create = await teacher.PostAsJsonAsync("/api/exams", new
        {
            title = "اختبار مقالي",
            description = "وصف",
            durationMinutes = 30,
            maxAttempts = 1,
            allowResumeAfterFocusLoss = true,
            stage = DefaultStage,
            grade = DefaultGrade,
            questions = new object[]
            {
                new { text = "اشرح الفكرة", type = "Essay", options = Array.Empty<string>(), correctAnswer = (string?)null, points = 5 }
            }
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var exam = await ReadJson(create);
        var examId = GuidValue(exam["id"]);
        var publish = await teacher.PutAsync($"/api/exams/{examId}/publish", null);
        Assert.Equal(HttpStatusCode.OK, publish.StatusCode);

        var studentCode = StudentCode(studentAuth);
        var joined = await student.PostAsJsonAsync("/api/exams/enter-code", new { code = studentCode });
        Assert.Equal(HttpStatusCode.OK, joined.StatusCode);
        await OpenExam(teacher, examId);

        var start = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var submissionId = GuidValue((await ReadJson(start))["id"]);

        var paper = await student.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/paper");
        var question = paper!["questions"]!.AsArray().Single()!;
        var questionId = GuidValue(question["id"]);
        var answers = new[] { new { questionId, answerText = "إجابة الطالب" } };

        var submit = await student.PostAsJsonAsync($"/api/submissions/{submissionId}/submit", new { answers, focusLossDetected = false });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
        var submitted = await ReadJson(submit);
        Assert.Equal("NeedsReview", submitted["status"]!.GetValue<string>());

        var reviewRows = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/review");
        var answer = reviewRows!.AsArray().Single()!["answers"]!.AsArray().Single()!;
        var answerId = GuidValue(answer["id"]);
        Assert.NotEqual(Guid.Empty, answerId);
        Assert.NotEqual(questionId, answerId);
        Assert.Equal(questionId, GuidValue(answer["questionId"]));

        var grade = await teacher.PutAsJsonAsync($"/api/submissions/{submissionId}/answers/{answerId}/grade",
            new { awardedPoints = 4, feedback = "جيد" });
        Assert.Equal(HttpStatusCode.OK, grade.StatusCode);
        var graded = await ReadJson(grade);
        Assert.Equal("Reviewed", graded["status"]!.GetValue<string>());
        Assert.Equal(4, graded["score"]!.GetValue<double>());

        var teacherReview = await teacher.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.Equal(4, teacherReview!["score"]!.GetValue<double>());
        Assert.Equal(4, teacherReview["answers"]![0]!["awardedPoints"]!.GetValue<double>());
        Assert.Equal("جيد", teacherReview["answers"]![0]!["teacherFeedback"]!.GetValue<string>());

        var gradeByQuestionId = await teacher.PutAsJsonAsync($"/api/submissions/{submissionId}/answers/{questionId}/grade",
            new { awardedPoints = 4, feedback = "خطأ" });
        Assert.Equal(HttpStatusCode.NotFound, gradeByQuestionId.StatusCode);

        var studentReview = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.False(studentReview!["resultsAvailable"]!.GetValue<bool>());
        Assert.True(studentReview["score"] is null);
        Assert.True(studentReview["answers"]![0]!["awardedPoints"] is null);
        Assert.True(studentReview["answers"]![0]!["teacherFeedback"] is null);
        Assert.Equal(answerId, GuidValue(studentReview["answers"]![0]!["id"]));

        await teacher.PutAsJsonAsync($"/api/exams/{examId}/state", new { action = "close" });

        var hiddenAfterClose = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.False(hiddenAfterClose!["resultsAvailable"]!.GetValue<bool>());
        Assert.True(hiddenAfterClose["score"] is null);

        await PublishResults(teacher, examId);

        var releasedReview = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.True(releasedReview!["resultsAvailable"]!.GetValue<bool>());
        Assert.Equal(4, releasedReview["score"]!.GetValue<double>());
        Assert.Equal("Reviewed", releasedReview["status"]!.GetValue<string>());
        Assert.Equal(4, releasedReview["answers"]![0]!["awardedPoints"]!.GetValue<double>());
        Assert.Equal("جيد", releasedReview["answers"]![0]!["teacherFeedback"]!.GetValue<string>());
    }

    [Fact]
    public async Task ResultsPublication_RequiresFinishedExamAndCompleteGrading_AndKeepsTeacherOwnership()
    {
        var (teacher, _) = await RegisterAndLogin(Email("publish-teacher"), "Teacher", "مدرس نشر النتائج");
        var (other, _) = await RegisterAndLogin(Email("publish-other"), "Teacher", "مدرس غير مالك");
        var (student, _) = await RegisterAndLogin(Email("publish-student"), "Student", "طالب نشر النتائج");
        await EnrollStudent(teacher, student);

        var create = await teacher.PostAsJsonAsync("/api/exams", new
        {
            title = "امتحان نشر النتائج",
            description = "وصف",
            durationMinutes = 30,
            maxAttempts = 1,
            allowResumeAfterFocusLoss = true,
            stage = DefaultStage,
            grade = DefaultGrade,
            questions = new object[]
            {
                new { text = "٢ + ٢", type = "MultipleChoice", options = new[] { "3", "4" }, correctAnswer = "4", points = 2 },
                new { text = "اشرح الفكرة", type = "Essay", options = Array.Empty<string>(), correctAnswer = (string?)null, points = 3 }
            }
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var examId = GuidValue((await ReadJson(create))["id"]);
        Assert.Equal(HttpStatusCode.OK, (await teacher.PutAsync($"/api/exams/{examId}/publish", null)).StatusCode);
        await OpenExam(teacher, examId);

        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);
        var submissionId = await StartAttempt(student, examId);
        var paper = await student.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/paper");
        var questions = paper!["questions"]!.AsArray();
        var answers = questions.Select(question => new
        {
            questionId = GuidValue(question!["id"]),
            answerText = question["type"]!.GetValue<string>() == "Essay" ? "إجابة مقالية" : "4"
        }).ToArray();
        var submit = await student.PostAsJsonAsync($"/api/submissions/{submissionId}/submit", new { answers, focusLossDetected = false });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
        var submitted = await ReadJson(submit);
        Assert.Equal("NeedsReview", submitted["status"]!.GetValue<string>());
        Assert.False(submitted["resultsAvailable"]!.GetValue<bool>());

        // Results can only be published after the exam has actually ended.
        var tooEarly = await teacher.PostAsync($"/api/exams/{examId}/results/publish", null);
        Assert.Equal(HttpStatusCode.Conflict, tooEarly.StatusCode);

        var close = await teacher.PutAsJsonAsync($"/api/exams/{examId}/state", new { action = "close" });
        Assert.Equal(HttpStatusCode.OK, close.StatusCode);

        // Closing the exam does not release results by itself.
        var hiddenAfterClose = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.False(hiddenAfterClose!["resultsAvailable"]!.GetValue<bool>());
        Assert.True(hiddenAfterClose["score"] is null);
        Assert.True(hiddenAfterClose["answers"]!.AsArray().All(answer => answer!["correctAnswer"] is null));

        // Ungraded essays block publication.
        var blocked = await teacher.PostAsync($"/api/exams/{examId}/results/publish", null);
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Contains("المقالية", (await ReadJson(blocked))["message"]!.GetValue<string>());

        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsync($"/api/exams/{examId}/results/publish", null)).StatusCode);

        var reviewRows = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/review");
        var reviewRow = reviewRows!.AsArray().Single(row => GuidValue(row!["id"]) == submissionId)!;
        var answerId = GuidValue(reviewRow["answers"]!.AsArray()
            .Single(answer => answer!["type"]!.GetValue<string>() == "Essay")!["id"]);
        var grade = await teacher.PutAsJsonAsync($"/api/submissions/{submissionId}/answers/{answerId}/grade",
            new { awardedPoints = 3, feedback = "إجابة جيدة" });
        Assert.Equal(HttpStatusCode.OK, grade.StatusCode);
        Assert.Equal("Reviewed", (await ReadJson(grade))["status"]!.GetValue<string>());

        var published = await teacher.PostAsync($"/api/exams/{examId}/results/publish", null);
        Assert.Equal(HttpStatusCode.OK, published.StatusCode);
        var publishedBody = await ReadJson(published);
        Assert.False(publishedBody["alreadyPublished"]!.GetValue<bool>());
        Assert.False(string.IsNullOrWhiteSpace(publishedBody["resultsPublishedAtUtc"]!.GetValue<string>()));

        var released = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.True(released!["resultsAvailable"]!.GetValue<bool>());
        Assert.Equal(5, released["score"]!.GetValue<double>());
        Assert.Equal(5, released["maxScore"]!.GetValue<double>());
        Assert.Equal("إجابة جيدة", released["answers"]!.AsArray()
            .Single(answer => answer!["type"]!.GetValue<string>() == "Essay")!["teacherFeedback"]!.GetValue<string>());
        Assert.Equal("4", released["answers"]!.AsArray()
            .Single(answer => answer!["type"]!.GetValue<string>() == "MultipleChoice")!["correctAnswer"]!.GetValue<string>());

        var mine = await student.GetFromJsonAsync<JsonNode>("/api/results/mine");
        var mineRow = mine!.AsArray().Single(row => GuidValue(row!["examId"]) == examId)!;
        Assert.True(mineRow["resultsAvailable"]!.GetValue<bool>());
        Assert.Equal(5, mineRow["score"]!.GetValue<double>());

        // Republishing is idempotent and keeps the original publication timestamp.
        var reissued = await teacher.PostAsync($"/api/exams/{examId}/results/publish", null);
        Assert.Equal(HttpStatusCode.OK, reissued.StatusCode);
        var reissuedBody = await ReadJson(reissued);
        Assert.True(reissuedBody["alreadyPublished"]!.GetValue<bool>());
        // SQLite loses DateTimeKind on round-trip, so compare the serialized instant ignoring
        // the optional UTC suffix instead of parsing it with the machine's local time zone.
        Assert.Equal(
            publishedBody["resultsPublishedAtUtc"]!.GetValue<string>().TrimEnd('Z'),
            reissuedBody["resultsPublishedAtUtc"]!.GetValue<string>().TrimEnd('Z'));
    }

    [Fact]
    public async Task Teacher_CanCloseExamAndFinalizeInProgressSubmission()
    {
        var teacherEmail = Email("close-teacher");
        var studentEmail = Email("close-student");
        var (teacher, _) = await RegisterAndLogin(teacherEmail, "Teacher", "مدرس إغلاق");
        var (student, studentAuth) = await RegisterAndLogin(studentEmail, "Student", "طالب إغلاق");
        await EnrollStudent(teacher, student);
        var examId = await CreatePublishedExam(teacher);
        var studentCode = StudentCode(studentAuth);
        var joined = await student.PostAsJsonAsync("/api/exams/enter-code", new { code = studentCode });
        Assert.Equal(HttpStatusCode.OK, joined.StatusCode);
        await OpenExam(teacher, examId);

        var start = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var submissionId = GuidValue((await ReadJson(start))["id"]);
        var paper = await student.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/paper");
        var answers = paper!["questions"]!.AsArray().Select(question => new
        {
            questionId = GuidValue(question!["id"]),
            answerText = question["type"]!.GetValue<string>() == "MultipleChoice" ? "4" : "صح"
        }).ToArray();
        var save = await student.PutAsJsonAsync($"/api/submissions/{submissionId}/answers", new { answers, focusLossDetected = false });
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);

        var close = await teacher.PutAsJsonAsync($"/api/exams/{examId}/state", new { action = "close" });
        Assert.Equal(HttpStatusCode.OK, close.StatusCode);
        Assert.Equal("Finished", (await ReadJson(close))["status"]!.GetValue<string>());

        var pendingResults = await student.GetFromJsonAsync<JsonNode>("/api/results/mine");
        var pendingResult = pendingResults!.AsArray().Single(x => GuidValue(x!["examId"]) == examId);
        Assert.Equal("Reviewed", pendingResult!["status"]!.GetValue<string>());
        Assert.False(pendingResult["resultsAvailable"]!.GetValue<bool>());
        Assert.True(pendingResult["score"] is null);
        Assert.True(pendingResult["maxScore"] is null);

        await PublishResults(teacher, examId);

        var results = await student.GetFromJsonAsync<JsonNode>("/api/results/mine");
        var result = results!.AsArray().Single(x => GuidValue(x!["examId"]) == examId);
        Assert.Equal("Reviewed", result!["status"]!.GetValue<string>());
        Assert.True(result["resultsAvailable"]!.GetValue<bool>());
        Assert.Equal(3, result["score"]!.GetValue<double>());
    }

    [Fact]
    public async Task Student_CannotStartWithoutBeingEnrolledByTeacher()
    {
        var teacherEmail = Email("teacher");
        var studentEmail = Email("student");
        var (teacher, _) = await RegisterAndLogin(teacherEmail, "Teacher", "مدرس");
        var (student, _) = await RegisterAndLogin(studentEmail, "Student", "طالب");
        var examId = await CreatePublishedExam(teacher);
        await OpenExam(teacher, examId);

        var start = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.Forbidden, start.StatusCode);

        var close = await teacher.PutAsJsonAsync($"/api/exams/{examId}/state", new { action = "close" });
        Assert.Equal(HttpStatusCode.OK, close.StatusCode);
        Assert.Equal("Finished", (await ReadJson(close))["status"]!.GetValue<string>());
    }

    [Fact]
    public async Task Student_OwnCode_JoinsCurrentPublishedExam_AndTeacherSeesCodeWithName()
    {
        var (teacher, teacherAuth) = await RegisterAndLogin(Email("roster-teacher"), "Teacher", "مدرس الحضور");
        var (student, studentAuth) = await RegisterAndLogin(Email("roster-student"), "Student", "سارة أحمد رستم");
        await EnrollStudent(teacher, student);
        var examId = await CreatePublishedExam(teacher);
        var studentCode = StudentCode(studentAuth);

        var beforeExam = await student.PostAsJsonAsync("/api/exams/enter-code", new { code = "999999" });
        Assert.Equal(HttpStatusCode.NotFound, beforeExam.StatusCode);

        var joined = await student.PostAsJsonAsync("/api/exams/enter-code", new { code = studentCode });
        Assert.Equal(HttpStatusCode.OK, joined.StatusCode);
        var joinResult = await ReadJson(joined);
        Assert.Equal(examId, GuidValue(joinResult["examId"]));
        Assert.Equal("Waiting", joinResult["participantStatus"]!.GetValue<string>());
        Assert.Equal(studentCode, joinResult["studentCode"]!.GetValue<string>());

        var live = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/live");
        var item = live!["items"]!.AsArray().Single();
        Assert.Equal("سارة أحمد رستم", item!["studentName"]!.GetValue<string>());
        Assert.Equal(studentCode, item["code"]!.GetValue<string>());
        Assert.Equal("Waiting", item["status"]!.GetValue<string>());
    }

    [Fact]
    public async Task Student_UsingPermanentCode_JoinsExistingTeacherGeneratedParticipantWithoutDuplication()
    {
        var (teacher, _) = await RegisterAndLogin(Email("generated-teacher"), "Teacher", "مدرس الأكواد المولدة");
        var (student, studentAuth) = await RegisterAndLogin(Email("generated-student"), "Student", "طالب الكود المولد");
        await EnrollStudent(teacher, student);
        var examId = await CreatePublishedExam(teacher);
        var me = await student.GetFromJsonAsync<JsonNode>("/api/auth/me");
        var studentId = GuidValue(me!["id"]);
        var permanentCode = StudentCode(studentAuth);

        var generate = await teacher.PostAsJsonAsync($"/api/exams/{examId}/participants/generate",
            new { studentIds = new[] { studentId } });
        Assert.Equal(HttpStatusCode.OK, generate.StatusCode);
        var generated = await ReadJson(generate);
        Assert.Equal(1, generated["generated"]!.GetValue<int>());

        var participants = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/participants");
        var participant = participants!["items"]!.AsArray().Single()!;
        var teacherGeneratedCode = participant["code"]!.GetValue<string>();
        Assert.NotEqual(permanentCode, teacherGeneratedCode);

        var joined = await student.PostAsJsonAsync("/api/exams/enter-code", new { code = permanentCode });
        Assert.Equal(HttpStatusCode.OK, joined.StatusCode);
        var joinedResult = await ReadJson(joined);
        Assert.Equal(examId, GuidValue(joinedResult["examId"]));
        Assert.Equal("Waiting", joinedResult["participantStatus"]!.GetValue<string>());

        var afterJoin = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/participants");
        Assert.Equal(1, afterJoin!["total"]!.GetValue<int>());
        Assert.Equal(teacherGeneratedCode, afterJoin["items"]!.AsArray().Single()!["code"]!.GetValue<string>());

        var joinedWithAssignedCode = await student.PostAsJsonAsync("/api/exams/enter-code", new { code = teacherGeneratedCode });
        Assert.Equal(HttpStatusCode.OK, joinedWithAssignedCode.StatusCode);
        Assert.Equal(examId, GuidValue((await ReadJson(joinedWithAssignedCode))["examId"]));
    }

    [Fact]
    public async Task Student_CannotEnterWithAnotherStudentsCode()
    {
        var (teacher, _) = await RegisterAndLogin(Email("owned-teacher"), "Teacher", "مدرس");
        var (first, firstAuth) = await RegisterAndLogin(Email("owned-first"), "Student", "الطالب الأول");
        await EnrollStudent(teacher, first);
        var (_, secondAuth) = await RegisterAndLogin(Email("owned-second"), "Student", "الطالب الثاني");
        await CreatePublishedExam(teacher);

        var otherCode = StudentCode(secondAuth);
        var firstCode = StudentCode(firstAuth);
        Assert.NotEqual(firstCode, otherCode);

        var rejected = await first.PostAsJsonAsync("/api/exams/enter-code", new { code = otherCode });
        Assert.Equal(HttpStatusCode.NotFound, rejected.StatusCode);

        var own = await first.PostAsJsonAsync("/api/exams/enter-code", new { code = firstCode });
        Assert.Equal(HttpStatusCode.OK, own.StatusCode);
        var joinedExamId = GuidValue((await ReadJson(own))["examId"]);
        Assert.NotEqual(Guid.Empty, joinedExamId);
    }

    [Fact]
    public async Task EnterCode_BeforeAnyPublishedExam_ReturnsConflict()
    {
        using var freshFactory = new ApiFactory();
        var client = freshFactory.CreateClient();
        var email = Email("idle-student");
        var register = await client.PostAsJsonAsync("/api/auth/register", new { fullName = "طالب بدون امتحان", email, password = "Passw0rd!", role = "Student", stage = DefaultStage, grade = DefaultGrade });
        Assert.Equal(HttpStatusCode.OK, register.StatusCode);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await ReadJson(login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());

        var response = await client.PostAsJsonAsync("/api/exams/enter-code", new { code = StudentCode(auth) });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await ReadJson(response);
        Assert.Contains("امتحان", body["message"]!.GetValue<string>());
    }

    [Fact]
    public async Task AvailableExams_ListsPublishedExamsFromAllTeachers_AndHidesUnavailableOnes()
    {
        var (teacherOne, _) = await RegisterAndLogin(Email("available-teacher-one"), "Teacher", "مدرس الرياضيات");
        var (teacherTwo, _) = await RegisterAndLogin(Email("available-teacher-two"), "Teacher", "مدرس الفيزياء");
        var (student, _) = await RegisterAndLogin(Email("available-student"), "Student", "طالب الامتحانات المتاحة");
        await EnrollStudent(teacherOne, student);
        await EnrollStudent(teacherTwo, student);
        var math = await CreateCustomExam(teacherOne, "امتحان الرياضيات");
        var physics = await CreateCustomExam(teacherTwo, "امتحان الفيزياء");
        var draft = await CreateCustomExam(teacherOne, "مسودة غير منشورة", publish: false);

        var response = await student.GetAsync("/api/exams/available");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var raw = await response.Content.ReadAsStringAsync();
        var body = JsonNode.Parse(raw)!;
        var items = body["items"]!.AsArray();
        var mathItem = items.Single(x => GuidValue(x!["examId"]) == math)!;
        var physicsItem = items.Single(x => GuidValue(x!["examId"]) == physics)!;
        Assert.Equal("مدرس الرياضيات", mathItem["teacherName"]!.GetValue<string>());
        Assert.Equal("مدرس الفيزياء", physicsItem["teacherName"]!.GetValue<string>());
        Assert.Equal(2, mathItem["questionCount"]!.GetValue<int>());
        Assert.DoesNotContain(items, x => GuidValue(x!["examId"]) == draft);
        Assert.DoesNotContain("joinCode", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("correctAnswer", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("studentCode", raw, StringComparison.OrdinalIgnoreCase);

        Assert.Equal(HttpStatusCode.Forbidden, (await teacherOne.GetAsync("/api/exams/available")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync("/api/exams/available")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await student.PostAsync($"/api/exams/{draft}/enter", null)).StatusCode);

        var enteredMath = await student.PostAsync($"/api/exams/{math}/enter", null);
        Assert.Equal(HttpStatusCode.OK, enteredMath.StatusCode);
        var mathSession = await ReadJson(enteredMath);
        Assert.Equal("Waiting", mathSession["participantStatus"]!.GetValue<string>());
        Assert.True(mathSession["submissionId"] is null);

        await OpenExam(teacherOne, math);
        var mathSubmission = await StartAttempt(student, math);
        await SubmitAttempt(student, math, mathSubmission);

        var afterMath = await ReadJson(await student.GetAsync("/api/exams/available"));
        var afterMathItems = afterMath["items"]!.AsArray();
        Assert.DoesNotContain(afterMathItems, x => GuidValue(x!["examId"]) == math);
        Assert.Contains(afterMathItems, x => GuidValue(x!["examId"]) == physics);
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsync($"/api/exams/{math}/enter", null)).StatusCode);

        var close = await teacherTwo.PutAsJsonAsync($"/api/exams/{physics}/state", new { action = "close" });
        Assert.Equal(HttpStatusCode.OK, close.StatusCode);
        var afterClose = await ReadJson(await student.GetAsync("/api/exams/available"));
        Assert.DoesNotContain(afterClose["items"]!.AsArray(), x => GuidValue(x!["examId"]) == physics);
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsync($"/api/exams/{physics}/enter", null)).StatusCode);
    }

    [Fact]
    public async Task EnterExamById_ResumesExistingAttempt_AndUsesRemainingAttemptsWithoutDuplication()
    {
        var (teacher, _) = await RegisterAndLogin(Email("enter-by-id-teacher"), "Teacher", "مدرس الدخول المباشر");
        var (student, _) = await RegisterAndLogin(Email("enter-by-id-student"), "Student", "طالب الدخول المباشر");
        await EnrollStudent(teacher, student);
        var examId = await CreateCustomExam(teacher, "امتحان بمحاولتين", maxAttempts: 2);

        var firstEnterResponse = await student.PostAsync($"/api/exams/{examId}/enter", null);
        Assert.Equal(HttpStatusCode.OK, firstEnterResponse.StatusCode);
        var firstEnter = await ReadJson(firstEnterResponse);
        Assert.Equal(examId, GuidValue(firstEnter["examId"]));
        Assert.Equal("Waiting", firstEnter["participantStatus"]!.GetValue<string>());
        Assert.True(firstEnter["submissionId"] is null);

        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);
        var roster = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/participants");
        Assert.Equal(1, roster!["total"]!.GetValue<int>());

        await OpenExam(teacher, examId);
        var firstAttempt = await StartAttempt(student, examId);

        var resumeEnterResponse = await student.PostAsync($"/api/exams/{examId}/enter", null);
        Assert.Equal(HttpStatusCode.OK, resumeEnterResponse.StatusCode);
        var resumeEnter = await ReadJson(resumeEnterResponse);
        Assert.Equal(firstAttempt, GuidValue(resumeEnter["submissionId"]));
        Assert.Equal("Active", resumeEnter["participantStatus"]!.GetValue<string>());
        Assert.True(resumeEnter["remainingSeconds"]!.GetValue<int>() > 0);

        var duplicateStart = await ReadJson(await student.PostAsync($"/api/exams/{examId}/start", null));
        Assert.Equal(firstAttempt, GuidValue(duplicateStart["id"]));

        await SubmitAttempt(student, examId, firstAttempt);
        var afterFirstSubmit = await ReadJson(await student.GetAsync("/api/exams/available"));
        var remainingItem = afterFirstSubmit["items"]!.AsArray().Single(x => GuidValue(x!["examId"]) == examId)!;
        Assert.Equal(1, remainingItem["attemptsUsed"]!.GetValue<int>());
        Assert.Equal(1, remainingItem["attemptsRemaining"]!.GetValue<int>());
        Assert.False(remainingItem["hasActiveAttempt"]!.GetValue<bool>());

        var nextEnter = await ReadJson(await student.PostAsync($"/api/exams/{examId}/enter", null));
        Assert.Equal("Waiting", nextEnter["participantStatus"]!.GetValue<string>());
        Assert.True(nextEnter["submissionId"] is null);

        var secondAttempt = await StartAttempt(student, examId);
        Assert.NotEqual(firstAttempt, secondAttempt);
        await SubmitAttempt(student, examId, secondAttempt);

        var exhausted = await ReadJson(await student.GetAsync("/api/exams/available"));
        Assert.DoesNotContain(exhausted["items"]!.AsArray(), x => GuidValue(x!["examId"]) == examId);
        var rejected = await student.PostAsync($"/api/exams/{examId}/enter", null);
        Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
    }

    [Fact]
    public async Task OtherTeacher_CannotManageTheExam()
    {
        var (owner, _) = await RegisterAndLogin(Email("owner"), "Teacher", "المدرس المالك");
        var (other, _) = await RegisterAndLogin(Email("other"), "Teacher", "مدرس آخر");
        var examId = await CreatePublishedExam(owner);

        var detail = await other.GetAsync($"/api/exams/{examId}");
        Assert.True(detail.StatusCode == HttpStatusCode.NotFound || detail.StatusCode == HttpStatusCode.Forbidden,
            $"Expected NotFound or Forbidden, got {detail.StatusCode}");
        var publish = await other.PutAsync($"/api/exams/{examId}/publish", null);
        Assert.True(publish.StatusCode == HttpStatusCode.NotFound || publish.StatusCode == HttpStatusCode.Forbidden,
            $"Expected NotFound or Forbidden, got {publish.StatusCode}");
    }

    [Fact]
    public async Task ExamCodeAttempts_AreRateLimitedPerAccount()
    {
        var (student, _) = await RegisterAndLogin(Email("ratelimit"), "Student", "Rate Limit Student");
        HttpResponseMessage? response = null;
        for (var attempt = 0; attempt < 16; attempt++)
            response = await student.PostAsJsonAsync("/api/exams/enter-code", new { code = "000000" });

        Assert.NotNull(response);
        Assert.Equal(HttpStatusCode.TooManyRequests, response!.StatusCode);
        Assert.Equal("60", response.Headers.GetValues("Retry-After").Single());
    }

    [Fact]
    public async Task AdminReset_DisabledInProductionByDefault()
    {
        using var productionFactory = new ProductionStartupFactory();
        var client = productionFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "dummy-token");
        var response = await client.PostAsync("/api/admin/reset", null);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task AdminReset_RequiresAdminRole()
    {
        // In Development, admin reset is enabled but requires proper auth.
        // This test verifies that a non-admin role gets forbidden.
        var (teacher, teacherAuth) = await RegisterAndLogin(Email("admin-reset-teacher"), "Teacher", "مدرس اختبار");
        var client = teacher;
        var response = await client.PostAsync("/api/admin/reset", null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task StudentCodeGeneration_HandlesCollisions()
    {
        // Register multiple students and verify all have unique 6-digit codes.
        var client = factory.CreateClient();
        var codes = new HashSet<string>();
        for (var i = 0; i < 10; i++)
        {
            var email = Email($"collision-{i}");
            var register = await client.PostAsJsonAsync("/api/auth/register", new
            {
                fullName = $"طالب ت撞{i}",
                email,
                password = "Passw0rd!",
                role = "Student",
                stage = DefaultStage,
                grade = DefaultGrade
            });
            Assert.Equal(HttpStatusCode.OK, register.StatusCode);
            var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!" });
            var auth = await ReadJson(login);
            var code = auth["studentCode"]!.GetValue<string>();
            Assert.Matches("^[0-9]{6}$", code);
            Assert.True(codes.Add(code), $"Duplicate code detected: {code}");
        }
    }

    [Fact]
    public async Task ParticipantViews_Pagination_Works()
    {
        var (teacher, _) = await RegisterAndLogin(Email("pag-teacher"), "Teacher", "مدرس تجزئة");
        var examId = await CreatePublishedExam(teacher);

        // Register multiple students and have them join.
        for (var i = 0; i < 5; i++)
        {
            var (student, studentAuth) = await RegisterAndLogin(Email($"pag-student-{i}"), "Student", $"طالب تجزئة {i}");
            await EnrollStudent(teacher, student);
            var code = StudentCode(studentAuth);
            var joined = await student.PostAsJsonAsync("/api/exams/enter-code", new { code });
            Assert.Equal(HttpStatusCode.OK, joined.StatusCode);
        }

        // Test pagination.
        var participantsPage1 = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/participants?page=1&pageSize=2");
        Assert.NotNull(participantsPage1);
        var items = participantsPage1["items"]!.AsArray();
        Assert.Equal(2, items.Count);
        Assert.Equal(5, participantsPage1["total"]!.GetValue<int>());
        Assert.Equal(1, participantsPage1["page"]!.GetValue<int>());
        Assert.Equal(2, participantsPage1["pageSize"]!.GetValue<int>());

        var participantsPage2 = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/participants?page=2&pageSize=2");
        items = participantsPage2!["items"]!.AsArray();
        Assert.Equal(2, items.Count);
    }

    [Fact]
    public async Task ConcurrentAutosaveVsSubmit_CoherenceMaintained()
    {
        var (teacher, _) = await RegisterAndLogin(Email("concurrent"), "Teacher", "مدرس تزامن");
        var (student, studentAuth) = await RegisterAndLogin(Email("concurrent-student"), "Student", "طالب تزامن");
        await EnrollStudent(teacher, student);
        var examId = await CreatePublishedExam(teacher);
        var code = StudentCode(studentAuth);

        await student.PostAsJsonAsync("/api/exams/enter-code", new { code });
        await OpenExam(teacher, examId);

        // Start exam.
        var start = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var started = await ReadJson(start);
        var submissionId = GuidValue(started["id"]);

        // Simulate concurrent autosave and submit.
        var answers = new[] { new { questionId = Guid.NewGuid(), answerText = "4" } };
        var saveTask = student.PutAsJsonAsync($"/api/submissions/{submissionId}/answers", new { answers, focusLossDetected = false });
        var submitTask = student.PostAsJsonAsync($"/api/submissions/{submissionId}/submit", new { answers, focusLossDetected = false });
        await Task.WhenAll(saveTask, submitTask);
        var saveResult = await saveTask;
        var submitResult = await submitTask;

        // Either save succeeds (200) or conflicts (409), submit must return 200.
        Assert.Contains(saveResult.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict });
        Assert.Equal(HttpStatusCode.OK, submitResult.StatusCode);

        // Verify final state is consistent.
        var review = await student.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.NotNull(review);
        Assert.Contains(review["status"]!.GetValue<string>(), new[] { "Reviewed", "NeedsReview" });
    }

    [Fact]
    public async Task FinalizeExpired_IdempotentOnRepeatedCalls()
    {
        var (teacher, _) = await RegisterAndLogin(Email("finalize"), "Teacher", "مدرس إنهاء");
        var (student, studentAuth) = await RegisterAndLogin(Email("finalize-student"), "Student", "طالب إنهاء");
        await EnrollStudent(teacher, student);
        var examId = await CreatePublishedExam(teacher);
        var code = StudentCode(studentAuth);

        var entered = await student.PostAsJsonAsync("/api/exams/enter-code", new { code });
        Assert.Equal(HttpStatusCode.OK, entered.StatusCode);
        await OpenExam(teacher, examId);

        // Start and immediately close (bypassing time).
        var start = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var close = await teacher.PutAsJsonAsync($"/api/exams/{examId}/state", new { action = "close" });
        Assert.Equal(HttpStatusCode.OK, close.StatusCode);

        // Call finalization multiple times - should not error.
        await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/live");
        await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/live");

        // Verify submission is still in correct state.
        var results = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/results");
        Assert.NotNull(results);
        Assert.Equal(1, results["total"]!.GetValue<int>());
    }

    [Fact]
    public async Task AvailabilityWindow_BlocksOutsideAndCapsRemainingTime()
    {
        var (teacher, _) = await RegisterAndLogin(Email("availability-teacher"), "Teacher", "مدرس الإتاحة");
        var (student, _) = await RegisterAndLogin(Email("availability-student"), "Student", "طالب الإتاحة");
        await EnrollStudent(teacher, student);

        async Task<Guid> CreateWindowExam(string title, DateTime? from, DateTime? until)
        {
            var create = await teacher.PostAsJsonAsync("/api/exams", new
            {
                title,
                description = "نافذة إتاحة",
                durationMinutes = 30,
                maxAttempts = 1,
                allowResumeAfterFocusLoss = true,
                availableFromUtc = from,
                availableUntilUtc = until,
                stage = DefaultStage,
                grade = DefaultGrade,
                questions = new object[]
                {
                    new { text = "٢ + ٢", type = "MultipleChoice", options = new[] { "3", "4" }, correctAnswer = "4", points = 1 }
                }
            });
            Assert.Equal(HttpStatusCode.Created, create.StatusCode);
            var id = GuidValue((await ReadJson(create))["id"]);
            Assert.Equal(HttpStatusCode.OK, (await teacher.PutAsync($"/api/exams/{id}/publish", null)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{id}/enter", null)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await teacher.PutAsJsonAsync($"/api/exams/{id}/state", new { action = "open" })).StatusCode);
            return id;
        }

        var now = DateTime.UtcNow;
        var openExam = await CreateWindowExam("نافذة مفتوحة", now.AddHours(-1), now.AddMinutes(10));
        var started = await student.PostAsync($"/api/exams/{openExam}/start", null);
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        var remaining = (await ReadJson(started))["remainingSeconds"]!.GetValue<int>();
        Assert.InRange(remaining, 540, 600);

        var expiredExam = await CreateWindowExam("نافذة منتهية", now.AddHours(-2), now.AddMinutes(-1));
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsync($"/api/exams/{expiredExam}/start", null)).StatusCode);

        var futureExam = await CreateWindowExam("نافذة مستقبلية", now.AddHours(1), now.AddHours(2));
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsync($"/api/exams/{futureExam}/start", null)).StatusCode);

        var other = await RegisterAndLogin(Email("availability-other-teacher"), "Teacher", "مدرس آخر");
        Assert.Equal(HttpStatusCode.NotFound,
            (await other.Item1.PutAsJsonAsync($"/api/exams/{openExam}/availability", new { availableUntilUtc = now.AddHours(3) })).StatusCode);
    }

    [Fact]
    public async Task Enrollment_IsRequiredAndOnlyTeacherCanDecide()
    {
        var (teacher, _) = await RegisterAndLogin(Email("enroll-teacher"), "Teacher", "مدرس التسجيل");
        var (student, studentAuth) = await RegisterAndLogin(Email("enroll-student"), "Student", "طالب التسجيل");
        await CreatePublishedExam(teacher);

        var available = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.Empty(available!["items"]!.AsArray());

        var request = await student.PostAsync($"/api/teachers/{GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"])}/request", null);
        Assert.Equal(HttpStatusCode.OK, request.StatusCode);
        var duplicate = await student.PostAsync($"/api/teachers/{GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"])}/request", null);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);

        var requests = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/requests");
        var row = requests!.AsArray().First(item => item!["status"]!.GetValue<string>() == "Pending");
        var requestId = GuidValue(row!["id"]);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PutAsJsonAsync($"/api/teacher/requests/{requestId}", new { action = "accept" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/teacher/requests")).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await teacher.PutAsJsonAsync($"/api/teacher/requests/{requestId}", new { action = "accept" })).StatusCode);
        var afterAccept = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.NotEmpty(afterAccept!["items"]!.AsArray());
    }

    [Fact]
    public async Task TeacherStudents_SingleExamBan_BlocksOnlyThatExamAndKeepsAttempt()
    {
        var (teacher, _) = await RegisterAndLogin(Email("exam-ban-teacher"), "Teacher", "مدرس منع الامتحان");
        var (student, _) = await RegisterAndLogin(Email("exam-ban-student"), "Student", "طالب منع الامتحان");
        var (otherTeacher, _) = await RegisterAndLogin(Email("exam-ban-other-teacher"), "Teacher", "مدرس آخر للمنع");
        await EnrollStudent(teacher, student);
        var bannedExam = await CreateCustomExam(teacher, "امتحان ممنوع");
        var allowedExam = await CreateCustomExam(teacher, "امتحان مسموح");

        var studentMe = await student.GetFromJsonAsync<JsonNode>("/api/auth/me");
        var studentId = GuidValue(studentMe!["id"]);
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);

        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/teacher/students")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{bannedExam}/enter", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{allowedExam}/enter", null)).StatusCode);
        await OpenExam(teacher, bannedExam);
        await OpenExam(teacher, allowedExam);
        var submissionId = await StartAttempt(student, bannedExam);

        // A teacher can only ban students from their own exams, and only linked students.
        var foreignExam = await CreateCustomExam(otherTeacher, "امتحان مدرس آخر");
        Assert.Equal(HttpStatusCode.NotFound,
            (await teacher.PostAsJsonAsync($"/api/teacher/students/{studentId}/exam-bans", new { examId = foreignExam })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherTeacher.PostAsJsonAsync($"/api/teacher/students/{studentId}/exam-bans", new { examId = bannedExam })).StatusCode);

        var ban = await teacher.PostAsJsonAsync($"/api/teacher/students/{studentId}/exam-bans", new { examId = bannedExam });
        Assert.Equal(HttpStatusCode.OK, ban.StatusCode);
        Assert.True((await ReadJson(ban))["isBanned"]!.GetValue<bool>());
        var duplicate = await teacher.PostAsJsonAsync($"/api/teacher/students/{studentId}/exam-bans", new { examId = bannedExam });
        Assert.Equal(HttpStatusCode.OK, duplicate.StatusCode);
        Assert.True((await ReadJson(duplicate))["alreadyBanned"]!.GetValue<bool>());

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(1, await db.TeacherStudentExamBans.CountAsync(x => x.ExamId == bannedExam && x.StudentId == studentId));
        }

        var available = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.DoesNotContain(available!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == bannedExam);
        Assert.Contains(available["items"]!.AsArray(), x => GuidValue(x!["examId"]) == allowedExam);
        var examList = await student.GetFromJsonAsync<JsonNode>("/api/exams?page=1&pageSize=100");
        Assert.DoesNotContain(examList!["items"]!.AsArray(), x => GuidValue(x!["id"]) == bannedExam);
        Assert.Contains(examList["items"]!.AsArray(), x => GuidValue(x!["id"]) == allowedExam);

        // Every entry path is blocked for the banned exam, including the existing attempt.
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync($"/api/exams/{bannedExam}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsync($"/api/exams/{bannedExam}/enter", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync($"/api/exams/{bannedExam}/session")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync($"/api/exams/{bannedExam}/paper")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsync($"/api/exams/{bannedExam}/start", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PutAsJsonAsync($"/api/submissions/{submissionId}/answers",
            new { answers = Array.Empty<object>(), focusLossDetected = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsJsonAsync($"/api/submissions/{submissionId}/submit",
            new { answers = Array.Empty<object>(), focusLossDetected = false })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await student.GetAsync($"/api/exams/{allowedExam}")).StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal("InProgress", (await db.Submissions.SingleAsync(x => x.Id == submissionId)).Status);
        }

        var teacherList = await teacher.GetFromJsonAsync<JsonNode>(
            $"/api/teacher/students?search={Uri.EscapeDataString("طالب")}&stage={Uri.EscapeDataString(DefaultStage)}&grade={Uri.EscapeDataString(DefaultGrade)}");
        var row = teacherList!["items"]!.AsArray().Single(x => GuidValue(x!["studentId"]) == studentId);
        Assert.Equal("Banned", row!["status"]!.GetValue<string>());
        Assert.Equal(1, row["bannedExamCount"]!.GetValue<int>());
        Assert.Contains(row["bannedExams"]!.AsArray(), x => GuidValue(x!["examId"]) == bannedExam);
        Assert.Equal(1, teacherList["summary"]!["banned"]!.GetValue<int>());

        var detail = await teacher.GetFromJsonAsync<JsonNode>($"/api/teacher/students/{studentId}");
        Assert.Equal("Banned", detail!["status"]!.GetValue<string>());
        var detailExam = detail["exams"]!.AsArray().Single(x => GuidValue(x!["examId"]) == bannedExam);
        Assert.True(detailExam!["isBanned"]!.GetValue<bool>());
        Assert.True(detailExam["attemptsCount"]!.GetValue<int>() >= 1);

        var unban = await teacher.DeleteAsync($"/api/teacher/students/{studentId}/exam-bans/{bannedExam}");
        Assert.Equal(HttpStatusCode.OK, unban.StatusCode);
        var afterUnban = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.Contains(afterUnban!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == bannedExam);
        Assert.Equal(HttpStatusCode.OK, (await student.GetAsync($"/api/exams/{bannedExam}")).StatusCode);

        var otherList = await otherTeacher.GetFromJsonAsync<JsonNode>("/api/teacher/students");
        Assert.Empty(otherList!["items"]!.AsArray());
    }

    [Fact]
    public async Task TeacherStudents_SuspendAndReactivate_BlockAndRestoreEveryExamPath()
    {
        var (teacher, _) = await RegisterAndLogin(Email("suspend-teacher"), "Teacher", "مدرس إيقاف الطالب");
        var (student, _) = await RegisterAndLogin(Email("suspend-student"), "Student", "طالب الإيقاف");
        await EnrollStudent(teacher, student);
        var firstExam = await CreateCustomExam(teacher, "امتحان الإيقاف الأول");
        var secondExam = await CreateCustomExam(teacher, "امتحان الإيقاف الثاني");
        var studentId = GuidValue((await student.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);

        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{firstExam}/enter", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{secondExam}/enter", null)).StatusCode);
        await OpenExam(teacher, firstExam);
        await OpenExam(teacher, secondExam);
        var submissionId = await StartAttempt(student, firstExam);

        var suspend = await teacher.PostAsync($"/api/teacher/students/{studentId}/suspend", null);
        Assert.Equal(HttpStatusCode.OK, suspend.StatusCode);
        Assert.Equal("Suspended", (await ReadJson(suspend))["status"]!.GetValue<string>());
        var duplicateSuspend = await teacher.PostAsync($"/api/teacher/students/{studentId}/suspend", null);
        Assert.Equal(HttpStatusCode.OK, duplicateSuspend.StatusCode);
        Assert.True((await ReadJson(duplicateSuspend))["alreadySuspended"]!.GetValue<bool>());

        var teacherList = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/students");
        Assert.Equal("Suspended",
            teacherList!["items"]!.AsArray().Single(x => GuidValue(x!["studentId"]) == studentId)!["status"]!.GetValue<string>());
        Assert.True(teacherList["summary"]!["suspended"]!.GetValue<int>() >= 1);

        var available = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.Empty(available!["items"]!.AsArray());
        foreach (var examId in new[] { firstExam, secondExam })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync($"/api/exams/{examId}")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync($"/api/exams/{examId}/session")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync($"/api/exams/{examId}/paper")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsync($"/api/exams/{examId}/start", null)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PutAsJsonAsync($"/api/submissions/{submissionId}/answers",
            new { answers = Array.Empty<object>(), focusLossDetected = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsJsonAsync($"/api/submissions/{submissionId}/submit",
            new { answers = Array.Empty<object>(), focusLossDetected = false })).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal("InProgress", (await db.Submissions.SingleAsync(x => x.Id == submissionId)).Status);
        }

        var reactivate = await teacher.PostAsync($"/api/teacher/students/{studentId}/reactivate", null);
        Assert.Equal(HttpStatusCode.OK, reactivate.StatusCode);
        Assert.Equal("Active", (await ReadJson(reactivate))["status"]!.GetValue<string>());
        var afterReactivate = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.Contains(afterReactivate!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == firstExam);
        Assert.Contains(afterReactivate["items"]!.AsArray(), x => GuidValue(x!["examId"]) == secondExam);
        Assert.Equal(HttpStatusCode.OK, (await student.GetAsync($"/api/exams/{firstExam}/session")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await student.GetAsync($"/api/exams/{firstExam}/paper")).StatusCode);

        // The rejected submit must not leave the attempt stuck in Processing.
        await SubmitAttempt(student, firstExam, submissionId);
    }

    [Fact]
    public async Task TeacherStudents_Unlink_PreservesHistoryAndOtherTeacherLinks()
    {
        var (teacher, _) = await RegisterAndLogin(Email("unlink-teacher"), "Teacher", "مدرس فك الارتباط");
        var (otherTeacher, _) = await RegisterAndLogin(Email("unlink-other-teacher"), "Teacher", "مدرس آخر لفك الارتباط");
        var (student, _) = await RegisterAndLogin(Email("unlink-student"), "Student", "طالب فك الارتباط");
        await EnrollStudent(teacher, student);
        await EnrollStudent(otherTeacher, student);
        var teacherExam = await CreateCustomExam(teacher, "امتحان المدرس الأول");
        var otherExam = await CreateCustomExam(otherTeacher, "امتحان المدرس الثاني");

        var studentMe = await student.GetFromJsonAsync<JsonNode>("/api/auth/me");
        var studentId = GuidValue(studentMe!["id"]);
        var studentEmail = studentMe["email"]!.GetValue<string>();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);

        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{teacherExam}/enter", null)).StatusCode);
        await OpenExam(teacher, teacherExam);
        var submissionId = await StartAttempt(student, teacherExam);
        await SubmitAttempt(student, teacherExam, submissionId);

        Assert.Equal(HttpStatusCode.OK,
            (await teacher.PostAsJsonAsync($"/api/teacher/students/{studentId}/exam-bans", new { examId = teacherExam })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherTeacher.PostAsJsonAsync($"/api/teacher/students/{studentId}/exam-bans", new { examId = teacherExam })).StatusCode);

        var unlink = await teacher.DeleteAsync($"/api/teacher/students/{studentId}");
        Assert.Equal(HttpStatusCode.OK, unlink.StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var relationship = await db.TeacherStudentRequests.SingleAsync(x => x.TeacherId == teacherId && x.StudentId == studentId);
            Assert.Equal("Accepted", relationship.Status);
            Assert.NotNull(relationship.UnlinkedAtUtc);
            Assert.Null(relationship.SuspendedAtUtc);
            Assert.False(await db.TeacherStudentExamBans.AnyAsync(x => x.TeacherId == teacherId && x.StudentId == studentId));
            Assert.True(await db.Submissions.AnyAsync(x => x.Id == submissionId));
            Assert.True(await db.Users.AnyAsync(x => x.Id == studentId));
        }

        Assert.Equal(HttpStatusCode.OK, (await student.GetAsync("/api/auth/me")).StatusCode);
        var teacherList = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/students");
        Assert.DoesNotContain(teacherList!["items"]!.AsArray(), x => GuidValue(x!["studentId"]) == studentId);
        Assert.Equal(HttpStatusCode.NotFound, (await teacher.GetAsync($"/api/teacher/students/{studentId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await teacher.DeleteAsync($"/api/teacher/students/{studentId}")).StatusCode);

        var otherList = await otherTeacher.GetFromJsonAsync<JsonNode>("/api/teacher/students");
        Assert.Contains(otherList!["items"]!.AsArray(), x => GuidValue(x!["studentId"]) == studentId);
        Assert.Equal(HttpStatusCode.OK, (await student.GetAsync($"/api/exams/{otherExam}")).StatusCode);
        var available = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.DoesNotContain(available!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == teacherExam);
        Assert.Contains(available["items"]!.AsArray(), x => GuidValue(x!["examId"]) == otherExam);

        var results = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{teacherExam}/results");
        Assert.Equal(1, results!["total"]!.GetValue<int>());
        Assert.Equal(studentEmail, results["items"]!.AsArray().Single()!["email"]!.GetValue<string>());

        var directory = await student.GetFromJsonAsync<JsonNode>("/api/teachers");
        Assert.Equal("Unlinked",
            directory!.AsArray().Single(x => GuidValue(x!["id"]) == teacherId)!["requestStatus"]!.GetValue<string>());

        var reopen = await student.PostAsync($"/api/teachers/{teacherId}/request", null);
        Assert.Equal(HttpStatusCode.OK, reopen.StatusCode);
        Assert.Equal("Pending", (await ReadJson(reopen))["status"]!.GetValue<string>());
        var pending = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/requests");
        var pendingRow = pending!.AsArray().Single(x =>
            x!["studentEmail"]!.GetValue<string>() == studentEmail && x["status"]!.GetValue<string>() == "Pending");
        Assert.Equal(HttpStatusCode.OK,
            (await teacher.PutAsJsonAsync($"/api/teacher/requests/{GuidValue(pendingRow!["id"])}", new { action = "accept" })).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var relationship = await db.TeacherStudentRequests.SingleAsync(x => x.TeacherId == teacherId && x.StudentId == studentId);
            Assert.Equal("Accepted", relationship.Status);
            Assert.Null(relationship.UnlinkedAtUtc);
        }

        var relinked = await teacher.GetFromJsonAsync<JsonNode>($"/api/teacher/students/{studentId}");
        Assert.Equal("Active", relinked!["status"]!.GetValue<string>());
        var relinkedExam = relinked["exams"]!.AsArray().Single(x => GuidValue(x!["examId"]) == teacherExam);
        Assert.Equal(1, relinkedExam!["attemptsCount"]!.GetValue<int>());
        Assert.False(relinkedExam["isBanned"]!.GetValue<bool>());
        Assert.Equal(HttpStatusCode.OK, (await student.GetAsync($"/api/exams/{teacherExam}")).StatusCode);
    }

    [Fact]
    public async Task Registration_ValidatesStudentStageAndGrade()
    {
        using var anonymous = factory.CreateClient();

        var missing = await anonymous.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "طالب بلا مرحلة",
            email = Email("education-missing"),
            password = "Passw0rd!",
            role = "Student"
        });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);

        var mismatched = await anonymous.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "طالب مرحلة غير متطابقة",
            email = Email("education-mismatched"),
            password = "Passw0rd!",
            role = "Student",
            stage = "ثانوي",
            grade = "الصف الأول الابتدائي"
        });
        Assert.Equal(HttpStatusCode.BadRequest, mismatched.StatusCode);

        var email = Email("education-valid");
        var valid = await anonymous.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "طالب مرحلة صحيحة",
            email,
            password = "Passw0rd!",
            role = "Student",
            stage = DefaultStage,
            grade = DefaultGrade
        });
        Assert.Equal(HttpStatusCode.OK, valid.StatusCode);

        var login = await anonymous.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await ReadJson(login);
        Assert.Equal(DefaultStage, auth["stage"]!.GetValue<string>());
        Assert.Equal(DefaultGrade, auth["grade"]!.GetValue<string>());

        var teacher = await anonymous.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "مدرس بلا مرحلة",
            email = Email("education-teacher"),
            password = "Passw0rd!",
            role = "Teacher"
        });
        Assert.Equal(HttpStatusCode.OK, teacher.StatusCode);
    }

    [Fact]
    public async Task ExamCreation_ValidatesAndPersistsStageAndGrade()
    {
        var (teacher, _) = await RegisterAndLogin(Email("exam-education-teacher"), "Teacher", "مدرس مرحلة الامتحان");

        async Task<HttpResponseMessage> Create(string? stage, string? grade) => await teacher.PostAsJsonAsync("/api/exams", new
        {
            title = "امتحان التحقق من المرحلة",
            description = "وصف",
            durationMinutes = 20,
            maxAttempts = 1,
            allowResumeAfterFocusLoss = true,
            stage,
            grade,
            questions = new object[]
            {
                new { text = "٢ + ٢", type = "MultipleChoice", options = new[] { "3", "4" }, correctAnswer = "4", points = 1 }
            }
        });

        Assert.Equal(HttpStatusCode.BadRequest, (await Create(null, null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create("ثانوي", "الصف الأول الابتدائي")).StatusCode);

        var created = await Create(DefaultStage, DefaultGrade);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var body = await ReadJson(created);
        Assert.Equal(DefaultStage, body["stage"]!.GetValue<string>());
        Assert.Equal(DefaultGrade, body["grade"]!.GetValue<string>());

        var detail = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{GuidValue(body["id"])}");
        Assert.Equal(DefaultStage, detail!["stage"]!.GetValue<string>());
        Assert.Equal(DefaultGrade, detail["grade"]!.GetValue<string>());
    }

    [Fact]
    public async Task AvailableExams_RequiresEnrollmentAndMatchingStageGrade()
    {
        var (teacher, _) = await RegisterAndLogin(Email("eligibility-teacher"), "Teacher", "مدرس الأهلية");
        var (matching, _) = await RegisterAndLogin(Email("eligibility-matching"), "Student", "طالب مطابق");
        var (mismatched, _) = await RegisterAndLogin(Email("eligibility-mismatched"), "Student", "طالب مرحلة أخرى", "ابتدائي", "الصف الأول الابتدائي");
        var (outsider, _) = await RegisterAndLogin(Email("eligibility-outsider"), "Student", "طالب غير مسجل");
        await EnrollStudent(teacher, matching);
        await EnrollStudent(teacher, mismatched);
        var examId = await CreateCustomExam(teacher, "امتحان الأهلية");

        var matchingAvailable = await matching.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.Contains(matchingAvailable!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == examId);
        var mismatchedAvailable = await mismatched.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.DoesNotContain(mismatchedAvailable!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == examId);
        var outsiderAvailable = await outsider.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.DoesNotContain(outsiderAvailable!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == examId);

        var matchingDetail = await matching.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}");
        Assert.Equal(DefaultStage, matchingDetail!["stage"]!.GetValue<string>());
        Assert.Equal(DefaultGrade, matchingDetail["grade"]!.GetValue<string>());

        Assert.Equal(HttpStatusCode.Forbidden, (await mismatched.GetAsync($"/api/exams/{examId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await mismatched.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync($"/api/exams/{examId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);

        var entered = await matching.PostAsync($"/api/exams/{examId}/enter", null);
        Assert.Equal(HttpStatusCode.OK, entered.StatusCode);
        await OpenExam(teacher, examId);
        var submissionId = await StartAttempt(matching, examId);

        // Changing the student's stage/grade must immediately block every attempt path.
        var update = await matching.PutAsJsonAsync("/api/auth/profile/education", new
        {
            stage = "ابتدائي",
            grade = "الصف الأول الابتدائي"
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden, (await matching.PostAsync($"/api/exams/{examId}/start", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await matching.GetAsync($"/api/exams/{examId}/paper")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await matching.GetAsync($"/api/exams/{examId}/session")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await matching.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await matching.PutAsJsonAsync($"/api/submissions/{submissionId}/answers",
            new { answers = Array.Empty<object>(), focusLossDetected = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await matching.PostAsJsonAsync($"/api/submissions/{submissionId}/submit",
            new { answers = Array.Empty<object>(), focusLossDetected = false })).StatusCode);
    }

    [Fact]
    public async Task LegacyStudent_CanCompleteEducationProfileWithoutLosingAccount()
    {
        var (teacher, _) = await RegisterAndLogin(Email("legacy-teacher"), "Teacher", "مدرس الطالب القديم");
        var (student, auth) = await RegisterAndLogin(Email("legacy-student"), "Student", "طالب قديم");
        await EnrollStudent(teacher, student);
        var examId = await CreateCustomExam(teacher, "امتحان بعد استكمال البيانات");

        // Simulate an account created before the education fields existed.
        var email = auth["email"]!.GetValue<string>();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = await db.Users.SingleAsync(x => x.Email == email);
            user.Stage = null;
            user.Grade = null;
            await db.SaveChangesAsync();
        }

        var me = await student.GetFromJsonAsync<JsonNode>("/api/auth/me");
        Assert.True(me!["stage"] is null);
        Assert.True(me["grade"] is null);
        var beforeCompletion = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.DoesNotContain(beforeCompletion!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == examId);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);

        var invalid = await student.PutAsJsonAsync("/api/auth/profile/education", new
        {
            stage = "ثانوي",
            grade = "الصف الأول الابتدائي"
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var update = await student.PutAsJsonAsync("/api/auth/profile/education", new
        {
            stage = DefaultStage,
            grade = DefaultGrade
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updated = await ReadJson(update);
        Assert.Equal(DefaultStage, updated["stage"]!.GetValue<string>());
        Assert.Equal(DefaultGrade, updated["grade"]!.GetValue<string>());

        var refreshed = await student.GetFromJsonAsync<JsonNode>("/api/auth/me");
        Assert.Equal(DefaultStage, refreshed!["stage"]!.GetValue<string>());
        Assert.Equal(DefaultGrade, refreshed["grade"]!.GetValue<string>());

        var login = await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var newAuth = await ReadJson(login);
        Assert.Equal(DefaultStage, newAuth["stage"]!.GetValue<string>());
        Assert.Equal(DefaultGrade, newAuth["grade"]!.GetValue<string>());

        var afterCompletion = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.Contains(afterCompletion!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == examId);
        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);
    }

    [Fact]
    public async Task DirectEntryWithoutCode_BindsAttemptToAuthenticatedStudent_AndRejectsSubmissionTampering()
    {
        var (teacher, _) = await RegisterAndLogin(Email("binding-teacher"), "Teacher", "مدرس ربط المحاولة");
        var (first, _) = await RegisterAndLogin(Email("binding-first"), "Student", "الطالب الأول");
        var (second, _) = await RegisterAndLogin(Email("binding-second"), "Student", "الطالب الثاني");
        await EnrollStudent(teacher, first);
        await EnrollStudent(teacher, second);
        var examId = await CreatePublishedExam(teacher);

        var firstEnter = await first.PostAsync($"/api/exams/{examId}/enter", null);
        Assert.Equal(HttpStatusCode.OK, firstEnter.StatusCode);
        var firstSession = await ReadJson(firstEnter);
        Assert.Equal(examId, GuidValue(firstSession["examId"]));
        Assert.Equal("Waiting", firstSession["participantStatus"]!.GetValue<string>());
        Assert.True(firstSession["submissionId"] is null);

        await OpenExam(teacher, examId);
        var firstSubmission = await StartAttempt(first, examId);

        var secondEnter = await second.PostAsync($"/api/exams/{examId}/enter", null);
        Assert.Equal(HttpStatusCode.OK, secondEnter.StatusCode);
        Assert.True((await ReadJson(secondEnter))["submissionId"] is null);
        var secondSubmission = await StartAttempt(second, examId);
        Assert.NotEqual(firstSubmission, secondSubmission);

        var secondPaper = await second.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/paper");
        Assert.Equal(secondSubmission, GuidValue(secondPaper!["submission"]!["id"]));

        Assert.Equal(HttpStatusCode.Forbidden, (await second.GetAsync($"/api/submissions/{firstSubmission}/review")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await second.PutAsJsonAsync($"/api/submissions/{firstSubmission}/answers",
            new { answers = Array.Empty<object>(), focusLossDetected = false })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await second.PostAsJsonAsync($"/api/submissions/{firstSubmission}/submit",
            new { answers = Array.Empty<object>(), focusLossDetected = false })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await second.PostAsJsonAsync($"/api/submissions/{firstSubmission}/events",
            new { type = "focus-loss" })).StatusCode);

        await SubmitAttempt(first, examId, firstSubmission);
        var hiddenReview = await first.GetFromJsonAsync<JsonNode>($"/api/submissions/{firstSubmission}/review");
        Assert.False(hiddenReview!["resultsAvailable"]!.GetValue<bool>());
        Assert.True(hiddenReview["score"] is null);
        Assert.True(hiddenReview["answers"]![0]!["correctAnswer"] is null);
        Assert.True(hiddenReview["answers"]![0]!["awardedPoints"] is null);
        Assert.False(string.IsNullOrWhiteSpace(hiddenReview["answers"]![0]!["studentAnswer"]!.GetValue<string>()));

        var close = await teacher.PutAsJsonAsync($"/api/exams/{examId}/state", new { action = "close" });
        Assert.Equal(HttpStatusCode.OK, close.StatusCode);

        var hiddenAfterClose = await first.GetFromJsonAsync<JsonNode>($"/api/submissions/{firstSubmission}/review");
        Assert.False(hiddenAfterClose!["resultsAvailable"]!.GetValue<bool>());
        Assert.True(hiddenAfterClose["score"] is null);

        await PublishResults(teacher, examId);

        var releasedReview = await first.GetFromJsonAsync<JsonNode>($"/api/submissions/{firstSubmission}/review");
        Assert.True(releasedReview!["resultsAvailable"]!.GetValue<bool>());
        Assert.Equal(3, releasedReview["score"]!.GetValue<double>());
        Assert.Equal("4", releasedReview["answers"]![0]!["correctAnswer"]!.GetValue<string>());
        Assert.Equal(2, releasedReview["answers"]![0]!["awardedPoints"]!.GetValue<double>());

        var results = await teacher.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/results");
        var firstRow = results!["items"]!.AsArray().Single(x => GuidValue(x!["id"]) == firstSubmission)!;
        Assert.Equal("الطالب الأول", firstRow["student"]!.GetValue<string>());
        Assert.Equal(3, firstRow["score"]!.GetValue<double>());
    }

    [Fact]
    public async Task OtherTeacher_CannotAccessExamRosterResultsOrSubmission()
    {
        var (owner, _) = await RegisterAndLogin(Email("isolation-owner"), "Teacher", "المدرس المالك");
        var (other, _) = await RegisterAndLogin(Email("isolation-other"), "Teacher", "مدرس غير مصرح");
        var (student, _) = await RegisterAndLogin(Email("isolation-student"), "Student", "طالب العزل");
        await EnrollStudent(owner, student);
        var examId = await CreatePublishedExam(owner);
        await student.PostAsync($"/api/exams/{examId}/enter", null);
        await OpenExam(owner, examId);
        var submissionId = await StartAttempt(student, examId);
        await SubmitAttempt(student, examId, submissionId);

        var ownerReview = await owner.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.Equal(3, ownerReview!["score"]!.GetValue<double>());
        Assert.Equal("4", ownerReview["answers"]![0]!["correctAnswer"]!.GetValue<string>());
        var answerId = GuidValue(ownerReview["answers"]![0]!["id"]);

        Assert.Contains((await other.GetAsync($"/api/exams/{examId}")).StatusCode,
            new[] { HttpStatusCode.NotFound, HttpStatusCode.Forbidden });
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/exams/{examId}/live")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/exams/{examId}/participants")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/exams/{examId}/results")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/exams/{examId}/review")).StatusCode);
        Assert.Contains((await other.GetAsync($"/api/exams/{examId}/export")).StatusCode,
            new[] { HttpStatusCode.NotFound, HttpStatusCode.Forbidden });
        Assert.Contains((await other.PutAsJsonAsync($"/api/exams/{examId}/state", new { action = "close" })).StatusCode,
            new[] { HttpStatusCode.NotFound, HttpStatusCode.Forbidden });

        Assert.Equal(HttpStatusCode.Forbidden, (await other.GetAsync($"/api/submissions/{submissionId}/review")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PutAsJsonAsync($"/api/submissions/{submissionId}/answers/{answerId}/grade",
            new { awardedPoints = 1, feedback = "غير مصرح" })).StatusCode);

        var stillVisible = await owner.GetFromJsonAsync<JsonNode>($"/api/submissions/{submissionId}/review");
        Assert.Equal(3, stillVisible!["score"]!.GetValue<double>());
    }

    [Fact]
    public async Task ForgotPassword_ResetsPasswordAndInvalidatesTheOldOne()
    {
        var email = Email("reset-student");
        var (_, auth) = await RegisterAndLogin(email, "Student", "طالب استعادة");
        var client = factory.CreateClient();

        var forgot = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email });
        Assert.Equal(HttpStatusCode.OK, forgot.StatusCode);
        var forgotBody = await ReadJson(forgot);
        var token = forgotBody["resetToken"]?.GetValue<string>();
        Assert.False(string.IsNullOrWhiteSpace(token));

        var weak = await client.PostAsJsonAsync("/api/auth/reset-password", new { token, password = "short" });
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);

        var reset = await client.PostAsJsonAsync("/api/auth/reset-password", new { token, password = "NewPassw0rd!" });
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);

        var oldLogin = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!" });
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);
        var newLogin = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "NewPassw0rd!" });
        Assert.Equal(HttpStatusCode.OK, newLogin.StatusCode);
        Assert.True(auth["studentCode"] != null);

        var reused = await client.PostAsJsonAsync("/api/auth/reset-password", new { token, password = "AnotherPass1!" });
        Assert.Equal(HttpStatusCode.BadRequest, reused.StatusCode);
    }
}
