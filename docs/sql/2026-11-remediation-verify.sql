-- Read-only post-deployment verification for the Emtehani remediation.
-- Safe to run against production: SELECT statements only.

SELECT DB_NAME() AS DatabaseName, @@VERSION AS SqlVersion;

SELECT 'Users' AS TableName, COUNT(*) AS RowCount FROM dbo.Users
UNION ALL SELECT 'Exams', COUNT(*) FROM dbo.Exams
UNION ALL SELECT 'Questions', COUNT(*) FROM dbo.Questions
UNION ALL SELECT 'Submissions', COUNT(*) FROM dbo.Submissions
UNION ALL SELECT 'Answers', COUNT(*) FROM dbo.Answers
UNION ALL SELECT 'AuditEvents', COUNT(*) FROM dbo.AuditEvents
UNION ALL SELECT 'TeacherStudentRequests', COUNT(*) FROM dbo.TeacherStudentRequests
UNION ALL SELECT 'TeacherSubscriptions', COUNT(*) FROM dbo.TeacherSubscriptions;

SELECT name AS IndexName
FROM sys.indexes
WHERE name IN (
    'IX_AuditEvents_ActorId_AtUtc',
    'IX_Submissions_StudentId_ExamId',
    'IX_Submissions_ExamId',
    'IX_TeacherStudentRequests_TeacherId_Unlinked',
    'IX_Exams_TeacherId_Published'
)
ORDER BY name;

-- Attempt aggregation sanity: every student's completed count should be <= total.
SELECT TOP 20
    s.StudentId,
    COUNT(*) AS TotalAttempts,
    SUM(CASE WHEN s.Status IN (N'Submitted', N'Reviewed', N'NeedsReview', N'Processing') THEN 1 ELSE 0 END) AS CompletedAttempts
FROM dbo.Submissions s
GROUP BY s.StudentId
HAVING SUM(CASE WHEN s.Status IN (N'Submitted', N'Reviewed', N'NeedsReview', N'Processing') THEN 1 ELSE 0 END) > COUNT(*);

-- Duplicate in-progress attempts should return no rows.
SELECT ExamId, StudentId, COUNT(*) AS InProgressCount
FROM dbo.Submissions
WHERE Status = N'InProgress'
GROUP BY ExamId, StudentId
HAVING COUNT(*) > 1;

-- Orphan checks (should return zero rows).
SELECT COUNT(*) AS OrphanAnswers
FROM dbo.Answers a
LEFT JOIN dbo.Submissions s ON s.Id = a.SubmissionId
WHERE s.Id IS NULL;

SELECT COUNT(*) AS OrphanSubmissions
FROM dbo.Submissions s
LEFT JOIN dbo.Exams e ON e.Id = s.ExamId
LEFT JOIN dbo.Users u ON u.Id = s.StudentId
WHERE e.Id IS NULL OR u.Id IS NULL;
