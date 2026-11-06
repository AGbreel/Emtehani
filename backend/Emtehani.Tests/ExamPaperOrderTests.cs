using System.Text.Json;
using Emtehani.Domain.Entities;
using Emtehani.Domain.Services;
using Xunit;

namespace Emtehani.Tests;

public sealed class ExamPaperOrderTests
{
    private static readonly Guid StudentA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid StudentB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static Exam BuildExam(bool shuffleQuestions = true, bool shuffleOptions = true)
    {
        var exam = new Exam { Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), ShuffleQuestions = shuffleQuestions, ShuffleOptions = shuffleOptions };
        for (var i = 0; i < 6; i++)
        {
            exam.Questions.Add(new Question { Id = Guid.NewGuid(), ExamId = exam.Id, SortOrder = i, Type = "ShortAnswer", Text = $"Q{i}" });
        }
        return exam;
    }

    [Fact]
    public void Questions_AreStableForTheSameStudent()
    {
        var exam = BuildExam();
        var first = ExamPaperOrder.Questions(exam, StudentA).Select(x => x.Id).ToList();
        var second = ExamPaperOrder.Questions(exam, StudentA).Select(x => x.Id).ToList();
        Assert.Equal(first, second);
    }

    [Fact]
    public void Questions_DifferBetweenStudents()
    {
        var exam = BuildExam();
        var a = ExamPaperOrder.Questions(exam, StudentA).Select(x => x.Id).ToList();
        var b = ExamPaperOrder.Questions(exam, StudentB).Select(x => x.Id).ToList();
        Assert.NotEqual(a, b);
        Assert.Equal(a.OrderBy(x => x), b.OrderBy(x => x));
    }

    [Fact]
    public void Questions_KeepSortOrderWhenShuffleIsDisabled()
    {
        var exam = BuildExam(shuffleQuestions: false);
        var ordered = ExamPaperOrder.Questions(exam, StudentA);
        Assert.Equal(exam.Questions.OrderBy(x => x.SortOrder).Select(x => x.Id), ordered.Select(x => x.Id));
    }

    [Fact]
    public void Options_AreShuffledPerStudentAndStayStable()
    {
        var exam = BuildExam(shuffleOptions: true);
        var question = new Question
        {
            Type = "MultipleChoice",
            OptionsJson = JsonSerializer.Serialize(new[] { "A", "B", "C", "D" })
        };

        var first = ExamPaperOrder.Options(exam, question, StudentA);
        var second = ExamPaperOrder.Options(exam, question, StudentA);
        var other = ExamPaperOrder.Options(exam, question, StudentB);

        Assert.Equal(first, second);
        Assert.NotEqual(first, other);
        Assert.Equal(["A", "B", "C", "D"], first.OrderBy(x => x));
    }

    [Fact]
    public void Options_AreNotShuffledWhenDisabledAndTrueFalseStaysFixed()
    {
        var exam = BuildExam(shuffleOptions: false);
        var mcq = new Question { Type = "MultipleChoice", OptionsJson = JsonSerializer.Serialize(new[] { "A", "B", "C" }) };
        var trueFalse = new Question { Type = "TrueFalse" };

        Assert.Equal(["A", "B", "C"], ExamPaperOrder.Options(exam, mcq, StudentA));
        Assert.Equal(["صح", "خطأ"], ExamPaperOrder.Options(exam, trueFalse, StudentA));
    }

    [Fact]
    public void MatchingOrder_IsAPermutationAndKeepsPairsIntact()
    {
        var exam = BuildExam(shuffleOptions: true);
        var question = new Question
        {
            Type = "Matching",
            OptionsJson = JsonSerializer.Serialize(new[] { "one||1", "two||2", "three||3" })
        };

        Assert.Equal(["one||1", "two||2", "three||3"], ExamPaperOrder.Options(exam, question, StudentA));

        var order = ExamPaperOrder.MatchingOrder(exam, question, StudentA);
        Assert.Equal(Enumerable.Range(0, 3), order.OrderBy(x => x));
        Assert.Equal(order, ExamPaperOrder.MatchingOrder(exam, question, StudentA));

        var other = ExamPaperOrder.MatchingOrder(exam, question, StudentB);
        Assert.Equal(Enumerable.Range(0, 3), other.OrderBy(x => x));
        Assert.NotEqual(order, other);
    }
}
