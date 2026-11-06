using System.Collections.Concurrent;
using Microsoft.Extensions.Configuration;

namespace Emtehani.API;

/// <summary>
/// Per-account brute-force protection that is independent of the caller's IP.
/// The IP limiter remains the first line of defence; this throttle closes the
/// gap where a client rotates source addresses (or forwarded headers) and keeps
/// guessing one account.
/// </summary>
public sealed class LoginThrottle
{
    private sealed class Entry
    {
        public int Failures;
        public DateTimeOffset FirstFailureUtc;
        public DateTimeOffset LockedUntilUtc;
    }

    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);
    private readonly int _maxFailures;
    private readonly TimeSpan _lockout;
    private readonly TimeProvider _clock;

    public LoginThrottle(IConfiguration configuration, TimeProvider clock)
    {
        _maxFailures = Math.Clamp(configuration.GetValue("Auth:MaxFailedLogins", 5), 1, 100);
        _lockout = TimeSpan.FromMinutes(Math.Clamp(configuration.GetValue("Auth:LoginLockoutMinutes", 15), 1, 1440));
        _clock = clock;
    }

    public bool IsLocked(string email, out int retryAfterSeconds)
    {
        retryAfterSeconds = 0;
        if (string.IsNullOrWhiteSpace(email)) return false;
        if (!_entries.TryGetValue(email, out var entry)) return false;

        lock (entry)
        {
            var now = _clock.GetUtcNow();
            if (entry.LockedUntilUtc > now)
            {
                retryAfterSeconds = Math.Max(1, (int)Math.Ceiling((entry.LockedUntilUtc - now).TotalSeconds));
                return true;
            }
            if (entry.LockedUntilUtc != default)
            {
                entry.Failures = 0;
                entry.FirstFailureUtc = default;
                entry.LockedUntilUtc = default;
            }
            return false;
        }
    }

    public void RegisterFailure(string email)
    {
        if (string.IsNullOrWhiteSpace(email)) return;
        var now = _clock.GetUtcNow();
        var entry = _entries.GetOrAdd(email, _ => new Entry());
        lock (entry)
        {
            if (entry.FirstFailureUtc == default || now - entry.FirstFailureUtc > _lockout)
            {
                entry.Failures = 1;
                entry.FirstFailureUtc = now;
                entry.LockedUntilUtc = default;
            }
            else
            {
                entry.Failures++;
            }

            if (entry.Failures >= _maxFailures)
                entry.LockedUntilUtc = now.Add(_lockout);
        }

        if (_entries.Count > 5000)
        {
            foreach (var pair in _entries)
            {
                if (pair.Value.LockedUntilUtc <= now && pair.Value.FirstFailureUtc != default && now - pair.Value.FirstFailureUtc > _lockout)
                    _entries.TryRemove(pair.Key, out _);
            }
        }
    }

    public void Clear(string email)
    {
        if (!string.IsNullOrWhiteSpace(email)) _entries.TryRemove(email, out _);
    }
}
