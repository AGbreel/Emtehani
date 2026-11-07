using Microsoft.EntityFrameworkCore;

namespace Emtehani.Infrastructure.Persistence;

/// <summary>
/// Additive, idempotent schema upgrade for the teaching/finance/chat-governance
/// module. It follows the existing ExamWorkflowSchema convention: never drops or
/// recreates tables, only creates missing ones and adds missing columns.
/// Runs on both SQL Server (production) and PostgreSQL (tests/alternate hosting).
/// </summary>
public static class TeachingSchema
{
    public static async Task EnsureAsync(AppDbContext db, CancellationToken cancellationToken = default)
    {
        if (db.Database.IsSqlServer())
        {
            await EnsureSqlServerAsync(db, cancellationToken);
            return;
        }
        if (db.Database.IsNpgsql())
        {
            await EnsurePostgresAsync(db, cancellationToken);
        }
    }

    private static async Task EnsureSqlServerAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        // ---------- existing tables: new columns ----------
        await db.Database.ExecuteSqlRawAsync("""
            IF COL_LENGTH('dbo.SubscriptionPlans','Price') IS NULL
                ALTER TABLE [SubscriptionPlans] ADD [Price] decimal(12,2) NOT NULL CONSTRAINT [DF_SubscriptionPlans_Price] DEFAULT 0;
            IF COL_LENGTH('dbo.SubscriptionPlans','Currency') IS NULL
                ALTER TABLE [SubscriptionPlans] ADD [Currency] nvarchar(8) NOT NULL CONSTRAINT [DF_SubscriptionPlans_Currency] DEFAULT N'EGP';
            IF COL_LENGTH('dbo.SubscriptionPlans','BillingPeriodDays') IS NULL
                ALTER TABLE [SubscriptionPlans] ADD [BillingPeriodDays] int NOT NULL CONSTRAINT [DF_SubscriptionPlans_BillingPeriodDays] DEFAULT 30;
            IF COL_LENGTH('dbo.SubscriptionPlans','MaxStudents') IS NULL
                ALTER TABLE [SubscriptionPlans] ADD [MaxStudents] int NOT NULL CONSTRAINT [DF_SubscriptionPlans_MaxStudents] DEFAULT 0;
            IF COL_LENGTH('dbo.SubscriptionPlans','MaxCourses') IS NULL
                ALTER TABLE [SubscriptionPlans] ADD [MaxCourses] int NOT NULL CONSTRAINT [DF_SubscriptionPlans_MaxCourses] DEFAULT 0;
            IF COL_LENGTH('dbo.SubscriptionPlans','MaxGroups') IS NULL
                ALTER TABLE [SubscriptionPlans] ADD [MaxGroups] int NOT NULL CONSTRAINT [DF_SubscriptionPlans_MaxGroups] DEFAULT 0;
            IF COL_LENGTH('dbo.SubscriptionPlans','MaxAssistants') IS NULL
                ALTER TABLE [SubscriptionPlans] ADD [MaxAssistants] int NOT NULL CONSTRAINT [DF_SubscriptionPlans_MaxAssistants] DEFAULT 0;
            IF COL_LENGTH('dbo.SubscriptionPlans','StorageMb') IS NULL
                ALTER TABLE [SubscriptionPlans] ADD [StorageMb] int NOT NULL CONSTRAINT [DF_SubscriptionPlans_StorageMb] DEFAULT 0;
            IF COL_LENGTH('dbo.SubscriptionPlans','MaxVideoMinutes') IS NULL
                ALTER TABLE [SubscriptionPlans] ADD [MaxVideoMinutes] int NOT NULL CONSTRAINT [DF_SubscriptionPlans_MaxVideoMinutes] DEFAULT 0;
            IF COL_LENGTH('dbo.SubscriptionPlans','TrialDays') IS NULL
                ALTER TABLE [SubscriptionPlans] ADD [TrialDays] int NOT NULL CONSTRAINT [DF_SubscriptionPlans_TrialDays] DEFAULT 0;
            IF COL_LENGTH('dbo.SubscriptionPlans','GraceDays') IS NULL
                ALTER TABLE [SubscriptionPlans] ADD [GraceDays] int NOT NULL CONSTRAINT [DF_SubscriptionPlans_GraceDays] DEFAULT 7;
            IF COL_LENGTH('dbo.SubscriptionPlans','IsPublic') IS NULL
                ALTER TABLE [SubscriptionPlans] ADD [IsPublic] bit NOT NULL CONSTRAINT [DF_SubscriptionPlans_IsPublic] DEFAULT 1;
            IF COL_LENGTH('dbo.TeacherSubscriptions','AutoRenew') IS NULL
                ALTER TABLE [TeacherSubscriptions] ADD [AutoRenew] bit NOT NULL CONSTRAINT [DF_TeacherSubscriptions_AutoRenew] DEFAULT 0;
            IF COL_LENGTH('dbo.TeacherSubscriptions','CancelledAtUtc') IS NULL
                ALTER TABLE [TeacherSubscriptions] ADD [CancelledAtUtc] datetime2 NULL;
            IF COL_LENGTH('dbo.TeacherSubscriptions','RenewedFromSubscriptionId') IS NULL
                ALTER TABLE [TeacherSubscriptions] ADD [RenewedFromSubscriptionId] uniqueidentifier NULL;
            IF COL_LENGTH('dbo.Conversations','GroupId') IS NULL
                ALTER TABLE [Conversations] ADD [GroupId] uniqueidentifier NULL;
            IF COL_LENGTH('dbo.Conversations','ChatMode') IS NULL
                ALTER TABLE [Conversations] ADD [ChatMode] nvarchar(24) NOT NULL CONSTRAINT [DF_Conversations_ChatMode] DEFAULT N'Everyone';
            IF COL_LENGTH('dbo.Conversations','LastPolicyChangedAtUtc') IS NULL
                ALTER TABLE [Conversations] ADD [LastPolicyChangedAtUtc] datetime2 NULL;
            IF COL_LENGTH('dbo.Conversations','LastPolicyChangedByUserId') IS NULL
                ALTER TABLE [Conversations] ADD [LastPolicyChangedByUserId] uniqueidentifier NULL;
            -- Dynamic SQL defers column name resolution: GroupId is added earlier in this
            -- same batch, and SQL Server otherwise rejects the reference at compile time.
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name]=N'IX_Conversations_GroupChat' AND [object_id]=OBJECT_ID(N'dbo.Conversations'))
                EXEC(N'CREATE UNIQUE INDEX [IX_Conversations_GroupChat] ON [Conversations] ([GroupId]) WHERE [Type] = N''GroupChat'' AND [GroupId] IS NOT NULL;');
            IF COL_LENGTH('dbo.ConversationMessages','IsDeleted') IS NULL
                ALTER TABLE [ConversationMessages] ADD [IsDeleted] bit NOT NULL CONSTRAINT [DF_ConversationMessages_IsDeleted] DEFAULT 0;
            IF COL_LENGTH('dbo.ConversationMessages','DeletedAtUtc') IS NULL
                ALTER TABLE [ConversationMessages] ADD [DeletedAtUtc] datetime2 NULL;
            IF COL_LENGTH('dbo.ConversationMessages','DeletedByUserId') IS NULL
                ALTER TABLE [ConversationMessages] ADD [DeletedByUserId] uniqueidentifier NULL;
            IF COL_LENGTH('dbo.ConversationMessages','IsPinned') IS NULL
                ALTER TABLE [ConversationMessages] ADD [IsPinned] bit NOT NULL CONSTRAINT [DF_ConversationMessages_IsPinned] DEFAULT 0;
            IF COL_LENGTH('dbo.ConversationMessages','PinnedAtUtc') IS NULL
                ALTER TABLE [ConversationMessages] ADD [PinnedAtUtc] datetime2 NULL;
            IF COL_LENGTH('dbo.ConversationMessages','PinnedByUserId') IS NULL
                ALTER TABLE [ConversationMessages] ADD [PinnedByUserId] uniqueidentifier NULL;
            IF COL_LENGTH('dbo.ConversationMessages','IsApproved') IS NULL
                ALTER TABLE [ConversationMessages] ADD [IsApproved] bit NOT NULL CONSTRAINT [DF_ConversationMessages_IsApproved] DEFAULT 1;
            IF COL_LENGTH('dbo.ConversationMessages','ApprovedAtUtc') IS NULL
                ALTER TABLE [ConversationMessages] ADD [ApprovedAtUtc] datetime2 NULL;
            IF COL_LENGTH('dbo.ConversationMessages','ApprovedByUserId') IS NULL
                ALTER TABLE [ConversationMessages] ADD [ApprovedByUserId] uniqueidentifier NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name]=N'IX_ConversationMessages_ConversationId_IsPinned' AND [object_id]=OBJECT_ID(N'dbo.ConversationMessages'))
                EXEC(N'CREATE INDEX [IX_ConversationMessages_ConversationId_IsPinned] ON [ConversationMessages] ([ConversationId],[IsPinned]);');
            IF COL_LENGTH('dbo.Notifications','Category') IS NULL
                ALTER TABLE [Notifications] ADD [Category] nvarchar(24) NOT NULL CONSTRAINT [DF_Notifications_Category] DEFAULT N'System';
            IF COL_LENGTH('dbo.Notifications','AnnouncementId') IS NULL
                ALTER TABLE [Notifications] ADD [AnnouncementId] uniqueidentifier NULL;
            IF COL_LENGTH('dbo.StudentPayments','CoverageType') IS NULL
                ALTER TABLE [StudentPayments] ADD [CoverageType] nvarchar(16) NULL;
            IF COL_LENGTH('dbo.StudentPayments','SessionsCount') IS NULL
                ALTER TABLE [StudentPayments] ADD [SessionsCount] int NULL;
            IF COL_LENGTH('dbo.StudentPayments','PeriodMonth') IS NULL
                ALTER TABLE [StudentPayments] ADD [PeriodMonth] int NULL;
            IF COL_LENGTH('dbo.StudentPayments','PeriodYear') IS NULL
                ALTER TABLE [StudentPayments] ADD [PeriodYear] int NULL;
            """, cancellationToken);

