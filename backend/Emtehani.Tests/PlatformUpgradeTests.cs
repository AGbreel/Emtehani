using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Emtehani.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Emtehani.Tests;

/// <summary>
/// Tests for the platform upgrade: identity uniqueness, consent-based teacher links,
/// invitations, fixed 24-hour sessions, academic snapshots, subscriptions, and admin RBAC.
/// Every test uses its own random phones/emails/names so the shared SQLite fixture stays valid.
/// </summary>
public sealed class PlatformUpgradeTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Stage = "ثانوي";
    private const string Grade = "الصف الثالث الثانوي";
    private const string NextStage = "البكالوريا";
    private const string NextGrade = "أولى بكالوريا";

    private static string Email(string prefix) => $"{prefix}-{Guid.NewGuid():N}@example.test";

    private static string FourPartName(string name)
    {
        var parts = (name ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        var fillers = new[] { "طالب", "مميز", "أول", "ثاني" };
        var filler = 0;
        while (parts.Count < 4) parts.Add(fillers[filler++ % fillers.Length]);
        return string.Join(' ', parts.Take(8));
    }

    private static string LetterSuffix()
    {
        var value = new string(Guid.NewGuid().ToString("N").Where(char.IsLetter).Take(6).ToArray());
        return value.Length >= 2 ? value : "مم";
    }
    private static string Phone(string prefix = "01") =>
        prefix + Random.Shared.Next(100000000, 999999999).ToString(System.Globalization.CultureInfo.InvariantCulture);
    private static Guid GuidValue(JsonNode? node) => Guid.Parse(node!.GetValue<string>());
    private static async Task<JsonNode> Json(HttpResponseMessage response) =>
        JsonNode.Parse(await response.Content.ReadAsStringAsync())!;

    private async Task<(HttpClient Client, JsonNode Auth)> RegisterTeacher(string name, bool confirmSubscription = true)
    {
        var client = factory.CreateClient();
        var email = Email("platform-teacher");
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = name,
            email,
            password = "Passw0rd!2026",
            role = "Teacher"
        });
        Assert.True(register.StatusCode == HttpStatusCode.OK, await register.Content.ReadAsStringAsync());
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!2026" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await Json(login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());
        if (confirmSubscription)
        {
            var confirm = await client.PostAsJsonAsync("/api/teacher/subscription", new { planCode = "free" });
            Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
        }
        return (client, auth);
    }

    private async Task<(HttpClient Client, JsonNode Auth)> RegisterStudent(
        Guid teacherId, string name, string? studentPhone = null, string? parentPhone = null,
        int teacherCount = 1, string? invitationToken = null)
    {
        var client = factory.CreateClient();
        var email = Email("platform-student");
        studentPhone ??= Phone("01");
        parentPhone ??= Phone("02");
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = FourPartName(name),
            email,
            password = "Passw0rd!2026",
            role = "Student",
            stage = Stage,
            grade = Grade,
            studentPhone,
            parentPhone,
            teacherCount,
            teacherIds = new[] { teacherId },
            invitationToken
        });
        Assert.True(register.StatusCode == HttpStatusCode.OK, await register.Content.ReadAsStringAsync());
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!2026" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await Json(login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());
        return (client, auth);
    }

    private async Task<string> GetStudentPhone(HttpClient student)
    {
        var me = await student.GetFromJsonAsync<JsonNode>("/api/auth/me");
        return me!["studentPhone"]!.GetValue<string>();
    }

    private async Task AcceptStudent(HttpClient teacher, HttpClient student)
    {
        var me = await student.GetFromJsonAsync<JsonNode>("/api/auth/me");
        var email = me!["email"]!.GetValue<string>();
        var requests = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/requests");
        var row = requests!.AsArray().Single(x =>
            x!["studentEmail"]!.GetValue<string>() == email && x["status"]!.GetValue<string>() == "Pending");
        var accepted = await teacher.PutAsJsonAsync($"/api/teacher/requests/{GuidValue(row!["id"])}", new { action = "accept" });
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
    }

    [Fact]
    public async Task Registration_RejectsDuplicateNormalizedNameAndPhone_AndSameParentPhone()
    {
        var (teacher, teacherAuth) = await RegisterTeacher("مدرس قيود التسجيل");
        var teacherId = GuidValue(teacherAuth["userId"]);
        var (studentClient, first) = await RegisterStudent(teacherId, "أحمد  علي محمد");
        var firstPhone = await GetStudentPhone(studentClient);

        // Same name after normalisation, different phone/e-mail.
        var duplicateName = await factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "احمد علي محمد طالب",
            email = Email("duplicate-name"),
            password = "Passw0rd!2026",
            role = "Student",
            stage = Stage,
            grade = Grade,
            studentPhone = Phone("01"),
            parentPhone = Phone("02"),
            teacherCount = 1,
            teacherIds = new[] { teacherId }
        });
        Assert.Equal(HttpStatusCode.Conflict, duplicateName.StatusCode);
        Assert.Contains("نفس الاسم", (await Json(duplicateName))["message"]!.GetValue<string>());

        // Same phone in international form must canonically collide with the local form.
        var international = "+20" + firstPhone[1..];
        var duplicatePhone = await factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            fullName = $"طالب هاتف مكرر {LetterSuffix()}",
            email = Email("duplicate-phone"),
            password = "Passw0rd!2026",
            role = "Student",
            stage = Stage,
            grade = Grade,
            studentPhone = international,
            parentPhone = Phone("02"),
            teacherCount = 1,
            teacherIds = new[] { teacherId }
        });
        Assert.Equal(HttpStatusCode.Conflict, duplicatePhone.StatusCode);
        Assert.Contains("رقم هاتف الطالب مستخدم", (await Json(duplicatePhone))["message"]!.GetValue<string>());

        // Student and parent phone must differ.
        var samePhone = Phone("01");
        var equalPhones = await factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            fullName = $"طالب هاتفين متساويين {LetterSuffix()}",
            email = Email("same-phones"),
            password = "Passw0rd!2026",
            role = "Student",
            stage = Stage,
            grade = Grade,
            studentPhone = samePhone,
            parentPhone = samePhone,
            teacherCount = 1,
            teacherIds = new[] { teacherId }
        });
        Assert.Equal(HttpStatusCode.BadRequest, equalPhones.StatusCode);
        Assert.Contains("يجب أن يختلف", (await Json(equalPhones))["message"]!.GetValue<string>());

        // Siblings may share a parent phone.
        var sharedParentPhone = Phone("02");
        await RegisterStudent(teacherId, $"طالب شقيق أول {LetterSuffix()} مميز", parentPhone: sharedParentPhone);
        await RegisterStudent(teacherId, $"طالب شقيق ثان {LetterSuffix()} مميز", parentPhone: sharedParentPhone);

        // Punctuation-only names must not bypass normalization uniqueness.
        var punctuationOnly = await studentClient.PutAsJsonAsync("/api/student/profile", new
        {
            fullName = "!!! ---",
            studentPhone = firstPhone,
            parentPhone = Phone("02"),
            stage = Stage,
            grade = Grade
        });
        Assert.Equal(HttpStatusCode.BadRequest, punctuationOnly.StatusCode);
        Assert.Contains("حروف", (await Json(punctuationOnly))["message"]!.GetValue<string>());
    }

    [Fact]
    public async Task TeacherLookup_AndConsentRequest_RespectStudentTeacherCount()
    {
        var (teacherOne, _) = await RegisterTeacher("مدرس الارتباط الأول");
        var (teacherTwo, teacherTwoAuth) = await RegisterTeacher("مدرس الارتباط الثاني");
        var (student, studentAuth) = await RegisterStudent(GuidValue((await teacherOne.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]), "طالب موافقة الارتباط");
        await AcceptStudent(teacherOne, student);
        var phone = await GetStudentPhone(student);

        var lookup = await teacherTwo.GetFromJsonAsync<JsonNode>($"/api/teacher/students/lookup?phone={Uri.EscapeDataString(phone)}");
        Assert.True(lookup!["found"]!.GetValue<bool>());
        var lookupItem = lookup["items"]!.AsArray().Single()!;
        var studentId = GuidValue(lookupItem["studentId"]);
        // Lookup must not disclose stored phone numbers before student consent.
        Assert.False(lookupItem.AsObject().ContainsKey("studentPhone"));
        Assert.False(lookupItem.AsObject().ContainsKey("parentPhone"));

        var request = await teacherTwo.PostAsJsonAsync("/api/teacher/students/request", new { studentId });
        Assert.Equal(HttpStatusCode.OK, request.StatusCode);

        // The teacher cannot decide their own consent request; only the student can.
        var teacherInbox = await teacherTwo.GetFromJsonAsync<JsonNode>("/api/teacher/requests");
        var ownRequest = teacherInbox!.AsArray().Single(x =>
            x!["studentEmail"]?.GetValue<string>() == studentAuth["email"]!.GetValue<string>()
            || (x["studentName"]!.GetValue<string>() == FourPartName("طالب موافقة الارتباط") && x["initiatedBy"]!.GetValue<string>() == "Teacher"));
        Assert.Equal("Teacher", ownRequest["initiatedBy"]!.GetValue<string>());
        Assert.Null(ownRequest["studentEmail"]);
        var teacherDecision = await teacherTwo.PutAsJsonAsync($"/api/teacher/requests/{GuidValue(ownRequest!["id"])}", new { action = "accept" });
        Assert.Equal(HttpStatusCode.Conflict, teacherDecision.StatusCode);
        Assert.Contains("موافقة الطالب", (await Json(teacherDecision))["message"]!.GetValue<string>());

        // Duplicate request for the same teacher is rejected rather than creating a second row.
        var duplicate = await teacherTwo.PostAsJsonAsync("/api/teacher/students/request", new { studentId });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);

        var incoming = await student.GetFromJsonAsync<JsonNode>("/api/student/link-requests");
        var pending = incoming!.AsArray().Single(x => GuidValue(x!["teacherId"]) == GuidValue(teacherTwoAuth["userId"]));
        Assert.Equal("Pending", pending!["status"]!.GetValue<string>());
        Assert.Equal("Teacher", pending["initiatedBy"]!.GetValue<string>());

        // The student already chose one teacher, so accepting a second must be blocked.
        var accept = await student.PutAsJsonAsync($"/api/student/link-requests/{GuidValue(pending["id"])}", new { action = "accept" });
        Assert.Equal(HttpStatusCode.Conflict, accept.StatusCode);
        Assert.Contains("1", (await Json(accept))["message"]!.GetValue<string>());

        var reject = await student.PutAsJsonAsync($"/api/student/link-requests/{GuidValue(pending["id"])}", new { action = "reject" });
        Assert.Equal(HttpStatusCode.OK, reject.StatusCode);
        Assert.Equal("Rejected", (await Json(reject))["status"]!.GetValue<string>());

        // A teacher who is not linked cannot edit the student.
        var forbiddenEdit = await teacherTwo.PutAsJsonAsync($"/api/teacher/students/{studentId}/profile", new
        {
            fullName = "محاولة تعديل غير مصرح",
            studentPhone = phone,
            parentPhone = Phone("02"),
            stage = Stage,
            grade = Grade
        });
        Assert.Equal(HttpStatusCode.NotFound, forbiddenEdit.StatusCode);
    }

    [Fact]
    public async Task TeacherInvitation_RegistersStudentOnce_AndConsumesToken()
    {
        var (teacher, _) = await RegisterTeacher("مدرس الدعوات");
        var studentPhone = Phone("01");
        var invite = await teacher.PostAsJsonAsync("/api/teacher/students/invite", new
        {
            fullName = $"طالب مدعو {LetterSuffix()} مميز",
            studentPhone,
            parentPhone = Phone("02"),
            stage = Stage,
            grade = Grade
        });
        Assert.Equal(HttpStatusCode.OK, invite.StatusCode);
        var inviteJson = await Json(invite);
        var token = inviteJson["token"]!.GetValue<string>();
        Assert.Contains("?invite=", inviteJson["inviteUrl"]!.GetValue<string>());
        Assert.Contains("لا توجد خدمة رسائل تلقائية", inviteJson["message"]!.GetValue<string>());

        var teacherId = GuidValue((await teacher.GetFromJsonAsync<JsonNode>("/api/auth/me"))!["id"]);
        var publicInvite = await factory.CreateClient().GetFromJsonAsync<JsonNode>($"/api/public/invitations/{token}");
        Assert.Equal(teacherId, GuidValue(publicInvite!["teacherId"]));
        Assert.Equal(studentPhone, publicInvite["studentPhone"]!.GetValue<string>());
        var publicTeachers = await factory.CreateClient().GetFromJsonAsync<JsonNode>("/api/public/teachers");
        Assert.Contains(publicTeachers!.AsArray(), x => GuidValue(x!["id"]) == teacherId);
        var (student, studentAuth) = await RegisterStudent(teacherId, $"طالب مدعو {LetterSuffix()} مميز", studentPhone, invitationToken: token);

        var link = await student.GetFromJsonAsync<JsonNode>("/api/student/link-requests");
        Assert.Equal("Accepted", link!.AsArray().Single()!["status"]!.GetValue<string>());
        Assert.Equal("Teacher", link.AsArray().Single()!["initiatedBy"]!.GetValue<string>());

        var profile = await student.GetFromJsonAsync<JsonNode>("/api/student/profile");
        Assert.Equal("TeacherInvitation", profile!["profile"]!["registrationSource"]!.GetValue<string>());

        var invitations = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/students/invitations");
        var consumed = invitations!.AsArray().Single(x => x!["token"]!.GetValue<string>() == token);
        Assert.Equal("Accepted", consumed!["effectiveStatus"]!.GetValue<string>());

        // A second invitation cannot create a duplicate account for the same phone.
        var duplicate = await teacher.PostAsJsonAsync("/api/teacher/students/invite", new
        {
            fullName = $"طالب مكرر {LetterSuffix()} مميز",
            studentPhone,
            parentPhone = Phone("02"),
            stage = Stage,
            grade = Grade
        });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Contains("يوجد حساب طالب", (await Json(duplicate))["message"]!.GetValue<string>());

        Assert.False(string.IsNullOrWhiteSpace(studentAuth["studentCode"]!.GetValue<string>()));
    }

    [Fact]
    public async Task LoginSession_IsFixedAt24Hours_AndRefreshCannotExtendIt()
    {
        var (teacher, auth) = await RegisterTeacher("مدرس جلسة اليوم");
        var sessionExpiry = auth["sessionExpiresAtUtc"]!.GetValue<DateTime>();
        var remaining = sessionExpiry - DateTime.UtcNow;
        Assert.InRange(remaining.TotalHours, 23.5, 24.1);

        var token = auth["token"]!.GetValue<string>();
        var payload = token.Split('.')[1].Replace('-', '+').Replace('_', '/');
        payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
        var jwt = JsonNode.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(payload)))!;
        var jwtExpiry = DateTimeOffset.FromUnixTimeSeconds(jwt["exp"]!.GetValue<long>()).UtcDateTime;
        Assert.True((jwtExpiry - sessionExpiry).Duration() < TimeSpan.FromSeconds(5));

        var refresh = await factory.CreateClient().PostAsJsonAsync("/api/auth/refresh", new
        {
            refreshToken = auth["refreshToken"]!.GetValue<string>()
        });
        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        var refreshed = await Json(refresh);
        Assert.Equal(sessionExpiry, refreshed["sessionExpiresAtUtc"]!.GetValue<DateTime>());

        // Multiple refresh rotations must all keep the same absolute session expiry.
        var rotated = refreshed;
        for (var i = 0; i < 3; i++)
        {
            var rotate = await factory.CreateClient().PostAsJsonAsync("/api/auth/refresh", new
            {
                refreshToken = rotated["refreshToken"]!.GetValue<string>()
            });
            Assert.Equal(HttpStatusCode.OK, rotate.StatusCode);
            rotated = await Json(rotate);
            Assert.Equal(sessionExpiry, rotated["sessionExpiresAtUtc"]!.GetValue<DateTime>());
        }

        // Force the fixed session into the past while the refresh token itself is still valid.
        var userId = GuidValue(auth["userId"]);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = await db.Users.SingleAsync(x => x.Id == userId);
            user.SessionExpiresAtUtc = DateTime.UtcNow.AddSeconds(-1);
            user.RefreshTokenExpiresUtc = DateTime.UtcNow.AddHours(1);
            await db.SaveChangesAsync();
        }
        var expired = await factory.CreateClient().PostAsJsonAsync("/api/auth/refresh", new
        {
            refreshToken = rotated["refreshToken"]!.GetValue<string>()
        });
        Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);
        Assert.Equal("session_expired", (await Json(expired))["code"]!.GetValue<string>());
        Assert.False(string.IsNullOrWhiteSpace((await Json(expired))["message"]!.GetValue<string>()));
    }

    [Fact]
    public async Task AcademicHistory_KeepsImmutableSnapshots_AndOldYearExamsAreHidden()
    {
        var (teacher, teacherAuth) = await RegisterTeacher("مدرس السجل الأكاديمي");
        var teacherId = GuidValue(teacherAuth["userId"]);
        var (student, studentAuth) = await RegisterStudent(teacherId, "طالب السجل الأكاديمي");
        await AcceptStudent(teacher, student);
        var studentId = GuidValue(studentAuth["userId"]);

        // A legacy/old-year exam and attempt, written directly to prove history and filtering.
        var oldExamId = Guid.NewGuid();
        var submissionId = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Exams.Add(new Emtehani.Domain.Entities.Exam
            {
                Id = oldExamId,
                TeacherId = teacherId,
                Title = "امتحان عام سابق",
                DurationMinutes = 30,
                MaxAttempts = 1,
                IsPublished = true,
                Status = "Active",
                JoinCode = Guid.NewGuid().ToString("N")[..8],
                Stage = Stage,
                Grade = Grade,
                AcademicYear = "2020/2021"
            });
            db.Submissions.Add(new Emtehani.Domain.Entities.Submission
            {
                Id = submissionId,
                ExamId = oldExamId,
                StudentId = studentId,
                AttemptNumber = 1,
                Status = "Reviewed",
                Score = 15,
                MaxScore = 20,
                StartedAtUtc = DateTime.UtcNow.AddHours(-2),
                SubmittedAtUtc = DateTime.UtcNow.AddHours(-1),
                StageAtAttempt = Stage,
                GradeAtAttempt = Grade,
                AcademicYearAtAttempt = "2020/2021"
            });
            await db.SaveChangesAsync();
        }

        var profile = await student.GetFromJsonAsync<JsonNode>("/api/student/profile");
        var groups = profile!["history"]!.AsArray();
        var archived = groups.Single(x => x!["academicYear"]!.GetValue<string>() == "2020/2021");
        Assert.Equal(Stage, archived!["stage"]!.GetValue<string>());
        Assert.Equal(Grade, archived["grade"]!.GetValue<string>());
        Assert.Equal(1, archived["attemptsCount"]!.GetValue<int>());
        Assert.Equal("امتحان عام سابق", archived["items"]![0]!["examTitle"]!.GetValue<string>());

        var available = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.DoesNotContain(available!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == oldExamId);

        var enterOld = await student.PostAsync($"/api/exams/{oldExamId}/enter", null);
        Assert.Equal(HttpStatusCode.Conflict, enterOld.StatusCode);
        Assert.Contains("عام دراسي سابق", (await Json(enterOld))["message"]!.GetValue<string>());

        var update = await student.PutAsJsonAsync("/api/student/profile", new
        {
            fullName = "طالب السجل الأكاديمي المعدل",
            studentPhone = await GetStudentPhone(student),
            parentPhone = (await student.GetFromJsonAsync<JsonNode>("/api/student/profile"))!["profile"]!["parentPhone"]!.GetValue<string>(),
            stage = NextStage,
            grade = NextGrade
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updateJson = await Json(update);
        Assert.True(updateJson["changed"]!.GetValue<bool>());
        Assert.Contains("الأكاديمي السابق", updateJson["message"]!.GetValue<string>());

        var after = await student.GetFromJsonAsync<JsonNode>("/api/student/profile");
        var change = after!["changes"]!.AsArray().Single(x => x!["newStage"]!.GetValue<string>() == NextStage);
        Assert.Equal(Stage, change!["previousStage"]!.GetValue<string>());
        Assert.Equal(NextStage, after["profile"]!["stage"]!.GetValue<string>());

        // A second stage/grade change keeps both audit entries and leaves history intact.
        var secondUpdate = await student.PutAsJsonAsync("/api/student/profile", new
        {
            fullName = "طالب السجل الأكاديمي المعدل",
            studentPhone = await GetStudentPhone(student),
            parentPhone = after["profile"]!["parentPhone"]!.GetValue<string>(),
            stage = Stage,
            grade = Grade
        });
        Assert.Equal(HttpStatusCode.OK, secondUpdate.StatusCode);
        Assert.True((await Json(secondUpdate))["changed"]!.GetValue<bool>());

        var finalProfile = await student.GetFromJsonAsync<JsonNode>("/api/student/profile");
        var finalChanges = finalProfile!["changes"]!.AsArray();
        Assert.Equal(2, finalChanges.Count);
        var secondChange = finalChanges.Single(x =>
            x!["previousStage"]!.GetValue<string>() == NextStage
            && x["newStage"]!.GetValue<string>() == Stage);
        Assert.Equal(NextGrade, secondChange["previousGrade"]!.GetValue<string>());
        Assert.Equal(Grade, secondChange["newGrade"]!.GetValue<string>());
        var archivedFinal = finalProfile["history"]!.AsArray()
            .Single(x => x!["academicYear"]!.GetValue<string>() == "2020/2021");
        Assert.Equal(Stage, archivedFinal!["stage"]!.GetValue<string>());
        Assert.Equal(Grade, archivedFinal["grade"]!.GetValue<string>());

        // The old attempt snapshot was not rewritten by the profile change.
        var archivedAfter = after["history"]!.AsArray()
            .Single(x => x!["academicYear"]!.GetValue<string>() == "2020/2021");
        Assert.Equal(Stage, archivedAfter!["stage"]!.GetValue<string>());
        Assert.Equal(Grade, archivedAfter["grade"]!.GetValue<string>());
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var stored = await db.Submissions.AsNoTracking().SingleAsync(x => x.Id == submissionId);
            Assert.Equal(Stage, stored.StageAtAttempt);
            Assert.Equal("2020/2021", stored.AcademicYearAtAttempt);
        }
    }

    [Fact]
    public async Task PendingTeacher_IsBlockedFromWorkspaceUntilFreeIsConfirmed()
    {
        var (teacher, _) = await RegisterTeacher("مدرس اشتراك معلق", confirmSubscription: false);

        var overview = await teacher.GetAsync("/api/teacher/overview");
        Assert.Equal(HttpStatusCode.Forbidden, overview.StatusCode);
        Assert.Equal("subscription_pending", (await Json(overview))["code"]!.GetValue<string>());

        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.GetAsync("/api/teacher/students")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.PostAsJsonAsync("/api/exams", new { title = "غير مسموح" })).StatusCode);

        // Confirmation itself and plan discovery stay available.
        Assert.Equal(HttpStatusCode.OK, (await teacher.GetAsync("/api/teacher/subscription")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await teacher.GetAsync("/api/subscriptions/plans")).StatusCode);
        var confirm = await teacher.PostAsJsonAsync("/api/teacher/subscription", new { planCode = "free" });
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await teacher.GetAsync("/api/teacher/overview")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await teacher.GetAsync("/api/teacher/students")).StatusCode);
    }

    [Fact]
    public async Task Student_CannotAccessTeacherWorkspaceOrExamsBeforeLinkAcceptance()
    {
        var (targetTeacher, targetAuth) = await RegisterTeacher("مدرس الهدف الأمني");
        var targetId = GuidValue(targetAuth["userId"]);
        var (hostTeacher, hostAuth) = await RegisterTeacher("مدرس الاستضافة الأمنية");
        var (student, studentAuth) = await RegisterStudent(GuidValue(hostAuth["userId"]), "طالب فحص الوصول");
        var examId = Guid.NewGuid();

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Exams.Add(new Emtehani.Domain.Entities.Exam
            {
                Id = examId,
                TeacherId = targetId,
                Title = "امتحان لا يظهر قبل الموافقة",
                DurationMinutes = 30,
                MaxAttempts = 1,
                IsPublished = true,
                Status = "Active",
                JoinCode = Guid.NewGuid().ToString("N")[..8],
                Stage = Stage,
                Grade = Grade,
                AcademicYear = Emtehani.Domain.Services.AcademicYear.Current()
            });
            await db.SaveChangesAsync();
        }

        var available = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.DoesNotContain(available!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == examId);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsync($"/api/exams/{examId}/enter", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync($"/api/exams/{examId}/paper")).StatusCode);

        // Role separation: a student cannot call teacher workspace or lookup APIs.
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/teacher/overview")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/teacher/students")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/teacher/requests")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/teacher/students/lookup?phone=01000000000")).StatusCode);

        // Requesting the target teacher does not grant access until the teacher accepts.
        var request = await student.PostAsync($"/api/teachers/{targetId}/request", null);
        Assert.Equal(HttpStatusCode.OK, request.StatusCode);
        var stillHidden = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.DoesNotContain(stillHidden!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == examId);

        var rows = await targetTeacher.GetFromJsonAsync<JsonNode>("/api/teacher/requests");
        var pending = rows!.AsArray().Single(x =>
            x!["studentEmail"]!.GetValue<string>() == studentAuth["email"]!.GetValue<string>()
            && x["status"]!.GetValue<string>() == "Pending");
        var accept = await targetTeacher.PutAsJsonAsync($"/api/teacher/requests/{GuidValue(pending!["id"])}", new { action = "accept" });
        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);

        var visible = await student.GetFromJsonAsync<JsonNode>("/api/exams/available");
        Assert.Contains(visible!["items"]!.AsArray(), x => GuidValue(x!["examId"]) == examId);
    }

    [Fact]
    public async Task TeacherSubscription_StartsPendingFree_AndCanBeConfirmed()
    {
        var (teacher, _) = await RegisterTeacher("مدرس الاشتراك المجاني", confirmSubscription: false);
        var before = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/subscription");
        Assert.True(before!["requiresSelection"]!.GetValue<bool>());
        Assert.Equal("Pending", before["subscription"]!["status"]!.GetValue<string>());
        Assert.Equal("free", before["subscription"]!["planCode"]!.GetValue<string>());
        var freePlan = before["plans"]!.AsArray().Single(x => x!["code"]!.GetValue<string>() == "free");
        Assert.True(freePlan!["isDefault"]!.GetValue<bool>());
        Assert.True(freePlan["features"]!.AsArray().Count > 0);
        Assert.Null(freePlan["price"]);
        Assert.Null(freePlan["priceMonthly"]);
        Assert.Null(freePlan["paymentRequired"]);

        var select = await teacher.PostAsJsonAsync("/api/teacher/subscription", new { planCode = "free" });
        Assert.Equal(HttpStatusCode.OK, select.StatusCode);
        Assert.Equal("Confirmed", (await Json(select))["status"]!.GetValue<string>());

        var after = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/subscription");
        Assert.False(after!["requiresSelection"]!.GetValue<bool>());
        Assert.Equal("Confirmed", after["subscription"]!["status"]!.GetValue<string>());
        Assert.NotNull(after["subscription"]!["startedAtUtc"]);
        Assert.Null(after["subscription"]!["endsAtUtc"]);
    }
}

