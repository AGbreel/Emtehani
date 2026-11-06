using System.Text.Json;
using Emtehani.Domain.Services;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Emtehani.API;

/// <summary>
/// Public, read-only MCP server and its server card.
///
/// This server intentionally exposes no student, teacher, exam, answer, or
/// result data. It uses no authentication because every tool is public
/// information; private data access remains available only through the
/// authenticated REST API and its server-side authorization.
/// </summary>
public static class PublicMcpServer
{
    private const string Name = "emtehani-mcp";
    private const string Version = "1.0.0";
    private const string PublicOrigin = "https://emtehani.vercel.app";
    private const string ApiOrigin = "https://emtehani.runasp.net";

    private static readonly string[] SupportedProtocolVersions = ["2025-06-18", "2025-03-26"];

    private static readonly object EmptySchema = new
    {
        type = "object",
        properties = new Dictionary<string, object>(),
        additionalProperties = false
    };

    private static readonly object[] ToolDefinitions =
    [
        new
        {
            name = "get_platform_info",
            title = "Get platform information",
            description = "Return public information about Emtehani: what the platform does, who it serves, supported roles, and canonical public URLs.",
            inputSchema = EmptySchema,
            annotations = new { readOnlyHint = true }
        },
        new
        {
            name = "list_education_catalog",
            title = "List education stages and grades",
            description = "Return the supported education stages and the grades belonging to each stage. This is static public catalog data, not student data.",
            inputSchema = EmptySchema,
            annotations = new { readOnlyHint = true }
        },
        new
        {
            name = "get_service_health",
            title = "Get service health",
            description = "Run the Emtehani health checks, including database connectivity, and return the current status.",
            inputSchema = EmptySchema,
            annotations = new { readOnlyHint = true }
        },
        new
        {
            name = "get_discovery_links",
            title = "Get discovery links",
            description = "Return canonical links to the API catalog, OpenAPI specification, API documentation, authentication guide, AI catalog, and Agent Skills index.",
            inputSchema = EmptySchema,
            annotations = new { readOnlyHint = true }
        }
    ];

    private static readonly Dictionary<string, object?> ServerCard = new()
    {
        ["$schema"] = "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
        ["name"] = "emtehani.vercel.app/emtehani-mcp",
        ["version"] = Version,
        ["title"] = "Emtehani Public MCP Server",
        ["description"] = "Read-only public MCP server for Emtehani. Exposes platform information, the education stage/grade catalog, live service health, and public discovery links. It never exposes student, teacher, exam, answer, or result data.",
        ["serverInfo"] = new Dictionary<string, object?>
        {
            ["name"] = Name,
            ["title"] = "Emtehani Public MCP Server",
            ["version"] = Version
        },
        ["transport"] = new Dictionary<string, object?>
        {
            ["type"] = "streamable-http",
            ["endpoint"] = $"{ApiOrigin}/mcp"
        },
        ["remotes"] = new object[]
        {
            new Dictionary<string, object?>
            {
                ["type"] = "streamable-http",
                ["url"] = $"{ApiOrigin}/mcp"
            }
        },
        ["protocolVersions"] = SupportedProtocolVersions,
        ["capabilities"] = new Dictionary<string, object?>
        {
            ["tools"] = new Dictionary<string, object?> { ["listChanged"] = false }
        },
        ["tools"] = ToolDefinitions,
        ["authentication"] = new Dictionary<string, object?>
        {
            ["required"] = false,
            ["schemes"] = Array.Empty<string>()
        },
        ["provider"] = new Dictionary<string, object?>
        {
            ["name"] = "Emtehani",
            ["url"] = $"{PublicOrigin}/"
        },
        ["websiteUrl"] = $"{PublicOrigin}/"
    };

    public static void MapPublicMcpServer(this WebApplication app)
    {
        app.MapGet("/.well-known/mcp/server-card.json", (HttpContext context) =>
        {
            context.Response.Headers.AccessControlAllowOrigin = "*";
            context.Response.Headers.CacheControl = "public, max-age=300";
            return Results.Json(ServerCard, contentType: "application/json; charset=utf-8");
        });

        // Legacy discovery alias used by some early MCP crawlers.
        app.MapGet("/.well-known/mcp-server-card.json", (HttpContext context) =>
        {
            context.Response.Headers.AccessControlAllowOrigin = "*";
            context.Response.Headers.CacheControl = "public, max-age=300";
            return Results.Json(ServerCard, contentType: "application/json; charset=utf-8");
        });

        app.MapMethods("/mcp", ["OPTIONS"], (HttpContext context) =>
        {
            SetCors(context);
            context.Response.Headers.AccessControlAllowMethods = "POST, GET, OPTIONS";
            context.Response.Headers.AccessControlAllowHeaders = "content-type, accept, mcp-protocol-version, mcp-session-id, authorization";
            context.Response.Headers.AccessControlMaxAge = "600";
            return Results.NoContent();
        });

        app.MapPost("/mcp", async (HttpContext context, HealthCheckService health) =>
        {
            SetCors(context);
            context.Response.Headers.CacheControl = "no-store";

            JsonDocument document;
            try
            {
                document = await JsonDocument.ParseAsync(context.Request.Body, cancellationToken: context.RequestAborted);
            }
            catch (JsonException)
            {
                return RpcError(null, -32700, "Parse error");
            }

            using (document)
            {
                var root = document.RootElement;
                if (root.ValueKind != JsonValueKind.Object)
                    return RpcError(null, -32600, "Invalid Request");

                if (!root.TryGetProperty("method", out var methodElement) || methodElement.ValueKind != JsonValueKind.String)
                    return RpcError(root.TryGetProperty("id", out var badId) ? badId.Clone() : null, -32600, "Invalid Request");

                var method = methodElement.GetString() ?? string.Empty;
                JsonElement? id = root.TryGetProperty("id", out var idElement) ? idElement.Clone() : null;

                // JSON-RPC notifications have no id. MCP sends
                // notifications/initialized after the handshake.
                if (id is null)
                    return Results.Accepted();

                try
                {
                    object? result = method switch
                    {
                        "initialize" => InitializeResult(root),
                        "ping" => new { },
                        "tools/list" => new { tools = ToolDefinitions },
                        "tools/call" => null, // handled below; needs an await
                        _ => null
                    };

                    if (method == "tools/call")
                        result = await CallToolAsync(root, health, context.RequestAborted);

                    if (result is null)
                        return RpcError(id, -32601, $"Method not found: {method}");

                    return Results.Json(new { jsonrpc = "2.0", id, result }, contentType: "application/json; charset=utf-8");
                }
                catch (KeyNotFoundException ex)
                {
                    return RpcError(id, -32602, ex.Message);
                }
                catch (InvalidOperationException ex)
                {
                    return RpcError(id, -32602, ex.Message);
                }
            }
        }).RequireRateLimiting("api");
    }

