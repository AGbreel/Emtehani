using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Emtehani.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Emtehani.Tests;

/// <summary>
/// The developer portfolio is a single admin-owned JSON document. The public page
/// must read it anonymously, while every write stays restricted to administrators.
/// </summary>
public sealed class DeveloperPortfolioTests(AdminApiFactory factory) : IClassFixture<AdminApiFactory>
{
    private async Task<HttpClient> Admin()
    {
        var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin-bootstrap@example.test",
            password = "AdminPassw0rd!2026"
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = JsonNode.Parse(await login.Content.ReadAsStringAsync())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());
        return client;
    }

    private async Task<HttpClient> Teacher()
    {
        var client = factory.CreateClient();
        var email = $"portfolio-teacher-{Guid.NewGuid():N}@example.test";
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            fullName = "مدرس بورتفوليو اختبار",
            email,
            password = "Passw0rd!2026",
            role = "Teacher"
        });
        Assert.Equal(HttpStatusCode.OK, register.StatusCode);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Passw0rd!2026" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = JsonNode.Parse(await login.Content.ReadAsStringAsync())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth["token"]!.GetValue<string>());
        return client;
    }

    [Fact]
    public async Task DeveloperPortfolio_IsPubliclyReadable_AndOnlyAdminsCanEdit()
    {
        var anonymous = factory.CreateClient();
        var initial = await anonymous.GetFromJsonAsync<JsonNode>("/api/developer/portfolio");
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/api/developer/portfolio")).StatusCode);
        Assert.True(initial!["data"] is null || initial["data"]!.AsObject().Count == 0);

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PutAsJsonAsync("/api/admin/developer/portfolio", new { data = new { } })).StatusCode);

        var teacher = await Teacher();
        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.GetAsync("/api/admin/developer/portfolio")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.PutAsJsonAsync("/api/admin/developer/portfolio", new { data = new { } })).StatusCode);

        var admin = await Admin();
        var save = await admin.PutAsJsonAsync("/api/admin/developer/portfolio", new
        {
            data = new
            {
                profile = new
                {
                    name = "أحمد جبريل",
                    role = "Full Stack Developer",
                    email = "ahmed@example.test",
                    github = "https://github.com/AGbreel",
                    avatarUrl = "/uploads/portrait.png"
                },
                hero = new
                {
                    headlineA = new { ar = "أبني منتجات", en = "I build" },
                    headlineB = new { ar = "رقمية تعمل.", en = "digital products." }
                },
                projects = new object[]
                {
                    new
                    {
                        id = "emtehani",
                        title = "منصة امتحاني",
                        layout = "featured",
                        category = new { ar = "منصة تعليمية", en = "Education" },
                        description = new { ar = "منصة اختبارات.", en = "Exam platform." },
                        tags = new[] { "React", "ASP.NET Core" },
                        link = "https://emtehani-opal.vercel.app"
                    }
                }
            }
        });
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);

        var publicView = await anonymous.GetFromJsonAsync<JsonNode>("/api/developer/portfolio");
        Assert.Equal("أحمد جبريل", publicView!["data"]!["profile"]!["name"]!.GetValue<string>());
        Assert.Equal("رقمية تعمل.", publicView["data"]!["hero"]!["headlineB"]!["ar"]!.GetValue<string>());
        Assert.Equal("منصة امتحاني", publicView["data"]!["projects"]![0]!["title"]!.GetValue<string>());

        var adminView = await admin.GetFromJsonAsync<JsonNode>("/api/admin/developer/portfolio");
        Assert.Equal("https://github.com/AGbreel", adminView!["data"]!["profile"]!["github"]!.GetValue<string>());
        Assert.NotNull(adminView["updatedAtUtc"]);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var setting = await db.SystemSettings.SingleAsync(x => x.Key == "developer.portfolio");
        var storedDocument = JsonNode.Parse(setting.Value)!;
        Assert.Equal("منصة امتحاني", storedDocument["projects"]![0]!["title"]!.GetValue<string>());
        Assert.True(await db.AuditEvents.AnyAsync(x => x.Action == "admin.developer-portfolio.updated"));
    }

    [Fact]
    public async Task DeveloperPortfolio_RejectsInvalidShapesAndUnsafeLinks()
    {
        var admin = await Admin();

        var unsafeLink = await admin.PutAsJsonAsync("/api/admin/developer/portfolio", new
        {
            data = new { profile = new { github = "javascript:alert(1)" } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, unsafeLink.StatusCode);
        Assert.Contains("الروابط", (JsonNode.Parse(await unsafeLink.Content.ReadAsStringAsync()))!["message"]!.GetValue<string>());

        var wrongProjects = await admin.PutAsJsonAsync("/api/admin/developer/portfolio", new
        {
            data = new { projects = new { title = "not a list" } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, wrongProjects.StatusCode);

        var arrayBody = await admin.PutAsJsonAsync("/api/admin/developer/portfolio", new object[] { 1, 2, 3 });
        Assert.Equal(HttpStatusCode.BadRequest, arrayBody.StatusCode);
    }
}