public sealed class AdminApiFactory : ApiFactory
{
    protected override void ConfigureTestSettings(IWebHostBuilder builder)
    {
        builder.UseSetting("Admin:BootstrapEmail", "admin-bootstrap@example.test");
        builder.UseSetting("Admin:BootstrapPassword", "AdminPassw0rd!2026");
    }
}

public sealed class AdminDashboardTests(AdminApiFactory factory) : IClassFixture<AdminApiFactory>
{
    private static string LetterSuffix()
    {
        var value = new string(Guid.NewGuid().ToString("N").Where(char.IsLetter).Take(6).ToArray());
        return value.Length >= 2 ? value : "مم";
    }

    [Fact]
    public async Task AdminOverview_IsRoleProtected_AndReportsSubscriptionAndLinkCounts()
    {
        var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/admin/overview")).StatusCode);

        var teacherClient = factory.CreateClient();
        var teacherEmail = $"admin-rbac-teacher-{Guid.NewGuid():N}@example.test";
        Assert.Equal(HttpStatusCode.OK, (await teacherClient.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "مدرس لوحة الإدارة",
            email = teacherEmail,
            password = "Passw0rd!2026",
            role = "Teacher"
        })).StatusCode);
        var teacherLogin = await teacherClient.PostAsJsonAsync("/api/auth/login", new { email = teacherEmail, password = "Passw0rd!2026" });
        var teacherAuth = JsonNode.Parse(await teacherLogin.Content.ReadAsStringAsync())!;
        teacherClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", teacherAuth["token"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.Forbidden, (await teacherClient.GetAsync("/api/admin/overview")).StatusCode);

        // Link one student so the admin count is verified against real accepted links.
        var studentPhone = "01" + Random.Shared.Next(100000000, 999999999).ToString(System.Globalization.CultureInfo.InvariantCulture);
        var parentPhone = "01" + Random.Shared.Next(100000000, 999999999).ToString(System.Globalization.CultureInfo.InvariantCulture);
        var studentEmail = $"admin-linked-student-{Guid.NewGuid():N}@example.test";
        var teacherId = Guid.Parse(teacherAuth["userId"]!.GetValue<string>());
        var studentRegister = await factory.CreateClient().PostAsJsonAsync("/api/auth/register", new
        {
            fullName = $"طالب عدّاد الإدارة {LetterSuffix()} مميز",
            email = studentEmail,
            password = "Passw0rd!2026",
            role = "Student",
            stage = "ثانوي",
            grade = "الصف الثالث الثانوي",
            studentPhone,
            parentPhone,
            teacherCount = 1,
            teacherIds = new[] { teacherId }
        });
        Assert.Equal(HttpStatusCode.OK, studentRegister.StatusCode);
        // Link the student directly for the count assertion; the teacher account intentionally
        // stays Pending so the admin dashboard still shows the unconfirmed-subscription state.
        var studentClient = factory.CreateClient();
        var studentLogin = await studentClient.PostAsJsonAsync("/api/auth/login", new { email = studentEmail, password = "Passw0rd!2026" });
        Assert.Equal(HttpStatusCode.OK, studentLogin.StatusCode);
        var studentAuth = JsonNode.Parse(await studentLogin.Content.ReadAsStringAsync())!;
        studentClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", studentAuth["token"]!.GetValue<string>());
        using (var linkScope = factory.Services.CreateScope())
        {
            var linkDb = linkScope.ServiceProvider.GetRequiredService<AppDbContext>();
            var linkedStudent = await linkDb.Users.SingleAsync(x => x.Email == studentEmail);
            var relationship = await linkDb.TeacherStudentRequests.SingleAsync(x => x.TeacherId == teacherId && x.StudentId == linkedStudent.Id);
            relationship.Status = "Accepted";
            relationship.DecidedAtUtc = DateTime.UtcNow;
            await linkDb.SaveChangesAsync();
        }

        // Every admin endpoint must reject both a teacher and a student.
        foreach (var forbiddenClient in new[] { teacherClient, studentClient })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await forbiddenClient.GetAsync("/api/admin/overview")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await forbiddenClient.GetAsync("/api/admin/subscription-settings")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await forbiddenClient.PutAsJsonAsync("/api/admin/subscription-settings", new { features = new[] { "exams" } })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await forbiddenClient.PostAsJsonAsync("/api/admin/reset", new { })).StatusCode);
        }

        var admin = factory.CreateClient();
        var login = await admin.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin-bootstrap@example.test",
            password = "AdminPassw0rd!2026"
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = JsonNode.Parse(await login.Content.ReadAsStringAsync())!;
        Assert.Equal("Admin", auth["role"]!.GetValue<string>());
        admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());

        var overview = await admin.GetFromJsonAsync<JsonNode>("/api/admin/overview");
        Assert.True(overview!["summary"]!["totalTeachers"]!.GetValue<int>() >= 1);
        Assert.True(overview["summary"]!["freePlanTeachers"]!.GetValue<int>() >= 1);
        Assert.True(overview["summary"]!["totalStudents"]!.GetValue<int>() >= 0);
        var row = overview["items"]!.AsArray().Single(x => x!["email"]!.GetValue<string>() == teacherEmail);
        Assert.Equal("free", row!["subscription"]!["planCode"]!.GetValue<string>());
        Assert.Equal("Pending", row["subscription"]!["status"]!.GetValue<string>());
        Assert.Equal(1, row["acceptedStudentCount"]!.GetValue<int>());
        Assert.Equal(0, row["pendingRequestCount"]!.GetValue<int>());
        Assert.NotNull(row["createdAtUtc"]);

        var filtered = await admin.GetFromJsonAsync<JsonNode>($"/api/admin/overview?search={Uri.EscapeDataString(teacherEmail)}&planStatus=Pending&sort=name");
        Assert.Single(filtered!["items"]!.AsArray());
        Assert.Equal(1, filtered["total"]!.GetValue<int>());

        var freeOnly = await admin.GetFromJsonAsync<JsonNode>("/api/admin/overview?planStatus=Free");
        Assert.True(freeOnly!["items"]!.AsArray().Count >= 1);

        var settings = await admin.GetFromJsonAsync<JsonNode>("/api/admin/subscription-settings");
        Assert.Equal("free", settings!["planCode"]!.GetValue<string>());
        Assert.True(settings["editableFeatures"]!.AsArray().Count >= 1);

        // Self-promotion is impossible: an Admin role submitted to public registration is
        // normalized to Student, and the bootstrap account remains the only Admin.
        var selfPromote = factory.CreateClient();
        var selfPromoteEmail = $"admin-selfpromote-{Guid.NewGuid():N}@example.test";
        var selfPromoteRegister = await selfPromote.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = $"طالب ترقية ذاتية {LetterSuffix()}",
            email = selfPromoteEmail,
            password = "Passw0rd!2026",
            role = "Admin",
            stage = "ثانوي",
            grade = "الصف الثالث الثانوي",
            studentPhone = "01" + Random.Shared.Next(100000000, 999999999).ToString(System.Globalization.CultureInfo.InvariantCulture),
            parentPhone = "01" + Random.Shared.Next(100000000, 999999999).ToString(System.Globalization.CultureInfo.InvariantCulture),
            teacherCount = 1,
            teacherIds = new[] { teacherId }
        });
        Assert.Equal(HttpStatusCode.OK, selfPromoteRegister.StatusCode);
        var selfLogin = await selfPromote.PostAsJsonAsync("/api/auth/login", new { email = selfPromoteEmail, password = "Passw0rd!2026" });
        var selfAuth = JsonNode.Parse(await selfLogin.Content.ReadAsStringAsync())!;
        Assert.Equal("Student", selfAuth["role"]!.GetValue<string>());
        selfPromote.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", selfAuth["token"]!.GetValue<string>());
        Assert.Equal(HttpStatusCode.Forbidden, (await selfPromote.GetAsync("/api/admin/overview")).StatusCode);

        using (var adminScope = factory.Services.CreateScope())
        {
            var adminDb = adminScope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(1, await adminDb.Users.CountAsync(x => x.Role == "Admin"));
        }
    }
}
