namespace Emtehani.Domain.Entities;
public sealed class AppUser {
 public Guid Id {get;set;}=Guid.NewGuid(); public string FullName {get;set;}=""; public string Email {get;set;}="";
 public string PasswordHash {get;set;}=""; public string Role {get;set;}="Student"; public string StudentCode {get;set;}=""; public string? Stage {get;set;} public string? Grade {get;set;} public bool EmailConfirmed {get;set;} public string? EmailVerificationToken {get;set;} public DateTime? EmailVerificationExpiresUtc {get;set;} public string? PasswordResetToken {get;set;} public DateTime? PasswordResetExpiresUtc {get;set;} public DateTime CreatedAtUtc {get;set;}=DateTime.UtcNow;
}
public sealed class Exam {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid TeacherId {get;set;} public string Title {get;set;}=""; public string? Description {get;set;}
 public int DurationMinutes {get;set;}=30; public int MaxAttempts {get;set;}=1; public bool AllowResumeAfterFocusLoss {get;set;}=true; public bool IsPublished {get;set;} public DateTime CreatedAtUtc {get;set;}=DateTime.UtcNow;
 public string Status {get;set;}="Draft"; public DateTime? ScheduledAtUtc {get;set;} public DateTime? PausedAtUtc {get;set;} public string JoinCode {get;set;}="";
 public DateTime? AvailableFromUtc {get;set;} public DateTime? AvailableUntilUtc {get;set;} public string? Stage {get;set;} public string? Grade {get;set;}
 public DateTime? ResultsPublishedAtUtc {get;set;}
 public List<Question> Questions {get;set;}=[]; public List<ExamParticipant> Participants {get;set;}=[];
}
public sealed class ExamParticipant {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid ExamId {get;set;} public Exam? Exam {get;set;} public Guid StudentId {get;set;} public AppUser? Student {get;set;}
 public string Status {get;set;}="Invited"; public DateTime? JoinedAtUtc {get;set;} public DateTime? LastSeenAtUtc {get;set;} public string Code {get;set;}=""; public DateTime CreatedAtUtc {get;set;}=DateTime.UtcNow;
}
public sealed class Question {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid ExamId {get;set;} public Exam? Exam {get;set;} public string Text {get;set;}="";
 public string Type {get;set;}="MultipleChoice"; public string OptionsJson {get;set;}="[]"; public string? CorrectAnswer {get;set;} public decimal Points {get;set;}=1; public int SortOrder {get;set;}
}
public sealed class Submission {
 public AppUser? Student {get;set;} public Exam? Exam {get;set;} public Guid Id {get;set;}=Guid.NewGuid(); public Guid ExamId {get;set;} public Guid StudentId {get;set;} public DateTime StartedAtUtc {get;set;}=DateTime.UtcNow;
 public DateTime? SubmittedAtUtc {get;set;} public decimal Score {get;set;} public decimal MaxScore {get;set;} public string Status {get;set;}="InProgress";
 public bool FocusLossDetected {get;set;} public int FocusLossCount {get;set;} public int CopyAttemptCount {get;set;} public int ScreenshotAttemptCount {get;set;} public int AttemptNumber {get;set;}=1; public bool IsExceptionAttempt {get;set;} public int ExtraTimeSeconds {get;set;} public List<SubmissionAnswer> Answers {get;set;}=[];
}
public sealed class SubmissionAnswer {
 public Question? Question {get;set;} public Guid Id {get;set;}=Guid.NewGuid(); public Guid SubmissionId {get;set;} public Submission? Submission {get;set;} public Guid QuestionId {get;set;}
 public string AnswerText {get;set;}=""; public decimal? AwardedPoints {get;set;} public string? TeacherFeedback {get;set;}
}
public sealed class AuditEvent {
 public long Id {get;set;} public Guid? ActorId {get;set;} public string Action {get;set;}=""; public string EntityType {get;set;}=""; public string? EntityId {get;set;} public string? Details {get;set;} public DateTime AtUtc {get;set;}=DateTime.UtcNow;
}
public sealed class TeacherStudentRequest {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid TeacherId {get;set;} public AppUser? Teacher {get;set;} public Guid StudentId {get;set;} public AppUser? Student {get;set;}
 public string Status {get;set;}="Pending"; public DateTime CreatedAtUtc {get;set;}=DateTime.UtcNow; public DateTime? DecidedAtUtc {get;set;}
 public DateTime? UnlinkedAtUtc {get;set;} public DateTime? SuspendedAtUtc {get;set;}
}
public sealed class TeacherStudentExamBan {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid TeacherId {get;set;} public Guid StudentId {get;set;} public Guid ExamId {get;set;} public Exam? Exam {get;set;}
 public DateTime CreatedAtUtc {get;set;}=DateTime.UtcNow;
}
