# MonsterASP Database & Deployment Notes

This project targets **.NET 10** and supports **SQL Server** and **PostgreSQL**.
MonsterASP provides MSSQL 2025/Express databases and PostgreSQL; the current
production database is **SQL Server**.

## Connection strings

Never commit a connection string and never put it in frontend code.

### Remote connection (local development / CI)

```text
Server=dbXXXX.public.databaseasp.net;Database=dbXXXX;User Id=dbXXXX;Password=<secret>;Encrypt=True;TrustServerCertificate=True;MultipleActiveResultSets=True;
```

- Enable **Remote Access** for the database user in the MonsterASP control panel first.
- Keep `Encrypt=True` and `TrustServerCertificate=True` for remote TLS connections.
- The public hostname must contain `.public.`. The non-public hostname resolves to a private network address and only works from websites hosted by MonsterASP.

### Local connection (application hosted by MonsterASP)

```text
Server=dbXXXX.databaseasp.net;Database=dbXXXX;User Id=dbXXXX;Password=<secret>;Encrypt=False;MultipleActiveResultSets=True;
```

- Use this value only in the **website's environment variables** on MonsterASP.
- Do not use the Local string from a developer workstation.

Set the value through one environment variable:

```text
ConnectionStrings__DefaultConnection
```

`DATABASE_URL` / `POSTGRES_URL` remain supported for PostgreSQL only.

### Local PowerShell setup (value is not written to this repository)

```powershell
[Environment]::SetEnvironmentVariable(
  'ConnectionStrings__DefaultConnection',
  '<remote-connection-string>',
  'User'
)
```

Restart the terminal/agent after changing a User-level variable. Never paste the
value into source files, screenshots, reports, or chat.

## Required production environment variables

| Variable | Required | Notes |
|---|---|---|
| `ASPNETCORE_ENVIRONMENT` | Yes | `Production` |
| `ConnectionStrings__DefaultConnection` | Yes | MonsterASP **Local** string for the hosted API |
| `Jwt__Key` or `JWT_KEY` | Yes | Random secret, at least 32 bytes; unique per environment |
| `Jwt__Issuer` / `Jwt__Audience` | Recommended | `Emtehani` / `Emtehani.Client` |
| `FrontendOrigin` | Yes | Exact HTTPS origin(s), comma-separated if needed |
| `PublicApiUrl` | Yes | Public API origin without `/api`; used in e-mail links |
| `Email__From` | Yes in production | Trusted sender address |
| `Email__SmtpHost` / `Email__SmtpPort` | Yes in production | SMTP server settings |
| `Email__Username` / `Email__Password` | Yes in production | Store as secrets only |
| `Email__EnableSsl` | Yes in production | `true` |
| `Auth__AutoConfirmWithoutSmtp` | Yes in production | Must be `false` |
| `Swagger__Enabled` | No | `false` in production |
| `Admin__BootstrapEmail` / `Admin__BootstrapPassword` | Optional | Creates one Admin only if no Admin exists |
| `Proxy__TrustForwardedFor` | Recommended | Keep `false` unless the MonsterASP/IIS proxy addresses are known. `X-Forwarded-Proto` is accepted for HTTPS detection; `X-Forwarded-For` is ignored by default. |
| `Proxy__KnownProxies` | Conditional | Exact proxy IPs, comma-separated. Required when `Proxy__TrustForwardedFor=true`. |
| `Proxy__KnownNetworks` | Conditional | CIDR ranges, comma-separated. Required instead of/alongside known proxies when trusting forwarded client IPs. |
| `Auth__MaxFailedLogins` / `Auth__LoginLockoutMinutes` | Recommended | Per-account lockout, default 5 failures / 15 minutes. |
| `RateLimiting__LookupPermitLimit` | Recommended | Per-teacher phone-lookup limit, default 12/minute. |
| `Database__BootstrapOnStartup` | Optional | Default `true`. Set `false` only after schema upgrades are managed by the deployment pipeline. |

The React frontend must receive its API origin through `VITE_API_URL`; database
credentials must never be exposed to the frontend.

## Schema upgrades and backups

The project already has one upgrade mechanism. Do not add a second one:

1. `Database.EnsureCreatedAsync()` — no-op on an existing database.
2. `ExamWorkflowSchema.EnsureAsync()` — idempotent additive SQL Server/PostgreSQL schema changes.
3. `PlatformDataUpgrade.EnsureAsync()` — safe one-time backfills and Free-plan seed.

The upgrade is additive: it does not drop or recreate existing tables and does
not delete users, exams, submissions, answers, or results.

Before applying an upgrade to a database with data:

1. Create a verified backup.
2. Restore that backup into an isolated database and compare table row counts.
3. Dry-run the upgrade inside a transaction and roll back.
4. Apply the upgrade, verify the schema and row counts, then smoke-test login,
   exam reading, autosave, submission, results, subscriptions, and admin access.

A `.bacpac` backup can be created and verified locally without writing files on
the MonsterASP server:

```powershell
dotnet tool install --tool-path "$env:TEMP\sqlpackage" Microsoft.SqlPackage
& "$env:TEMP\sqlpackage\sqlpackage.exe" `
  /Action:Export `
  /SourceConnectionString:"<remote-connection-string>" `
  /TargetFile:"$env:TEMP\emtehani.bacpac" `
  /p:VerifyExtraction=True

& "$env:TEMP\sqlpackage\sqlpackage.exe" `
  /Action:Import `
  /SourceFile:"$env:TEMP\emtehani.bacpac" `
  /TargetConnectionString:"Server=(localdb)\MSSQLLocalDB;Integrated Security=True;Database=EmtehaniRestoreCheck;TrustServerCertificate=True"
```

Never run destructive integration tests against the MonsterASP database. The
test suite uses isolated SQLite/PostgreSQL databases.

## Deployment split

- Deploy the ASP.NET Core API to MonsterASP and configure the **Local** database
  connection plus the production variables in its website panel.
- Deploy the React frontend separately (for example Vercel) with `VITE_API_URL`
  pointing to the public API origin.
- If the API origin changes, update the `connect-src` entry in
  `frontend/vercel.json` as well. `npm run build` now runs
  `scripts/verify-csp.mjs` and fails when `VITE_API_URL` is missing from the CSP,
  when a wildcard is used, or when `script-src` is weakened.
- SQL Server must not be queried directly from the browser.
- Verify HTTPS, CORS (`FrontendOrigin`), JWT, SMTP, and `/health` after deployment.
- Deployment to production requires explicit approval.

## Admin bootstrap

There is no public Admin registration. To enable the admin dashboard for the
first time, set `Admin__BootstrapEmail` and a strong `Admin__BootstrapPassword`
in the MonsterASP website environment and restart the site. The bootstrap runs
only when the database contains **no** Admin account, so it cannot create a
second Admin. Keep the password out of source control and remove the variables
from the environment after the account is confirmed if your process requires it.

