using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Emtehani.Domain.Services;

/// <summary>Normalizes student answers before exact matching. Multiple accepted answers may be separated by | or ;.</summary>
public static class AnswerNormalizer
{
    public static string Normalize(string? value)
    {
        var input = (value ?? string.Empty)
            .Normalize(NormalizationForm.FormKC)
            .Replace("ـ", string.Empty)
            .Trim();

        var chars = input.Where(c =>
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(c);
            return category is not UnicodeCategory.NonSpacingMark
                and not UnicodeCategory.SpacingCombiningMark
                and not UnicodeCategory.EnclosingMark;
        }).ToArray();

        return Regex.Replace(new string(chars), @"\s+", " ").ToUpperInvariant();
    }

    public static bool Matches(string? answer, string? acceptedAnswers) =>
        (acceptedAnswers ?? string.Empty)
            .Split(new[] { '|', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(candidate => Normalize(answer) == Normalize(candidate));
}
