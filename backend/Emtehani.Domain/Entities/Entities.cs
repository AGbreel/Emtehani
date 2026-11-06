namespace Emtehani.Domain.Entities;

public sealed class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FullName { get; set; } = "";
    public string NormalizedName { get; set; } = "";
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "Student";
    public string StudentCode { get; set; } = "";
    public string? Stage { get; set; }
    public string? Grade { get; set; }
    public string? StudentPhone { get; set; }
    public string? ParentPhone { get; set; }
    /// <summary>Guardian display name captured at registration or by the teacher. Optional for legacy accounts.</summary>
    public string? ParentName { get; set; }
    /// <summary>Maximum number of teachers the student chose at registration.</summary>
    public int? TeacherCount { get; set; }
    /// <summary>Self, Teacher, or Admin. Kept for registration-source reporting.</summary>
    public string RegistrationSource { get; set; } = "Self";
    public bool EmailConfirmed { get; set; }
    public string? EmailVerificationToken { get; set; }
    public DateTime? EmailVerificationExpiresUtc { get; set; }
    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetExpiresUtc { get; set; }
    public string? RefreshTokenHash { get; set; }
    public DateTime? RefreshTokenExpiresUtc { get; set; }
    public DateTime? RefreshTokenCreatedAtUtc { get; set; }
    /// <summary>Fixed end of the current login session. Refresh rotation never extends it.</summary>
    public DateTime? SessionExpiresAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class Exam
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public int DurationMinutes { get; set; } = 30;
    public int MaxAttempts { get; set; } = 1;
    public bool AllowResumeAfterFocusLoss { get; set; } = true;
    public bool IsPublished { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "Draft";
    public DateTime? ScheduledAtUtc { get; set; }
    public DateTime? PausedAtUtc { get; set; }
    public string JoinCode { get; set; } = "";
    public DateTime? AvailableFromUtc { get; set; }
    public DateTime? AvailableUntilUtc { get; set; }
    public string? Stage { get; set; }
    public string? Grade { get; set; }
    /// <summary>Academic year (for example "2026/2027") used to keep old-year exams out of current lists.</summary>
    public string AcademicYear { get; set; } = "";
    public DateTime? ResultsPublishedAtUtc { get; set; }
    // null preserves the legacy behaviour (teacher must explicitly publish after the exam ends).
    public string? ResultsReleaseMode { get; set; }
    public List<Question> Questions { get; set; } = [];
    public List<ExamParticipant> Participants { get; set; } = [];
}

public sealed class ExamParticipant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ExamId { get; set; }
    public Exam? Exam { get; set; }
    public Guid StudentId { get; set; }
    public AppUser? Student { get; set; }
    public string Status { get; set; } = "Invited";
    public DateTime? JoinedAtUtc { get; set; }
    public DateTime? LastSeenAtUtc { get; set; }
    public string Code { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class Question
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ExamId { get; set; }
    public Exam? Exam { get; set; }
    public string Text { get; set; } = "";
    public string Type { get; set; } = "MultipleChoice";
    public string OptionsJson { get; set; } = "[]";
    public string? CorrectAnswer { get; set; }
    public decimal Points { get; set; } = 1;
    public int SortOrder { get; set; }
}

public sealed class Submission
{
    public AppUser? Student { get; set; }
    public Exam? Exam { get; set; }
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ExamId { get; set; }
    public Guid StudentId { get; set; }
    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? SubmittedAtUtc { get; set; }
    public decimal Score { get; set; }
    public decimal MaxScore { get; set; }
    public string Status { get; set; } = "InProgress";
    public bool FocusLossDetected { get; set; }
    public int FocusLossCount { get; set; }
    public int CopyAttemptCount { get; set; }
    public int ScreenshotAttemptCount { get; set; }
    public int AttemptNumber { get; set; } = 1;
    public bool IsExceptionAttempt { get; set; }
    public int ExtraTimeSeconds { get; set; }
    // Immutable snapshots taken when the attempt starts. Later profile or exam edits
    // must never rewrite the academic context of an old attempt.
    public string? StageAtAttempt { get; set; }
    public string? GradeAtAttempt { get; set; }
    public string? AcademicYearAtAttempt { get; set; }
    public List<SubmissionAnswer> Answers { get; set; } = [];
}

public sealed class SubmissionAnswer
{
    public Question? Question { get; set; }
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SubmissionId { get; set; }
    public Submission? Submission { get; set; }
    public Guid QuestionId { get; set; }
    public string AnswerText { get; set; } = "";
    public decimal? AwardedPoints { get; set; }
    public string? TeacherFeedback { get; set; }
}

