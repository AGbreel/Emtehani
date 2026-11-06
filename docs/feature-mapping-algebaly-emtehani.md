# خريطة الميزات — الجبالي مقابل امتحاني

> هذا الملف هو نتيجة تحليل فعلي لملفات المشروعين، ويُستخدم كقائمة تنفيذ.
> المرجع: `منصه الجبالي/AlGebaly` (ASP.NET Core MVC + Razor + EF Core + SignalR).
> الهدف: `Emtehani-main` (React + ASP.NET Core net10 API/Application/Domain/Infrastructure).
>
> **قاعدة**: لا تُنسخ واجهات Razor، ولا تُحذف ميزات قائمة في امتحاني، ونظام الامتحانات الحالي يبقى كما هو ويُوسَّع فقط.

## قراءة سريعة للمشروعين

| المحور | الجبالي | امتحاني (قبل التطوير) |
|---|---|---|
| الأدوار | Admin, Teacher, Assistant, Student | Admin, Teacher, Student |
| تعدد المدرسين | مدرس واحد للمنصة (Tenant واحد) | مدرسون متعددون مع عزل جزئي عبر `TeacherId` |
| الكورسات | Course → Unit → Lesson + مواد + تقدّم | غير موجود |
| المجموعات | TeachingGroup + عضوية + جداول + طلبات انضمام + نقل طالب | غير موجود |
| الحصص | GroupSession + حالة زمنية + بدء/إيقاف/إلغاء/إعادة جدولة + QR | غير موجود |
| الحضور | Present/Late/Absent/Excused + QR + Audit Log | غير موجود |
| الواجبات | HomeworkAssignment + تسليم + تصحيح | غير موجود |
| الامتحانات | بسيطة مرتبطة بالكورس | متقدمة (جلسات، محاولات، قفل، تصحيح مقالي، نشر نتائج، أكواد) — **يُحافظ عليها** |
| مالية المدرس↔الطالب | خصومات/مدفوعات/تسويات/توليد شهري/تصدير | غير موجود |
| مالية المدرس↔المنصة | غير موجود | خطط + اشتراك + تأكيد من الإدارة (بدون أسعار/مدد/حدود) |
| الشات | غرفة مجموعة + مباشر + حذف رسالة + SignalR | TeacherGroup + Direct + AdminDirect + AdminGroup + إشعارات وجرس + Polling |
| أوضاع الشات | لا يوجد قفل/إشراف | لا يوجد قفل/إشراف (المطلوب: أوضاع تُفرض من الخادم) |
| الإعلانات | Announcement عام | غير موجود |
| الإشعارات | StudentNotification + تفضيلات | مركز إشعارات + صوت + Polling (بدون تفضيلات/إعلانات) |
| التقارير | تقرير مجموعة + CSV | إحصاءات امتحانات فقط |
| المساعدون | AssistantPermission + AssistantGroupAccess | غير موجود |
| حماية المحتوى | Cloudinary فقط | Cloudinary للصور + قفل شاشة الامتحان؛ لا حماية مواد دراسية |
| المخطط | Migrations | EnsureCreated + DDL idempotent (لا Migrations في الإنتاج) |

## جدول الميزات

