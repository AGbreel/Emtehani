using Emtehani.Domain.Services;
using Xunit;

namespace Emtehani.Tests;

public sealed class AnswerNormalizerTests
{
    [Theory]
    [InlineData("  A   B  ", "A B")]
    [InlineData("مُحَمَّد", "محمد")]
    [InlineData("صحـ", "صح")]
    public void Normalize_RemovesMarksAndCollapsesWhitespace(string input, string expected)
        => Assert.Equal(expected, AnswerNormalizer.Normalize(input));

    [Theory]
    [InlineData("صح", "خطأ|صح", true)]
    [InlineData(" A ", "B; a ", true)]
    [InlineData("إجابة مختلفة", "إجابة واحدة|إجابة ثانية", false)]
    public void Matches_SupportsMultipleAcceptedAnswers(string answer, string accepted, bool expected)
        => Assert.Equal(expected, AnswerNormalizer.Matches(answer, accepted));
}
