using Emtehani.Domain.Entities;

namespace Emtehani.Domain.Services;

public static class ExamGrader
{
    public static DateTime Deadline(Submission submission, int durationMinutes) =>
        submission.StartedAtUtc.AddMinutes(durationMinutes).AddSeconds(submission.ExtraTimeSeconds);

    // The attempt ends at whichever comes first: the per-attempt duration or the
    // exam availability window. Null window preserves the legacy behaviour.
    public static DateTime Deadline(Submission submission, int durationMinutes, DateTime? availableUntilUtc)
    {
        var durationEnd = Deadline(submission, durationMinutes);
        return availableUntilUtc is DateTime until && until < durationEnd ? until : durationEnd;
    }

    public static bool IsExpired(Submission submission, int durationMinutes, DateTime now) =>
        now >= Deadline(submission, durationMinutes);

    public static void EnsureAnswers(Submission submission, IEnumerable<Question> questions)
    {
        var known = submission.Answers.Select(x => x.QuestionId).ToHashSet();
        foreach (var question in questions.Where(x => !known.Contains(x.Id)))
        {
            submission.Answers.Add(new SubmissionAnswer
            {
                Id = Guid.Empty,
                SubmissionId = submission.Id,
                QuestionId = question.Id
            });
        }
    }

    public static void Grade(Submission submission, IEnumerable<Question> questions)
    {
        var list = questions.ToList();
        EnsureAnswers(submission, list);

        var answerByQuestion = submission.Answers
            .GroupBy(x => x.QuestionId)
            .ToDictionary(x => x.Key, x => x.First());

        foreach (var question in list.Where(x => x.Type != "Essay"))
        {
            var answer = answerByQuestion[question.Id];
            answer.AwardedPoints = AnswerNormalizer.Matches(answer.AnswerText, question.CorrectAnswer)
                ? question.Points
                : 0;
        }

        submission.MaxScore = list.Sum(x => x.Points);
        submission.Score = list.Sum(x => answerByQuestion[x.Id].AwardedPoints ?? 0);
        submission.Status = list.Any(x => x.Type == "Essay"
            && answerByQuestion[x.Id].AwardedPoints is null)
            ? "NeedsReview"
            : "Reviewed";
    }
}
