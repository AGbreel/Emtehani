namespace Emtehani.Domain.Entities;

// ---------------------------------------------------------------------------
// Teaching module. Every tenant-owned row carries TeacherId so a teacher (or an
// assistant scoped to that teacher) can never read another teacher's data.
// String status fields are used instead of enums so the API stays forward
// compatible without schema migrations when a new status is introduced.
// ---------------------------------------------------------------------------

public sealed class TeachingAssistant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public AppUser? Teacher { get; set; }
    public Guid AssistantId { get; set; }
    public AppUser? Assistant { get; set; }
    public string Status { get; set; } = "Active";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class AssistantPermission
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public Guid AssistantId { get; set; }
    public string Permission { get; set; } = "";
    public DateTime GrantedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class AssistantGroupAccess
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public Guid AssistantId { get; set; }
    public Guid GroupId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class TeacherCourse
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public AppUser? Teacher { get; set; }
    public string Title { get; set; } = "";
    public string? ShortDescription { get; set; }
    public string? Description { get; set; }
    public string? Subject { get; set; }
    public string? Stage { get; set; }
    public string? Grade { get; set; }
    public string? CoverUrl { get; set; }
    public string? IntroVideoUrl { get; set; }
    /// <summary>Online, Offline or Hybrid.</summary>
    public string DeliveryMode { get; set; } = "Online";
    public bool IsFree { get; set; }
    public decimal Price { get; set; }
    public decimal? OldPrice { get; set; }
    public int? Capacity { get; set; }
    public int AccessDays { get; set; } = 365;
    public bool IsPublished { get; set; }
    public bool IsFeatured { get; set; }
    public bool IsArchived { get; set; }
    public DateTime? PublishAtUtc { get; set; }
    public DateTime? ArchiveAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<CourseUnit> Units { get; set; } = [];
    public List<CourseEnrollment> Enrollments { get; set; } = [];
    public List<GroupCourse> Groups { get; set; } = [];
}

public sealed class CourseUnit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CourseId { get; set; }
    public Guid TeacherId { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<CourseLesson> Lessons { get; set; } = [];
}

