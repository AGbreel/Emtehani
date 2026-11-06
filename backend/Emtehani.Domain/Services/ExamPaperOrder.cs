using System.Text.Json;
using Emtehani.Domain.Entities;

namespace Emtehani.Domain.Services;

/// <summary>
/// Deterministic per-student paper ordering. The same student always gets the same
/// order for the same exam (refreshing must never reshuffle), while different
/// students get different orders. Seeded with stable ids only, never with the clock.
/// </summary>
public static class ExamPaperOrder
{
    public static List<Question> Questions(Exam exam, Guid studentId) =>
        Order(exam.Questions, exam.ShuffleQuestions, exam.Id, studentId);

    public static List<Question> Order(IEnumerable<Question> questions, bool shuffle, Guid examId, Guid studentId)
    {
        var ordered = questions
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Id)
            .ToList();
        if (!shuffle || ordered.Count < 2) return ordered;
        return ShuffledIndices(ordered.Count, Seed(examId, studentId, "questions", null))
            .Select(index => ordered[index])
            .ToList();
    }

    public static string[] Options(Exam exam, Question question, Guid studentId)
    {
        var options = ParseOptions(question);
        // Matching right-hand items are indexed by the answer value, so they are
        // reordered for display through MatchingOrder instead of being rewritten here.
        if (question.Type != "MultipleChoice" || !exam.ShuffleOptions || options.Length < 2)
            return options;
        return ShuffledIndices(options.Length, Seed(exam.Id, studentId, "options", question.Id))
            .Select(index => options[index])
            .ToArray();
    }

    /// <summary>Display order of the right-hand column for a Matching question.</summary>
    public static int[] MatchingOrder(Exam exam, Question question, Guid studentId)
    {
        var count = ParseOptions(question).Length;
        if (!exam.ShuffleOptions || count < 2) return Enumerable.Range(0, count).ToArray();
        return ShuffledIndices(count, Seed(exam.Id, studentId, "match", question.Id));
    }

    public static string[] ParseOptions(Question question) =>
        question.Type == "TrueFalse"
            ? ["صح", "خطأ"]
            : JsonSerializer.Deserialize<string[]>(question.OptionsJson) ?? [];

    private static ulong Seed(Guid examId, Guid studentId, string salt, Guid? questionId)
    {
        var text = $"{examId:N}|{studentId:N}|{salt}|{questionId?.ToString("N") ?? "-"}";
        var hash = 14695981039346656037ul; // 64-bit FNV-1a offset basis
        foreach (var ch in text)
        {
            hash ^= ch;
            hash *= 1099511628211ul;
        }
        // SplitMix64 finalizer: nearby ids (differing in one hex digit) must still
        // avalanche into unrelated seeds, otherwise classmates can see the same order.
        hash += 0x9E3779B97F4A7C15ul;
        hash = (hash ^ (hash >> 30)) * 0xBF58476D1CE4E5B9ul;
        hash = (hash ^ (hash >> 27)) * 0x94D049BB133111EBul;
        return hash ^ (hash >> 31);
    }

    private static int[] ShuffledIndices(int count, ulong seed)
    {
        var values = Enumerable.Range(0, count).ToArray();
        var state = seed == 0 ? 1ul : seed;
        for (var i = count - 1; i > 0; i--)
        {
            state += 0x9E3779B97F4A7C15ul;
            var z = (state ^ (state >> 30)) * 0xBF58476D1CE4E5B9ul;
            z = (z ^ (z >> 27)) * 0x94D049BB133111EBul;
            var j = (int)((z ^ (z >> 31)) % (ulong)(i + 1));
            (values[i], values[j]) = (values[j], values[i]);
        }
        return values;
    }
}
