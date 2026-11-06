using System.Globalization;
using System.Text;

namespace Emtehani.Domain.Services;

public static class AcademicYear
{
    /// <summary>
    /// Egyptian school year starts in September. Dates before September belong to the
    /// academic year that started the previous September.
    /// </summary>
    public static string For(DateTime value)
    {
        var utc = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
        var start = utc.Month >= 9 ? utc.Year : utc.Year - 1;
        return $"{start}/{start + 1}";
    }

    public static string Current() => For(DateTime.UtcNow);
}

public static class IdentityNormalizer
{
    private static readonly char[] ArabicDiacritics =
    [
        '\u064B', '\u064C', '\u064D', '\u064E', '\u064F', '\u0650',
        '\u0651', '\u0652', '\u0653', '\u0654', '\u0655', '\u0656',
        '\u0657', '\u0658', '\u0670'
    ];

    /// <summary>Normalises names for duplicate detection without changing the display name.</summary>
    public static string NormalizeName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var text = value.Normalize(NormalizationForm.FormKC).Trim().ToLowerInvariant();
        var builder = new StringBuilder(text.Length);
        var previousWasSpace = false;
        foreach (var raw in text)
        {
            if (Array.IndexOf(ArabicDiacritics, raw) >= 0 || raw == '\u0640') continue;
            var ch = raw switch
            {
                'أ' or 'إ' or 'آ' or 'ٱ' => 'ا',
                'ى' => 'ي',
                'ؤ' => 'و',
                'ئ' => 'ي',
                'ة' => 'ه',
                _ => raw
            };
            if (char.IsWhiteSpace(ch))
            {
                if (previousWasSpace || builder.Length == 0) continue;
                builder.Append(' ');
                previousWasSpace = true;
                continue;
            }
            // Ignore punctuation so "سارة، أحمد" and "سارة أحمد" collide.
            if (char.IsPunctuation(ch) || char.IsSymbol(ch)) continue;
            builder.Append(ch);
            previousWasSpace = false;
        }
        return builder.ToString().Trim();
    }

    /// <summary>
    /// Returns digits-only phones and canonicalises Egyptian international numbers
    /// (+20 / 0020) to the local 01xxxxxxxxx form so one phone cannot register twice.
    /// </summary>
    public static string? NormalizePhone(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var builder = new StringBuilder(value.Length);
        foreach (var raw in value.Trim())
        {
            var ch = raw switch
            {
                >= '\u0660' and <= '\u0669' => (char)('0' + (raw - '\u0660')),
                >= '\u06F0' and <= '\u06F9' => (char)('0' + (raw - '\u06F0')),
                _ => raw
            };
            if (ch is >= '0' and <= '9') builder.Append(ch);
        }
        var digits = builder.ToString();
        if (digits.StartsWith("00", StringComparison.Ordinal)) digits = digits[2..];
        if (digits.StartsWith("20", StringComparison.Ordinal) && digits.Length == 12)
            digits = "0" + digits[2..];
        if (digits.Length is < 8 or > 15) return null;
        if (digits.All(ch => ch == '0')) return null;
        return digits;
    }

    /// <summary>Trims and collapses every run of whitespace to a single space without changing letters.</summary>
    public static string NormalizeDisplayName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var builder = new StringBuilder(value.Length);
        var previousWasSpace = false;
        foreach (var raw in value.Normalize(NormalizationForm.FormKC).Trim())
        {
            if (char.IsWhiteSpace(raw) || raw == '\u00A0')
            {
                if (builder.Length > 0 && !previousWasSpace) builder.Append(' ');
                previousWasSpace = true;
                continue;
            }
            builder.Append(raw);
            previousWasSpace = false;
        }
        return builder.ToString().Trim();
    }

    public static string[] NameParts(string? value) =>
        NormalizeDisplayName(value)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    /// <summary>
    /// Student registration requires a real four-part Arabic/Latin name.
    /// Digits, punctuation-only parts, and names shorter than four parts are rejected.
    /// </summary>
    public static string? StudentFullNameError(string? value)
    {
        if (NormalizeName(value).Length == 0) return "أدخل اسماً صحيحاً يحتوي على حروف.";
        var parts = NameParts(value);
        if (parts.Length < 4) return "اكتب اسم الطالب رباعياً (أربعة أسماء على الأقل).";
        if (parts.Length > 8) return "اسم الطالب طويل جداً. اكتب الاسم الرباعي فقط.";
        if (parts.Distinct(StringComparer.Ordinal).Count() < 3)
            return "أدخل اسماً حقيقياً يتكون من أسماء مختلفة، وليس اسماً مكرراً أو وهمياً.";
        foreach (var part in parts)
        {
            if (part.Length < 2) return "كل جزء من الاسم يجب أن يحتوي على حرفين على الأقل.";
            if (part.Any(char.IsDigit)) return "لا يمكن أن يحتوي الاسم على أرقام.";
            if (!part.All(ch => char.IsLetter(ch) || IsCombiningMark(ch) || ch is '\'' or '’' or '-')) return "استخدم حروفاً عربية أو إنجليزية فقط في الاسم.";
        }
        var normalized = NormalizeName(string.Join(' ', parts));
        if (normalized.Length < 8) return "أدخل اسماً حقيقياً وواضحاً للطالب.";
        return null;
    }

    private static bool IsCombiningMark(char ch) =>
        CharUnicodeInfo.GetUnicodeCategory(ch) is
            UnicodeCategory.NonSpacingMark or
            UnicodeCategory.SpacingCombiningMark or
            UnicodeCategory.EnclosingMark;

    /// <summary>
    /// Guardian name is optional for legacy rows but must contain real letters when supplied.
    /// Returns null when the value is empty (nothing to update).
    /// </summary>
    public static string? ParentNameError(string? value)
    {
        var normalized = NormalizeDisplayName(value);
        if (normalized.Length == 0) return null;
        if (normalized.Length is < 3 or > 200) return "أدخل اسم ولي الأمر بين 3 و200 حرف.";
        if (normalized.Any(char.IsDigit)) return "اسم ولي الأمر لا يمكن أن يحتوي على أرقام.";
        if (!normalized.All(ch => char.IsLetter(ch) || char.IsWhiteSpace(ch) || IsCombiningMark(ch) || ch is '\'' or '’' or '-'))
            return "استخدم حروفاً عربية أو إنجليزية فقط في اسم ولي الأمر.";
        if (NormalizeName(normalized).Length < 3) return "أدخل اسم ولي الأمر بشكل صحيح.";
        return null;
    }

    public static string Slugify(string? value, string fallback)
    {
        var text = (value ?? "").Normalize(NormalizationForm.FormKD).ToLowerInvariant();
        var builder = new StringBuilder(text.Length);
        var previousDash = false;
        foreach (var ch in text)
        {
            if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9'))
            {
                builder.Append(ch);
                previousDash = false;
            }
            else if ((char.IsWhiteSpace(ch) || ch is '-' or '_') && builder.Length > 0 && !previousDash)
            {
                builder.Append('-');
                previousDash = true;
            }
        }
        var slug = builder.ToString().Trim('-');
        if (slug.Length < 3 || slug.Length > 64) return fallback;
        return slug;
    }

    public static bool IsValidPublicSlug(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && value.Length is >= 3 and <= 64
        && value[0] != '-'
        && value[^1] != '-'
        && value.All(ch => (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-');

    public static string? PhoneConflictMessage(string field) =>
        field == "student" ? "رقم هاتف الطالب غير صالح. أدخل رقماً صحيحاً بين 8 و15 رقماً." : "رقم هاتف ولي الأمر غير صالح. أدخل رقماً صحيحاً بين 8 و15 رقماً.";

    public static string? FormatPhone(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return NormalizePhone(value);
    }
}
