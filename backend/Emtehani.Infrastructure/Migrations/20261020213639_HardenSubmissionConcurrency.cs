using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Emtehani.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class HardenSubmissionConcurrency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Submissions_ExamId_StudentId",
                table: "Submissions");

            migrationBuilder.DropIndex(
                name: "IX_Answers_SubmissionId",
                table: "Answers");

            migrationBuilder.Sql(@"
WITH ranked AS (
    SELECT Id, ROW_NUMBER() OVER (PARTITION BY ExamId, StudentId ORDER BY StartedAtUtc, Id) AS rn
    FROM Submissions
    WHERE Status = 'InProgress'
)
UPDATE s
SET Status = 'Abandoned', SubmittedAtUtc = COALESCE(s.SubmittedAtUtc, SYSUTCDATETIME())
FROM Submissions s
INNER JOIN ranked r ON s.Id = r.Id
WHERE r.rn > 1;");

            migrationBuilder.Sql(@"
WITH ranked AS (
    SELECT Id, ROW_NUMBER() OVER (PARTITION BY SubmissionId, QuestionId ORDER BY Id) AS rn
    FROM Answers
)
DELETE a
FROM Answers a
INNER JOIN ranked r ON a.Id = r.Id
WHERE r.rn > 1;");

            migrationBuilder.CreateIndex(
                name: "IX_Submissions_Exam_Student_InProgress",
                table: "Submissions",
                columns: new[] { "ExamId", "StudentId" },
                unique: true,
                filter: "[Status] = 'InProgress'");

            migrationBuilder.CreateIndex(
                name: "IX_Answers_SubmissionId_QuestionId",
                table: "Answers",
                columns: new[] { "SubmissionId", "QuestionId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Submissions_Exam_Student_InProgress",
                table: "Submissions");

            migrationBuilder.DropIndex(
                name: "IX_Answers_SubmissionId_QuestionId",
                table: "Answers");

            migrationBuilder.CreateIndex(
                name: "IX_Submissions_ExamId_StudentId",
                table: "Submissions",
                columns: new[] { "ExamId", "StudentId" });

            migrationBuilder.CreateIndex(
                name: "IX_Answers_SubmissionId",
                table: "Answers",
                column: "SubmissionId");
        }
    }
}