        // ---------- new tables ----------
        await db.Database.ExecuteSqlRawAsync("""
            IF OBJECT_ID(N'dbo.TeachingAssistants',N'U') IS NULL
            BEGIN
                CREATE TABLE [TeachingAssistants](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [AssistantId] uniqueidentifier NOT NULL,
                    [Status] nvarchar(24) NOT NULL DEFAULT N'Active',
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_TeachingAssistants] PRIMARY KEY([Id]),
                    CONSTRAINT [FK_TeachingAssistants_Users_TeacherId] FOREIGN KEY([TeacherId]) REFERENCES [Users]([Id]) ON DELETE CASCADE,
                    CONSTRAINT [FK_TeachingAssistants_Users_AssistantId] FOREIGN KEY([AssistantId]) REFERENCES [Users]([Id]) ON DELETE NO ACTION
                );
                CREATE UNIQUE INDEX [IX_TeachingAssistants_TeacherId_AssistantId] ON [TeachingAssistants]([TeacherId],[AssistantId]);
                CREATE INDEX [IX_TeachingAssistants_AssistantId] ON [TeachingAssistants]([AssistantId]);
            END;
            IF OBJECT_ID(N'dbo.AssistantPermissions',N'U') IS NULL
            BEGIN
                CREATE TABLE [AssistantPermissions](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [AssistantId] uniqueidentifier NOT NULL,
                    [Permission] nvarchar(64) NOT NULL,
                    [GrantedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_AssistantPermissions] PRIMARY KEY([Id])
                );
                CREATE UNIQUE INDEX [IX_AssistantPermissions_AssistantId_TeacherId_Permission] ON [AssistantPermissions]([AssistantId],[TeacherId],[Permission]);
            END;
            IF OBJECT_ID(N'dbo.AssistantGroupAccesses',N'U') IS NULL
            BEGIN
                CREATE TABLE [AssistantGroupAccesses](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [AssistantId] uniqueidentifier NOT NULL,
                    [GroupId] uniqueidentifier NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_AssistantGroupAccesses] PRIMARY KEY([Id])
                );
                CREATE UNIQUE INDEX [IX_AssistantGroupAccesses_AssistantId_GroupId] ON [AssistantGroupAccesses]([AssistantId],[GroupId]);
            END;
            IF OBJECT_ID(N'dbo.TeacherCourses',N'U') IS NULL
            BEGIN
                CREATE TABLE [TeacherCourses](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [Title] nvarchar(200) NOT NULL,
                    [ShortDescription] nvarchar(max) NULL,
                    [Description] nvarchar(max) NULL,
                    [Subject] nvarchar(120) NULL,
                    [Stage] nvarchar(32) NULL,
                    [Grade] nvarchar(64) NULL,
                    [CoverUrl] nvarchar(500) NULL,
                    [IntroVideoUrl] nvarchar(1000) NULL,
                    [DeliveryMode] nvarchar(24) NOT NULL DEFAULT N'Online',
                    [IsFree] bit NOT NULL DEFAULT 0,
                    [Price] decimal(12,2) NOT NULL DEFAULT 0,
                    [OldPrice] decimal(12,2) NULL,
                    [Capacity] int NULL,
                    [AccessDays] int NOT NULL DEFAULT 365,
                    [IsPublished] bit NOT NULL DEFAULT 0,
                    [IsFeatured] bit NOT NULL DEFAULT 0,
                    [IsArchived] bit NOT NULL DEFAULT 0,
                    [PublishAtUtc] datetime2 NULL,
                    [ArchiveAtUtc] datetime2 NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_TeacherCourses] PRIMARY KEY([Id]),
                    CONSTRAINT [FK_TeacherCourses_Users_TeacherId] FOREIGN KEY([TeacherId]) REFERENCES [Users]([Id]) ON DELETE CASCADE
                );
                CREATE INDEX [IX_TeacherCourses_TeacherId_IsArchived] ON [TeacherCourses]([TeacherId],[IsArchived]);
            END;
            IF OBJECT_ID(N'dbo.CourseUnits',N'U') IS NULL
            BEGIN
                CREATE TABLE [CourseUnits](
                    [Id] uniqueidentifier NOT NULL,
                    [CourseId] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [Title] nvarchar(200) NOT NULL,
                    [Description] nvarchar(max) NULL,
                    [SortOrder] int NOT NULL DEFAULT 0,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_CourseUnits] PRIMARY KEY([Id]),
                    CONSTRAINT [FK_CourseUnits_TeacherCourses_CourseId] FOREIGN KEY([CourseId]) REFERENCES [TeacherCourses]([Id]) ON DELETE CASCADE
                );
                CREATE INDEX [IX_CourseUnits_CourseId_SortOrder] ON [CourseUnits]([CourseId],[SortOrder]);
                CREATE INDEX [IX_CourseUnits_TeacherId] ON [CourseUnits]([TeacherId]);
            END;
            IF OBJECT_ID(N'dbo.CourseLessons',N'U') IS NULL
            BEGIN
                CREATE TABLE [CourseLessons](
                    [Id] uniqueidentifier NOT NULL,
                    [UnitId] uniqueidentifier NOT NULL,
                    [CourseId] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [Title] nvarchar(200) NOT NULL,
                    [Description] nvarchar(max) NULL,
                    [VideoUrl] nvarchar(1000) NULL,
                    [PdfUrl] nvarchar(1000) NULL,
                    [DurationMinutes] int NOT NULL DEFAULT 0,
                    [IsFreePreview] bit NOT NULL DEFAULT 0,
                    [IsPublished] bit NOT NULL DEFAULT 1,
                    [IsArchived] bit NOT NULL DEFAULT 0,
                    [PublishAtUtc] datetime2 NULL,
                    [SortOrder] int NOT NULL DEFAULT 0,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_CourseLessons] PRIMARY KEY([Id]),
                    CONSTRAINT [FK_CourseLessons_CourseUnits_UnitId] FOREIGN KEY([UnitId]) REFERENCES [CourseUnits]([Id]) ON DELETE CASCADE
                );
                CREATE INDEX [IX_CourseLessons_CourseId_SortOrder] ON [CourseLessons]([CourseId],[SortOrder]);
                CREATE INDEX [IX_CourseLessons_TeacherId] ON [CourseLessons]([TeacherId]);
            END;
            IF OBJECT_ID(N'dbo.LessonMaterials',N'U') IS NULL
            BEGIN
                CREATE TABLE [LessonMaterials](
                    [Id] uniqueidentifier NOT NULL,
                    [LessonId] uniqueidentifier NOT NULL,
                    [CourseId] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [Kind] nvarchar(24) NOT NULL DEFAULT N'Link',
                    [Title] nvarchar(200) NOT NULL,
                    [Url] nvarchar(1000) NOT NULL,
                    [StorageKey] nvarchar(500) NULL,
                    [SizeBytes] bigint NULL,
                    [IsFreePreview] bit NOT NULL DEFAULT 0,
                    [IsDownloadable] bit NOT NULL DEFAULT 1,
                    [IsPublished] bit NOT NULL DEFAULT 1,
                    [PublishAtUtc] datetime2 NULL,
                    [SortOrder] int NOT NULL DEFAULT 0,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_LessonMaterials] PRIMARY KEY([Id]),
                    CONSTRAINT [FK_LessonMaterials_CourseLessons_LessonId] FOREIGN KEY([LessonId]) REFERENCES [CourseLessons]([Id]) ON DELETE CASCADE
                );
                CREATE INDEX [IX_LessonMaterials_LessonId_SortOrder] ON [LessonMaterials]([LessonId],[SortOrder]);
                CREATE INDEX [IX_LessonMaterials_TeacherId] ON [LessonMaterials]([TeacherId]);
            END;
            IF OBJECT_ID(N'dbo.CourseEnrollments',N'U') IS NULL
            BEGIN
                CREATE TABLE [CourseEnrollments](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [CourseId] uniqueidentifier NOT NULL,
                    [StudentId] uniqueidentifier NOT NULL,
                    [PackageId] uniqueidentifier NULL,
                    [Status] nvarchar(24) NOT NULL DEFAULT N'Active',
                    [EnrolledAtUtc] datetime2 NOT NULL,
                    [StartsAtUtc] datetime2 NULL,
                    [ExpiresAtUtc] datetime2 NULL,
                    [AmountPaid] decimal(12,2) NOT NULL DEFAULT 0,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_CourseEnrollments] PRIMARY KEY([Id])
                );
                CREATE UNIQUE INDEX [IX_CourseEnrollments_CourseId_StudentId] ON [CourseEnrollments]([CourseId],[StudentId]);
                CREATE INDEX [IX_CourseEnrollments_TeacherId_StudentId] ON [CourseEnrollments]([TeacherId],[StudentId]);
            END;
            IF OBJECT_ID(N'dbo.LessonProgresses',N'U') IS NULL
            BEGIN
                CREATE TABLE [LessonProgresses](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [CourseId] uniqueidentifier NOT NULL,
                    [LessonId] uniqueidentifier NOT NULL,
                    [StudentId] uniqueidentifier NOT NULL,
                    [StartedAtUtc] datetime2 NOT NULL,
                    [CompletedAtUtc] datetime2 NULL,
                    [LastSeenAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_LessonProgresses] PRIMARY KEY([Id])
                );
                CREATE UNIQUE INDEX [IX_LessonProgresses_LessonId_StudentId] ON [LessonProgresses]([LessonId],[StudentId]);
                CREATE INDEX [IX_LessonProgresses_TeacherId_StudentId] ON [LessonProgresses]([TeacherId],[StudentId]);
            END;
            IF OBJECT_ID(N'dbo.TeachingGroups',N'U') IS NULL
            BEGIN
                CREATE TABLE [TeachingGroups](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [Name] nvarchar(160) NOT NULL,
                    [Description] nvarchar(max) NULL,
                    [Subject] nvarchar(120) NOT NULL,
                    [Stage] nvarchar(32) NULL,
                    [Grade] nvarchar(64) NULL,
                    [AcademicYear] nvarchar(32) NULL,
                    [DeliveryMode] nvarchar(24) NOT NULL DEFAULT N'Offline',
                    [Capacity] int NOT NULL DEFAULT 20,
                    [Location] nvarchar(300) NULL,
                    [OnlineLink] nvarchar(1000) NULL,
                    [Price] decimal(12,2) NOT NULL DEFAULT 0,
                    [PaymentType] nvarchar(24) NOT NULL DEFAULT N'Monthly',
                    [MonthlyDueDay] int NOT NULL DEFAULT 5,
                    [SessionBillingPolicy] nvarchar(24) NOT NULL DEFAULT N'PerAttendedSession',
                    [StartDateUtc] datetime2 NOT NULL,
                    [EndDateUtc] datetime2 NULL,
                    [EnrollmentOpen] bit NOT NULL DEFAULT 1,
                    [IsActive] bit NOT NULL DEFAULT 1,
                    [LateGraceMinutes] int NOT NULL DEFAULT 10,
                    [QrValidityMinutes] int NOT NULL DEFAULT 2,
                    [ChatMode] nvarchar(24) NOT NULL DEFAULT N'Everyone',
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_TeachingGroups] PRIMARY KEY([Id]),
                    CONSTRAINT [FK_TeachingGroups_Users_TeacherId] FOREIGN KEY([TeacherId]) REFERENCES [Users]([Id]) ON DELETE CASCADE
                );
                CREATE INDEX [IX_TeachingGroups_TeacherId_IsActive] ON [TeachingGroups]([TeacherId],[IsActive]);
            END;
            IF OBJECT_ID(N'dbo.GroupCourses',N'U') IS NULL
            BEGIN
                CREATE TABLE [GroupCourses](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [GroupId] uniqueidentifier NOT NULL,
                    [CourseId] uniqueidentifier NOT NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_GroupCourses] PRIMARY KEY([Id])
                );
                CREATE UNIQUE INDEX [IX_GroupCourses_GroupId_CourseId] ON [GroupCourses]([GroupId],[CourseId]);
            END;
            IF OBJECT_ID(N'dbo.GroupMemberships',N'U') IS NULL
            BEGIN
                CREATE TABLE [GroupMemberships](
                    [Id] uniqueidentifier NOT NULL,
                    [GroupId] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [StudentId] uniqueidentifier NOT NULL,
                    [Status] nvarchar(24) NOT NULL DEFAULT N'Active',
                    [JoinedAtUtc] datetime2 NOT NULL,
                    [SuspendedAtUtc] datetime2 NULL,
                    [Note] nvarchar(500) NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_GroupMemberships] PRIMARY KEY([Id])
                );
                CREATE UNIQUE INDEX [IX_GroupMemberships_GroupId_StudentId] ON [GroupMemberships]([GroupId],[StudentId]);
                CREATE INDEX [IX_GroupMemberships_TeacherId_StudentId] ON [GroupMemberships]([TeacherId],[StudentId]);
            END;
            IF OBJECT_ID(N'dbo.GroupSchedules',N'U') IS NULL
            BEGIN
                CREATE TABLE [GroupSchedules](
                    [Id] uniqueidentifier NOT NULL,
                    [GroupId] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [DayOfWeek] int NOT NULL DEFAULT 0,
                    [StartTime] time NOT NULL,
                    [EndTime] time NOT NULL,
                    [Location] nvarchar(300) NULL,
                    [IsActive] bit NOT NULL DEFAULT 1,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_GroupSchedules] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_GroupSchedules_GroupId] ON [GroupSchedules]([GroupId]);
            END;
            IF OBJECT_ID(N'dbo.GroupSessions',N'U') IS NULL
            BEGIN
                CREATE TABLE [GroupSessions](
                    [Id] uniqueidentifier NOT NULL,
                    [GroupId] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [ScheduleId] uniqueidentifier NULL,
                    [ScheduledDateUtc] datetime2 NOT NULL,
                    [StartTime] time NOT NULL,
                    [EndTime] time NOT NULL,
                    [StartsAtUtc] datetime2 NOT NULL,
                    [EndsAtUtc] datetime2 NOT NULL,
                    [ActualStartAtUtc] datetime2 NULL,
                    [ActualEndAtUtc] datetime2 NULL,
                    [Status] nvarchar(24) NOT NULL DEFAULT N'Scheduled',
                    [Title] nvarchar(200) NOT NULL DEFAULT N'',
                    [DeliveryMode] nvarchar(24) NOT NULL DEFAULT N'Offline',
                    [Location] nvarchar(300) NULL,
                    [OnlineLink] nvarchar(1000) NULL,
                    [Notes] nvarchar(max) NULL,
                    [CancellationReason] nvarchar(500) NULL,
                    [AttendanceOpenedAtUtc] datetime2 NULL,
                    [AttendanceClosedAtUtc] datetime2 NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_GroupSessions] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_GroupSessions_GroupId_StartsAtUtc] ON [GroupSessions]([GroupId],[StartsAtUtc]);
                CREATE INDEX [IX_GroupSessions_TeacherId_StartsAtUtc] ON [GroupSessions]([TeacherId],[StartsAtUtc]);
            END;
            IF OBJECT_ID(N'dbo.SessionAttendances',N'U') IS NULL
            BEGIN
                CREATE TABLE [SessionAttendances](
                    [Id] uniqueidentifier NOT NULL,
                    [SessionId] uniqueidentifier NOT NULL,
                    [GroupId] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [StudentId] uniqueidentifier NOT NULL,
                    [Status] nvarchar(16) NOT NULL DEFAULT N'Absent',
                    [CheckInAtUtc] datetime2 NULL,
                    [Method] nvarchar(16) NOT NULL DEFAULT N'Manual',
                    [RecordedByUserId] uniqueidentifier NULL,
                    [Note] nvarchar(500) NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_SessionAttendances] PRIMARY KEY([Id])
                );
                CREATE UNIQUE INDEX [IX_SessionAttendances_SessionId_StudentId] ON [SessionAttendances]([SessionId],[StudentId]);
                CREATE INDEX [IX_SessionAttendances_TeacherId_StudentId] ON [SessionAttendances]([TeacherId],[StudentId]);
            END;
            IF OBJECT_ID(N'dbo.AttendanceAuditLogs',N'U') IS NULL
            BEGIN
                CREATE TABLE [AttendanceAuditLogs](
                    [Id] bigint IDENTITY(1,1) NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [SessionId] uniqueidentifier NOT NULL,
                    [StudentId] uniqueidentifier NOT NULL,
                    [AttendanceId] uniqueidentifier NULL,
                    [ChangedByUserId] uniqueidentifier NULL,
                    [OldStatus] nvarchar(16) NOT NULL DEFAULT N'',
                    [NewStatus] nvarchar(16) NOT NULL DEFAULT N'',
                    [Reason] nvarchar(500) NULL,
                    [ChangedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_AttendanceAuditLogs] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_AttendanceAuditLogs_TeacherId_ChangedAtUtc] ON [AttendanceAuditLogs]([TeacherId],[ChangedAtUtc]);
                CREATE INDEX [IX_AttendanceAuditLogs_SessionId] ON [AttendanceAuditLogs]([SessionId]);
            END;
            IF OBJECT_ID(N'dbo.AttendanceQrTokens',N'U') IS NULL
            BEGIN
                CREATE TABLE [AttendanceQrTokens](
                    [Id] uniqueidentifier NOT NULL,
                    [SessionId] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [TokenHash] nvarchar(128) NOT NULL,
                    [ExpiresAtUtc] datetime2 NOT NULL,
                    [CreatedByUserId] uniqueidentifier NULL,
                    [RevokedAtUtc] datetime2 NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_AttendanceQrTokens] PRIMARY KEY([Id])
                );
                CREATE UNIQUE INDEX [IX_AttendanceQrTokens_TokenHash] ON [AttendanceQrTokens]([TokenHash]);
                CREATE INDEX [IX_AttendanceQrTokens_ExpiresAtUtc] ON [AttendanceQrTokens]([ExpiresAtUtc]);
            END;
            """, cancellationToken);

