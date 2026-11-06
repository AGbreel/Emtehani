namespace Emtehani.Domain.Entities;

// Types: "TeacherGroup" (teacher + all active students), "Direct" (teacher + student),
// "AdminDirect" (teacher + platform admin). Each pair has a single canonical row.
public class Conversation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Type { get; set; } = "Direct";
    public Guid TeacherId { get; set; }
    public AppUser? Teacher { get; set; }
    public Guid? StudentId { get; set; }
    public AppUser? Student { get; set; }
    public Guid? AdminId { get; set; }
    public AppUser? Admin { get; set; }
    /// <summary>GroupChat conversations are scoped to one TeachingGroup.</summary>
    public Guid? GroupId { get; set; }
    public string? Title { get; set; }
    /// <summary>
    /// TeacherGroup/GroupChat: TeacherOnly, Everyone or Moderated.
    /// AdminGroup: AdminOnly, Everyone or Announcement.
    /// </summary>
    public string ChatMode { get; set; } = "Everyone";
    public DateTime? LastPolicyChangedAtUtc { get; set; }
    public Guid? LastPolicyChangedByUserId { get; set; }
    public string? LastMessagePreview { get; set; }
    public DateTime? LastMessageAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public ICollection<ConversationMessage> Messages { get; set; } = [];
}

public class ConversationMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public Conversation? Conversation { get; set; }
    public Guid SenderId { get; set; }
    public AppUser? Sender { get; set; }
    public string Body { get; set; } = "";
    public string? AttachmentUrl { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAtUtc { get; set; }
    public Guid? DeletedByUserId { get; set; }
    public bool IsPinned { get; set; }
    public DateTime? PinnedAtUtc { get; set; }
    public Guid? PinnedByUserId { get; set; }
    /// <summary>False only in Moderated mode until a teacher approves the message.</summary>
    public bool IsApproved { get; set; } = true;
    public DateTime? ApprovedAtUtc { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public DateTime SentAtUtc { get; set; } = DateTime.UtcNow;
}

public class ConversationMemberState
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public Guid UserId { get; set; }
    public bool IsMuted { get; set; }
    public DateTime? MutedUntilUtc { get; set; }
    public Guid? MutedByUserId { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class ChatAuditLog
{
    public long Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid? ActorUserId { get; set; }
    public string Action { get; set; } = "";
    public string? Details { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public class ConversationRead
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public Conversation? Conversation { get; set; }
    public Guid UserId { get; set; }
    public AppUser? User { get; set; }
    public DateTime LastReadAtUtc { get; set; } = DateTime.UtcNow;
}
