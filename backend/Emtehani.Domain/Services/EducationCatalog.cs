namespace Emtehani.Domain.Services;
public static class EducationCatalog
{
    public const string Primary = "ابتدائي";
    public const string Preparatory = "إعدادي";
    public const string Secondary = "ثانوي";
    public const string Baccalaureate = "بكالوريا";

    public static readonly IReadOnlyList<string> Stages =
    [
        Primary,
        Preparatory,
        Secondary,
        Baccalaureate
    ];

    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> GradesByStage =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            [Primary] =
            [
                "الصف الأول الابتدائي",
                "الصف الثاني الابتدائي",
                "الصف الثالث الابتدائي",
                "الصف الرابع الابتدائي",
                "الصف الخامس الابتدائي",
                "الصف السادس الابتدائي"
            ],

            [Preparatory] =
            [
                "الصف الأول الإعدادي",
                "الصف الثاني الإعدادي",
                "الصف الثالث الإعدادي"
            ],

            [Secondary] =
            [
                "الصف الأول الثانوي",
                "الصف الثاني الثانوي",
                "الصف الثالث الثانوي"
            ],

            [Baccalaureate] =
            [
                "السنة الأولى بكالوريا",
                "السنة الثانية بكالوريا"
            ]
        };

    public static IReadOnlyList<string> GradesFor(string? stage) =>
        stage is not null && GradesByStage.TryGetValue(stage, out var grades)
            ? grades
            : [];

    public static bool IsValidStage(string? stage) =>
        stage is not null && Stages.Contains(stage, StringComparer.Ordinal);

    public static bool IsValid(string? stage, string? grade) =>
        IsValidStage(stage)
        && grade is not null
        && GradesFor(stage).Contains(grade, StringComparer.Ordinal);

    /// <summary>
    /// Legacy records have no stage/grade. Those fields are treated as unrestricted.
    /// </summary>
    public static bool Matches(
        string? examStage,
        string? examGrade,
        string? studentStage,
        string? studentGrade) =>
        (string.IsNullOrWhiteSpace(examStage)
         || string.Equals(examStage, studentStage, StringComparison.Ordinal))
        && (string.IsNullOrWhiteSpace(examGrade)
         || string.Equals(examGrade, studentGrade, StringComparison.Ordinal));
}
