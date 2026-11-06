# MonsterASP Production Readiness Plan

This plan is intentionally **read-only on production** until an explicit approval is given.
No step below drops, resets, or deletes production data.

## Current topology

- Frontend: Vercel (`https://emtehani.vercel.app`)
- API: MonsterASP (`https://emtehani.runasp.net`)
- Database: MonsterASP SQL Server (`db73841.public.databaseasp.net` / `db73841`)
- Startup schema upgrade: `EnsureCreated` → `ExamWorkflowSchema` → `PlatformDataUpgrade`

## 0. Preconditions

1. Freeze deployments and announce a short maintenance window.
2. Record the currently deployed API build/commit and the current row counts.
3. Confirm the remote database user still has **Remote Access** enabled for the backup
   connection (public hostname with `.public.`).
4. Keep the backup and the restore database outside the production database.

## 1. Take a verified backup (read-only on production)

Use either the MonsterASP control panel backup or `sqlpackage`:

```powershell
dotnet tool install --tool-path "$env:TEMP\sqlpackage" Microsoft.SqlPackage

& "$env:TEMP\sqlpackage\sqlpackage.exe" `
  /Action:Export `
  /SourceConnectionString:"Server=db73841.public.databaseasp.net;Database=db73841;User Id=db73841;Password=<secret>;Encrypt=True;TrustServerCertificate=True;MultipleActiveResultSets=True;" `
  /TargetFile:"$env:TEMP\emtehani-preupgrade.bacpac" `
  /p:VerifyExtraction=True
```

Verify the backup file exists and is non-empty before continuing.

## 2. Restore into an isolated database

Preferred: LocalDB on the workstation, or a **separate** MonsterASP test database.
Never restore over `db73841`.

```powershell
& "$env:TEMP\sqlpackage\sqlpackage.exe" `
  /Action:Import `
  /SourceFile:"$env:TEMP\emtehani-preupgrade.bacpac" `
  /TargetConnectionString:"Server=(localdb)\MSSQLLocalDB;Integrated Security=True;Database=EmtehaniRestoreCheck;TrustServerCertificate=True"
```

Compare at least these row counts between production (read-only query) and the restore:

`Users`, `Exams`, `Questions`, `Submissions`, `Answers`, `TeacherStudentRequests`,
`TeacherStudentInvitations`, `TeacherStudentExamBans`, `StudentAcademicChanges`,
`SubscriptionPlans`, `TeacherSubscriptions`, `AuditEvents`.

## 3. Start a staging API against the restored database

Use a staging copy of the API settings; never point a test run at `db73841`:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:ASPNETCORE_URLS = "http://127.0.0.1:5099"
$env:ConnectionStrings__DefaultConnection = "Server=(localdb)\MSSQLLocalDB;Database=EmtehaniRestoreCheck;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=True"
$env:FrontendOrigin = "http://127.0.0.1:4173"
$env:PublicApiUrl = "http://127.0.0.1:5099"
$env:Auth__AutoConfirmWithoutSmtp = "true"
$env:Jwt__Key = "<staging-only-secret-at-least-32-bytes>"
dotnet backend\Emtehani.API\bin\Debug\net10.0\Emtehani.API.dll
```

Startup is idempotent. On the restored copy, verify:

1. `GET /health` returns `Healthy`.
2. An existing user can log in (old accounts keep their names).
3. A teacher sees existing exams/students.
4. A new student sees a published exam created before the link (accepted link only).
5. Draft, other-stage, other-academic-year, banned, and expired-window exams are hidden.
6. Attempt counters: start/submit/refresh; abandoned and exception attempts do not consume.
7. Unlink → status `Unlinked`, access revoked, history retained.
8. Re-request after rejection → new request ID, old rejected row retained.
9. Teacher profile: draft hidden, publish visible, private contact hidden by default.

## 4. Verify the schema on the restored copy

```sql
SELECT COL_LENGTH('dbo.Users', 'ParentName');
SELECT COL_LENGTH('dbo.TeacherStudentInvitations', 'ParentName');
SELECT OBJECT_ID('dbo.TeacherProfiles', 'U');
SELECT COL_LENGTH('dbo.TeacherProfiles', 'ContactPhone');
SELECT name FROM sys.indexes
WHERE name IN ('IX_TeacherProfiles_TeacherId','IX_TeacherProfiles_PublicSlug',
               'IX_TeacherStudentRequests_Pending','IX_TeacherStudentRequests_Active');
SELECT name FROM sys.indexes
WHERE name = 'IX_TeacherStudentRequests_TeacherId_StudentId'; -- must return no row
```

Run the startup twice against the same restored database. Both starts must be
successful and `/health` must return `Healthy` on both; this proves idempotency.

## 5. Production cutover (only after approval)

1. Deploy the API build. Startup applies additive schema changes and the one-time
   `Unlinked` backfill. No tables or rows are dropped.
2. Monitor the startup log for schema errors and the `/health` endpoint.
3. Run a short smoke test: login, available exams, one attempt, teacher student detail,
   link/unlink, re-request, teacher profile publish.
4. Keep the pre-upgrade backup for the agreed retention period.

## 6. Rollback

- The schema changes are additive; the previous API build can run against the upgraded
  database (new nullable columns/tables are ignored).
- Restore the backup only if data integrity is actually affected, and only with explicit
  approval. Do not run a production restore as a routine rollback.

## 7. Go / No-Go gates

- [ ] Verified backup + verified isolated restore.
- [ ] Row counts match production.
- [ ] Startup twice on the restored database is healthy.
- [ ] Schema/index verification queries pass.
- [ ] Smoke tests pass on the restored copy.
- [ ] Rollback owner and approval are documented.
- [ ] No production write has happened before the explicit approval.
