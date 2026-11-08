using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Emtehani.Domain.Entities;
using Emtehani.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Emtehani.API;

/// <summary>
/// Public developer portfolio content. The whole document is stored as one JSON
/// setting so the administration can add, edit, or remove every section from the
/// dashboard without a schema change. The frontend owns the default document and
/// merges it with whatever is stored here.
/// </summary>
public static class DeveloperPortfolioEndpoints
{
    public const string SettingKey = "developer.portfolio";
    private const int MaxBytes = 300_000;

    private static readonly (string Key, int Limit, string Label)[] ArrayLimits =
    [
        ("projects", 60, "المشاريع"),
        ("services", 30, "الخدمات"),
        ("steps", 20, "خطوات العمل"),
        ("stack", 40, "التقنيات"),
        ("facts", 20, "الحقائق"),
    ];

    public static IEndpointRouteBuilder MapDeveloperPortfolioEndpoints(this IEndpointRouteBuilder app)
    {
        // Public: the portfolio page reads this without authentication.
        app.MapGet("/api/developer/portfolio", async (AppDbContext db) =>
        {
            var setting = await db.SystemSettings.AsNoTracking()
                .Where(x => x.Key == SettingKey)
                .Select(x => new { x.Value, x.UpdatedAtUtc })
                .FirstOrDefaultAsync();
            return Results.Ok(new
            {
                data = TryParse(setting?.Value),
                updatedAtUtc = setting?.UpdatedAtUtc,
                serverUtc = DateTime.UtcNow
            });
        }).RequireRateLimiting("api");

        // Admin: load the editable document (same shape as the public endpoint).
        app.MapGet("/api/admin/developer/portfolio", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            if (p.FindFirstValue(ClaimTypes.Role) != "Admin") return Results.Forbid();
            var setting = await db.SystemSettings.AsNoTracking()
                .Where(x => x.Key == SettingKey)
                .Select(x => new { x.Value, x.UpdatedAtUtc })
                .FirstOrDefaultAsync();
            return Results.Ok(new
            {
                data = TryParse(setting?.Value),
                updatedAtUtc = setting?.UpdatedAtUtc,
                serverUtc = DateTime.UtcNow
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        // Admin: replace the complete document. Every section is optional so the
        // dashboard can intentionally hide a section by sending an empty collection.
        app.MapPut("/api/admin/developer/portfolio", async (JsonElement body, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (p.FindFirstValue(ClaimTypes.Role) != "Admin") return Results.Forbid();
            if (!Guid.TryParse(p.FindFirstValue(ClaimTypes.NameIdentifier), out var adminId)) return Results.Unauthorized();

            var data = body.ValueKind == JsonValueKind.Object && body.TryGetProperty("data", out var nested)
                ? nested
                : body;
            var (json, error) = Validate(data);
            if (error is not null) return Results.BadRequest(new { message = error });

            var now = DateTime.UtcNow;
            var setting = await db.SystemSettings.FirstOrDefaultAsync(x => x.Key == SettingKey);
            if (setting is null)
            {
                db.SystemSettings.Add(new SystemSetting { Key = SettingKey, Value = json!, UpdatedAtUtc = now });
            }
            else
            {
                setting.Value = json!;
                setting.UpdatedAtUtc = now;
            }
            db.AuditEvents.Add(new AuditEvent
            {
                ActorId = adminId,
                Action = "admin.developer-portfolio.updated",
                EntityType = "SystemSetting",
                EntityId = SettingKey
            });
            await db.SaveChangesAsync();
            return Results.Ok(new
            {
                message = "تم حفظ بورتفوليو المطور. التغييرات ظاهرة الآن على الصفحة العامة.",
                updatedAtUtc = now
            });
        }).RequireAuthorization().RequireRateLimiting("api");

        return app;
    }

    private static (string? Json, string? Error) Validate(JsonElement data)
    {
        if (data.ValueKind != JsonValueKind.Object)
            return (null, "بيانات البورتفوليو يجب أن تكون كائن JSON.");

        var raw = data.GetRawText();
        if (Encoding.UTF8.GetByteCount(raw) > MaxBytes)
            return (null, "حجم بيانات البورتفوليو كبير جداً. اختصر النصوص أو عدد المشاريع.");

        foreach (var (key, limit, label) in ArrayLimits)
        {
            if (!data.TryGetProperty(key, out var value) || value.ValueKind == JsonValueKind.Null) continue;
            if (value.ValueKind != JsonValueKind.Array)
                return (null, $"قسم «{label}» يجب أن يكون قائمة.");
            if (value.GetArrayLength() > limit)
                return (null, $"عدد عناصر «{label}» يجب ألا يتجاوز {limit}.");
            foreach (var item in value.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                    return (null, $"كل عنصر في «{label}» يجب أن يكون كائن JSON.");
            }
        }

        if (data.TryGetProperty("profile", out var profile) && profile.ValueKind is not (JsonValueKind.Object or JsonValueKind.Null))
            return (null, "بيانات الملف الشخصي غير صحيحة.");

        if (HasUnsafeUrl(data))
            return (null, "إحدى الروابط غير صالحة. استخدم رابطاً يبدأ بـ https:// أو صورة مرفوعة من لوحة التحكم.");

        return (raw, null);
    }

    private static bool HasUnsafeUrl(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    if (IsUrlField(property.Name) && property.Value.ValueKind == JsonValueKind.String)
                    {
                        var value = property.Value.GetString();
                        if (!string.IsNullOrWhiteSpace(value) && !IsSafeUrl(value)) return true;
                    }
                    if (HasUnsafeUrl(property.Value)) return true;
                }
                return false;
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    if (HasUnsafeUrl(item)) return true;
                }
                return false;
            default:
                return false;
        }
    }

    private static bool IsUrlField(string name) =>
        name.EndsWith("Url", StringComparison.OrdinalIgnoreCase)
        || name is "link" or "repo" or "github" or "linkedin" or "whatsappLink";

    private static bool IsSafeUrl(string value) =>
        value.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
        || value.StartsWith('/')
        || value.StartsWith("http://localhost", StringComparison.OrdinalIgnoreCase);

    private static JsonNode? TryParse(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        try
        {
            return JsonNode.Parse(raw);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
