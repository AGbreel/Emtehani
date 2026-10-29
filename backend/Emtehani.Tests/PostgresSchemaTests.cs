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
        command.CommandText = $"CREATE DATABASE \"{databaseName}\"";
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
