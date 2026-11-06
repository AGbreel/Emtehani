using Emtehani.Domain.Entities;
using Emtehani.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace Emtehani.Tests;

public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("EMTEHANI_POSTGRES_TEST_CONNECTION")))
            Skip = "Set EMTEHANI_POSTGRES_TEST_CONNECTION to an isolated PostgreSQL test database.";
        else if (Environment.GetEnvironmentVariable("EMTEHANI_RUN_POSTGRES_TESTS") != "1")
            Skip = "Set EMTEHANI_RUN_POSTGRES_TESTS=1 to allow disposable PostgreSQL database creation.";
    }
}

public sealed class PostgresTestDatabase : IAsyncDisposable
{
    private const string DatabasePrefix = "emtehani_test_";
    private readonly NpgsqlConnectionStringBuilder _admin;

    private PostgresTestDatabase(NpgsqlConnectionStringBuilder admin, string databaseName)
    {
        _admin = admin;
        DatabaseName = databaseName;
        var target = new NpgsqlConnectionStringBuilder(admin.ConnectionString) { Database = databaseName };
        ConnectionString = target.ConnectionString;
    }

    public string DatabaseName { get; }
    public string ConnectionString { get; }

    public static async Task<PostgresTestDatabase> CreateAsync()
    {
        var configured = Environment.GetEnvironmentVariable("EMTEHANI_POSTGRES_TEST_CONNECTION");
        if (string.IsNullOrWhiteSpace(configured))
            throw new InvalidOperationException("EMTEHANI_POSTGRES_TEST_CONNECTION is not configured.");

        var admin = new NpgsqlConnectionStringBuilder(configured);
        if (string.IsNullOrWhiteSpace(admin.Database)) admin.Database = "postgres";
        var databaseName = DatabasePrefix + Guid.NewGuid().ToString("N");

        await using var connection = new NpgsqlConnection(admin.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        // Windows PostgreSQL clusters often default to WIN1252; Arabic fixtures need UTF8.
        command.CommandText = $"CREATE DATABASE \"{databaseName}\" ENCODING 'UTF8' TEMPLATE template0";
        await command.ExecuteNonQueryAsync();
        return new PostgresTestDatabase(admin, databaseName);
    }

    public DbContextOptions<AppDbContext> Options()
        => new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(ConnectionString).Options;

    public async ValueTask DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        await using var connection = new NpgsqlConnection(_admin.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"DROP DATABASE IF EXISTS \"{DatabaseName}\" WITH (FORCE)";
        await command.ExecuteNonQueryAsync();
    }
}

public sealed class PostgresSchemaTests
{
    [PostgresFact]
    public async Task LegacySchemaBootstrap_AddsWorkflowColumnsAndParticipantTableIdempotently()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        await using var db = new AppDbContext(database.Options());
        await db.Database.EnsureCreatedAsync();

        await db.Database.ExecuteSqlRawAsync("""
            DROP TABLE IF EXISTS "ExamParticipants";
            ALTER TABLE "Exams" DROP COLUMN IF EXISTS "Status";
            ALTER TABLE "Exams" DROP COLUMN IF EXISTS "ScheduledAtUtc";
            ALTER TABLE "Exams" DROP COLUMN IF EXISTS "PausedAtUtc";
            ALTER TABLE "Submissions" DROP COLUMN IF EXISTS "ExtraTimeSeconds";
            """);