| Feature | AlGebaly Reference | Emtehani Current State | Required Action | Priority |
|---|---|---|---|---|
| Multi-tenant teacher isolation | `TeachingBaseController`, `TeacherId` | جزئي: `TeacherId` في الامتحانات/الطلاب/الشات | إضافة `TeacherId` لكل كيان تعليمي + تحقق موحّد من النطاق | P0 |
| Platform Admin role | `Areas/Admin` | موجود | توسيع لوحة الإدارة بإدارة الخطط والمدفوعات | P0 |
| Assistant role | `Areas/Admin/AssistantsController`, `GroupPermissions` | غير موجود | `TeachingAssistant` + `AssistantPermission` + `AssistantGroupAccess` + فحص خادم لكل نقطة | P0 |
| Granular permissions | `GroupPermissions.All` (19 صلاحية) | غير موجود | 21+ صلاحية مع تحقق Backend إلزامي | P0 |
| Course CRUD | `Areas/Admin/CoursesController` | غير موجود | `TeacherCourse` CRUD + نشر/أرشفة + سعر/سعة/مدة/نمط | P0 |
| Course content tree | Course→Unit→Lesson | غير موجود | `CourseUnit`, `CourseLesson` + ترتيب + جدولة نشر | P0 |
| Learning materials | Lesson.VideoUrl/PdfUrl | غير موجود | `LessonMaterial` متعدد الأنواع + مجاني/مدفوع + جدولة | P0 |
| Lesson progress | `LessonProgress` | غير موجود | تسجيل إكمال الدرس وفتح الوصول | P1 |
| Course enrollment | `Enrollment` | غير موجود | `CourseEnrollment` مرتبط بباقة/دفع | P0 |
| Groups | `TeachingGroup` + schedules + requests | غير موجود | CRUD + عضوية + جدول أسبوعي + طلبات انضمام | P0 |
| Group transfer/suspend | `TransferStudent`, `SetMembershipStatus` | غير موجود | تغيير حالة العضوية ونقل الطالب | P1 |
| Sessions | `GroupSession` + DisplayStatus | غير موجود | CRUD + حالة تلقائية زمنية + إلغاء/إعادة جدولة | P0 |
| Session generation | `GenerateSessions` | غير موجود | توليد حصص من الجدول لفترة | P1 |
| Attendance | `GroupAttendance` + `AttendanceAuditLog` | غير موجود | تسجيل/تعديل + سبب + Audit + تقارير | P0 |
| QR attendance | `AttendanceQrToken` + `CheckIn` | غير موجود | رمز قصير العمر + تسجيل حضور الطالب | P1 |
| Homework | `HomeworkAssignment` + submissions | غير موجود | CRUD + تسليم ملف + تصحيح + إشعار | P1 |
| Practice activities | `PracticeActivity` | غير موجود | مؤجل (خارج نطاق SaaS الأساسي) | P2 |
| Lesson Q&A | `LessonQuestion` | غير موجود | مؤجل | P2 |
| Student profile (teacher view) | `StudentsController.Details` | `TeacherStudentsPage` موجود | توسيع: كورسات/مجموعات/حضور/مالية/نتائج/نشاط | P0 |
| Student archive/search/filter | `StudentsController` | بحث وتصفية موجودة | إضافة أرشفة وتعطيل | P1 |
| Teacher platform plans | غير موجود | `SubscriptionPlan` بلا سعر/مدة/حدود | توسيع: سعر، مدة، حدود، Grace، ميزات | P0 |
| Platform subscription lifecycle | غير موجود | اختيار خطة + تأكيد | تسجيل دفع + مراجعة إدارة + تجديد/ترقية + Grace | P0 |
| Subscription enforcement | غير موجود | لا يوجد | خدمة حدود (طلاب/كورسات/مجموعات/مساعدين/تخزين) | P0 |
| Teacher packages | غير موجود | غير موجود | `StudentPackage` + عناصر (كورس/مجموعة) | P0 |
| Student charges/payments | `FinancialCharge`, `PaymentTransaction`, `FinancialAdjustment` | غير موجود | كيانات مستقلة + رصيد + إيصالات + تسويات | P0 |
| Monthly/session billing | `GroupBillingService` | غير موجود | توليد مستحقات شهرية/لكل حصة مع `DedupeKey` | P1 |
| Coupons/discounts | غير موجود | غير موجود | `DiscountCoupon` + تطبيق عند التسجيل | P1 |
| Group chat | `ChatHub`, `ChatController` | TeacherGroup عام فقط | `GroupChat` لكل مجموعة + عضوية | P0 |
| Chat lock modes | غير موجود (المطلوب جديد) | غير موجود | `TeacherOnly`/`Everyone`/`Moderated` + `AdminOnly`/`Everyone`/`Announcement` | P0 |
| Server-side chat enforcement | — | الاعتماد على الواجهة فقط | رفض الإرسال في الخادم + Audit | P0 |
| Message moderation | حذف رسالة فقط | لا يوجد | موافقة/رفض، تثبيت، كتم طالب، حذف ناعم | P0 |
| Notifications center | `StudentNotification` | موجود + صوت + Badge | توسيع الأنواع + تفضيلات + إعلانات | P1 |
| Announcements | `Announcement` عام | غير موجود | إعلان منصة/مدرس/مجموعة/كورس + جدولة + انتهاء | P0 |
| Reports | `ReportsController` + CSV | تقارير امتحانات فقط | تقارير تعليم/حضور/مالية/إدارة + فلاتر + CSV | P1 |
| Media protection | Cloudinary | غير موجود للمواد | Signed access tokens قصيرة العمر + AccessLog + منع الوصول العام | P1 |
| Site settings | `SettingsController` | `SystemSetting` | استخدامه للخطط والإعدادات العامة | P1 |
| Theme/UI | Bootstrap + custom CSS | Design tokens + animations موجودة | توسيع الصفحات الجديدة بنفس النظام | P1 |
| Observability | Serilog? | Logging + Audit | Audit موحّد لكل تغييرات الصلاحيات/الشات/الحضور | P1 |

## قرارات تقنية موثقة

