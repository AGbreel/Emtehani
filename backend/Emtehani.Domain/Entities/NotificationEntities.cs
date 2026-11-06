namespace Emtehani.Domain.Entities;

// Types: "Message", "LinkRequest", "LinkAccepted", "Exam", "Subscription", "Welcome", "System".
public class UserNotification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public AppUser? User { get; set; }
    public string Type { get; set; } = "System";
    /// <summary>Messages, Exams, Sessions, Payments, Announcements or System.</summary>
    public string Category { get; set; } = "System";
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string? Page { get; set; }
    public Guid? ConversationId { get; set; }
    public Guid? AnnouncementId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAtUtc { get; set; }
}
