namespace Emtehani.Application.Contracts;

public record RegisterRequest(
    string FullName,
    string Email,
    string Password,
    string Role = "Student",
    string? Stage = null,
    string? Grade = null,
    string? StudentPhone = null,
    string? ParentPhone = null,
    string? ParentName = null,
    int? TeacherCount = null,
    Guid[]? TeacherIds = null,
    string? InvitationToken = null);
public record LoginRequest(string Email, string Password);
public record AuthResponse(
    string Token,
    string FullName,
    string Email,
    string Role,
    DateTime ExpiresAtUtc,
    string? StudentCode = null,
    string? Stage = null,
    string? Grade = null,
    string? RefreshToken = null,
    DateTime? SessionExpiresAtUtc = null,
    DateTime? ServerUtc = null,
    string? SubscriptionStatus = null,
    string? SubscriptionPlan = null,
    Guid? UserId = null);
public record RefreshTokenRequest(string RefreshToken);
public record EducationProfileRequest(string? Stage, string? Grade);
public record StudentProfileUpdateRequest(string FullName, string StudentPhone, string ParentPhone, string? Stage, string? Grade, string? ParentName = null);
public record TeacherStudentProfileUpdateRequest(string FullName, string StudentPhone, string ParentPhone, string? Stage, string? Grade, string? ParentName = null);
public record TeacherStudentLookupRequest(string Phone);
public record TeacherStudentRequestCreate(string? StudentId = null, string? Phone = null);
public record TeacherInvitationRequest(string FullName, string StudentPhone, string? ParentPhone, string Stage, string Grade, string? ParentName = null);
public record SocialLinkInput(string Label, string Url);
public record TeacherProfileUpdateRequest(
    string ProfessionalName,
    string? Specialty = null,
    string? Bio = null,
    string? Qualifications = null,
    string? Experience = null,
    int? YearsOfExperience = null,
    string? TeachingStyle = null,
    string? ExtraInfo = null,
    string? AvatarUrl = null,
    string? CoverUrl = null,
    string? ContactPhone = null,
    string[]? Stages = null,
    string[]? Grades = null,
    SocialLinkInput[]? SocialLinks = null,
    bool ShowEmail = false,
    bool ShowPhone = false,
    string? PublicSlug = null);
public record StudentLinkDecisionRequest(string Action);
public record SubscriptionSelectRequest(string PlanCode, string? Method = null, string? Reference = null, string? ReceiptUrl = null, int Periods = 1);
public record AdminSubscriptionSettingsRequest(string[] Features);
public record QuestionInput(string Text, string Type, string[]? Options, string? CorrectAnswer, decimal Points = 1);
public record ExamCreateRequest(string Title, string? Description, int DurationMinutes, List<QuestionInput> Questions, int MaxAttempts = 1, bool AllowResumeAfterFocusLoss = true, DateTime? ScheduledAtUtc = null, DateTime? AvailableFromUtc = null, DateTime? AvailableUntilUtc = null, string? Stage = null, string? Grade = null, string? ResultsReleaseMode = null, bool ShuffleQuestions = true, bool ShuffleOptions = true, bool AllowReviewPrevious = true);
public record AnswerInput(Guid QuestionId, string AnswerText);
public record SubmitRequest(List<AnswerInput> Answers, bool FocusLossDetected = false, int? CurrentIndex = null);
public record ExamSettingsRequest(bool ShuffleQuestions, bool ShuffleOptions, bool AllowReviewPrevious);
public record EssayGradeRequest(decimal AwardedPoints, string? Feedback);
public record ResendVerificationRequest(string Email);
public record ForgotPasswordRequest(string Email);
public record ResetPasswordRequest(string Token, string Password);
public record SubmissionEventRequest(string Type);
public record NotificationPreferenceRequest(bool Messages, bool Exams, bool Sessions, bool Payments,
    bool Announcements, bool System, bool SoundEnabled);
public record ExamStateRequest(string Action);
public record StudentCodeRequest(string Code);
public record ExamParticipantView(Guid Id, string StudentName, string Email, string Code, string Status, DateTime? JoinedAtUtc, DateTime? LastSeenAtUtc, DateTime? SubmittedAtUtc, decimal? Score, decimal? MaxScore, int? RemainingSeconds);
public record ExamParticipantGenerateRequest(Guid[]? StudentIds = null);
public record TeacherJoinDecisionRequest(string Action);
public record TeacherStudentExamBanRequest(Guid ExamId);
public record ExamAvailabilityRequest(DateTime? AvailableFromUtc, DateTime? AvailableUntilUtc, string? ResultsReleaseMode = null);
public record ChatSendRequest(string? Body, string? AttachmentUrl = null);
public record ChatDirectRequest(Guid UserId);
public record NotificationReadRequest(Guid[]? Ids = null, Guid? ConversationId = null, bool All = false);
