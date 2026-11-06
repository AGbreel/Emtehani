using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Emtehani.Tests;

/// <summary>
/// End-to-end coverage for the multi-tenant teaching module: tenant isolation,
/// server-enforced assistant permissions, the paid-plan verification flow, and
/// chat governance modes. Each test uses generated emails and codes so the shared
/// SQLite fixture stays valid across runs.
/// </summary>
public sealed class TeachingModuleTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Password = "Passw0rd!2026";

    private static string Email(string prefix) => $"{prefix}-{Guid.NewGuid():N}@example.test";
    private static Guid Id(JsonNode? node) => Guid.Parse(node!["id"]!.GetValue<string>());

    private static async Task<JsonNode> Json(HttpResponseMessage response) =>
        JsonNode.Parse(await response.Content.ReadAsStringAsync())!;

    private async Task<(HttpClient Client, Guid TeacherId)> Teacher(string name, bool confirm = true)
    {
        var client = factory.CreateClient();
        var email = Email("teaching-teacher");
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = name,
            email,
            password = Password,
            role = "Teacher"
        });
        Assert.Equal(HttpStatusCode.OK, register.StatusCode);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await Json(login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());
        if (confirm)
        {
            var select = await client.PostAsJsonAsync("/api/teacher/subscription", new { planCode = "free" });
            Assert.Equal(HttpStatusCode.OK, select.StatusCode);
        }
        return (client, Guid.Parse(auth["userId"]!.GetValue<string>()));
    }

    private async Task<HttpClient> LinkedStudent(HttpClient teacher, Guid teacherId, string name)
    {
        var client = factory.CreateClient();
        var email = Email("teaching-student");
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = name,
            email,
            password = Password,
            role = "Student",
            stage = "ثانوي",
            grade = "الصف الثالث الثانوي",
            studentPhone = "01" + Random.Shared.Next(100000000, 999999999),
            parentPhone = "01" + Random.Shared.Next(100000000, 999999999),
            teacherCount = 1,
            teacherIds = new[] { teacherId }
        });
        Assert.True(register.StatusCode == HttpStatusCode.OK,
            $"{register.StatusCode}: {await register.Content.ReadAsStringAsync()}");
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await Json(login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());

        var requests = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/requests");
        var row = requests!.AsArray().First(x =>
            x!["studentEmail"]!.GetValue<string>() == email
            && x["status"]!.GetValue<string>() == "Pending");
        var accept = await teacher.PutAsJsonAsync($"/api/teacher/requests/{Id(row)}", new { action = "accept" });
        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);
        return client;
    }

    private static object Course(string title, bool isFree = false) => new
    {
        title,
        shortDescription = "وصف قصير",
        description = "وصف تفصيلي للكورس",
        subject = "الرياضيات",
        stage = "ثانوي",
        grade = "الصف الثالث الثانوي",
        deliveryMode = "Online",
        isFree,
        price = isFree ? 0 : 100,
        capacity = 30,
        accessDays = 90,
        isPublished = true
    };

    private static object Group(string name, bool enrollmentOpen = true) => new
    {
        name,
        description = "مجموعة اختبار",
        subject = "الرياضيات",
        stage = "ثانوي",
        grade = "الصف الثالث الثانوي",
        academicYear = "2026/2027",
        deliveryMode = "Online",
        capacity = 25,
        price = 150,
        paymentType = "Monthly",
        monthlyDueDay = 5,
        sessionBillingPolicy = "PerAttendedSession",
        enrollmentOpen,
        isActive = true,
        lateGraceMinutes = 10,
        qrValidityMinutes = 5,
        chatMode = "Everyone"
    };

    [Fact]
    public async Task Teacher_CanCreateCourseAndGroup_AndOverviewReflectsThem()
    {
        var (teacher, _) = await Teacher("مدرس المنهج التعليمي");

        var course = await teacher.PostAsJsonAsync("/api/teaching/courses", Course("كورس التفاضل والتكامل"));
        Assert.Equal(HttpStatusCode.OK, course.StatusCode);
        var courseId = Id(await Json(course));

        var group = await teacher.PostAsJsonAsync("/api/teaching/groups", Group("مجموعة التفاضل"));
        Assert.Equal(HttpStatusCode.OK, group.StatusCode);

        var courses = await teacher.GetFromJsonAsync<JsonNode>("/api/teaching/courses");
        Assert.Contains(courses!["items"]!.AsArray(), x => Guid.Parse(x!["id"]!.GetValue<string>()) == courseId);

        var groups = await teacher.GetFromJsonAsync<JsonNode>("/api/teaching/groups");
        Assert.Contains(groups!["items"]!.AsArray(), x => x!["name"]!.GetValue<string>() == "مجموعة التفاضل");

        var unit = await teacher.PostAsJsonAsync($"/api/teaching/courses/{courseId}/units", new { title = "الوحدة الأولى", sortOrder = 1 });
        Assert.Equal(HttpStatusCode.OK, unit.StatusCode);
        var unitId = Id(await Json(unit));

        var lesson = await teacher.PostAsJsonAsync($"/api/teaching/units/{unitId}/lessons", new
        {
            title = "الدرس الأول",
            videoUrl = "https://cdn.example.test/video.mp4",
            isPublished = true,
            sortOrder = 1
        });
        Assert.Equal(HttpStatusCode.OK, lesson.StatusCode);
        var lessonId = Id(await Json(lesson));

        var material = await teacher.PostAsJsonAsync($"/api/teaching/lessons/{lessonId}/materials", new
        {
            title = "ملزمة الدرس",
            kind = "Pdf",
            url = "https://cdn.example.test/lesson.pdf",
            isDownloadable = true,
            isPublished = true
        });
        Assert.Equal(HttpStatusCode.OK, material.StatusCode);
        var materialId = Id(await Json(material));

        var access = await teacher.GetFromJsonAsync<JsonNode>($"/api/teaching/materials/{materialId}/access");
        Assert.NotNull(access!["url"]);
        Assert.Contains("token=", access["url"]!.GetValue<string>());
        Assert.NotNull(access["watermark"]);

        var overview = await teacher.GetFromJsonAsync<JsonNode>("/api/teaching/overview");
        Assert.Equal(1, overview!["counts"]!["courses"]!.GetValue<int>());
        Assert.Equal(1, overview["counts"]!["groups"]!.GetValue<int>());
    }

    [Fact]
    public async Task Courses_AreIsolatedBetweenTeachers()
    {
        var (first, _) = await Teacher("مدرس العزل الأول");
        var (second, _) = await Teacher("مدرس العزل الثاني");

        var created = await first.PostAsJsonAsync("/api/teaching/courses", Course("كورس خاص بالمدرس الأول"));
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var courseId = Id(await Json(created));

        var crossTenant = await second.GetAsync($"/api/teaching/courses/{courseId}");
        Assert.Equal(HttpStatusCode.NotFound, crossTenant.StatusCode);

        var list = await second.GetFromJsonAsync<JsonNode>("/api/teaching/courses");
        Assert.DoesNotContain(list!["items"]!.AsArray(), x => Guid.Parse(x!["id"]!.GetValue<string>()) == courseId);
    }

    [Fact]
    public async Task AssistantPermissions_AreEnforcedOnEveryRequest()
    {
        var (teacher, _) = await Teacher("مدرس صلاحيات المساعد");
        var createdCourse = await teacher.PostAsJsonAsync("/api/teaching/courses", Course("كورس المساعد"));
        Assert.Equal(HttpStatusCode.OK, createdCourse.StatusCode);

        var email = Email("assistant");
        var created = await teacher.PostAsJsonAsync("/api/teaching/assistants", new
        {
            email,
            fullName = "مساعد الاختبار",
            password = "AssistPassw0rd!2026",
            permissions = new[] { "Courses.View" },
            groupIds = Array.Empty<Guid>()
        });
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var assistantLink = await Json(created);
        var assistantLinkId = Id(assistantLink);

        var assistant = factory.CreateClient();
        var login = await assistant.PostAsJsonAsync("/api/auth/login", new { email, password = "AssistPassw0rd!2026" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await Json(login);
        assistant.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());

        Assert.Equal(HttpStatusCode.OK, (await assistant.GetAsync("/api/teaching/courses")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await assistant.PostAsJsonAsync("/api/teaching/courses", Course("محاولة غير مصرح بها"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await assistant.GetAsync("/api/teaching/assistants")).StatusCode);

        var update = await teacher.PutAsJsonAsync($"/api/teaching/assistants/{assistantLinkId}", new
        {
            status = "Active",
            permissions = new[] { "Courses.View", "Courses.Manage" },
            groupIds = Array.Empty<Guid>()
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        var nowAllowed = await assistant.PostAsJsonAsync("/api/teaching/courses", Course("كورس بعد منح الصلاحية"));
        Assert.Equal(HttpStatusCode.OK, nowAllowed.StatusCode);
    }

    [Fact]
    public async Task ChatModeChange_IsStoredAndValidatedServerSide()
    {
        var (teacher, _) = await Teacher("مدرس أوضاع المحادثة");
        var group = await teacher.PostAsJsonAsync("/api/teaching/groups", Group("مجموعة المحادثة"));
        Assert.Equal(HttpStatusCode.OK, group.StatusCode);
        var groupId = Id(await Json(group));

        var conversations = await teacher.GetFromJsonAsync<JsonNode>("/api/chat/conversations");
        var conversation = conversations!["items"]!.AsArray()
            .Single(x => x!["groupId"] is not null && Guid.Parse(x["groupId"]!.GetValue<string>()) == groupId);
        var conversationId = Guid.Parse(conversation!["id"]!.GetValue<string>());

        var changed = await teacher.PutAsJsonAsync($"/api/chat/conversations/{conversationId}/mode", new { mode = "TeacherOnly" });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        Assert.Equal("TeacherOnly", (await Json(changed))["chatMode"]!.GetValue<string>());

        var control = await teacher.GetFromJsonAsync<JsonNode>($"/api/chat/conversations/{conversationId}/control");
        Assert.True(control!["canManage"]!.GetValue<bool>());
        Assert.Equal("TeacherOnly", control["chatMode"]!.GetValue<string>());
        Assert.Contains("Everyone", control["allowedModes"]!.AsArray().Select(x => x!.GetValue<string>()));

        var invalid = await teacher.PutAsJsonAsync($"/api/chat/conversations/{conversationId}/mode", new { mode = "BanEveryone" });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task MediaUpload_RequiresTeacher_RejectsDisguisedFiles_AndStoresVideos()
    {
        static ByteArrayContent Mp4Body() => new(new byte[]
        {
            0x00, 0x00, 0x00, 0x18, (byte)'f', (byte)'t', (byte)'y', (byte)'p',
            (byte)'i', (byte)'s', (byte)'o', (byte)'m', 0x00, 0x00, 0x02, 0x00
        });

        using (var anonymousForm = new MultipartFormDataContent())
        {
            var content = Mp4Body();
            content.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
            anonymousForm.Add(content, "file", "lesson.mp4");
            var anonymous = await factory.CreateClient().PostAsync("/api/uploads/media", anonymousForm);
            Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        }

        var teacherResult = await Teacher("مدرس رفع الوسائط");
        var teacher = teacherResult.Client;

        using (var disguisedForm = new MultipartFormDataContent())
        {
            var content = new ByteArrayContent(Encoding.UTF8.GetBytes("<html>definitely not a video</html>"));
            content.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
            disguisedForm.Add(content, "file", "fake.mp4");
            var disguised = await teacher.PostAsync("/api/uploads/media", disguisedForm);
            Assert.Equal(HttpStatusCode.BadRequest, disguised.StatusCode);
        }

        using (var validForm = new MultipartFormDataContent())
        {
            var content = Mp4Body();
            content.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
            validForm.Add(content, "file", "lesson.mp4");
            var response = await teacher.PostAsync("/api/uploads/media", validForm);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var payload = await Json(response);
            Assert.Equal("Video", payload["kind"]!.GetValue<string>());
            Assert.Equal(16, payload["sizeBytes"]!.GetValue<long>());
            var url = payload["url"]!.GetValue<string>();
            if (url.StartsWith("/uploads/"))
            {
                var root = factory.Services.GetRequiredService<IWebHostEnvironment>().ContentRootPath;
                var path = Path.Combine(root, "wwwroot", url.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
                Assert.True(File.Exists(path));
                File.Delete(path);
            }
            else
            {
                Assert.StartsWith("https://", url);
            }
        }
    }

    [Fact]
    public async Task Students_DiscoverLinkedGroupsAndCourses_AndJoinThemselves()
    {
        var (teacher, teacherId) = await Teacher("مدرس الاستكشاف");
        var student = await LinkedStudent(teacher, teacherId, "طالب الاستكشاف محمد أحمد");
        var (otherTeacher, otherId) = await Teacher("مدرس آخر للاستكشاف");
        var stranger = await LinkedStudent(otherTeacher, otherId, "طالب غير مرتبط علي حسن");

        var freeCourse = await teacher.PostAsJsonAsync("/api/teaching/courses", Course("كورس مجاني", isFree: true));
        Assert.Equal(HttpStatusCode.OK, freeCourse.StatusCode);
        var freeCourseId = Id(await Json(freeCourse));
        var paidCourse = await teacher.PostAsJsonAsync("/api/teaching/courses", Course("كورس مدفوع"));
        Assert.Equal(HttpStatusCode.OK, paidCourse.StatusCode);
        var paidCourseId = Id(await Json(paidCourse));

        var openGroup = await teacher.PostAsJsonAsync("/api/teaching/groups", Group("مجموعة مفتوحة"));
        Assert.Equal(HttpStatusCode.OK, openGroup.StatusCode);
        var openGroupId = Id(await Json(openGroup));
        var closedGroup = await teacher.PostAsJsonAsync("/api/teaching/groups", Group("مجموعة مغلقة", enrollmentOpen: false));
        Assert.Equal(HttpStatusCode.OK, closedGroup.StatusCode);
        var closedGroupId = Id(await Json(closedGroup));

        var explore = await student.GetFromJsonAsync<JsonNode>("/api/teaching/explore/groups");
        var openRow = explore!["items"]!.AsArray().Single(x => Id(x) == openGroupId);
        Assert.True(openRow!["canJoin"]!.GetValue<bool>());
        Assert.Equal(0, openRow["activeMembers"]!.GetValue<int>());
        var closedRow = explore["items"]!.AsArray().Single(x => Id(x) == closedGroupId);
        Assert.False(closedRow!["canJoin"]!.GetValue<bool>());

        var catalog = await student.GetFromJsonAsync<JsonNode>("/api/teaching/catalog");
        Assert.Contains(catalog!["items"]!.AsArray(), x => Id(x) == freeCourseId);
        Assert.Contains(catalog["items"]!.AsArray(), x => Id(x) == paidCourseId);

        var joinGroup = await student.PostAsync($"/api/teaching/groups/{openGroupId}/join", null);
        Assert.Equal(HttpStatusCode.OK, joinGroup.StatusCode);
        Assert.False((await Json(joinGroup))["alreadyMember"]!.GetValue<bool>());
        var joinAgain = await student.PostAsync($"/api/teaching/groups/{openGroupId}/join", null);
        Assert.Equal(HttpStatusCode.OK, joinAgain.StatusCode);
        Assert.True((await Json(joinAgain))["alreadyMember"]!.GetValue<bool>());
        var myGroups = await student.GetFromJsonAsync<JsonNode>("/api/teaching/my/groups");
        Assert.Contains(myGroups!["items"]!.AsArray(), x => Id(x) == openGroupId);

        Assert.Equal(HttpStatusCode.BadRequest, (await student.PostAsync($"/api/teaching/groups/{closedGroupId}/join", null)).StatusCode);

        var joinCourse = await student.PostAsync($"/api/teaching/catalog/{freeCourseId}/join", null);
        Assert.Equal(HttpStatusCode.OK, joinCourse.StatusCode);
        Assert.False((await Json(joinCourse))["alreadyEnrolled"]!.GetValue<bool>());
        var enrollAgain = await student.PostAsync($"/api/teaching/catalog/{freeCourseId}/join", null);
        Assert.Equal(HttpStatusCode.OK, enrollAgain.StatusCode);
        Assert.True((await Json(enrollAgain))["alreadyEnrolled"]!.GetValue<bool>());
        var myCourses = await student.GetFromJsonAsync<JsonNode>("/api/teaching/my/courses");
        Assert.Contains(myCourses!["items"]!.AsArray(), x => Id(x) == freeCourseId);

        Assert.Equal(HttpStatusCode.BadRequest, (await student.PostAsync($"/api/teaching/catalog/{paidCourseId}/join", null)).StatusCode);

        var strangerExplore = await stranger.GetFromJsonAsync<JsonNode>("/api/teaching/explore/groups");
        Assert.Empty(strangerExplore!["items"]!.AsArray());
        var strangerCatalog = await stranger.GetFromJsonAsync<JsonNode>("/api/teaching/catalog");
        Assert.Empty(strangerCatalog!["items"]!.AsArray());
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.PostAsync($"/api/teaching/groups/{openGroupId}/join", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.PostAsync($"/api/teaching/catalog/{freeCourseId}/join", null)).StatusCode);
    }
}

public sealed class PaidSubscriptionFlowTests(AdminApiFactory factory) : IClassFixture<AdminApiFactory>
{
    private const string Password = "Passw0rd!2026";

    private static async Task<JsonNode> Json(HttpResponseMessage response) =>
        JsonNode.Parse(await response.Content.ReadAsStringAsync())!;

    [Fact]
    public async Task PaidPlan_StaysReadOnlyUntilAdminApprovesPayment()
    {
        var admin = factory.CreateClient();
        var adminLogin = await admin.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin-bootstrap@example.test",
            password = "AdminPassw0rd!2026"
        });
        Assert.Equal(HttpStatusCode.OK, adminLogin.StatusCode);
        var adminAuth = await Json(adminLogin);
        admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth["token"]!.GetValue<string>());

        var planCode = $"pro-{Guid.NewGuid():N}"[..20];
        var plan = await admin.PostAsJsonAsync("/api/admin/plans", new
        {
            code = planCode,
            name = "خطة اختبار مدفوعة",
            description = "خطة تُستخدم لاختبار دورة الدفع",
            isActive = true,
            isDefault = false,
            isPublic = true,
            sortOrder = 50,
            price = 250,
            currency = "EGP",
            billingPeriodDays = 30,
            trialDays = 0,
            graceDays = 5,
            maxStudents = 50,
            maxCourses = 5,
            maxGroups = 5,
            maxAssistants = 1,
            storageMb = 1024,
            maxVideoMinutes = 300,
            featuresJson = "[\"courses\",\"groups\"]"
        });
        Assert.Equal(HttpStatusCode.OK, plan.StatusCode);

        var teacherEmail = $"paid-teacher-{Guid.NewGuid():N}@example.test";
        var teacher = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await teacher.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "مدرس الاشتراك المدفوع",
            email = teacherEmail,
            password = Password,
            role = "Teacher"
        })).StatusCode);
        var login = await teacher.PostAsJsonAsync("/api/auth/login", new { email = teacherEmail, password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await Json(login);
        teacher.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());

        var request = await teacher.PostAsJsonAsync("/api/teacher/subscription", new
        {
            planCode,
            method = "InstaPay",
            reference = "REF-TEST-1",
            periods = 2
        });
        Assert.Equal(HttpStatusCode.OK, request.StatusCode);
        var requestBody = await Json(request);
        Assert.Equal("Pending", requestBody["status"]!.GetValue<string>());
        Assert.Equal(500m, requestBody["amount"]!.GetValue<decimal>());

        // Pending: reads still work, writes are blocked until the admin verifies the payment.
        Assert.Equal(HttpStatusCode.OK, (await teacher.GetAsync("/api/teaching/courses")).StatusCode);
        var blocked = await teacher.PostAsJsonAsync("/api/teaching/courses", new { title = "كورس قبل التفعيل" });
        Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);

        var payments = await admin.GetFromJsonAsync<JsonNode>("/api/admin/platform-payments?status=Pending");
        var payment = payments!["items"]!.AsArray().Single(x => x!["reference"]!.GetValue<string>() == "REF-TEST-1");
        var paymentId = Guid.Parse(payment!["id"]!.GetValue<string>());

        var approve = await admin.PostAsJsonAsync($"/api/admin/platform-payments/{paymentId}/approve", new { note = "تم التحقق" });
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);

        var subscription = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/subscription");
        Assert.Equal("Confirmed", subscription!["subscription"]!["status"]!.GetValue<string>());
        Assert.Equal(planCode, subscription["subscription"]!["planCode"]!.GetValue<string>());
        Assert.NotNull(subscription["subscription"]!["endsAtUtc"]);

        var allowed = await teacher.PostAsJsonAsync("/api/teaching/courses", new { title = "كورس بعد التفعيل" });
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);

        var history = await teacher.GetFromJsonAsync<JsonNode>("/api/teacher/subscription/payments");
        Assert.Contains(history!["payments"]!.AsArray(), x => x!["status"]!.GetValue<string>() == "Approved");

        // Teacher finance is a separate ledger and must not contain platform subscription money.
        var finance = await teacher.GetFromJsonAsync<JsonNode>("/api/teaching/finance/summary");
        Assert.Equal(0m, finance!["totalPaid"]!.GetValue<decimal>());
    }
}