1. **لا Migrations جديدة في الإنتاج**: المشروع يعتمد `EnsureCreatedAsync` ثم DDL idempotent. ستُضاف جداول الوحدة التعليمية في `TeachingSchema.EnsureAsync` بنفس النمط (SQL Server + PostgreSQL).
2. **الأدوار**: يبقى `Admin/Teacher/Student` كما هو، ويُضاف `Assistant` كدور مستقل مرتبط بمدرس عبر `TeachingAssistant`. كل نقطة تعليمية تحل النطاق إلى `TeacherId` وتتحقق من الصلاحية.
3. **المالية منفصلة تمامًا**: `SubscriptionPlan`/`TeacherSubscription`/`PlatformPayment` للمنصة، و`StudentPackage`/`PackageEnrollment`/`FinancialCharge`/`StudentPayment`/`FinancialAdjustment` لعلاقة المدرس بالطالب. لا تُجمع الإيرادات في تقرير واحد.
4. **أوضاع الشات تُفرض في الخادم**: حتى لو أرسل العميل طلبًا يدويًا، يُرفض إذا لم يكن الوضع يسمح. تُسجَّل كل تغييرات السياسة في `ChatAuditLogs`.
5. **المحتوى الخاص**: لكل مادة رابط مخزّن داخلي، والوصول يتم عبر `/api/media/access/{materialId}?token=...` برمز HMAC قصير العمر مرتبط بالمستخدم. لا تُعرض روابط التخزين مباشرة للطلاب.
6. **الحصص**: الحالة الفعلية تُحسب من الوقت الحالي + الإلغاء/البدء/الانتهاء، ولا يُعتمد على قيمة محفوظة وحدها.
7. **عزل البيانات**: كل استعلام تعليمي يُقيَّد بـ `TeacherId` (أو `GroupId` المتحقق من ملكيته)، ولا يمكن للمساعد تجاوز مجموعاته أو صلاحياته.
8. **عدم كسر الامتحانات**: لا تُعدَّل كيانات `Exam/Question/Submission` إلا بإضافات اختيارية (`CourseId`, `GroupId`) وربط واجهات فقط.

## حالة التنفيذ (2026-11-06)

| المحور | الحالة | الدليل |
|---|---|---|
| عزل المدرسين | ✅ منفذ | `TeacherId` على كل كيان + `TeachingAccess` + اختبار عزل |
| دور المساعد والصلاحيات | ✅ منفذ | 27 صلاحية + `AssistantPermissions` + `AssistantGroupAccesses` |
| الكورسات والوحدات والدروس والمواد | ✅ منفذ | `TeachingEndpoints.cs` + `TeachingCoursesPage` |
| تقدم الدرس والتسجيل | ✅ منفذ | `LessonProgresses` + `CourseEnrollments` |
| المجموعات والعضويات والجداول | ✅ منفذ | `TeachingGroupEndpoints.cs` + `TeachingGroupsPage` |
| الحصص والحالة الزمنية والإلغاء/الإعادة | ✅ منفذ | `SessionStatusCalculator` + مسارات `sessions` |
| الحضور وQR والتقارير والتدقيق | ✅ منفذ | `SessionAttendances` + `AttendanceQrTokens` + CSV |
| الواجبات والتسليم والتصحيح | ✅ منفذ | `HomeworkAssignments/Submissions` |
| اشتراك المدرس مع المنصة | ✅ منفذ | خطط بأسعار/حدود + `PlatformPayments` + دورة اعتماد |
| مالية الطالب مع المدرس | ✅ منفذ | الباقات/المستحقات/المدفوعات/التسويات/الكوبونات |
| أوضاع الشات والإشراف | ✅ منفذ | `ChatGovernanceEndpoints.cs` + واجهة إدارة في `ChatPage` |
| الإشعارات والتفضيلات | ✅ منفذ | `NotificationPreference` + مركز إشعارات + صوت |
| الإعلانات | ✅ منفذ | `Announcements` + جدولة + استهداف + `AnnouncementsPage` |
| التقارير والتصدير | ✅ منفذ | تقارير مدرس/إدارة + CSV + طباعة PDF |
| حماية المواد | ✅ منفذ | رموز HMAC + إعادة تحقق + `ContentAccessLogs` + علامة مائية |
| حدود الخطة والفرض | ✅ منفذ | `TeachingBillingLimits` + Middleware اشتراك |
| Practice Activities / Lesson Q&A | ⏸️ مؤجل | P2 خارج النطاق الأساسي |
| HLS/DRM | ⏸️ غير منفذ | يحتاج خط معالجة وسائط منفصلًا؛ موثق كقيد |
| نشر جديد | ⏳ لم يُنفذ | التغييرات مبنية ومختبرة محليًا فقط |

**نتائج التحقق:** 84 اختبار Backend ناجح / 0 فاشل / 5 متخطى، و31 اختبار Frontend ناجح،
وبناء الواجهة مع فحص CSP ناجح. راجع `docs/final-implementation-report.md` و`docs/security-audit.md`.