    private static object InitializeResult(JsonElement root)
    {
        var requested = root.TryGetProperty("params", out var parameters)
            && parameters.ValueKind == JsonValueKind.Object
            && parameters.TryGetProperty("protocolVersion", out var protocol)
            && protocol.ValueKind == JsonValueKind.String
            ? protocol.GetString()
            : null;

        var protocolVersion = requested is not null && SupportedProtocolVersions.Contains(requested)
            ? requested
            : SupportedProtocolVersions[0];

        return new
        {
            protocolVersion,
            capabilities = new { tools = new { listChanged = false } },
            serverInfo = new { name = Name, title = "Emtehani Public MCP Server", version = Version },
            instructions = "Public, read-only tools only. Student, teacher, exam, answer, and result data require the authenticated REST API and are never returned here. Do not bypass authentication or authorization."
        };
    }

    private static async Task<object> CallToolAsync(JsonElement root, HealthCheckService health, CancellationToken cancellationToken)
    {
        if (!root.TryGetProperty("params", out var parameters) || parameters.ValueKind != JsonValueKind.Object)
            throw new KeyNotFoundException("Missing tool parameters.");

        var toolName = parameters.TryGetProperty("name", out var nameElement) && nameElement.ValueKind == JsonValueKind.String
            ? nameElement.GetString()
            : null;

        object payload = toolName switch
        {
            "get_platform_info" => new
            {
                name = "Emtehani",
                nameAr = "امتحاني",
                description = "Arabic-first school exam platform for teachers and students: exam creation, waiting room, live sessions, grading, essay review, and results.",
                url = $"{PublicOrigin}/",
                roles = new[] { "Teacher", "Student" },
                languages = new[] { "ar" },
                authentication = "Email/password with JWT access tokens and rotating refresh tokens. No OAuth/OIDC.",
                privacy = "Student, teacher, exam, answer, and result data are private and are never returned by public tools."
            },
            "list_education_catalog" => new
            {
                stages = EducationCatalog.Stages.Select(stage => new
                {
                    stage,
                    grades = EducationCatalog.GradesFor(stage)
                })
            },
            "get_service_health" => await HealthPayloadAsync(health, cancellationToken),
            "get_discovery_links" => new
            {
                site = $"{PublicOrigin}/",
                apiCatalog = $"{PublicOrigin}/.well-known/api-catalog",
                openApi = $"{ApiOrigin}/swagger/v1/swagger.json",
                apiDocs = $"{PublicOrigin}/api-docs/",
                authGuide = $"{PublicOrigin}/auth.md",
                agentSkills = $"{PublicOrigin}/.well-known/agent-skills/index.json",
                aiCatalog = $"{PublicOrigin}/.well-known/ai-catalog.json",
                mcpServerCard = $"{PublicOrigin}/.well-known/mcp/server-card.json",
                health = $"{ApiOrigin}/health"
            },
            _ => throw new KeyNotFoundException($"Unknown tool: {toolName}")
        };

        var text = JsonSerializer.Serialize(payload);
        return new
        {
            content = new object[] { new { type = "text", text } },
            isError = false
        };
    }

    private static async Task<object> HealthPayloadAsync(HealthCheckService health, CancellationToken cancellationToken)
    {
        var report = await health.CheckHealthAsync(cancellationToken);
        return new
        {
            status = report.Status.ToString(),
            checks = report.Entries.Select(entry => new
            {
                name = entry.Key,
                status = entry.Value.Status.ToString()
            }),
            timestampUtc = DateTime.UtcNow
        };
    }

    private static void SetCors(HttpContext context)
    {
        context.Response.Headers.AccessControlAllowOrigin = "*";
    }

    private static IResult RpcError(JsonElement? id, int code, string message) =>
        Results.Json(new
        {
            jsonrpc = "2.0",
            id,
            error = new { code, message }
        }, contentType: "application/json; charset=utf-8");
}
