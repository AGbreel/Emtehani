-- Emtehani remediation indexes (SQL Server 2025 / MonsterASP)
-- Additive only. No table, row, or column is modified.
-- These indexes are also created idempotently by ExamWorkflowSchema.EnsureAsync
-- at API startup. This script exists for DBAs who prefer to pre-create them.
--
-- IMPORTANT: production Status/EntityType/EntityId columns are nvarchar(max).
-- Do not add them as index key columns. The indexes below use bounded columns only.

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_AuditEvents_ActorId_AtUtc' AND [object_id] = OBJECT_ID(N'dbo.AuditEvents'))
    CREATE INDEX [IX_AuditEvents_ActorId_AtUtc] ON [AuditEvents] ([ActorId], [AtUtc] DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_Submissions_StudentId_ExamId' AND [object_id] = OBJECT_ID(N'dbo.Submissions'))
    CREATE INDEX [IX_Submissions_StudentId_ExamId] ON [Submissions] ([StudentId], [ExamId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_Submissions_ExamId' AND [object_id] = OBJECT_ID(N'dbo.Submissions'))
    CREATE INDEX [IX_Submissions_ExamId] ON [Submissions] ([ExamId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_TeacherStudentRequests_TeacherId_Unlinked' AND [object_id] = OBJECT_ID(N'dbo.TeacherStudentRequests'))
    CREATE INDEX [IX_TeacherStudentRequests_TeacherId_Unlinked] ON [TeacherStudentRequests] ([TeacherId], [UnlinkedAtUtc]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_Exams_TeacherId_Published' AND [object_id] = OBJECT_ID(N'dbo.Exams'))
    CREATE INDEX [IX_Exams_TeacherId_Published] ON [Exams] ([TeacherId], [IsPublished]);
GO

-- Rollback (only if a measured regression is caused by these indexes):
-- DROP INDEX IF EXISTS [IX_AuditEvents_ActorId_AtUtc] ON [AuditEvents];
-- DROP INDEX IF EXISTS [IX_Submissions_StudentId_ExamId] ON [Submissions];
-- DROP INDEX IF EXISTS [IX_Submissions_ExamId] ON [Submissions];
-- DROP INDEX IF EXISTS [IX_TeacherStudentRequests_TeacherId_Unlinked] ON [TeacherStudentRequests];
-- DROP INDEX IF EXISTS [IX_Exams_TeacherId_Published] ON [Exams];