        await db.Database.ExecuteSqlRawAsync("""
            IF OBJECT_ID(N'dbo.HomeworkAssignments',N'U') IS NULL
            BEGIN
                CREATE TABLE [HomeworkAssignments](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [CourseId] uniqueidentifier NULL,
                    [GroupId] uniqueidentifier NULL,
                    [LessonId] uniqueidentifier NULL,
                    [Title] nvarchar(200) NOT NULL,
                    [Prompt] nvarchar(max) NOT NULL DEFAULT N'',
                    [DueAtUtc] datetime2 NULL,
                    [AllowLateSubmission] bit NOT NULL DEFAULT 1,
                    [MaxPoints] decimal(12,2) NOT NULL DEFAULT 10,
                    [IsPublished] bit NOT NULL DEFAULT 1,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_HomeworkAssignments] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_HomeworkAssignments_TeacherId_DueAtUtc] ON [HomeworkAssignments]([TeacherId],[DueAtUtc]);
                CREATE INDEX [IX_HomeworkAssignments_GroupId] ON [HomeworkAssignments]([GroupId]);
            END;
            IF OBJECT_ID(N'dbo.HomeworkSubmissions',N'U') IS NULL
            BEGIN
                CREATE TABLE [HomeworkSubmissions](
                    [Id] uniqueidentifier NOT NULL,
                    [AssignmentId] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [StudentId] uniqueidentifier NOT NULL,
                    [AnswerText] nvarchar(max) NOT NULL DEFAULT N'',
                    [AttachmentUrl] nvarchar(1000) NULL,
                    [Status] nvarchar(24) NOT NULL DEFAULT N'Submitted',
                    [Grade] decimal(12,2) NULL,
                    [Feedback] nvarchar(2000) NULL,
                    [SubmittedAtUtc] datetime2 NOT NULL,
                    [ReviewedAtUtc] datetime2 NULL,
                    [ReviewedByUserId] uniqueidentifier NULL,
                    CONSTRAINT [PK_HomeworkSubmissions] PRIMARY KEY([Id])
                );
                CREATE UNIQUE INDEX [IX_HomeworkSubmissions_AssignmentId_StudentId] ON [HomeworkSubmissions]([AssignmentId],[StudentId]);
                CREATE INDEX [IX_HomeworkSubmissions_TeacherId_Status] ON [HomeworkSubmissions]([TeacherId],[Status]);
            END;
            IF OBJECT_ID(N'dbo.StudentPackages',N'U') IS NULL
            BEGIN
                CREATE TABLE [StudentPackages](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [Name] nvarchar(200) NOT NULL,
                    [Description] nvarchar(2000) NULL,
                    [Kind] nvarchar(24) NOT NULL DEFAULT N'Course',
                    [Price] decimal(12,2) NOT NULL DEFAULT 0,
                    [OldPrice] decimal(12,2) NULL,
                    [DurationDays] int NOT NULL DEFAULT 30,
                    [SessionsIncluded] int NULL,
                    [Capacity] int NULL,
                    [IsRecurring] bit NOT NULL DEFAULT 0,
                    [IsActive] bit NOT NULL DEFAULT 1,
                    [AvailableFromUtc] datetime2 NULL,
                    [AvailableUntilUtc] datetime2 NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_StudentPackages] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_StudentPackages_TeacherId_IsActive] ON [StudentPackages]([TeacherId],[IsActive]);
            END;
            IF OBJECT_ID(N'dbo.PackageItems',N'U') IS NULL
            BEGIN
                CREATE TABLE [PackageItems](
                    [Id] uniqueidentifier NOT NULL,
                    [PackageId] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [ItemType] nvarchar(24) NOT NULL DEFAULT N'Course',
                    [ItemId] uniqueidentifier NOT NULL,
                    CONSTRAINT [PK_PackageItems] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_PackageItems_PackageId] ON [PackageItems]([PackageId]);
            END;
            IF OBJECT_ID(N'dbo.PackageEnrollments',N'U') IS NULL
            BEGIN
                CREATE TABLE [PackageEnrollments](
                    [Id] uniqueidentifier NOT NULL,
                    [PackageId] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [StudentId] uniqueidentifier NOT NULL,
                    [Status] nvarchar(24) NOT NULL DEFAULT N'Active',
                    [EnrolledAtUtc] datetime2 NOT NULL,
                    [StartsAtUtc] datetime2 NULL,
                    [ExpiresAtUtc] datetime2 NULL,
                    [AmountDue] decimal(12,2) NOT NULL DEFAULT 0,
                    [AmountPaid] decimal(12,2) NOT NULL DEFAULT 0,
                    [CouponCode] nvarchar(40) NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_PackageEnrollments] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_PackageEnrollments_PackageId_StudentId] ON [PackageEnrollments]([PackageId],[StudentId]);
                CREATE INDEX [IX_PackageEnrollments_TeacherId_StudentId] ON [PackageEnrollments]([TeacherId],[StudentId]);
            END;
            IF OBJECT_ID(N'dbo.DiscountCoupons',N'U') IS NULL
            BEGIN
                CREATE TABLE [DiscountCoupons](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [Code] nvarchar(40) NOT NULL,
                    [Kind] nvarchar(16) NOT NULL DEFAULT N'Percent',
                    [Value] decimal(12,2) NOT NULL DEFAULT 0,
                    [MaxUses] int NULL,
                    [UsedCount] int NOT NULL DEFAULT 0,
                    [ValidFromUtc] datetime2 NULL,
                    [ValidUntilUtc] datetime2 NULL,
                    [IsActive] bit NOT NULL DEFAULT 1,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_DiscountCoupons] PRIMARY KEY([Id])
                );
                CREATE UNIQUE INDEX [IX_DiscountCoupons_TeacherId_Code] ON [DiscountCoupons]([TeacherId],[Code]);
            END;
            IF OBJECT_ID(N'dbo.FinancialCharges',N'U') IS NULL
            BEGIN
                CREATE TABLE [FinancialCharges](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [StudentId] uniqueidentifier NOT NULL,
                    [GroupId] uniqueidentifier NULL,
                    [CourseId] uniqueidentifier NULL,
                    [PackageId] uniqueidentifier NULL,
                    [SessionId] uniqueidentifier NULL,
                    [Kind] nvarchar(24) NOT NULL DEFAULT N'Manual',
                    [Amount] decimal(12,2) NOT NULL DEFAULT 0,
                    [DueDateUtc] datetime2 NOT NULL,
                    [Description] nvarchar(500) NOT NULL DEFAULT N'',
                    [DedupeKey] nvarchar(200) NOT NULL DEFAULT N'',
                    [IsVoid] bit NOT NULL DEFAULT 0,
                    [VoidReason] nvarchar(500) NULL,
                    [CreatedByUserId] uniqueidentifier NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_FinancialCharges] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_FinancialCharges_TeacherId_StudentId] ON [FinancialCharges]([TeacherId],[StudentId]);
                CREATE INDEX [IX_FinancialCharges_TeacherId_GroupId] ON [FinancialCharges]([TeacherId],[GroupId]);
                CREATE UNIQUE INDEX [IX_FinancialCharges_TeacherId_DedupeKey] ON [FinancialCharges]([TeacherId],[DedupeKey]) WHERE [DedupeKey] <> N'';
            END;
            IF OBJECT_ID(N'dbo.StudentPayments',N'U') IS NULL
            BEGIN
                CREATE TABLE [StudentPayments](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [StudentId] uniqueidentifier NOT NULL,
                    [GroupId] uniqueidentifier NULL,
                    [CourseId] uniqueidentifier NULL,
                    [PackageId] uniqueidentifier NULL,
                    [ChargeId] uniqueidentifier NULL,
                    [Amount] decimal(12,2) NOT NULL DEFAULT 0,
                    [Method] nvarchar(24) NOT NULL DEFAULT N'Cash',
                    [Reference] nvarchar(200) NULL,
                    [Notes] nvarchar(500) NULL,
                    [ReceiptNumber] nvarchar(40) NOT NULL DEFAULT N'',
                    [CoverageType] nvarchar(16) NULL,
                    [SessionsCount] int NULL,
                    [PeriodMonth] int NULL,
                    [PeriodYear] int NULL,
                    [ReceivedByUserId] uniqueidentifier NULL,
                    [PaidAtUtc] datetime2 NOT NULL,
                    [IsVoid] bit NOT NULL DEFAULT 0,
                    [VoidReason] nvarchar(500) NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_StudentPayments] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_StudentPayments_TeacherId_StudentId] ON [StudentPayments]([TeacherId],[StudentId]);
                CREATE UNIQUE INDEX [IX_StudentPayments_ReceiptNumber] ON [StudentPayments]([ReceiptNumber]);
            END;
            IF OBJECT_ID(N'dbo.GroupPaymentRequests',N'U') IS NULL
            BEGIN
                CREATE TABLE [GroupPaymentRequests](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [StudentId] uniqueidentifier NOT NULL,
                    [GroupId] uniqueidentifier NOT NULL,
                    [Amount] decimal(12,2) NOT NULL DEFAULT 0,
                    [CoverageType] nvarchar(16) NOT NULL DEFAULT N'Month',
                    [SessionsCount] int NULL,
                    [PeriodMonth] int NULL,
                    [PeriodYear] int NULL,
                    [Method] nvarchar(24) NOT NULL DEFAULT N'Cash',
                    [Reference] nvarchar(200) NULL,
                    [Notes] nvarchar(500) NULL,
                    [Status] nvarchar(16) NOT NULL DEFAULT N'Pending',
                    [ReviewNote] nvarchar(500) NULL,
                    [ReviewedAtUtc] datetime2 NULL,
                    [ReviewedByUserId] uniqueidentifier NULL,
                    [PaymentId] uniqueidentifier NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_GroupPaymentRequests] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_GroupPaymentRequests_TeacherId_Status] ON [GroupPaymentRequests]([TeacherId],[Status]);
                CREATE INDEX [IX_GroupPaymentRequests_StudentId_CreatedAtUtc] ON [GroupPaymentRequests]([StudentId],[CreatedAtUtc]);
            END;
            IF OBJECT_ID(N'dbo.FinancialAdjustments',N'U') IS NULL
            BEGIN
                CREATE TABLE [FinancialAdjustments](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [StudentId] uniqueidentifier NOT NULL,
                    [GroupId] uniqueidentifier NULL,
                    [Kind] nvarchar(24) NOT NULL DEFAULT N'Discount',
                    [Amount] decimal(12,2) NOT NULL DEFAULT 0,
                    [Reason] nvarchar(500) NOT NULL DEFAULT N'',
                    [CreatedByUserId] uniqueidentifier NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_FinancialAdjustments] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_FinancialAdjustments_TeacherId_StudentId] ON [FinancialAdjustments]([TeacherId],[StudentId]);
            END;
            IF OBJECT_ID(N'dbo.PlatformPayments',N'U') IS NULL
            BEGIN
                CREATE TABLE [PlatformPayments](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [SubscriptionId] uniqueidentifier NULL,
                    [Amount] decimal(12,2) NOT NULL DEFAULT 0,
                    [Currency] nvarchar(8) NOT NULL DEFAULT N'EGP',
                    [Method] nvarchar(24) NOT NULL DEFAULT N'Cash',
                    [Reference] nvarchar(200) NULL,
                    [ReceiptUrl] nvarchar(1000) NULL,
                    [Status] nvarchar(16) NOT NULL DEFAULT N'Pending',
                    [AdminNote] nvarchar(500) NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [ReviewedAtUtc] datetime2 NULL,
                    [ReviewedByAdminId] uniqueidentifier NULL,
                    CONSTRAINT [PK_PlatformPayments] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_PlatformPayments_TeacherId_Status] ON [PlatformPayments]([TeacherId],[Status]);
            END;
            IF OBJECT_ID(N'dbo.Announcements',N'U') IS NULL
            BEGIN
                CREATE TABLE [Announcements](
                    [Id] uniqueidentifier NOT NULL,
                    [TeacherId] uniqueidentifier NULL,
                    [GroupId] uniqueidentifier NULL,
                    [CourseId] uniqueidentifier NULL,
                    [Audience] nvarchar(24) NOT NULL DEFAULT N'Students',
                    [TargetStudentIdsJson] nvarchar(max) NULL,
                    [Title] nvarchar(200) NOT NULL,
                    [Summary] nvarchar(500) NULL,
                    [Body] nvarchar(max) NULL,
                    [ImageUrl] nvarchar(1000) NULL,
                    [IsPublished] bit NOT NULL DEFAULT 1,
                    [IsPinned] bit NOT NULL DEFAULT 0,
                    [PublishAtUtc] datetime2 NULL,
                    [ExpiresAtUtc] datetime2 NULL,
                    [DeliveredAtUtc] datetime2 NULL,
                    [CreatedByUserId] uniqueidentifier NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_Announcements] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_Announcements_TeacherId_CreatedAtUtc] ON [Announcements]([TeacherId],[CreatedAtUtc]);
                CREATE INDEX [IX_Announcements_PublishAtUtc] ON [Announcements]([PublishAtUtc]);
            END;
            IF COL_LENGTH(N'dbo.Announcements',N'TargetStudentIdsJson') IS NULL
                ALTER TABLE [Announcements] ADD [TargetStudentIdsJson] nvarchar(max) NULL;
            IF COL_LENGTH(N'dbo.Announcements',N'DeliveredAtUtc') IS NULL
                ALTER TABLE [Announcements] ADD [DeliveredAtUtc] datetime2 NULL;
            IF OBJECT_ID(N'dbo.NotificationPreferences',N'U') IS NULL
            BEGIN
                CREATE TABLE [NotificationPreferences](
                    [UserId] uniqueidentifier NOT NULL,
                    [Messages] bit NOT NULL DEFAULT 1,
                    [Exams] bit NOT NULL DEFAULT 1,
                    [Sessions] bit NOT NULL DEFAULT 1,
                    [Payments] bit NOT NULL DEFAULT 1,
                    [Announcements] bit NOT NULL DEFAULT 1,
                    [System] bit NOT NULL DEFAULT 1,
                    [SoundEnabled] bit NOT NULL DEFAULT 1,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_NotificationPreferences] PRIMARY KEY([UserId])
                );
            END;
            IF OBJECT_ID(N'dbo.ContentAccessLogs',N'U') IS NULL
            BEGIN
                CREATE TABLE [ContentAccessLogs](
                    [Id] bigint IDENTITY(1,1) NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [LessonMaterialId] uniqueidentifier NOT NULL,
                    [UserId] uniqueidentifier NOT NULL,
                    [Action] nvarchar(24) NOT NULL DEFAULT N'Open',
                    [AtUtc] datetime2 NOT NULL,
                    [IpAddress] nvarchar(64) NULL,
                    CONSTRAINT [PK_ContentAccessLogs] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_ContentAccessLogs_TeacherId_AtUtc] ON [ContentAccessLogs]([TeacherId],[AtUtc]);
                CREATE INDEX [IX_ContentAccessLogs_LessonMaterialId] ON [ContentAccessLogs]([LessonMaterialId]);
            END;
            IF OBJECT_ID(N'dbo.TeachingAuditLogs',N'U') IS NULL
            BEGIN
                CREATE TABLE [TeachingAuditLogs](
                    [Id] bigint IDENTITY(1,1) NOT NULL,
                    [TeacherId] uniqueidentifier NOT NULL,
                    [ActorUserId] uniqueidentifier NULL,
                    [Action] nvarchar(80) NOT NULL,
                    [EntityType] nvarchar(80) NOT NULL,
                    [EntityId] nvarchar(80) NULL,
                    [Details] nvarchar(2000) NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_TeachingAuditLogs] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_TeachingAuditLogs_TeacherId_CreatedAtUtc] ON [TeachingAuditLogs]([TeacherId],[CreatedAtUtc]);
            END;
            IF OBJECT_ID(N'dbo.ConversationMemberStates',N'U') IS NULL
            BEGIN
                CREATE TABLE [ConversationMemberStates](
                    [Id] uniqueidentifier NOT NULL,
                    [ConversationId] uniqueidentifier NOT NULL,
                    [UserId] uniqueidentifier NOT NULL,
                    [IsMuted] bit NOT NULL DEFAULT 0,
                    [MutedUntilUtc] datetime2 NULL,
                    [MutedByUserId] uniqueidentifier NULL,
                    [UpdatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_ConversationMemberStates] PRIMARY KEY([Id])
                );
                CREATE UNIQUE INDEX [IX_ConversationMemberStates_ConversationId_UserId] ON [ConversationMemberStates]([ConversationId],[UserId]);
                CREATE INDEX [IX_ConversationMemberStates_UserId] ON [ConversationMemberStates]([UserId]);
            END;
            IF OBJECT_ID(N'dbo.ChatAuditLogs',N'U') IS NULL
            BEGIN
                CREATE TABLE [ChatAuditLogs](
                    [Id] bigint IDENTITY(1,1) NOT NULL,
                    [ConversationId] uniqueidentifier NOT NULL,
                    [ActorUserId] uniqueidentifier NULL,
                    [Action] nvarchar(60) NOT NULL,
                    [Details] nvarchar(1000) NULL,
                    [CreatedAtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_ChatAuditLogs] PRIMARY KEY([Id])
                );
                CREATE INDEX [IX_ChatAuditLogs_ConversationId_CreatedAtUtc] ON [ChatAuditLogs]([ConversationId],[CreatedAtUtc]);
            END;
            """, cancellationToken);
    }

    private static async Task EnsurePostgresAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "Price" numeric(12,2) NOT NULL DEFAULT 0;
            ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "Currency" character varying(8) NOT NULL DEFAULT 'EGP';
            ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "BillingPeriodDays" integer NOT NULL DEFAULT 30;
            ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "MaxStudents" integer NOT NULL DEFAULT 0;
            ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "MaxCourses" integer NOT NULL DEFAULT 0;
            ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "MaxGroups" integer NOT NULL DEFAULT 0;
            ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "MaxAssistants" integer NOT NULL DEFAULT 0;
            ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "StorageMb" integer NOT NULL DEFAULT 0;
            ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "MaxVideoMinutes" integer NOT NULL DEFAULT 0;
            ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "TrialDays" integer NOT NULL DEFAULT 0;
            ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "GraceDays" integer NOT NULL DEFAULT 7;
            ALTER TABLE "SubscriptionPlans" ADD COLUMN IF NOT EXISTS "IsPublic" boolean NOT NULL DEFAULT TRUE;
            ALTER TABLE "TeacherSubscriptions" ADD COLUMN IF NOT EXISTS "AutoRenew" boolean NOT NULL DEFAULT FALSE;
            ALTER TABLE "TeacherSubscriptions" ADD COLUMN IF NOT EXISTS "CancelledAtUtc" timestamp with time zone NULL;
            ALTER TABLE "TeacherSubscriptions" ADD COLUMN IF NOT EXISTS "RenewedFromSubscriptionId" uuid NULL;
            ALTER TABLE "Conversations" ADD COLUMN IF NOT EXISTS "GroupId" uuid NULL;
            ALTER TABLE "Conversations" ADD COLUMN IF NOT EXISTS "ChatMode" character varying(24) NOT NULL DEFAULT 'Everyone';
            ALTER TABLE "Conversations" ADD COLUMN IF NOT EXISTS "LastPolicyChangedAtUtc" timestamp with time zone NULL;
            ALTER TABLE "Conversations" ADD COLUMN IF NOT EXISTS "LastPolicyChangedByUserId" uuid NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Conversations_GroupChat" ON "Conversations" ("GroupId") WHERE "Type" = 'GroupChat' AND "GroupId" IS NOT NULL;
            ALTER TABLE "ConversationMessages" ADD COLUMN IF NOT EXISTS "IsDeleted" boolean NOT NULL DEFAULT FALSE;
            ALTER TABLE "ConversationMessages" ADD COLUMN IF NOT EXISTS "DeletedAtUtc" timestamp with time zone NULL;
            ALTER TABLE "ConversationMessages" ADD COLUMN IF NOT EXISTS "DeletedByUserId" uuid NULL;
            ALTER TABLE "ConversationMessages" ADD COLUMN IF NOT EXISTS "IsPinned" boolean NOT NULL DEFAULT FALSE;
            ALTER TABLE "ConversationMessages" ADD COLUMN IF NOT EXISTS "PinnedAtUtc" timestamp with time zone NULL;
            ALTER TABLE "ConversationMessages" ADD COLUMN IF NOT EXISTS "PinnedByUserId" uuid NULL;
            ALTER TABLE "ConversationMessages" ADD COLUMN IF NOT EXISTS "IsApproved" boolean NOT NULL DEFAULT TRUE;
            ALTER TABLE "ConversationMessages" ADD COLUMN IF NOT EXISTS "ApprovedAtUtc" timestamp with time zone NULL;
            ALTER TABLE "ConversationMessages" ADD COLUMN IF NOT EXISTS "ApprovedByUserId" uuid NULL;
            CREATE INDEX IF NOT EXISTS "IX_ConversationMessages_ConversationId_IsPinned" ON "ConversationMessages" ("ConversationId","IsPinned");
            ALTER TABLE "Notifications" ADD COLUMN IF NOT EXISTS "Category" character varying(24) NOT NULL DEFAULT 'System';
            ALTER TABLE "Notifications" ADD COLUMN IF NOT EXISTS "AnnouncementId" uuid NULL;
            CREATE INDEX IF NOT EXISTS "IX_Notifications_AnnouncementId" ON "Notifications" ("AnnouncementId");
            ALTER TABLE "StudentPayments" ADD COLUMN IF NOT EXISTS "CoverageType" character varying(16) NULL;
            ALTER TABLE "StudentPayments" ADD COLUMN IF NOT EXISTS "SessionsCount" integer NULL;
            ALTER TABLE "StudentPayments" ADD COLUMN IF NOT EXISTS "PeriodMonth" integer NULL;
            ALTER TABLE "StudentPayments" ADD COLUMN IF NOT EXISTS "PeriodYear" integer NULL;
            """, cancellationToken);

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "TeachingAssistants"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "AssistantId" uuid NOT NULL,
                "Status" character varying(24) NOT NULL DEFAULT 'Active',
                "CreatedAtUtc" timestamp with time zone NOT NULL, "UpdatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_TeachingAssistants" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_TeachingAssistants_TeacherId_AssistantId" ON "TeachingAssistants"("TeacherId","AssistantId");
            CREATE INDEX IF NOT EXISTS "IX_TeachingAssistants_AssistantId" ON "TeachingAssistants"("AssistantId");
            CREATE TABLE IF NOT EXISTS "AssistantPermissions"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "AssistantId" uuid NOT NULL,
                "Permission" character varying(64) NOT NULL, "GrantedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_AssistantPermissions" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_AssistantPermissions_AssistantId_TeacherId_Permission" ON "AssistantPermissions"("AssistantId","TeacherId","Permission");
            CREATE TABLE IF NOT EXISTS "AssistantGroupAccesses"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "AssistantId" uuid NOT NULL, "GroupId" uuid NOT NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_AssistantGroupAccesses" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_AssistantGroupAccesses_AssistantId_GroupId" ON "AssistantGroupAccesses"("AssistantId","GroupId");
            CREATE TABLE IF NOT EXISTS "TeacherCourses"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "Title" character varying(200) NOT NULL,
                "ShortDescription" text NULL, "Description" text NULL, "Subject" character varying(120) NULL,
                "Stage" character varying(32) NULL, "Grade" character varying(64) NULL, "CoverUrl" character varying(500) NULL,
                "IntroVideoUrl" character varying(1000) NULL, "DeliveryMode" character varying(24) NOT NULL DEFAULT 'Online',
                "IsFree" boolean NOT NULL DEFAULT FALSE, "Price" numeric(12,2) NOT NULL DEFAULT 0, "OldPrice" numeric(12,2) NULL,
                "Capacity" integer NULL, "AccessDays" integer NOT NULL DEFAULT 365, "IsPublished" boolean NOT NULL DEFAULT FALSE,
                "IsFeatured" boolean NOT NULL DEFAULT FALSE, "IsArchived" boolean NOT NULL DEFAULT FALSE,
                "PublishAtUtc" timestamp with time zone NULL, "ArchiveAtUtc" timestamp with time zone NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL, "UpdatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_TeacherCourses" PRIMARY KEY("Id"));
            CREATE INDEX IF NOT EXISTS "IX_TeacherCourses_TeacherId_IsArchived" ON "TeacherCourses"("TeacherId","IsArchived");
            CREATE TABLE IF NOT EXISTS "CourseUnits"(
                "Id" uuid NOT NULL, "CourseId" uuid NOT NULL, "TeacherId" uuid NOT NULL,
                "Title" character varying(200) NOT NULL, "Description" text NULL, "SortOrder" integer NOT NULL DEFAULT 0,
                "CreatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_CourseUnits" PRIMARY KEY("Id"));
            CREATE INDEX IF NOT EXISTS "IX_CourseUnits_CourseId_SortOrder" ON "CourseUnits"("CourseId","SortOrder");
            CREATE TABLE IF NOT EXISTS "CourseLessons"(
                "Id" uuid NOT NULL, "UnitId" uuid NOT NULL, "CourseId" uuid NOT NULL, "TeacherId" uuid NOT NULL,
                "Title" character varying(200) NOT NULL, "Description" text NULL, "VideoUrl" character varying(1000) NULL,
                "PdfUrl" character varying(1000) NULL, "DurationMinutes" integer NOT NULL DEFAULT 0,
                "IsFreePreview" boolean NOT NULL DEFAULT FALSE, "IsPublished" boolean NOT NULL DEFAULT TRUE,
                "IsArchived" boolean NOT NULL DEFAULT FALSE, "PublishAtUtc" timestamp with time zone NULL,
                "SortOrder" integer NOT NULL DEFAULT 0, "CreatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_CourseLessons" PRIMARY KEY("Id"));
            CREATE INDEX IF NOT EXISTS "IX_CourseLessons_CourseId_SortOrder" ON "CourseLessons"("CourseId","SortOrder");
            CREATE TABLE IF NOT EXISTS "LessonMaterials"(
                "Id" uuid NOT NULL, "LessonId" uuid NOT NULL, "CourseId" uuid NOT NULL, "TeacherId" uuid NOT NULL,
                "Kind" character varying(24) NOT NULL DEFAULT 'Link', "Title" character varying(200) NOT NULL,
                "Url" character varying(1000) NOT NULL, "StorageKey" character varying(500) NULL, "SizeBytes" bigint NULL,
                "IsFreePreview" boolean NOT NULL DEFAULT FALSE, "IsDownloadable" boolean NOT NULL DEFAULT TRUE,
                "IsPublished" boolean NOT NULL DEFAULT TRUE, "PublishAtUtc" timestamp with time zone NULL,
                "SortOrder" integer NOT NULL DEFAULT 0, "CreatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_LessonMaterials" PRIMARY KEY("Id"));
            CREATE INDEX IF NOT EXISTS "IX_LessonMaterials_LessonId_SortOrder" ON "LessonMaterials"("LessonId","SortOrder");
            CREATE TABLE IF NOT EXISTS "CourseEnrollments"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "CourseId" uuid NOT NULL, "StudentId" uuid NOT NULL,
                "PackageId" uuid NULL, "Status" character varying(24) NOT NULL DEFAULT 'Active',
                "EnrolledAtUtc" timestamp with time zone NOT NULL, "StartsAtUtc" timestamp with time zone NULL,
                "ExpiresAtUtc" timestamp with time zone NULL, "AmountPaid" numeric(12,2) NOT NULL DEFAULT 0,
                "UpdatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_CourseEnrollments" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_CourseEnrollments_CourseId_StudentId" ON "CourseEnrollments"("CourseId","StudentId");
            CREATE TABLE IF NOT EXISTS "LessonProgresses"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "CourseId" uuid NOT NULL, "LessonId" uuid NOT NULL,
                "StudentId" uuid NOT NULL, "StartedAtUtc" timestamp with time zone NOT NULL,
                "CompletedAtUtc" timestamp with time zone NULL, "LastSeenAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_LessonProgresses" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_LessonProgresses_LessonId_StudentId" ON "LessonProgresses"("LessonId","StudentId");
            CREATE TABLE IF NOT EXISTS "TeachingGroups"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "Name" character varying(160) NOT NULL,
                "Description" text NULL, "Subject" character varying(120) NOT NULL, "Stage" character varying(32) NULL,
                "Grade" character varying(64) NULL, "AcademicYear" character varying(32) NULL,
                "DeliveryMode" character varying(24) NOT NULL DEFAULT 'Offline', "Capacity" integer NOT NULL DEFAULT 20,
                "Location" character varying(300) NULL, "OnlineLink" character varying(1000) NULL,
                "Price" numeric(12,2) NOT NULL DEFAULT 0, "PaymentType" character varying(24) NOT NULL DEFAULT 'Monthly',
                "MonthlyDueDay" integer NOT NULL DEFAULT 5, "SessionBillingPolicy" character varying(24) NOT NULL DEFAULT 'PerAttendedSession',
                "StartDateUtc" timestamp with time zone NOT NULL, "EndDateUtc" timestamp with time zone NULL,
                "EnrollmentOpen" boolean NOT NULL DEFAULT TRUE, "IsActive" boolean NOT NULL DEFAULT TRUE,
                "LateGraceMinutes" integer NOT NULL DEFAULT 10, "QrValidityMinutes" integer NOT NULL DEFAULT 2,
                "ChatMode" character varying(24) NOT NULL DEFAULT 'Everyone',
                "CreatedAtUtc" timestamp with time zone NOT NULL, "UpdatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_TeachingGroups" PRIMARY KEY("Id"));
            CREATE INDEX IF NOT EXISTS "IX_TeachingGroups_TeacherId_IsActive" ON "TeachingGroups"("TeacherId","IsActive");
            CREATE TABLE IF NOT EXISTS "GroupCourses"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "GroupId" uuid NOT NULL, "CourseId" uuid NOT NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_GroupCourses" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_GroupCourses_GroupId_CourseId" ON "GroupCourses"("GroupId","CourseId");
            CREATE TABLE IF NOT EXISTS "GroupMemberships"(
                "Id" uuid NOT NULL, "GroupId" uuid NOT NULL, "TeacherId" uuid NOT NULL, "StudentId" uuid NOT NULL,
                "Status" character varying(24) NOT NULL DEFAULT 'Active', "JoinedAtUtc" timestamp with time zone NOT NULL,
                "SuspendedAtUtc" timestamp with time zone NULL, "Note" character varying(500) NULL,
                "UpdatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_GroupMemberships" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_GroupMemberships_GroupId_StudentId" ON "GroupMemberships"("GroupId","StudentId");
            CREATE TABLE IF NOT EXISTS "GroupSchedules"(
                "Id" uuid NOT NULL, "GroupId" uuid NOT NULL, "TeacherId" uuid NOT NULL, "DayOfWeek" integer NOT NULL DEFAULT 0,
                "StartTime" interval NOT NULL, "EndTime" interval NOT NULL, "Location" character varying(300) NULL,
                "IsActive" boolean NOT NULL DEFAULT TRUE, "CreatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_GroupSchedules" PRIMARY KEY("Id"));
            CREATE INDEX IF NOT EXISTS "IX_GroupSchedules_GroupId" ON "GroupSchedules"("GroupId");
            CREATE TABLE IF NOT EXISTS "GroupSessions"(
                "Id" uuid NOT NULL, "GroupId" uuid NOT NULL, "TeacherId" uuid NOT NULL, "ScheduleId" uuid NULL,
                "ScheduledDateUtc" timestamp with time zone NOT NULL, "StartTime" interval NOT NULL, "EndTime" interval NOT NULL,
                "StartsAtUtc" timestamp with time zone NOT NULL, "EndsAtUtc" timestamp with time zone NOT NULL,
                "ActualStartAtUtc" timestamp with time zone NULL, "ActualEndAtUtc" timestamp with time zone NULL,
                "Status" character varying(24) NOT NULL DEFAULT 'Scheduled', "Title" character varying(200) NOT NULL DEFAULT '',
                "DeliveryMode" character varying(24) NOT NULL DEFAULT 'Offline', "Location" character varying(300) NULL,
                "OnlineLink" character varying(1000) NULL, "Notes" text NULL, "CancellationReason" character varying(500) NULL,
                "AttendanceOpenedAtUtc" timestamp with time zone NULL, "AttendanceClosedAtUtc" timestamp with time zone NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL, "UpdatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_GroupSessions" PRIMARY KEY("Id"));
            CREATE INDEX IF NOT EXISTS "IX_GroupSessions_GroupId_StartsAtUtc" ON "GroupSessions"("GroupId","StartsAtUtc");
            CREATE TABLE IF NOT EXISTS "SessionAttendances"(
                "Id" uuid NOT NULL, "SessionId" uuid NOT NULL, "GroupId" uuid NOT NULL, "TeacherId" uuid NOT NULL,
                "StudentId" uuid NOT NULL, "Status" character varying(16) NOT NULL DEFAULT 'Absent',
                "CheckInAtUtc" timestamp with time zone NULL, "Method" character varying(16) NOT NULL DEFAULT 'Manual',
                "RecordedByUserId" uuid NULL, "Note" character varying(500) NULL, "UpdatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_SessionAttendances" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_SessionAttendances_SessionId_StudentId" ON "SessionAttendances"("SessionId","StudentId");
            CREATE TABLE IF NOT EXISTS "AttendanceAuditLogs"(
                "Id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL, "TeacherId" uuid NOT NULL, "SessionId" uuid NOT NULL,
                "StudentId" uuid NOT NULL, "AttendanceId" uuid NULL, "ChangedByUserId" uuid NULL,
                "OldStatus" character varying(16) NOT NULL DEFAULT '', "NewStatus" character varying(16) NOT NULL DEFAULT '',
                "Reason" character varying(500) NULL, "ChangedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_AttendanceAuditLogs" PRIMARY KEY("Id"));
            CREATE INDEX IF NOT EXISTS "IX_AttendanceAuditLogs_TeacherId_ChangedAtUtc" ON "AttendanceAuditLogs"("TeacherId","ChangedAtUtc");
            CREATE TABLE IF NOT EXISTS "AttendanceQrTokens"(
                "Id" uuid NOT NULL, "SessionId" uuid NOT NULL, "TeacherId" uuid NOT NULL,
                "TokenHash" character varying(128) NOT NULL, "ExpiresAtUtc" timestamp with time zone NOT NULL,
                "CreatedByUserId" uuid NULL, "RevokedAtUtc" timestamp with time zone NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_AttendanceQrTokens" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_AttendanceQrTokens_TokenHash" ON "AttendanceQrTokens"("TokenHash");
            """, cancellationToken);

        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "HomeworkAssignments"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "CourseId" uuid NULL, "GroupId" uuid NULL, "LessonId" uuid NULL,
                "Title" character varying(200) NOT NULL, "Prompt" text NOT NULL DEFAULT '', "DueAtUtc" timestamp with time zone NULL,
                "AllowLateSubmission" boolean NOT NULL DEFAULT TRUE, "MaxPoints" numeric(12,2) NOT NULL DEFAULT 10,
                "IsPublished" boolean NOT NULL DEFAULT TRUE, "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_HomeworkAssignments" PRIMARY KEY("Id"));
            CREATE TABLE IF NOT EXISTS "HomeworkSubmissions"(
                "Id" uuid NOT NULL, "AssignmentId" uuid NOT NULL, "TeacherId" uuid NOT NULL, "StudentId" uuid NOT NULL,
                "AnswerText" text NOT NULL DEFAULT '', "AttachmentUrl" character varying(1000) NULL,
                "Status" character varying(24) NOT NULL DEFAULT 'Submitted', "Grade" numeric(12,2) NULL,
                "Feedback" character varying(2000) NULL, "SubmittedAtUtc" timestamp with time zone NOT NULL,
                "ReviewedAtUtc" timestamp with time zone NULL, "ReviewedByUserId" uuid NULL,
                CONSTRAINT "PK_HomeworkSubmissions" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_HomeworkSubmissions_AssignmentId_StudentId" ON "HomeworkSubmissions"("AssignmentId","StudentId");
            CREATE TABLE IF NOT EXISTS "StudentPackages"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "Name" character varying(200) NOT NULL,
                "Description" character varying(2000) NULL, "Kind" character varying(24) NOT NULL DEFAULT 'Course',
                "Price" numeric(12,2) NOT NULL DEFAULT 0, "OldPrice" numeric(12,2) NULL, "DurationDays" integer NOT NULL DEFAULT 30,
                "SessionsIncluded" integer NULL, "Capacity" integer NULL, "IsRecurring" boolean NOT NULL DEFAULT FALSE,
                "IsActive" boolean NOT NULL DEFAULT TRUE, "AvailableFromUtc" timestamp with time zone NULL,
                "AvailableUntilUtc" timestamp with time zone NULL, "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_StudentPackages" PRIMARY KEY("Id"));
            CREATE TABLE IF NOT EXISTS "PackageItems"(
                "Id" uuid NOT NULL, "PackageId" uuid NOT NULL, "TeacherId" uuid NOT NULL,
                "ItemType" character varying(24) NOT NULL DEFAULT 'Course', "ItemId" uuid NOT NULL,
                CONSTRAINT "PK_PackageItems" PRIMARY KEY("Id"));
            CREATE TABLE IF NOT EXISTS "PackageEnrollments"(
                "Id" uuid NOT NULL, "PackageId" uuid NOT NULL, "TeacherId" uuid NOT NULL, "StudentId" uuid NOT NULL,
                "Status" character varying(24) NOT NULL DEFAULT 'Active', "EnrolledAtUtc" timestamp with time zone NOT NULL,
                "StartsAtUtc" timestamp with time zone NULL, "ExpiresAtUtc" timestamp with time zone NULL,
                "AmountDue" numeric(12,2) NOT NULL DEFAULT 0, "AmountPaid" numeric(12,2) NOT NULL DEFAULT 0,
                "CouponCode" character varying(40) NULL, "UpdatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_PackageEnrollments" PRIMARY KEY("Id"));
            CREATE TABLE IF NOT EXISTS "DiscountCoupons"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "Code" character varying(40) NOT NULL,
                "Kind" character varying(16) NOT NULL DEFAULT 'Percent', "Value" numeric(12,2) NOT NULL DEFAULT 0,
                "MaxUses" integer NULL, "UsedCount" integer NOT NULL DEFAULT 0, "ValidFromUtc" timestamp with time zone NULL,
                "ValidUntilUtc" timestamp with time zone NULL, "IsActive" boolean NOT NULL DEFAULT TRUE,
                "CreatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_DiscountCoupons" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_DiscountCoupons_TeacherId_Code" ON "DiscountCoupons"("TeacherId","Code");
            CREATE TABLE IF NOT EXISTS "FinancialCharges"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "StudentId" uuid NOT NULL, "GroupId" uuid NULL,
                "CourseId" uuid NULL, "PackageId" uuid NULL, "SessionId" uuid NULL,
                "Kind" character varying(24) NOT NULL DEFAULT 'Manual', "Amount" numeric(12,2) NOT NULL DEFAULT 0,
                "DueDateUtc" timestamp with time zone NOT NULL, "Description" character varying(500) NOT NULL DEFAULT '',
                "DedupeKey" character varying(200) NOT NULL DEFAULT '', "IsVoid" boolean NOT NULL DEFAULT FALSE,
                "VoidReason" character varying(500) NULL, "CreatedByUserId" uuid NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_FinancialCharges" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_FinancialCharges_TeacherId_DedupeKey" ON "FinancialCharges"("TeacherId","DedupeKey") WHERE "DedupeKey" <> '';
            CREATE TABLE IF NOT EXISTS "StudentPayments"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "StudentId" uuid NOT NULL, "GroupId" uuid NULL,
                "CourseId" uuid NULL, "PackageId" uuid NULL, "ChargeId" uuid NULL, "Amount" numeric(12,2) NOT NULL DEFAULT 0,
                "Method" character varying(24) NOT NULL DEFAULT 'Cash', "Reference" character varying(200) NULL,
                "Notes" character varying(500) NULL, "ReceiptNumber" character varying(40) NOT NULL DEFAULT '',
                "CoverageType" character varying(16) NULL, "SessionsCount" integer NULL,
                "PeriodMonth" integer NULL, "PeriodYear" integer NULL,
                "ReceivedByUserId" uuid NULL, "PaidAtUtc" timestamp with time zone NOT NULL,
                "IsVoid" boolean NOT NULL DEFAULT FALSE, "VoidReason" character varying(500) NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_StudentPayments" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_StudentPayments_ReceiptNumber" ON "StudentPayments"("ReceiptNumber");
            CREATE TABLE IF NOT EXISTS "GroupPaymentRequests"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "StudentId" uuid NOT NULL, "GroupId" uuid NOT NULL,
                "Amount" numeric(12,2) NOT NULL DEFAULT 0, "CoverageType" character varying(16) NOT NULL DEFAULT 'Month',
                "SessionsCount" integer NULL, "PeriodMonth" integer NULL, "PeriodYear" integer NULL,
                "Method" character varying(24) NOT NULL DEFAULT 'Cash', "Reference" character varying(200) NULL,
                "Notes" character varying(500) NULL, "Status" character varying(16) NOT NULL DEFAULT 'Pending',
                "ReviewNote" character varying(500) NULL, "ReviewedAtUtc" timestamp with time zone NULL,
                "ReviewedByUserId" uuid NULL, "PaymentId" uuid NULL, "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_GroupPaymentRequests" PRIMARY KEY("Id"));
            CREATE INDEX IF NOT EXISTS "IX_GroupPaymentRequests_TeacherId_Status" ON "GroupPaymentRequests"("TeacherId","Status");
            CREATE INDEX IF NOT EXISTS "IX_GroupPaymentRequests_StudentId_CreatedAtUtc" ON "GroupPaymentRequests"("StudentId","CreatedAtUtc");
            CREATE TABLE IF NOT EXISTS "FinancialAdjustments"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "StudentId" uuid NOT NULL, "GroupId" uuid NULL,
                "Kind" character varying(24) NOT NULL DEFAULT 'Discount', "Amount" numeric(12,2) NOT NULL DEFAULT 0,
                "Reason" character varying(500) NOT NULL DEFAULT '', "CreatedByUserId" uuid NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_FinancialAdjustments" PRIMARY KEY("Id"));
            CREATE TABLE IF NOT EXISTS "PlatformPayments"(
                "Id" uuid NOT NULL, "TeacherId" uuid NOT NULL, "SubscriptionId" uuid NULL,
                "Amount" numeric(12,2) NOT NULL DEFAULT 0, "Currency" character varying(8) NOT NULL DEFAULT 'EGP',
                "Method" character varying(24) NOT NULL DEFAULT 'Cash', "Reference" character varying(200) NULL,
                "ReceiptUrl" character varying(1000) NULL, "Status" character varying(16) NOT NULL DEFAULT 'Pending',
                "AdminNote" character varying(500) NULL, "CreatedAtUtc" timestamp with time zone NOT NULL,
                "ReviewedAtUtc" timestamp with time zone NULL, "ReviewedByAdminId" uuid NULL,
                CONSTRAINT "PK_PlatformPayments" PRIMARY KEY("Id"));
            CREATE TABLE IF NOT EXISTS "Announcements"(
                "Id" uuid NOT NULL, "TeacherId" uuid NULL, "GroupId" uuid NULL, "CourseId" uuid NULL,
                "Audience" character varying(24) NOT NULL DEFAULT 'Students', "Title" character varying(200) NOT NULL,
                "TargetStudentIdsJson" text NULL,
                "Summary" character varying(500) NULL, "Body" text NULL, "ImageUrl" character varying(1000) NULL,
                "IsPublished" boolean NOT NULL DEFAULT TRUE, "IsPinned" boolean NOT NULL DEFAULT FALSE,
                "PublishAtUtc" timestamp with time zone NULL, "ExpiresAtUtc" timestamp with time zone NULL,
                "DeliveredAtUtc" timestamp with time zone NULL,
                "CreatedByUserId" uuid NULL, "CreatedAtUtc" timestamp with time zone NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_Announcements" PRIMARY KEY("Id"));
            CREATE INDEX IF NOT EXISTS "IX_Announcements_TeacherId_CreatedAtUtc" ON "Announcements"("TeacherId","CreatedAtUtc");
            ALTER TABLE "Announcements" ADD COLUMN IF NOT EXISTS "TargetStudentIdsJson" text NULL;
            ALTER TABLE "Announcements" ADD COLUMN IF NOT EXISTS "DeliveredAtUtc" timestamp with time zone NULL;
            CREATE TABLE IF NOT EXISTS "NotificationPreferences"(
                "UserId" uuid NOT NULL, "Messages" boolean NOT NULL DEFAULT TRUE, "Exams" boolean NOT NULL DEFAULT TRUE,
                "Sessions" boolean NOT NULL DEFAULT TRUE, "Payments" boolean NOT NULL DEFAULT TRUE,
                "Announcements" boolean NOT NULL DEFAULT TRUE, "System" boolean NOT NULL DEFAULT TRUE,
                "SoundEnabled" boolean NOT NULL DEFAULT TRUE, "UpdatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_NotificationPreferences" PRIMARY KEY("UserId"));
            CREATE TABLE IF NOT EXISTS "ContentAccessLogs"(
                "Id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL, "TeacherId" uuid NOT NULL,
                "LessonMaterialId" uuid NOT NULL, "UserId" uuid NOT NULL, "Action" character varying(24) NOT NULL DEFAULT 'Open',
                "AtUtc" timestamp with time zone NOT NULL, "IpAddress" character varying(64) NULL,
                CONSTRAINT "PK_ContentAccessLogs" PRIMARY KEY("Id"));
            CREATE TABLE IF NOT EXISTS "TeachingAuditLogs"(
                "Id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL, "TeacherId" uuid NOT NULL,
                "ActorUserId" uuid NULL, "Action" character varying(80) NOT NULL,
                "EntityType" character varying(80) NOT NULL, "EntityId" character varying(80) NULL,
                "Details" character varying(2000) NULL, "CreatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_TeachingAuditLogs" PRIMARY KEY("Id"));
            CREATE TABLE IF NOT EXISTS "ConversationMemberStates"(
                "Id" uuid NOT NULL, "ConversationId" uuid NOT NULL, "UserId" uuid NOT NULL,
                "IsMuted" boolean NOT NULL DEFAULT FALSE, "MutedUntilUtc" timestamp with time zone NULL,
                "MutedByUserId" uuid NULL, "UpdatedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_ConversationMemberStates" PRIMARY KEY("Id"));
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_ConversationMemberStates_ConversationId_UserId" ON "ConversationMemberStates"("ConversationId","UserId");
            CREATE TABLE IF NOT EXISTS "ChatAuditLogs"(
                "Id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL, "ConversationId" uuid NOT NULL,
                "ActorUserId" uuid NULL, "Action" character varying(60) NOT NULL, "Details" character varying(1000) NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL, CONSTRAINT "PK_ChatAuditLogs" PRIMARY KEY("Id"));
            CREATE INDEX IF NOT EXISTS "IX_ChatAuditLogs_ConversationId_CreatedAtUtc" ON "ChatAuditLogs"("ConversationId","CreatedAtUtc");
            """, cancellationToken);
    }
}