public sealed class CourseLesson
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UnitId { get; set; }
    public Guid CourseId { get; set; }
    public Guid TeacherId { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public string? VideoUrl { get; set; }
    public string? PdfUrl { get; set; }
    public int DurationMinutes { get; set; }
    public bool IsFreePreview { get; set; }
    public bool IsPublished { get; set; } = true;
    public bool IsArchived { get; set; }
    public DateTime? PublishAtUtc { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<LessonMaterial> Materials { get; set; } = [];
}

public sealed class LessonMaterial
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LessonId { get; set; }
    public Guid CourseId { get; set; }
    public Guid TeacherId { get; set; }
    /// <summary>Video, Pdf, Image, Audio, Document, Link or Other.</summary>
    public string Kind { get; set; } = "Link";
    public string Title { get; set; } = "";
    /// <summary>Private storage key or external URL. Never returned raw to students.</summary>
    public string Url { get; set; } = "";
    public string? StorageKey { get; set; }
    public long? SizeBytes { get; set; }
    public bool IsFreePreview { get; set; }
    public bool IsDownloadable { get; set; } = true;
    public bool IsPublished { get; set; } = true;
    public DateTime? PublishAtUtc { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class CourseEnrollment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public Guid CourseId { get; set; }
    public Guid StudentId { get; set; }
    public AppUser? Student { get; set; }
    public Guid? PackageId { get; set; }
    /// <summary>Pending, Active, Expired or Cancelled.</summary>
    public string Status { get; set; } = "Active";
    public DateTime EnrolledAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? StartsAtUtc { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    public decimal AmountPaid { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class LessonProgress
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public Guid CourseId { get; set; }
    public Guid LessonId { get; set; }
    public Guid StudentId { get; set; }
    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAtUtc { get; set; }
    public DateTime LastSeenAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class TeachingGroup
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public AppUser? Teacher { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string Subject { get; set; } = "";
    public string? Stage { get; set; }
    public string? Grade { get; set; }
    public string? AcademicYear { get; set; }
    /// <summary>Online, Offline or Hybrid.</summary>
    public string DeliveryMode { get; set; } = "Offline";
    public int Capacity { get; set; } = 20;
    public string? Location { get; set; }
    public string? OnlineLink { get; set; }
    public decimal Price { get; set; }
    /// <summary>Monthly or PerSession.</summary>
    public string PaymentType { get; set; } = "Monthly";
    public int MonthlyDueDay { get; set; } = 5;
    /// <summary>PerAttendedSession or PerScheduledSession.</summary>
    public string SessionBillingPolicy { get; set; } = "PerAttendedSession";
    public DateTime StartDateUtc { get; set; } = DateTime.UtcNow.Date;
    public DateTime? EndDateUtc { get; set; }
    public bool EnrollmentOpen { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public int LateGraceMinutes { get; set; } = 10;
    public int QrValidityMinutes { get; set; } = 2;
    /// <summary>TeacherOnly, Everyone or Moderated.</summary>
    public string ChatMode { get; set; } = "Everyone";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<GroupMembership> Memberships { get; set; } = [];
    public List<GroupSchedule> Schedules { get; set; } = [];
    public List<GroupSession> Sessions { get; set; } = [];
    public List<GroupCourse> Courses { get; set; } = [];
}

public sealed class GroupCourse
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public Guid GroupId { get; set; }
    public Guid CourseId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class GroupMembership
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public Guid TeacherId { get; set; }
    public Guid StudentId { get; set; }
    public AppUser? Student { get; set; }
    /// <summary>Active, Suspended or Left.</summary>
    public string Status { get; set; } = "Active";
    public DateTime JoinedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? SuspendedAtUtc { get; set; }
    public string? Note { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class GroupSchedule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public Guid TeacherId { get; set; }
    /// <summary>0 = Sunday ... 6 = Saturday (matches .NET DayOfWeek).</summary>
    public int DayOfWeek { get; set; }
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
    public string? Location { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class GroupSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GroupId { get; set; }
    public Guid TeacherId { get; set; }
    public Guid? ScheduleId { get; set; }
    public DateTime ScheduledDateUtc { get; set; }
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public DateTime? ActualStartAtUtc { get; set; }
    public DateTime? ActualEndAtUtc { get; set; }
    /// <summary>Scheduled, InProgress, Completed or Cancelled.</summary>
    public string Status { get; set; } = "Scheduled";
    public string Title { get; set; } = "";
    public string DeliveryMode { get; set; } = "Offline";
    public string? Location { get; set; }
    public string? OnlineLink { get; set; }
    public string? Notes { get; set; }
    public string? CancellationReason { get; set; }
    public DateTime? AttendanceOpenedAtUtc { get; set; }
    public DateTime? AttendanceClosedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<SessionAttendance> Attendances { get; set; } = [];
}

public sealed class SessionAttendance
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public Guid GroupId { get; set; }
    public Guid TeacherId { get; set; }
    public Guid StudentId { get; set; }
    /// <summary>Present, Late, Absent or Excused.</summary>
    public string Status { get; set; } = "Absent";
    public DateTime? CheckInAtUtc { get; set; }
    /// <summary>Manual or Qr.</summary>
    public string Method { get; set; } = "Manual";
    public Guid? RecordedByUserId { get; set; }
    public string? Note { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class AttendanceAuditLog
{
    public long Id { get; set; }
    public Guid TeacherId { get; set; }
    public Guid SessionId { get; set; }
    public Guid StudentId { get; set; }
    public Guid? AttendanceId { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public string OldStatus { get; set; } = "";
    public string NewStatus { get; set; } = "";
    public string? Reason { get; set; }
    public DateTime ChangedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class AttendanceQrToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public Guid TeacherId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTime ExpiresAtUtc { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class HomeworkAssignment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public Guid? CourseId { get; set; }
    public Guid? GroupId { get; set; }
    public Guid? LessonId { get; set; }
    public string Title { get; set; } = "";
    public string Prompt { get; set; } = "";
    public DateTime? DueAtUtc { get; set; }
    public bool AllowLateSubmission { get; set; } = true;
    public decimal MaxPoints { get; set; } = 10;
    public bool IsPublished { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<HomeworkSubmission> Submissions { get; set; } = [];
}

public sealed class HomeworkSubmission
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AssignmentId { get; set; }
    public Guid TeacherId { get; set; }
    public Guid StudentId { get; set; }
    public AppUser? Student { get; set; }
    public string AnswerText { get; set; } = "";
    public string? AttachmentUrl { get; set; }
    /// <summary>Submitted, Late or Reviewed.</summary>
    public string Status { get; set; } = "Submitted";
    public decimal? Grade { get; set; }
    public string? Feedback { get; set; }
    public DateTime SubmittedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAtUtc { get; set; }
    public Guid? ReviewedByUserId { get; set; }
}

// --------------------------- teacher → student money -------------------------

public sealed class StudentPackage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    /// <summary>Course, Group, Bundle or Sessions.</summary>
    public string Kind { get; set; } = "Course";
    public decimal Price { get; set; }
    public decimal? OldPrice { get; set; }
    public int DurationDays { get; set; } = 30;
    public int? SessionsIncluded { get; set; }
    public int? Capacity { get; set; }
    public bool IsRecurring { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? AvailableFromUtc { get; set; }
    public DateTime? AvailableUntilUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<PackageItem> Items { get; set; } = [];
}

public sealed class PackageItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PackageId { get; set; }
    public Guid TeacherId { get; set; }
    /// <summary>Course or Group.</summary>
    public string ItemType { get; set; } = "Course";
    public Guid ItemId { get; set; }
}

public sealed class PackageEnrollment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PackageId { get; set; }
    public Guid TeacherId { get; set; }
    public Guid StudentId { get; set; }
    public AppUser? Student { get; set; }
    /// <summary>Pending, Active, Expired or Cancelled.</summary>
    public string Status { get; set; } = "Active";
    public DateTime EnrolledAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? StartsAtUtc { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    public decimal AmountDue { get; set; }
    public decimal AmountPaid { get; set; }
    public string? CouponCode { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class DiscountCoupon
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public string Code { get; set; } = "";
    /// <summary>Percent or Fixed.</summary>
    public string Kind { get; set; } = "Percent";
    public decimal Value { get; set; }
    public int? MaxUses { get; set; }
    public int UsedCount { get; set; }
    public DateTime? ValidFromUtc { get; set; }
    public DateTime? ValidUntilUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class FinancialCharge
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public Guid StudentId { get; set; }
    public Guid? GroupId { get; set; }
    public Guid? CourseId { get; set; }
    public Guid? PackageId { get; set; }
    public Guid? SessionId { get; set; }
    /// <summary>MonthlySubscription, PerSession, Course, Package or Manual.</summary>
    public string Kind { get; set; } = "Manual";
    public decimal Amount { get; set; }
    public DateTime DueDateUtc { get; set; } = DateTime.UtcNow;
    public string Description { get; set; } = "";
    public string DedupeKey { get; set; } = "";
    public bool IsVoid { get; set; }
    public string? VoidReason { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class StudentPayment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public Guid StudentId { get; set; }
    public Guid? GroupId { get; set; }
    public Guid? CourseId { get; set; }
    public Guid? PackageId { get; set; }
    public Guid? ChargeId { get; set; }
    public decimal Amount { get; set; }
    /// <summary>Cash, VodafoneCash, InstaPay, BankTransfer or Online.</summary>
    public string Method { get; set; } = "Cash";
    public string? Reference { get; set; }
    public string? Notes { get; set; }
    public string ReceiptNumber { get; set; } = "";
    public Guid? ReceivedByUserId { get; set; }
    public DateTime PaidAtUtc { get; set; } = DateTime.UtcNow;
    public bool IsVoid { get; set; }
    public string? VoidReason { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class FinancialAdjustment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public Guid StudentId { get; set; }
    public Guid? GroupId { get; set; }
    /// <summary>Discount, Scholarship, Refund or Correction.</summary>
    public string Kind { get; set; } = "Discount";
    public decimal Amount { get; set; }
    public string Reason { get; set; } = "";
    public Guid? CreatedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

// --------------------------- platform → teacher money -----------------------

public sealed class PlatformPayment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeacherId { get; set; }
    public Guid? SubscriptionId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "EGP";
    /// <summary>Cash, VodafoneCash, InstaPay, BankTransfer or Online.</summary>
    public string Method { get; set; } = "Cash";
    public string? Reference { get; set; }
    public string? ReceiptUrl { get; set; }
    /// <summary>Pending, Approved or Rejected.</summary>
    public string Status { get; set; } = "Pending";
    public string? AdminNote { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAtUtc { get; set; }
    public Guid? ReviewedByAdminId { get; set; }
}

// --------------------------- announcements & prefs --------------------------

public sealed class Announcement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>Null means a platform-wide announcement.</summary>
    public Guid? TeacherId { get; set; }
    public Guid? GroupId { get; set; }
    public Guid? CourseId { get; set; }
    /// <summary>Platform, Teachers, Students, Group, Course or Selected.</summary>
    public string Audience { get; set; } = "Students";
    /// <summary>JSON array of student ids for "Selected", "Group" or "Course" audiences.</summary>
    public string? TargetStudentIdsJson { get; set; }
    public string Title { get; set; } = "";
    public string? Summary { get; set; }
    public string? Body { get; set; }
    public string? ImageUrl { get; set; }
    public bool IsPublished { get; set; } = true;
    public bool IsPinned { get; set; }
    public DateTime? PublishAtUtc { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    /// <summary>Set once notifications were fanned out, so scheduled delivery stays idempotent.</summary>
    public DateTime? DeliveredAtUtc { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class NotificationPreference
{
    public Guid UserId { get; set; }
    public bool Messages { get; set; } = true;
    public bool Exams { get; set; } = true;
    public bool Sessions { get; set; } = true;
    public bool Payments { get; set; } = true;
    public bool Announcements { get; set; } = true;
    public bool System { get; set; } = true;
    public bool SoundEnabled { get; set; } = true;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

// --------------------------- content access & auditing ----------------------

public sealed class ContentAccessLog
{
    public long Id { get; set; }
    public Guid TeacherId { get; set; }
    public Guid LessonMaterialId { get; set; }
    public Guid UserId { get; set; }
    public string Action { get; set; } = "Open";
    public DateTime AtUtc { get; set; } = DateTime.UtcNow;
    public string? IpAddress { get; set; }
}

public sealed class TeachingAuditLog
{
    public long Id { get; set; }
    public Guid TeacherId { get; set; }
    public Guid? ActorUserId { get; set; }
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public string? EntityId { get; set; }
    public string? Details { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
