using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Emtehani.Tests;

/// <summary>
/// Regression coverage for the production-audit remediation:
/// finished-exam attempt aggregation, masked phone lookup, audit visibility,
/// finished-exam extra attempts, password policy, and the forwarded-header
/// rate-limit bypass.
/// </summary>
public sealed class RemediationTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Stage = "ثانوي";
    private const string Grade = "الصف الثالث الثانوي";

    private static string Email(string prefix) => $"{prefix}-{Guid.NewGuid():N}@example.test";
    private static string Phone(string prefix) => prefix + Random.Shared.Next(100000000, 999999999).ToString(System.Globalization.CultureInfo.InvariantCulture);
    private static string Letters()
    {
        var value = new string(Guid.NewGuid().ToString("N").Where(char.IsLetter).Take(6).ToArray());
        return value.Length >= 2 ? value : "مم";
    }
    private static Guid GuidValue(JsonNode? node) => Guid.Parse(node!.GetValue<string>());
    private static async Task<JsonNode> Json(HttpResponseMessage response) =>
        JsonNode.Parse(await response.Content.ReadAsStringAsync())!;

    private async Task<(HttpClient Client, JsonNode Auth, string Email)> RegisterTeacher(string? password = null)
    {
        var client = factory.CreateClient();
        var email = Email("rem-teacher");
        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = $"مدرس تدقيق {Letters()}",
            email,
            password = password ?? "Passw0rd!2026",
            role = "Teacher"
        });
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = password ?? "Passw0rd!2026" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await Json(login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());
        var plan = await client.PostAsJsonAsync("/api/teacher/subscription", new { planCode = "free" });
        Assert.Equal(HttpStatusCode.OK, plan.StatusCode);
        return (client, auth, email);
    }

    private async Task<(HttpClient Client, JsonNode Auth, Guid Id, string Email)> RegisterStudent(Guid teacherId)
    {
        var client = factory.CreateClient();
        var email = Email("rem-student");
        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = $"طالب تدقيق {Letters()} مميز",
            email,
            password = "Passw0rd!2026",
            role = "Student",
            stage = Stage,
            grade = Grade,
            studentPhone = Phone("011"),
            parentPhone = Phone("012"),
            parentName = "ولي أمر التدقيق",
            teacherCount = 1,
            teacherIds = new[] { teacherId }
        });
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!2026" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await Json(login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());
        return (client, auth, GuidValue(auth["userId"]), email);
    }

    private static async Task Accept(HttpClient teacher, string studentEmail)
    {
        var rows = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/requests");
        var pending = rows!.AsArray().Single(x =>
            x!["studentEmail"]?.GetValue<string>() == studentEmail && x["status"]!.GetValue<string>() == "Pending");
        var response = await teacher.PutAsJsonAsync($"/api/teacher/requests/{GuidValue(pending["id"])}", new { action = "accept" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static async Task<(Guid ExamId, Guid SubmissionId)> CreateAndSubmitExam(HttpClient teacher, HttpClient student, int maxAttempts = 1)
    {
        var created = await teacher.PostAsJsonAsync("/api/exams", new
        {
            title = $"امتحان تدقيق {Letters()}",
            description = "اختبار انحدار",
            durationMinutes = 30,
            maxAttempts,
            allowResumeAfterFocusLoss = true,
            stage = Stage,
            grade = Grade,
            questions = new object[]
            {
                new { text = "٢ + ٢", type = "MultipleChoice", options = new[] { "3", "4" }, correctAnswer = "4", points = 2 },
                new { text = "السماء زرقاء", type = "TrueFalse", options = Array.Empty<string>(), correctAnswer = "صح", points = 1 }
            }
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var examId = GuidValue((await Json(created))["id"]);
        Assert.Equal(HttpStatusCode.OK, (await teacher.PutAsync($"/api/exams/{examId}/publish", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await teacher.PutAsJsonAsync($"/api/exams/{examId}/state", new { action = "open" })).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);
        var start = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var submissionId = GuidValue((await Json(start))["id"]);
        var paper = await student.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/paper");
        var answers = paper!["questions"]!.AsArray()
            .Select(q => new
            {
                questionId = GuidValue(q!["id"]),
                answerText = q["type"]!.GetValue<string>() == "TrueFalse" ? "صح" : "4"
            })
            .ToArray();
        var submit = await student.PostAsJsonAsync($"/api/submissions/{submissionId}/submit", new { answers });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);
        return (examId, submissionId);
    }

    [Fact]
    public async Task FinishedExam_AttemptsAreCounted_AuditShowsSubmission_AndExtraAttemptIsBlocked()
    {
        var (teacher, teacherAuth, _) = await RegisterTeacher();
        var teacherId = GuidValue(teacherAuth["userId"]);
        var (student, _, studentId, studentEmail) = await RegisterStudent(teacherId);
        await Accept(teacher, studentEmail);
        var (examId, submissionId) = await CreateAndSubmitExam(teacher, student, maxAttempts: 1);

        var close = await teacher.PutAsJsonAsync($"/api/exams/{examId}/state", new { action = "close" });
        Assert.Equal(HttpStatusCode.OK, close.StatusCode);

        var detail = await teacher.GetFromJsonAsync<JsonNode>($"/api/teacher/students/{studentId}");
        Assert.Equal(1, detail!["attempts"]!["allowed"]!.GetValue<int>());
        Assert.Equal(1, detail["attempts"]["used"]!.GetValue<int>());
        Assert.Equal(1, detail["attempts"]["completed"]!.GetValue<int>());
        Assert.Equal(0, detail["attempts"]["remaining"]!.GetValue<int>());
        Assert.Equal(1, detail["submittedAttempts"]!.GetValue<int>());
        Assert.True(detail["finishedExamCount"]!.GetValue<int>() >= 1);
        Assert.Empty(detail["exams"]!.AsArray());

        var overview = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/overview");
        Assert.Equal(0, overview!["openableExams"]!.GetValue<int>());

        var audit = await teacher.GetFromJsonAsync<JsonNode>("/api/audit?pageSize=100");
        Assert.Contains(audit!["items"]!.AsArray(), item => item!["action"]!.GetValue<string>() == "submission.submitted");

        var extra = await teacher.PostAsync($"/api/submissions/{submissionId}/grant-extra-attempt", null);
        Assert.Equal(HttpStatusCode.Conflict, extra.StatusCode);
    }

    [Fact]
    public async Task PhoneLookup_MasksUnrelatedStudent_AndRevealsOnlyAfterAcceptance()
    {
        var (teacher1, teacher1Auth, _) = await RegisterTeacher();
        var teacher1Id = GuidValue(teacher1Auth["userId"]);
        var (_, _, studentId, studentEmail) = await RegisterStudent(teacher1Id);
        await Accept(teacher1, studentEmail);
        var detail = await teacher1.GetFromJsonAsync<JsonNode>($"/api/teacher/students/{studentId}");
        var phone = detail!["studentPhone"]!.GetValue<string>();

        var (teacher2, _, _) = await RegisterTeacher();

        var masked = await teacher2.GetFromJsonAsync<JsonNode>($"/api/teacher/students/lookup?phone={phone}");
        var maskedItem = masked!["items"]!.AsArray().Single();
        Assert.True(maskedItem!["masked"]!.GetValue<bool>());
        Assert.Contains("…", maskedItem["fullName"]!.GetValue<string>());
        Assert.NotEqual(detail["fullName"]!.GetValue<string>(), maskedItem["fullName"]!.GetValue<string>());
        Assert.Null(maskedItem["stage"]);
        Assert.Null(maskedItem["grade"]);

        var full = await teacher1.GetFromJsonAsync<JsonNode>($"/api/teacher/students/lookup?phone={phone}");
        var fullItem = full!["items"]!.AsArray().Single();
        Assert.False(fullItem!["masked"]!.GetValue<bool>());
        Assert.Equal(detail["fullName"]!.GetValue<string>(), fullItem["fullName"]!.GetValue<string>());
        Assert.Equal(Stage, fullItem["stage"]!.GetValue<string>());
        Assert.Equal(Grade, fullItem["grade"]!.GetValue<string>());

        Assert.Equal(HttpStatusCode.NotFound, (await teacher2.GetAsync($"/api/teacher/students/{studentId}")).StatusCode);
    }

    [Fact]
    public async Task PhoneLookup_IsRateLimitedPerTeacher()
    {
        var (teacher, _, _) = await RegisterTeacher();
        var phone = Phone("015");
        HttpResponseMessage? last = null;
        for (var i = 0; i < 13; i++)
            last = await teacher.GetAsync($"/api/teacher/students/lookup?phone={phone}");
        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
    }

    [Fact]
    public async Task PasswordPolicy_RejectsShortAndCommonPasswords()
    {
        var client = factory.CreateClient();
        var shortPassword = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "مدرس كلمة قصيرة",
            email = Email("short"),
            password = "Short1!",
            role = "Teacher"
        });
        Assert.Equal(HttpStatusCode.BadRequest, shortPassword.StatusCode);

        var commonPassword = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "مدرس كلمة شائعة",
            email = Email("common"),
            password = "1234567890",
            role = "Teacher"
        });
        Assert.Equal(HttpStatusCode.BadRequest, commonPassword.StatusCode);
        Assert.Contains("شائعة", (await Json(commonPassword))["message"]!.GetValue<string>());

        var strong = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "مدرس كلمة قوية",
            email = Email("strong"),
            password = "StrongPass!2026",
            role = "Teacher"
        });
        Assert.Equal(HttpStatusCode.OK, strong.StatusCode);
    }

    [Fact]
    public async Task Login_IsLockedPerAccount_AfterRepeatedFailures()
    {
        var (_, _, email) = await RegisterTeacher();
        var client = factory.CreateClient();
        for (var i = 0; i < 5; i++)
        {
            var wrong = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "WrongPass!2026" });
            Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        }
        var locked = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!2026" });
        Assert.Equal(HttpStatusCode.TooManyRequests, locked.StatusCode);
        Assert.Equal("login_locked", (await Json(locked))["code"]!.GetValue<string>());
    }
}

public sealed class StrictAuthLimitFactory : ApiFactory
{
    protected override void ConfigureTestConfiguration(IConfigurationBuilder config)
    {
        config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["RateLimiting:AuthPermitLimit"] = "2",
            ["Auth:MaxFailedLogins"] = "1000"
        });
    }
}

public sealed class ForwardedHeaderRateLimitTests(StrictAuthLimitFactory factory) : IClassFixture<StrictAuthLimitFactory>
{
    [Fact]
    public async Task SpoofedForwardedFor_DoesNotBypassAuthRateLimit()
    {
        var client = factory.CreateClient();
        HttpResponseMessage? last = null;
        for (var i = 0; i < 4; i++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
            {
                Content = JsonContent.Create(new { email = $"spoof-{i}-{Guid.NewGuid():N}@example.test", password = "WrongPass!2026" })
            };
            request.Headers.TryAddWithoutValidation("X-Forwarded-For", $"203.0.113.{i + 1}");
            last = await client.SendAsync(request);
        }
        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
    }
}
