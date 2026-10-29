using Emtehani.Domain.Entities;
using Emtehani.Domain.Services;
using Xunit;

namespace Emtehani.Tests;

public sealed class ExamGraderTests
{
    [Fact]
    public void Grade_RecomputesObjectiveAnswersAndPreservesEssayPoints()
    {
        var objective = new Question { Type = "MultipleChoice", CorrectAnswer = "A", Points = 2 };
        var shortAnswer = new Question { Type = "ShortAnswer", CorrectAnswer = "x|y", Points = 3 };
        var essay = new Question { Type = "Essay", Points = 5 };
        var submission = new Submission
        {
            Answers =
            [
                new SubmissionAnswer { QuestionId = objective.Id, AnswerText = "A", AwardedPoints = 1 },
                new SubmissionAnswer { QuestionId = shortAnswer.Id, AnswerText = "wrong", AwardedPoints = 3 },
                new SubmissionAnswer { QuestionId = essay.Id, AnswerText = "essay", AwardedPoints = 4 }
            ]
        };

        ExamGrader.Grade(submission, [objective, shortAnswer, essay]);

        Assert.Equal(6, submission.Score);
        Assert.Equal(10, submission.MaxScore);
        Assert.Equal(2, submission.Answers.Single(x => x.QuestionId == objective.Id).AwardedPoints);
        Assert.Equal(0, submission.Answers.Single(x => x.QuestionId == shortAnswer.Id).AwardedPoints);
        Assert.Equal(4, submission.Answers.Single(x => x.QuestionId == essay.Id).AwardedPoints);
        Assert.Equal("Reviewed", submission.Status);
    }

    [Fact]
    public void Grade_CreatesMissingAnswerRowsAndFlagsUngradedEssay()
    {
        var objective = new Question { Type = "TrueFalse", CorrectAnswer = "صح", Points = 1 };
        var essay = new Question { Type = "Essay", Points = 5 };
        var submission = new Submission();

        ExamGrader.Grade(submission, [objective, essay]);

        Assert.Equal(2, submission.Answers.Count);
        Assert.Equal(0, submission.Score);
        Assert.Equal("NeedsReview", submission.Status);
    }

    [Fact]
    public void IsExpired_UsesTheExamDeadline()
    {
        var started = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var submission = new Submission { StartedAtUtc = started };

        Assert.Equal(started.AddMinutes(30), ExamGrader.Deadline(submission, 30));
        Assert.False(ExamGrader.IsExpired(submission, 30, started.AddMinutes(29)));
        Assert.True(ExamGrader.IsExpired(submission, 30, started.AddMinutes(30)));
    }
}
