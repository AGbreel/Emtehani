namespace Emtehani.Domain.Services;

/// <summary>
/// Session status is derived from time plus the persisted lifecycle flags so a
/// stale row can never show "Upcoming" for a session that already ended.
/// </summary>
public static class SessionStatusCalculator
{
    public const string Scheduled = "Scheduled";
    public const string InProgress = "InProgress";
    public const string Completed = "Completed";
    public const string Cancelled = "Cancelled";

    public static string Compute(DateTime startsAtUtc, DateTime endsAtUtc, string storedStatus,
        DateTime? actualStartAtUtc, DateTime? actualEndAtUtc, DateTime nowUtc)
    {
        if (storedStatus == Cancelled) return Cancelled;
        if (actualEndAtUtc is not null || storedStatus == Completed) return Completed;
        if (actualStartAtUtc is not null || storedStatus == InProgress)
            return nowUtc >= endsAtUtc ? Completed : InProgress;
        if (nowUtc >= endsAtUtc) return Completed;
        if (nowUtc >= startsAtUtc) return InProgress;
        return Scheduled;
    }

    /// <summary>Friendly display value used by the agenda: Upcoming, Live, Completed, Cancelled.</summary>
    public static string Display(string computed) => computed switch
    {
        InProgress => "Live",
        Completed => "Completed",
        Cancelled => "Cancelled",
        _ => "Upcoming"
    };
}
