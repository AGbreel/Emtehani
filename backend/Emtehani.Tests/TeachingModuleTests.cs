using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
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

    private static object Course(string title) => new
    {
        title,
        shortDescription = "وصف قصير",
        description = "وصف تفصيلي للكورس",
        subject = "الرياضيات",
        stage = "ثانوي",
        grade = "الصف الثالث الثانوي",
        deliveryMode = "Online",
        isFree = false,
        price = 100,
        capacity = 30,
        accessDays = 90,
        isPublished = true
    };

    private static object Group(string name) => new
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
        enrollmentOpen = true,
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
