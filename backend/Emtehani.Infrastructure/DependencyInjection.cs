using Emtehani.Application.Abstractions;
using Emtehani.Infrastructure.Persistence;
using Emtehani.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Emtehani.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var connectionString = ResolveConnectionString(config);
        services.AddDbContext<AppDbContext>(options =>
        {
            if (IsSqlServerConnection(connectionString))
                options.UseSqlServer(connectionString);
            else
                options.UseNpgsql(connectionString);
        });
        services.AddScoped<ITokenService, TokenService>();
        return services;
    }

    private static string ResolveConnectionString(IConfiguration config)
    {
        var configured = config.GetConnectionString("DefaultConnection");
        var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL")
            ?? Environment.GetEnvironmentVariable("POSTGRES_URL");

        if (IsPostgresUrl(configured))
            return ToNpgsqlConnectionString(configured!);

        if (!string.IsNullOrWhiteSpace(databaseUrl)
            && (string.IsNullOrWhiteSpace(configured) || configured.Contains("(localdb)", StringComparison.OrdinalIgnoreCase)))
            return ToNpgsqlConnectionString(databaseUrl);

        if (!string.IsNullOrWhiteSpace(configured))
            return configured;

        if (!string.IsNullOrWhiteSpace(databaseUrl))
            return ToNpgsqlConnectionString(databaseUrl);

        throw new InvalidOperationException("A database connection string is required. Set ConnectionStrings__DefaultConnection or DATABASE_URL.");
    }

    private static bool IsPostgresUrl(string? connectionString) =>
        connectionString?.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) == true
        || connectionString?.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) == true;

    private static bool IsSqlServerConnection(string connectionString) =>
        connectionString.Contains("(localdb)", StringComparison.OrdinalIgnoreCase)
        || connectionString.Contains("Data Source=", StringComparison.OrdinalIgnoreCase)
        || connectionString.Contains("Initial Catalog=", StringComparison.OrdinalIgnoreCase)
        || (connectionString.Contains("Server=", StringComparison.OrdinalIgnoreCase)
            && !connectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase));

    private static string ToNpgsqlConnectionString(string databaseUrl)
    {
        if (!IsPostgresUrl(databaseUrl))
            return databaseUrl;

        var uri = new Uri(databaseUrl);
        var credentials = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(credentials[0]),
            Password = credentials.Length > 1 ? Uri.UnescapeDataString(credentials[1]) : string.Empty,
            SslMode = SslMode.Require,
            Pooling = true
        };
        return builder.ConnectionString;
    }
}