public sealed class AuditEvent
{
    public long Id { get; set; }
    public Guid? ActorId { get; set; }
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public string? EntityId { get; set; }
    public string? Details { get; set; }
    public DateTime AtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class TeacherStudentRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public AppUser? Teacher { get; set; }
    public Guid StudentId { get; set; }
    public AppUser? Student { get; set; }
    public string Status { get; set; } = "Pending";
    /// <summary>Student means the teacher decides; Teacher means the student must consent.</summary>
    public string InitiatedBy { get; set; } = "Student";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DecidedAtUtc { get; set; }
    public DateTime? UnlinkedAtUtc { get; set; }
    public DateTime? SuspendedAtUtc { get; set; }
}

/// <summary>
/// Public teacher portfolio. Draft profiles are visible only to their owner; only
/// Published profiles are exposed to students or anonymous visitors.
/// </summary>
public sealed class TeacherProfile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public AppUser? Teacher { get; set; }
    /// <summary>Stable public identifier used in /t/{slug}.</summary>
    public string PublicSlug { get; set; } = "";
    public string ProfessionalName { get; set; } = "";
    public string? Specialty { get; set; }
    public string? Bio { get; set; }
    public string? Qualifications { get; set; }
    public string? Experience { get; set; }
    public int? YearsOfExperience { get; set; }
    public string? TeachingStyle { get; set; }
    public string? ExtraInfo { get; set; }
    public string? AvatarUrl { get; set; }
    public string? CoverUrl { get; set; }
    /// <summary>Optional public contact number. The account phone is used as a fallback.</summary>
    public string? ContactPhone { get; set; }
    public string StagesJson { get; set; } = "[]";
    public string GradesJson { get; set; } = "[]";
    public string SocialLinksJson { get; set; } = "[]";
    public bool ShowEmail { get; set; }
    public bool ShowPhone { get; set; }
    public string Status { get; set; } = "Draft";
    public DateTime? PublishedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class TeacherStudentExamBan
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public Guid StudentId { get; set; }
    public Guid ExamId { get; set; }
    public Exam? Exam { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>Immutable audit trail of student stage/grade changes. Old attempts remain snapshotted separately.</summary>
public sealed class StudentAcademicChange
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StudentId { get; set; }
    public AppUser? Student { get; set; }
    public string? PreviousStage { get; set; }
    public string? PreviousGrade { get; set; }
    public string? NewStage { get; set; }
    public string? NewGrade { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public string ChangedByRole { get; set; } = "Student";
    public string Source { get; set; } = "Student";
    public DateTime ChangedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>Platform plan (teacher → Emtehani). Limits are enforced server-side.</summary>
public sealed class SubscriptionPlan
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsDefault { get; set; }
    public bool IsPublic { get; set; } = true;
    public int SortOrder { get; set; }
    public decimal Price { get; set; }
    public string Currency { get; set; } = "EGP";
    public int BillingPeriodDays { get; set; } = 30;
    public int MaxStudents { get; set; }
    public int MaxCourses { get; set; }
    public int MaxGroups { get; set; }
    public int MaxAssistants { get; set; }
    public int StorageMb { get; set; }
    public int MaxVideoMinutes { get; set; }
    public int TrialDays { get; set; }
    public int GraceDays { get; set; } = 7;
    /// <summary>JSON array of feature keys.</summary>
    public string FeaturesJson { get; set; } = "[]";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class TeacherSubscription
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public AppUser? Teacher { get; set; }
    public Guid PlanId { get; set; }
    public SubscriptionPlan? Plan { get; set; }
    public string Status { get; set; } = "Pending";
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? EndsAtUtc { get; set; }
    public DateTime? ConfirmedAtUtc { get; set; }
    public bool AutoRenew { get; set; }
    public DateTime? CancelledAtUtc { get; set; }
    public Guid? RenewedFromSubscriptionId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class SystemSetting
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// A teacher-created invitation for a student who does not have an account yet.
/// The student must open the link, create/activate their own account, and thereby consent.
/// </summary>
public sealed class TeacherStudentInvitation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public AppUser? Teacher { get; set; }
    public string StudentName { get; set; } = "";
    public string StudentPhone { get; set; } = "";
    public string? ParentPhone { get; set; }
    public string? ParentName { get; set; }
    public string Stage { get; set; } = "";
    public string Grade { get; set; } = "";
    public string Token { get; set; } = "";
    public string Status { get; set; } = "Pending";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; } = DateTime.UtcNow.AddDays(14);
    public DateTime? AcceptedAtUtc { get; set; }
    public Guid? AcceptedStudentId { get; set; }
}
