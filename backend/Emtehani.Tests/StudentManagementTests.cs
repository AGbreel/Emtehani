using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Emtehani.Domain.Entities;
using Emtehani.Domain.Services;
using Emtehani.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Emtehani.Tests;

/// <summary>
/// Regression coverage for the student-management upgrade: four-part names, guardian
/// data, attempt counting, historical link visibility, teacher portfolio privacy,
/// explicit Unlinked state, and re-requesting after rejection.
/// </summary>
public sealed class StudentManagementTests(ApiFactory factory) : IClassFixture<ApiFactory>
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

    private async Task<(HttpClient Client, JsonNode Auth)> RegisterTeacher(string? name = null)
    {
        var client = factory.CreateClient();
        var email = Email("sm-teacher");
        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = name ?? $"مدرس إدارة الطلاب {Letters()}",
            email,
            password = "Passw0rd!2026",
            role = "Teacher"
        });
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!2026" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await Json(login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());
        var plan = await client.PostAsJsonAsync("/api/teacher/subscription", new { planCode = "free" });
        Assert.Equal(HttpStatusCode.OK, plan.StatusCode);
        return (client, auth);
    }

    private async Task<(HttpClient Client, JsonNode Auth, Guid Id)> RegisterStudent(
        Guid teacherId, string? name = null, string? parentName = "أحمد محمد علي حسن")
    {
        var client = factory.CreateClient();
        var email = Email("sm-student");
        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = name ?? $"طالب إدارة {Letters()} مميز",
            email,
            password = "Passw0rd!2026",
            role = "Student",
            stage = Stage,
            grade = Grade,
            studentPhone = Phone("01"),
            parentPhone = Phone("02"),
            parentName,
            teacherCount = 3,
            teacherIds = new[] { teacherId }
        });
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!2026" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await Json(login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());
        return (client, auth, GuidValue(auth["userId"]));
    }

    private static async Task<JsonNode> PendingRequest(HttpClient teacher, string studentEmail)
    {
        var rows = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/requests");
        return rows!.AsArray().Single(x =>
            x!["studentEmail"]?.GetValue<string>() == studentEmail
            && x["status"]!.GetValue<string>() == "Pending");
    }

    private static async Task Accept(HttpClient teacher, string studentEmail)
    {
        var pending = await PendingRequest(teacher, studentEmail);
        var response = await teacher.PutAsJsonAsync($"/api/teacher/requests/{GuidValue(pending["id"])}", new { action = "accept" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private async Task<Guid> CreateExam(
        HttpClient teacher,
        string? title = null,
        int maxAttempts = 2,
        bool publish = true,
        DateTime? availableFromUtc = null,
        DateTime? availableUntilUtc = null)
    {
        var response = await teacher.PostAsJsonAsync("/api/exams", new
        {
            title = title ?? $"امتحان إدارة {Letters()}",
            description = "وصف",
            durationMinutes = 30,
            maxAttempts,
            allowResumeAfterFocusLoss = true,
            availableFromUtc,
            availableUntilUtc,
            stage = Stage,
            grade = Grade,
            questions = new object[]
            {
                new { text = "٢ + ٢", type = "MultipleChoice", options = new[] { "3", "4" }, correctAnswer = "4", points = 2 },
                new { text = "السماء زرقاء", type = "TrueFalse", options = Array.Empty<string>(), correctAnswer = "صح", points = 1 }
            }
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var examId = GuidValue((await Json(response))["id"]);
        if (publish)
        {
            var published = await teacher.PutAsync($"/api/exams/{examId}/publish", null);
            Assert.Equal(HttpStatusCode.OK, published.StatusCode);
            var open = await teacher.PutAsJsonAsync($"/api/exams/{examId}/state", new { action = "open" });
            Assert.Equal(HttpStatusCode.OK, open.StatusCode);
        }
        return examId;
    }

    [Fact]
    public async Task TeacherStudentDetail_ExposesGuardianAndAttemptSummary_WithoutAnEditAction()
    {
        var (teacher, _) = await RegisterTeacher();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var uniqueName = $"سارة أحمد {Letters()} علي";
        var (student, studentAuth, studentId) = await RegisterStudent(teacherId, uniqueName);
        var email = studentAuth["email"]!.GetValue<string>();
        await Accept(teacher, email);

        var examId = await CreateExam(teacher, maxAttempts: 2);
        var enter = await student.PostAsync($"/api/exams/{examId}/enter", null);
        Assert.Equal(HttpStatusCode.OK, enter.StatusCode);
        var start = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        var submissionId = GuidValue((await Json(start))["id"]);
        var paper = await student.GetFromJsonAsync<JsonNode>($"/api/exams/{examId}/paper");
        var questions = paper!["questions"]!.AsArray();
        var answers = questions.Select(q => new { questionId = GuidValue(q!["id"]), answerText = q["type"]!.GetValue<string>() == "TrueFalse" ? "صح" : "4" }).ToArray();
        var submit = await student.PostAsJsonAsync($"/api/submissions/{submissionId}/submit", new { answers });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);

        var detail = await teacher.GetFromJsonAsync<JsonNode>($"/api/teacher/students/{studentId}");
        Assert.Equal(uniqueName, detail!["fullName"]!.GetValue<string>());
        Assert.False(string.IsNullOrWhiteSpace(detail["studentPhone"]!.GetValue<string>()));
        Assert.False(string.IsNullOrWhiteSpace(detail["parentPhone"]!.GetValue<string>()));
        Assert.Equal("أحمد محمد علي حسن", detail["parentName"]!.GetValue<string>());
        Assert.Equal(Stage, detail["stage"]!.GetValue<string>());
        Assert.Equal(Grade, detail["grade"]!.GetValue<string>());
        Assert.Equal(2, detail["attempts"]!["allowed"]!.GetValue<int>());
        Assert.Equal(1, detail["attempts"]["used"]!.GetValue<int>());
        Assert.Equal(1, detail["attempts"]["completed"]!.GetValue<int>());
        Assert.Equal(1, detail["attempts"]["remaining"]!.GetValue<int>());
        var exam = detail["exams"]!.AsArray().Single(x => GuidValue(x!["examId"]) == examId);
        Assert.Equal(2, exam!["attempts"]!["allowed"]!.GetValue<int>());
        Assert.Equal(1, exam["attempts"]["completed"]!.GetValue<int>());
    }

    [Fact]
    public async Task Registration_RequiresFourPartStudentName_AndRejectsDigits()
    {
        var (teacher, _) = await RegisterTeacher();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var client = factory.CreateClient();

        var threeParts = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "سارة أحمد علي",
            email = Email("sm-three"),
            password = "Passw0rd!2026",
            role = "Student",
            stage = Stage,
            grade = Grade,
            studentPhone = Phone("01"),
            parentPhone = Phone("02"),
            teacherCount = 1,
            teacherIds = new[] { teacherId }
        });
        Assert.Equal(HttpStatusCode.BadRequest, threeParts.StatusCode);
        Assert.Contains("رباع", (await Json(threeParts))["message"]!.GetValue<string>());

        var digits = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "سارة أحمد محمد 1234",
            email = Email("sm-digits"),
            password = "Passw0rd!2026",
            role = "Student",
            stage = Stage,
            grade = Grade,
            studentPhone = Phone("01"),
            parentPhone = Phone("02"),
            teacherCount = 1,
            teacherIds = new[] { teacherId }
        });
        Assert.Equal(HttpStatusCode.BadRequest, digits.StatusCode);
        Assert.Contains("أرقام", (await Json(digits))["message"]!.GetValue<string>());

        var invalidParent = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = $"سارة أحمد {Letters()} علي",
            email = Email("sm-parent"),
            password = "Passw0rd!2026",
            role = "Student",
            stage = Stage,
            grade = Grade,
            studentPhone = Phone("01"),
            parentPhone = Phone("02"),
            parentName = "!!!",
            teacherCount = 1,
            teacherIds = new[] { teacherId }
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidParent.StatusCode);
        Assert.Contains("ولي الأمر", (await Json(invalidParent))["message"]!.GetValue<string>());

        var (_, _, _) = await RegisterStudent(teacherId, $"سارة أحمد {Letters()} علي");
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email = Email("does-not-exist"), password = "Passw0rd!2026" });
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
    }

    [Fact]
    public async Task ReopeningOrRefreshingAnAttempt_DoesNotCreateAnotherAttempt()
    {
        var (teacher, _) = await RegisterTeacher();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var (student, studentAuth, studentId) = await RegisterStudent(teacherId);
        await Accept(teacher, studentAuth["email"]!.GetValue<string>());
        var examId = await CreateExam(teacher, maxAttempts: 3);

        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{examId}/start", null)).StatusCode);
        for (var i = 0; i < 4; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await student.GetAsync($"/api/exams/{examId}/session")).StatusCode);
        }

        var detail = await teacher.GetFromJsonAsync<JsonNode>($"/api/teacher/students/{studentId}");
        Assert.Equal(1, detail!["attempts"]!["used"]!.GetValue<int>());
        Assert.Equal(0, detail["attempts"]["completed"]!.GetValue<int>());
        Assert.Equal(3, detail["attempts"]["allowed"]!.GetValue<int>());
    }

    [Fact]
    public async Task NewlyLinkedStudent_SeesPublishedExamCreatedEarlier_ButNotDraftExams()
    {
        var (teacher, _) = await RegisterTeacher();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var published = await CreateExam(teacher, "امتحان قديم منشور");
        var draft = await CreateExam(teacher, "امتحان مسودة", publish: false);

        var (student, studentAuth, _) = await RegisterStudent(teacherId);
        await Accept(teacher, studentAuth["email"]!.GetValue<string>());

        var available = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        var items = available!["items"]!.AsArray();
        Assert.Contains(items, x => GuidValue(x!["examId"]) == published);
        Assert.DoesNotContain(items, x => GuidValue(x!["examId"]) == draft);
        Assert.Equal(HttpStatusCode.OK, (await student.GetAsync($"/api/exams/{published}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await student.GetAsync($"/api/exams/{draft}")).StatusCode);
    }

    [Fact]
    public async Task TeacherPortfolio_IsDraftUntilPublished_AndHidesPrivateContactsByDefault()
    {
        var (teacher, _) = await RegisterTeacher();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var (student, studentAuth, _) = await RegisterStudent(teacherId);
        await Accept(teacher, studentAuth["email"]!.GetValue<string>());

        var save = await teacher.PutAsJsonAsync("/api/teacher/profile", new
        {
            professionalName = "أ. أحمد الرياضيات",
            specialty = "الرياضيات",
            bio = "خبرة في تدريس الثانوية.",
            stages = new[] { Stage },
            grades = new[] { Grade },
            yearsOfExperience = 8,
            contactPhone = Phone("01"),
            publicSlug = $"portfolio-{Letters()}"
        });
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);
        var slug = (await Json(save))["publicSlug"]!.GetValue<string>();
        Assert.Equal("Draft", (await Json(save))["status"]!.GetValue<string>());

        var hidden = await student.GetAsync($"/api/teachers/{teacherId}/profile");
        Assert.Equal(HttpStatusCode.NotFound, hidden.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await factory.CreateClient().GetAsync($"/api/public/teachers/{slug}")).StatusCode);

        var publish = await teacher.PostAsync("/api/teacher/profile/publish", null);
        Assert.Equal(HttpStatusCode.OK, publish.StatusCode);
        var visible = await student.GetFromJsonAsync<JsonNode>($"/api/teachers/{teacherId}/profile");
        Assert.Equal("أ. أحمد الرياضيات", visible!["professionalName"]!.GetValue<string>());
        Assert.Null(visible["email"]?.GetValue<string>());
        Assert.Null(visible["phone"]?.GetValue<string>());

        var anonymous = await factory.CreateClient().GetFromJsonAsync<JsonNode>($"/api/public/teachers/{slug}");
        Assert.Equal(teacherId, GuidValue(anonymous!["teacherId"]));

        var show = await teacher.PutAsJsonAsync("/api/teacher/profile", new
        {
            professionalName = "أ. أحمد الرياضيات",
            specialty = "الرياضيات",
            bio = "خبرة في تدريس الثانوية.",
            stages = new[] { Stage },
            grades = new[] { Grade },
            yearsOfExperience = 8,
            contactPhone = Phone("01"),
            publicSlug = slug,
            showEmail = true,
            showPhone = true
        });
        Assert.Equal(HttpStatusCode.OK, show.StatusCode);
        var withContacts = await student.GetFromJsonAsync<JsonNode>($"/api/teachers/{teacherId}/profile");
        Assert.False(string.IsNullOrWhiteSpace(withContacts!["email"]!.GetValue<string>()));
        Assert.False(string.IsNullOrWhiteSpace(withContacts["phone"]!.GetValue<string>()));
    }

    [Fact]
    public async Task Unlink_SetsExplicitStatus_RemovesActiveAccess_AndKeepsHistory()
    {
        var (teacher, _) = await RegisterTeacher();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var (student, studentAuth, studentId) = await RegisterStudent(teacherId);
        var email = studentAuth["email"]!.GetValue<string>();
        await Accept(teacher, email);
        var examId = await CreateExam(teacher);

        var unlink = await teacher.DeleteAsync($"/api/teacher/students/{studentId}");
        Assert.Equal(HttpStatusCode.OK, unlink.StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var link = await db.TeacherStudentRequests.AsNoTracking()
                .SingleAsync(x => x.TeacherId == teacherId && x.StudentId == studentId);
            Assert.Equal("Unlinked", link.Status);
            Assert.NotNull(link.UnlinkedAtUtc);
        }

        var students = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/students");
        Assert.DoesNotContain(students!["items"]!.AsArray(), x => GuidValue(x!["studentId"]) == studentId);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync($"/api/exams/{examId}")).StatusCode);
        var profile = await student.GetFromJsonAsync<JsonNode>("/api/student/profile");
        Assert.DoesNotContain(profile!["linkedTeachers"]!.AsArray(), x => GuidValue(x!["teacherId"]) == teacherId);
        var directory = await student.GetFromJsonAsync<JsonNode>("/api/teachers");
        Assert.Equal("Unlinked", directory!.AsArray().Single(x => GuidValue(x!["id"]) == teacherId)!["requestStatus"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.NotFound, (await teacher.GetAsync($"/api/teacher/students/{studentId}")).StatusCode);

        Guid oldLinkId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            oldLinkId = (await db.TeacherStudentRequests.AsNoTracking()
                .SingleAsync(x => x.TeacherId == teacherId && x.StudentId == studentId)).Id;
        }
        var reRequest = await student.PostAsync($"/api/teachers/{teacherId}/request", null);
        Assert.Equal(HttpStatusCode.OK, reRequest.StatusCode);
        var reRequestJson = await Json(reRequest);
        Assert.NotEqual(oldLinkId, GuidValue(reRequestJson["requestId"]));
        Assert.Equal("Pending", reRequestJson["status"]!.GetValue<string>());
    }

    [Fact]
    public async Task Student_CanReRequestAfterRejection_WithNewId_ButCannotDuplicatePending()
    {
        var (teacher, _) = await RegisterTeacher();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var (student, studentAuth, studentId) = await RegisterStudent(teacherId);
        var email = studentAuth["email"]!.GetValue<string>();

        var first = await PendingRequest(teacher, email);
        var firstId = GuidValue(first["id"]);
        var reject = await teacher.PutAsJsonAsync($"/api/teacher/requests/{firstId}", new { action = "reject" });
        Assert.Equal(HttpStatusCode.OK, reject.StatusCode);

        var again = await student.PostAsync($"/api/teachers/{teacherId}/request", null);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        var againJson = await Json(again);
        var newId = GuidValue(againJson["requestId"]);
        Assert.NotEqual(firstId, newId);
        Assert.Equal("Pending", againJson["status"]!.GetValue<string>());

        var duplicate = await student.PostAsync($"/api/teachers/{teacherId}/request", null);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var history = await db.TeacherStudentRequests.AsNoTracking()
            .Where(x => x.TeacherId == teacherId && x.StudentId == studentId)
            .OrderBy(x => x.CreatedAtUtc)
            .ToListAsync();
        Assert.Equal(2, history.Count);
        Assert.Equal("Rejected", history[0].Status);
        Assert.Equal("Pending", history[1].Status);
        Assert.NotEqual(history[0].Id, history[1].Id);
    }

    [Fact]
    public async Task AbandonedAttempt_IsReportedSeparately_AndDoesNotConsumeAMaxAttempt()
    {
        var (teacher, _) = await RegisterTeacher();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var (student, studentAuth, studentId) = await RegisterStudent(teacherId);
        await Accept(teacher, studentAuth["email"]!.GetValue<string>());
        var examId = await CreateExam(teacher, maxAttempts: 1);

        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);
        var started = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        var submissionId = GuidValue((await Json(started))["id"]);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var submission = await db.Submissions.SingleAsync(x => x.Id == submissionId);
            submission.Status = "Abandoned";
            submission.SubmittedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        var detail = await teacher.GetFromJsonAsync<JsonNode>($"/api/teacher/students/{studentId}");
        Assert.Equal(0, detail!["attempts"]!["used"]!.GetValue<int>());
        Assert.Equal(0, detail["attempts"]["completed"]!.GetValue<int>());
        Assert.Equal(1, detail["attempts"]["remaining"]!.GetValue<int>());
        Assert.Equal(1, detail["attempts"]["abandoned"]!.GetValue<int>());

        // The abandoned technical row must not block a fresh attempt.
        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{examId}/start", null)).StatusCode);
    }

    [Fact]
    public async Task ExpiredAvailability_IsHiddenFromTheStudentList_AndEnterIsRejected()
    {
        var (teacher, _) = await RegisterTeacher();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var (student, studentAuth, _) = await RegisterStudent(teacherId);
        await Accept(teacher, studentAuth["email"]!.GetValue<string>());

        var now = DateTime.UtcNow;
        var expired = await CreateExam(teacher, "امتحان منتهي", availableFromUtc: now.AddHours(-2), availableUntilUtc: now.AddMinutes(-1));
        var future = await CreateExam(teacher, "امتحان قادم", availableFromUtc: now.AddHours(1), availableUntilUtc: now.AddHours(2));

        var available = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        var items = available!["items"]!.AsArray();
        Assert.DoesNotContain(items, x => GuidValue(x!["examId"]) == expired);
        Assert.Contains(items, x => GuidValue(x!["examId"]) == future);
        Assert.Equal(HttpStatusCode.Conflict, (await student.PostAsync($"/api/exams/{expired}/enter", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{future}/enter", null)).StatusCode);
    }

    [Fact]
    public async Task TeacherProfile_RejectsUnsafeUrlsAndInvalidOrDuplicateSlugs()
    {
        var (firstTeacher, _) = await RegisterTeacher();
        var (secondTeacher, _) = await RegisterTeacher();
        var slug = $"profile-{Letters()}";

        async Task<HttpResponseMessage> Save(HttpClient client, string? publicSlug, string? avatarUrl = null, string? socialUrl = null)
            => await client.PutAsJsonAsync("/api/teacher/profile", new
            {
                professionalName = "أ. اختبار الأمان",
                specialty = "الرياضيات",
                stages = new[] { Stage },
                grades = new[] { Grade },
                publicSlug,
                avatarUrl,
                socialLinks = socialUrl is null ? Array.Empty<object>() : new[] { new { label = "موقع", url = socialUrl } }
            });

        Assert.Equal(HttpStatusCode.BadRequest, (await Save(firstTeacher, slug, avatarUrl: "javascript:alert(1)")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(firstTeacher, slug, avatarUrl: "http://example.com/avatar.png")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(firstTeacher, "Bad Slug!", socialUrl: "https://example.com")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(firstTeacher, slug, socialUrl: "javascript:alert(1)")).StatusCode);

        var valid = await Save(firstTeacher, slug);
        Assert.Equal(HttpStatusCode.OK, valid.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Save(secondTeacher, slug)).StatusCode);

        var secondSlug = $"other-{Letters()}";
        Assert.Equal(HttpStatusCode.OK, (await Save(secondTeacher, secondSlug)).StatusCode);
        var firstOwn = await firstTeacher.GetFromJsonAsync<JsonNode>("/api/teacher/profile");
        Assert.Equal("أ. اختبار الأمان", firstOwn!["profile"]!["professionalName"]!.GetValue<string>());
        Assert.Equal(slug, firstOwn["profile"]!["publicSlug"]!.GetValue<string>());
    }

    [Fact]
    public async Task LegacyThreePartStudentName_CanStillUpdateOtherProfileFields()
    {
        var (teacher, _) = await RegisterTeacher();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var (student, studentAuth, studentId) = await RegisterStudent(teacherId);
        await Accept(teacher, studentAuth["email"]!.GetValue<string>());
        var legacyName = $"ليجا سي {Letters()}";

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = await db.Users.SingleAsync(x => x.Id == studentId);
            user.FullName = legacyName;
            user.NormalizedName = IdentityNormalizer.NormalizeName(legacyName);
            user.ParentName = null;
            await db.SaveChangesAsync();
        }

        var profile = await student.GetFromJsonAsync<JsonNode>("/api/student/profile");
        var studentPhone = profile!["profile"]!["studentPhone"]!.GetValue<string>();
        var parentPhone = profile["profile"]["parentPhone"]!.GetValue<string>();

        var invalidParent = await student.PutAsJsonAsync("/api/student/profile", new
        {
            fullName = legacyName,
            studentPhone,
            parentPhone,
            parentName = "!!!",
            stage = Stage,
            grade = Grade
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidParent.StatusCode);

        var sameName = await student.PutAsJsonAsync("/api/student/profile", new
        {
            fullName = legacyName,
            studentPhone,
            parentPhone,
            parentName = "أحمد محمد علي حسن",
            stage = Stage,
            grade = Grade
        });
        Assert.Equal(HttpStatusCode.OK, sameName.StatusCode);

        var changedToAnotherThreePartName = await student.PutAsJsonAsync("/api/student/profile", new
        {
            fullName = $"ليجا سي {Letters()}",
            studentPhone,
            parentPhone,
            parentName = "أحمد محمد علي حسن",
            stage = Stage,
            grade = Grade
        });
        Assert.Equal(HttpStatusCode.BadRequest, changedToAnotherThreePartName.StatusCode);
    }

    [Fact]
    public async Task DatabaseFilteredIndexes_BlockDuplicatePendingAndActiveLinks()
    {
        var (teacher, _) = await RegisterTeacher();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var (_, studentAuth, studentId) = await RegisterStudent(teacherId);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.TeacherStudentRequests.Add(new TeacherStudentRequest
            {
                TeacherId = teacherId,
                StudentId = studentId,
                Status = "Pending",
                InitiatedBy = "Student",
                CreatedAtUtc = DateTime.UtcNow
            });
            await Assert.ThrowsAnyAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }

        await Accept(teacher, studentAuth["email"]!.GetValue<string>());

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.TeacherStudentRequests.Add(new TeacherStudentRequest
            {
                TeacherId = teacherId,
                StudentId = studentId,
                Status = "Accepted",
                InitiatedBy = "Student",
                CreatedAtUtc = DateTime.UtcNow,
                DecidedAtUtc = DateTime.UtcNow
            });
            await Assert.ThrowsAnyAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
    }

    [Fact]
    public async Task StaleInProgressAttempt_CanBeRecoveredByTeacherWithoutLosingAnAttempt()
    {
        var (teacher, _) = await RegisterTeacher();
        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var (student, studentAuth, studentId) = await RegisterStudent(teacherId);
        await Accept(teacher, studentAuth["email"]!.GetValue<string>());
        var examId = await CreateExam(teacher, maxAttempts: 1);

        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);
        var started = await student.PostAsync($"/api/exams/{examId}/start", null);
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        var submissionId = GuidValue((await Json(started))["id"]);

        // A fresh heartbeat means the attempt is genuinely active and must not be reset.
        var fresh = await teacher.PostAsync($"/api/submissions/{submissionId}/grant-extra-attempt", null);
        Assert.Equal(HttpStatusCode.Conflict, fresh.StatusCode);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var participant = await db.ExamParticipants.SingleAsync(x => x.ExamId == examId && x.StudentId == studentId);
            participant.LastSeenAtUtc = DateTime.UtcNow.AddMinutes(-10);
            await db.SaveChangesAsync();
        }

        var recovered = await teacher.PostAsync($"/api/submissions/{submissionId}/grant-extra-attempt", null);
        Assert.Equal(HttpStatusCode.OK, recovered.StatusCode);

        var detail = await teacher.GetFromJsonAsync<JsonNode>($"/api/teacher/students/{studentId}");
        Assert.Equal(0, detail!["attempts"]!["used"]!.GetValue<int>());
        Assert.Equal(1, detail["attempts"]["exceptionUsed"]!.GetValue<int>());
        Assert.Equal(1, detail["attempts"]["remaining"]!.GetValue<int>());
        Assert.Equal(HttpStatusCode.OK, (await student.PostAsync($"/api/exams/{examId}/start", null)).StatusCode);
    }
}
