namespace Emtehani.Domain.Services;

/// <summary>
/// Granular assistant permissions. Every permission is checked on the server; the
/// frontend may hide controls but never decides access.
/// </summary>
public static class TeachingPermissions
{
    public const string StudentsView = "Students.View";
    public const string StudentsCreate = "Students.Create";
    public const string StudentsUpdate = "Students.Update";
    public const string StudentsDelete = "Students.Delete";

    public const string GroupsView = "Groups.View";
    public const string GroupsCreate = "Groups.Create";
    public const string GroupsUpdate = "Groups.Update";
    public const string GroupsDelete = "Groups.Delete";

    public const string SessionsView = "Sessions.View";
    public const string SessionsManage = "Sessions.Manage";
    public const string AttendanceManage = "Attendance.Manage";

    public const string CoursesView = "Courses.View";
    public const string CoursesManage = "Courses.Manage";
    public const string ContentManage = "Content.Manage";

    public const string ExamsView = "Exams.View";
    public const string ExamsCreate = "Exams.Create";
    public const string ExamsEdit = "Exams.Edit";
    public const string ExamsDelete = "Exams.Delete";
    public const string ExamsGrade = "Exams.Grade";

    public const string HomeworkView = "Homework.View";
    public const string HomeworkManage = "Homework.Manage";

    public const string PaymentsView = "Payments.View";
    public const string PaymentsManage = "Payments.Manage";

    public const string ReportsView = "Reports.View";
    public const string ChatManage = "Chat.Manage";
    public const string AnnouncementsManage = "Announcements.Manage";
    public const string AssistantsManage = "Assistants.Manage";

    public static readonly IReadOnlyList<(string Key, string Label, string Group)> All = new List<(string, string, string)>
    {
        (StudentsView, "عرض الطلاب", "الطلاب"),
        (StudentsCreate, "إضافة طلاب", "الطلاب"),
        (StudentsUpdate, "تعديل الطلاب", "الطلاب"),
        (StudentsDelete, "تعطيل/أرشفة الطلاب", "الطلاب"),
        (GroupsView, "عرض المجموعات", "المجموعات"),
        (GroupsCreate, "إنشاء مجموعة", "المجموعات"),
        (GroupsUpdate, "تعديل المجموعات", "المجموعات"),
        (GroupsDelete, "حذف/إيقاف المجموعات", "المجموعات"),
        (SessionsView, "عرض الحصص", "الحصص"),
        (SessionsManage, "إدارة الحصص والجدولة", "الحصص"),
        (AttendanceManage, "تسجيل وتعديل الحضور", "الحصص"),
        (CoursesView, "عرض الكورسات", "المحتوى"),
        (CoursesManage, "إدارة الكورسات", "المحتوى"),
        (ContentManage, "إدارة الوحدات والدروس والمواد", "المحتوى"),
        (HomeworkView, "عرض الواجبات", "المحتوى"),
        (HomeworkManage, "إدارة الواجبات وتصحيحها", "المحتوى"),
        (ExamsView, "عرض الامتحانات", "الامتحانات"),
        (ExamsCreate, "إنشاء امتحانات", "الامتحانات"),
        (ExamsEdit, "تعديل الامتحانات", "الامتحانات"),
        (ExamsDelete, "حذف الامتحانات", "الامتحانات"),
        (ExamsGrade, "تصحيح المقالات", "الامتحانات"),
        (PaymentsView, "عرض المدفوعات", "المالية"),
        (PaymentsManage, "تسجيل المدفوعات والتسويات", "المالية"),
        (ReportsView, "عرض التقارير", "التقارير"),
        (ChatManage, "إدارة المحادثات", "التواصل"),
        (AnnouncementsManage, "إدارة الإعلانات", "التواصل"),
        (AssistantsManage, "إدارة المساعدين", "الإدارة"),
    };

    /// <summary>Used when an assistant is created without an explicit selection.</summary>
    public static readonly string[] DefaultAssistantPermissions =
    [
        StudentsView, GroupsView, SessionsView, AttendanceManage,
        CoursesView, HomeworkView, ExamsView, ReportsView, ChatManage
    ];

    public static bool IsKnown(string permission) =>
        All.Any(x => string.Equals(x.Key, permission, StringComparison.Ordinal));

    public static readonly string[] SessionActions = ["start", "end", "cancel", "reschedule"];
}