        await ExamWorkflowSchema.EnsureAsync(db);
        await ExamWorkflowSchema.EnsureAsync(db);

        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Exams", "Status"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Exams", "ScheduledAtUtc"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Exams", "PausedAtUtc"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Submissions", "ExtraTimeSeconds"));
        Assert.True(await TableExistsAsync(database.ConnectionString, "ExamParticipants"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "ExamParticipants", "Code"));
    }

    [PostgresFact]
    public async Task ResultsPublicationColumn_BackfillsOnlyLegacyFinishedExams()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        await using var db = new AppDbContext(database.Options());
        await db.Database.EnsureCreatedAsync();

        var legacyFinished = new Exam { Title = "legacy-finished", JoinCode = $"legacy-{Guid.NewGuid():N}", IsPublished = true, Status = "Finished" };
        var activeExam = new Exam { Title = "still-running", JoinCode = $"active-{Guid.NewGuid():N}", IsPublished = true, Status = "Active" };
        db.Exams.AddRange(legacyFinished, activeExam);
        await db.SaveChangesAsync();

        // Simulate a database created before explicit results publication existed.
        await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "Exams" DROP COLUMN "ResultsPublishedAtUtc";""");
        db.ChangeTracker.Clear();

        await ExamWorkflowSchema.EnsureAsync(db);
        await ExamWorkflowSchema.EnsureAsync(db);
        db.ChangeTracker.Clear();

        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Exams", "ResultsPublishedAtUtc"));
        Assert.NotNull(await db.Exams.Where(x => x.Id == legacyFinished.Id)
            .Select(x => x.ResultsPublishedAtUtc).SingleAsync());
        Assert.Null(await db.Exams.Where(x => x.Id == activeExam.Id)
            .Select(x => x.ResultsPublishedAtUtc).SingleAsync());

        // Future finished exams must stay unpublished until the teacher explicitly publishes.
        var futureFinished = new Exam { Title = "future-finished", JoinCode = $"future-{Guid.NewGuid():N}", IsPublished = true, Status = "Finished" };
        db.Exams.Add(futureFinished);
        await db.SaveChangesAsync();
        await ExamWorkflowSchema.EnsureAsync(db);
        db.ChangeTracker.Clear();

        Assert.Null(await db.Exams.Where(x => x.Id == futureFinished.Id)
            .Select(x => x.ResultsPublishedAtUtc).SingleAsync());
    }

    [PostgresFact]
    public async Task WorkflowBootstrap_DeduplicatesAndEnforcesOneInProgressAttemptPerStudent()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        await using var db = new AppDbContext(database.Options());
        await db.Database.EnsureCreatedAsync();
        await ExamWorkflowSchema.EnsureAsync(db);

        var teacher = new AppUser { FullName = "Teacher", Email = $"teacher-{Guid.NewGuid():N}@example.test", Role = "Teacher", PasswordHash = "x" };
        var student = new AppUser { FullName = "Student", Email = $"student-{Guid.NewGuid():N}@example.test", Role = "Student", PasswordHash = "x" };
        var exam = new Exam { TeacherId = teacher.Id, Title = "PostgreSQL verification", IsPublished = true, Status = "Waiting" };
        db.Users.AddRange(teacher, student);
        db.Exams.Add(exam);
        await db.SaveChangesAsync();

        await db.Database.ExecuteSqlRawAsync("""DROP INDEX IF EXISTS "IX_Submissions_Exam_Student_InProgress" """);
        db.Submissions.AddRange(
            new Submission { ExamId = exam.Id, StudentId = student.Id, Status = "InProgress", StartedAtUtc = DateTime.UtcNow.AddMinutes(-2), AttemptNumber = 1 },
            new Submission { ExamId = exam.Id, StudentId = student.Id, Status = "InProgress", StartedAtUtc = DateTime.UtcNow.AddMinutes(-1), AttemptNumber = 2 });
        await db.SaveChangesAsync();

        await ExamWorkflowSchema.EnsureAsync(db);
        db.ChangeTracker.Clear();

        Assert.Equal(1, await db.Submissions.CountAsync(x => x.Status == "InProgress"));
        Assert.Equal(1, await db.Submissions.CountAsync(x => x.Status == "Abandoned"));

        await using (var connection = new NpgsqlConnection(database.ConnectionString))
        {
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT indexdef FROM pg_indexes
                WHERE schemaname = 'public' AND indexname = 'IX_Submissions_Exam_Student_InProgress'
                """;
            var definition = (string?)await command.ExecuteScalarAsync();
            Assert.NotNull(definition);
            Assert.Contains("UNIQUE INDEX", definition, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("InProgress", definition, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("WHERE", definition, StringComparison.OrdinalIgnoreCase);
        }

        db.Submissions.Add(new Submission
        {
            ExamId = exam.Id,
            StudentId = student.Id,
            Status = "InProgress",
            StartedAtUtc = DateTime.UtcNow,
            AttemptNumber = 3
        });
        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Equal("23505", Assert.IsType<PostgresException>(exception.InnerException).SqlState);
    }

    [PostgresFact]
    public async Task StudentManagementSchema_AddsRelationshipStateAndExamBanTableIdempotently()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        await using var db = new AppDbContext(database.Options());
        await db.Database.EnsureCreatedAsync();

        var teacher = new AppUser { FullName = "Teacher", Email = $"ban-teacher-{Guid.NewGuid():N}@example.test", Role = "Teacher", PasswordHash = "x" };
        var student = new AppUser { FullName = "Student", Email = $"ban-student-{Guid.NewGuid():N}@example.test", Role = "Student", PasswordHash = "x" };
        var exam = new Exam { TeacherId = teacher.Id, Title = "Ban schema verification", IsPublished = true, Status = "Waiting" };
        db.Users.AddRange(teacher, student);
        db.Exams.Add(exam);
        db.TeacherStudentRequests.Add(new TeacherStudentRequest
        {
            TeacherId = teacher.Id,
            StudentId = student.Id,
            Status = "Accepted",
            DecidedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
        var relationshipId = await db.TeacherStudentRequests
            .Where(x => x.TeacherId == teacher.Id && x.StudentId == student.Id)
            .Select(x => x.Id)
            .SingleAsync();

        // Simulate a database created before student management and per-exam bans existed.
        await db.Database.ExecuteSqlRawAsync("""
            DROP TABLE IF EXISTS "TeacherStudentExamBans";
            ALTER TABLE "TeacherStudentRequests" DROP COLUMN IF EXISTS "UnlinkedAtUtc";
            ALTER TABLE "TeacherStudentRequests" DROP COLUMN IF EXISTS "SuspendedAtUtc";
            """);
        db.ChangeTracker.Clear();

        await ExamWorkflowSchema.EnsureAsync(db);
        await ExamWorkflowSchema.EnsureAsync(db);
        db.ChangeTracker.Clear();

        Assert.True(await ColumnExistsAsync(database.ConnectionString, "TeacherStudentRequests", "UnlinkedAtUtc"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "TeacherStudentRequests", "SuspendedAtUtc"));
        Assert.True(await TableExistsAsync(database.ConnectionString, "TeacherStudentExamBans"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "TeacherStudentExamBans", "ExamId"));

        var preserved = await db.TeacherStudentRequests.SingleAsync(x => x.Id == relationshipId);
        Assert.Equal("Accepted", preserved.Status);
        Assert.Null(preserved.UnlinkedAtUtc);
        Assert.Null(preserved.SuspendedAtUtc);

        db.TeacherStudentExamBans.Add(new TeacherStudentExamBan
        {
            TeacherId = teacher.Id,
            StudentId = student.Id,
            ExamId = exam.Id
        });
        await db.SaveChangesAsync();

        db.TeacherStudentExamBans.Add(new TeacherStudentExamBan
        {
            TeacherId = teacher.Id,
            StudentId = student.Id,
            ExamId = exam.Id
        });
        var duplicate = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Equal("23505", Assert.IsType<PostgresException>(duplicate.InnerException).SqlState);
    }

    [PostgresFact]
    public async Task PlatformUpgradeSchema_AddsIdentityHistorySubscriptionsAndBackfillsSafely()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        await using var db = new AppDbContext(database.Options());
        await db.Database.EnsureCreatedAsync();

        // Simulate a database created before the platform upgrade.
        await db.Database.ExecuteSqlRawAsync("""
            DROP TABLE IF EXISTS "TeacherStudentInvitations";
            DROP TABLE IF EXISTS "TeacherSubscriptions";
            DROP TABLE IF EXISTS "SubscriptionPlans";
            DROP TABLE IF EXISTS "SystemSettings";
            DROP TABLE IF EXISTS "StudentAcademicChanges";
            DROP INDEX IF EXISTS "IX_Users_StudentPhone";
            DROP INDEX IF EXISTS "IX_Users_NormalizedName_Student";
            DROP INDEX IF EXISTS "IX_Users_ParentPhone";
            DROP INDEX IF EXISTS "IX_Exams_AcademicYear";
            ALTER TABLE "Users" DROP COLUMN IF EXISTS "NormalizedName";
            ALTER TABLE "Users" DROP COLUMN IF EXISTS "StudentPhone";
            ALTER TABLE "Users" DROP COLUMN IF EXISTS "ParentPhone";
            ALTER TABLE "Users" DROP COLUMN IF EXISTS "TeacherCount";
            ALTER TABLE "Users" DROP COLUMN IF EXISTS "RegistrationSource";
            ALTER TABLE "Users" DROP COLUMN IF EXISTS "SessionExpiresAtUtc";
            ALTER TABLE "Users" DROP COLUMN IF EXISTS "UpdatedAtUtc";
            ALTER TABLE "Exams" DROP COLUMN IF EXISTS "AcademicYear";
            ALTER TABLE "Submissions" DROP COLUMN IF EXISTS "StageAtAttempt";
            ALTER TABLE "Submissions" DROP COLUMN IF EXISTS "GradeAtAttempt";
            ALTER TABLE "Submissions" DROP COLUMN IF EXISTS "AcademicYearAtAttempt";
            ALTER TABLE "TeacherStudentRequests" DROP COLUMN IF EXISTS "InitiatedBy";
            """);
        db.ChangeTracker.Clear();

        // The upgrade must be safe to run repeatedly.
        await ExamWorkflowSchema.EnsureAsync(db);
        await ExamWorkflowSchema.EnsureAsync(db);

        foreach (var table in new[] { "StudentAcademicChanges", "SubscriptionPlans", "TeacherSubscriptions", "SystemSettings", "TeacherStudentInvitations" })
            Assert.True(await TableExistsAsync(database.ConnectionString, table), $"Missing table {table}");
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Users", "NormalizedName"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Users", "StudentPhone"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Users", "ParentPhone"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Users", "TeacherCount"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Users", "RegistrationSource"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Users", "SessionExpiresAtUtc"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Exams", "AcademicYear"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Submissions", "StageAtAttempt"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Submissions", "GradeAtAttempt"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "Submissions", "AcademicYearAtAttempt"));
        Assert.True(await ColumnExistsAsync(database.ConnectionString, "TeacherStudentRequests", "InitiatedBy"));
        Assert.True(await IndexExistsAsync(database.ConnectionString, "IX_Users_NormalizedName_Student"));
        Assert.True(await IndexExistsAsync(database.ConnectionString, "IX_Users_StudentPhone"));
        Assert.True(await IndexExistsAsync(database.ConnectionString, "IX_TeacherStudentInvitations_Token"));
        Assert.True(await IndexExistsAsync(database.ConnectionString, "IX_SubscriptionPlans_Code"));

        // Legacy rows survive the upgrade and receive immutable snapshots/defaults.
        var teacher = new AppUser
        {
            FullName = "مدرس قديم",
            Email = $"legacy-teacher-{Guid.NewGuid():N}@example.test",
            Role = "Teacher",
            PasswordHash = "x",
            CreatedAtUtc = new DateTime(2024, 9, 1, 8, 0, 0, DateTimeKind.Utc)
        };
        var student = new AppUser
        {
            FullName = "أحمد  علي",
            Email = $"legacy-student-{Guid.NewGuid():N}@example.test",
            Role = "Student",
            PasswordHash = "x",
            StudentPhone = "01011112222",
            ParentPhone = "01033334444",
            Stage = "ثانوي",
            Grade = "الصف الثالث الثانوي",
            CreatedAtUtc = new DateTime(2024, 9, 2, 8, 0, 0, DateTimeKind.Utc)
        };
        var exam = new Exam
        {
            TeacherId = teacher.Id,
            Title = "legacy exam",
            JoinCode = $"legacy-{Guid.NewGuid():N}",
            IsPublished = true,
            Status = "Finished",
            CreatedAtUtc = new DateTime(2024, 10, 1, 8, 0, 0, DateTimeKind.Utc)
        };
        var submission = new Submission
        {
            ExamId = exam.Id,
            StudentId = student.Id,
            AttemptNumber = 1,
            Status = "Reviewed",
            StartedAtUtc = new DateTime(2024, 10, 1, 9, 0, 0, DateTimeKind.Utc),
            SubmittedAtUtc = new DateTime(2024, 10, 1, 10, 0, 0, DateTimeKind.Utc)
        };
        db.Users.AddRange(teacher, student);
        db.Exams.Add(exam);
        db.Submissions.Add(submission);
        await db.SaveChangesAsync();

        await PlatformDataUpgrade.EnsureAsync(db);
        db.ChangeTracker.Clear();

        var storedStudent = await db.Users.SingleAsync(x => x.Id == student.Id);
        Assert.False(string.IsNullOrWhiteSpace(storedStudent.NormalizedName));
        Assert.Equal(1, storedStudent.TeacherCount);
        var storedExam = await db.Exams.SingleAsync(x => x.Id == exam.Id);
        Assert.Equal("2024/2025", storedExam.AcademicYear);
        var storedSubmission = await db.Submissions.SingleAsync(x => x.Id == submission.Id);
        Assert.Equal("2024/2025", storedSubmission.AcademicYearAtAttempt);
        Assert.Equal("ثانوي", storedSubmission.StageAtAttempt);
        Assert.Equal("الصف الثالث الثانوي", storedSubmission.GradeAtAttempt);
        Assert.True(await db.SubscriptionPlans.AnyAsync(x => x.Code == "free" && x.IsActive));
        Assert.True(await db.SystemSettings.AnyAsync(x => x.Key == PlatformDataUpgrade.FreeFeaturesSettingKey));
        Assert.True(await db.TeacherSubscriptions.AnyAsync(x => x.TeacherId == teacher.Id && x.Status == "Confirmed"));

        // Duplicate normalized names and student phones are rejected by PostgreSQL indexes.
        db.Users.Add(new AppUser
        {
            FullName = "اسم مكرر",
            NormalizedName = storedStudent.NormalizedName,
            Email = $"dup-name-{Guid.NewGuid():N}@example.test",
            Role = "Student",
            PasswordHash = "x",
            StudentPhone = "01099990000"
        });
        var duplicateName = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Equal("23505", Assert.IsType<PostgresException>(duplicateName.InnerException).SqlState);
        db.ChangeTracker.Clear();

        db.Users.Add(new AppUser
        {
            FullName = "هاتف مكرر",
            NormalizedName = "هاتف مكرر",
            Email = $"dup-phone-{Guid.NewGuid():N}@example.test",
            Role = "Student",
            PasswordHash = "x",
            StudentPhone = storedStudent.StudentPhone
        });
        var duplicatePhone = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Equal("23505", Assert.IsType<PostgresException>(duplicatePhone.InnerException).SqlState);
        db.ChangeTracker.Clear();

        // Siblings may share the same parent phone.
        db.Users.Add(new AppUser
        {
            FullName = "شقيق مشترك",
            NormalizedName = "شقيق مشترك",
            Email = $"sibling-{Guid.NewGuid():N}@example.test",
            Role = "Student",
            PasswordHash = "x",
            StudentPhone = "01055556666",
            ParentPhone = storedStudent.ParentPhone
        });
        await db.SaveChangesAsync();
    }

    private static async Task<bool> IndexExistsAsync(string connectionString, string index)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname = 'public' AND indexname = @index
            )
            """;
        command.Parameters.AddWithValue("index", index);
        return (bool)(await command.ExecuteScalarAsync())!;
    }

    private static async Task<bool> ColumnExistsAsync(string connectionString, string table, string column)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = @table AND column_name = @column
            )
            """;
        command.Parameters.AddWithValue("table", table);
        command.Parameters.AddWithValue("column", column);
        return (bool)(await command.ExecuteScalarAsync())!;
    }

    private static async Task<bool> TableExistsAsync(string connectionString, string table)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = @table
            )
            """;
        command.Parameters.AddWithValue("table", table);
        return (bool)(await command.ExecuteScalarAsync())!;
    }
}
