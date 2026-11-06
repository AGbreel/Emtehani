# تقرير التنفيذ النهائي — تحويل امتحاني إلى منصة تعليمية متعددة المستأجرين

> التاريخ: 2026-11-06
> النطاق: `C:\Users\Administrator\Downloads\Emtehani-main`
> المرجع التحليلي: `docs/feature-mapping-algebaly-emtehani.md`
> التدقيق الأمني: `docs/security-audit.md`
> **ملاحظة:** تم النشر الفعلي إلى الإنتاج في نفس اليوم:
> Backend على MonsterASP (`https://emtehani.runasp.net`) والواجهة عبر GitHub → Vercel
> (`https://emtehani-opal.vercel.app`). تفاصيل التحقق في القسم 11.

---

## 1. الملخص التنفيذي

تم توسيع امتحاني داخل نفس المشروع (بدون مشروع جديد وبدون نسخ واجهات Razor) إلى منصة
SaaS متعددة المدرسين، مع الحفاظ على نظام الامتحانات القائم دون كسر. أُضيفت:

- أدوار `Assistant` بصلاحيات دقيقة مفروضة من الخادم.
- كورسات → وحدات → دروس → مواد + تقدّم الطالب.
- مجموعات + عضويات + جداول + حصص + حضور + QR.
- واجبات وتسليمات وتصحيح.
- مالية منفصلة تمامًا: اشتراك المدرس مع المنصة، ومدفوعات الطالب للمدرس.
- شات جماعي/فردي مع أوضاع إرسال وإشراف وكتم وحذف وتثبيت وسجل تدقيق.
- إعلانات وإشعارات موحدة بمركز إشعارات وتفضيلات.
- تقارير وتصدير CSV متوافق مع Excel وطباعة PDF من المتصفح.
- حماية محتوى عبر رموز موقعة قصيرة العمر + سجل وصول + علامة مائية.
- إعادة تصميم وتوصيل كل الصفحات الجديدة بهوية المنصة وحركاتها.

---

## 2. ما تم تنفيذه حسب المراحل

### المرحلة 0 — التدقيق
- `docs/feature-mapping-algebaly-emtehani.md`: مقارنة كاملة + قرارات تقنية + أولويات P0/P1/P2.
- أُضيف قسم حالة التنفيذ في نهاية الملف.

### المرحلة 1/2 — تعدد المستأجرين والأدوار
- `Assistant` أصبح دورًا مستقلًا مرتبطًا بمدرس عبر `TeachingAssistants`.
- `TeachingAccess.ResolveAsync` يحل نطاق المدرس/المساعد، و`RequireAsync` تفرض الصلاحية.
- كل الكيانات التعليمية تحمل `TeacherId`، وكل استعلام مُقيَّد به.
- لوحة تحكم مستقلة لكل دور:
  - `TeacherDashboard` (موجود وموسّع).
  - `StudentDashboard` (موجود وموسّع).
  - `AssistantDashboard` (جديد).
  - `AdminDashboard` (موجود وموسّع).

### المرحلة 3 — التعليم
- **الكورسات:** `TeacherCourses`, `CourseUnits`, `CourseLessons`, `LessonMaterials`, `CourseEnrollments`, `LessonProgresses`.
- **المجموعات:** `TeachingGroups`, `GroupCourses`, `GroupMemberships`, `GroupSchedules` + طلبات انضمام ونقل/تعليق عضوية.
- **الحصص:** `GroupSessions` مع حالة محسوبة زمنيًا (`SessionStatusCalculator`) + بدء/إيقاف/إلغاء/إعادة جدولة + توليد من الجدول.
- **الحضور:** `SessionAttendances`, `AttendanceAuditLogs`, `AttendanceQrTokens` + Present/Absent/Late/Excused + أسباب + تقارير وإحصاءات.
- **الواجبات:** `HomeworkAssignments`, `HomeworkSubmissions` + موعد تسليم + استهداف مجموعة/كورس + تسليم ملف + تصحيح + ملاحظات + إشعار.
- **الامتحانات:** لم تُحذف أي ميزة. أُضيفت فقط روابط اختيارية `CourseId`/`GroupId` وواجهات مرتبطة.

### المرحلة 4 — المالية (فصل كامل)
- **المدرس ↔ المنصة:** `SubscriptionPlans` (سعر/مدة/حدود/Grace/ميزات) + `TeacherSubscriptions` + `PlatformPayments`.
  - دورة: اختيار خطة → طلب دفع → مراجعة إدارة → تفعيل → Grace → انتهاء.
  - التجديد/الترقية/التخفيض مسجلة في `RenewedFromSubscriptionId`، ولا تُحذف البيانات عند الانتهاء.
- **المدرس ↔ الطالب:** `StudentPackages`, `PackageItems`, `PackageEnrollments`, `DiscountCoupon`, `FinancialCharge`, `StudentPayment`, `FinancialAdjustment`.
  - تسجيل في باقة → مستحقات (كلية/شهرية/لكل حصة مع `DedupeKey`) → دفع كامل/جزئي → تسويات → إلغاء عبر `void` → إيصالات وتقارير.
- لا تُخلط الإيرادات: ملخص المدرس وتعليم المنصة منفصلان، وتقارير المنصة في `/api/admin/reports/*`.

### المرحلة 5 — المساعدون
- 21+ صلاحية في `TeachingPermissions`.
- `AssistantPermissions` + `AssistantGroupAccesses`.
- كل Endpoint تعليمي يفحص الصلاحية والمجموعة، والمساعد لا يستطيع تجاوز نطاقه حتى لو عدّل الطلب يدويًا.
- صفحة `TeachingAssistantsPage` لإدارة المساعدين وصلاحياتهم ومجموعاتهم.

### المرحلة 6 — حوكمة الشات
- أنواع: `TeacherGroup`, `Direct`, `AdminDirect`, `AdminGroup`, `GroupChat`.
- أوضاع تُفرض خادميًا: `TeacherOnly/Everyone/Moderated` و`AdminOnly/Everyone/Announcement`.
- رسائل `Moderated` تنتظر موافقة، والحذف ناعم، والتثبيت والكتم والإشراف متاح للمشرفين.
- `ChatAuditLogs` لكل تغيير، ومركز إشعارات للرسائل الجديدة والمعتمدة.
- واجهة إدارة كاملة داخل `ChatPage` (وضع/معلّق/أعضاء/بحث/سجل تدقيق).
- عند إغلاق المحادثة يظهر سبب واضح ويُعطَّل الإرسال، والخادم يرفض الطلب أيضًا.

### المرحلة 7 — الإشعارات والإعلانات
- `UserNotification`, `NotificationPreference` + مركز إشعارات + جرس + صوت + عداد غير مقروء + تحديد الكل كمقروء.
- ترقيم صفحات وتفضيلات لكل نوع.
- إعلانات: منصة/مدرس/مجموعة/كورس/طلاب محددون + جدولة نشر + انتهاء + صورة + تسليم غير مكرر.
- صفحة `AnnouncementsPage` لكل الأدوار المصرح لها.

### المرحلة 8 — التقارير والتصدير
- تقارير المدرس: نظرة عامة، حضور، واجبات، مالية، اشتراكات.
- تقارير الإدارة: مدرسون، اشتراكات، مدفوعات المنصة، نظرة عامة.
- كل تقرير يدعم التاريخ/الفلاتر/البحث/الترقيم حيث ينطبق.
- تصدير CSV بترميز UTF-8 مع BOM (يفتح في Excel بالعربية).
- PDF عبر طباعة المتصفح مع أنماط `@media print` في `frontend/src/index.css`.

### المرحلة 9 — الواجهة والحركات
- نظام Tokens مركزي (`frontend/src/index.css`, `components/ui.jsx`).
- خلفيات متحركة، Blobs، Glow، انتقالات، Hover، Skeletons، عدادات، تبويبات، مودالات.
- احترام `prefers-reduced-motion` عبر `useReducedMotion` وCSS.
- تنقل كامل لكل دور في `AppShell`، وتوجيه Hash قابل للاستعادة، وحماية صفحات حسب الدور.
- تحسين الجوال: قائمة جانبية، أزرار لا تخرج عن الشاشة، جداول قابلة للتمرير، مودالات متجاوبة.

### المرحلة 10 — حماية المحتوى
- `/api/teaching/materials/{id}/access` يصدر رمز HMAC مرتبطًا بالمادة والمستخدم.
- `/api/teaching/media/{id}?token=` يعيد التحقق من الدور/التسجيل/المجموعة وقت الفتح.
- انتهاء الاشتراك أو تعطيل المجموعة يوقف الوصول فورًا.
- `ContentAccessLogs` يسجل الإصدار والفتح وIP.
- علامة مائية باسم الطالب وكوده على الصور والفيديو، ومنع قائمة السياق/التنزيل.
- لا تُخزَّن المواد التعليمية المحمية في `wwwroot` العام.

### المرحلة 11 — الفرض والتشغيل
- حدود الخطة (طلاب/كورسات/مجموعات/مساعدون/تخزين/دقائق فيديو) عبر `TeachingBillingLimits`.
- Middleware اشتراك: يمنع مساحة العمل قبل تفعيل الباقة المجانية، ويسمح بالقراءة فقط
  للاشتراك المدفوع المعلّق/المنتهي/الموقوف، ويمنع الكتابة حتى التجديد.
- فهارس وعلاقات ومفاتيح أجنبية في `TeachingSchema` (SQL Server + PostgreSQL).
- حذف ناعم حيث يلزم، و`void` للمالية، ومعاملات عند العمليات المركبة.
- سجلات تدقيق: `TeachingAuditLogs`, `ChatAuditLogs`, `AttendanceAuditLogs`, `AuditEvents`, `ContentAccessLogs`.

---

## 3. قاعدة البيانات

- لا Migrations جديدة؛ يظل النمط: `EnsureCreatedAsync` → `ExamWorkflowSchema` → `TeachingSchema` → `PlatformDataUpgrade`.
- كل DDL idempotent ويعمل على SQL Server وPostgreSQL (اختبارات PostgreSQL اختيارية ومتخطاة افتراضيًا).
- جداول جديدة رئيسية:
  `TeachingAssistants`, `AssistantPermissions`, `AssistantGroupAccesses`,
  `TeacherCourses`, `CourseUnits`, `CourseLessons`, `LessonMaterials`, `CourseEnrollments`, `LessonProgresses`,
  `TeachingGroups`, `GroupCourses`, `GroupMemberships`, `GroupSchedules`,
  `GroupSessions`, `SessionAttendances`, `AttendanceAuditLogs`, `AttendanceQrTokens`,
  `HomeworkAssignments`, `HomeworkSubmissions`,
  `StudentPackages`, `PackageItems`, `PackageEnrollments`, `DiscountCoupons`,
  `FinancialCharges`, `StudentPayments`, `FinancialAdjustments`, `PlatformPayments`,
  `Announcements`, `NotificationPreferences`, `ContentAccessLogs`, `TeachingAuditLogs`.
- أعمدة مضافة بأمان: أسعار/حدود الخطط، دورة اشتراك، أوضاع الشات، حقول الحذف/التثبيت/الاعتماد،
  فئة الإشعار، ربط الإعلان.

---

## 4. Backend — ملفات رئيسية

| الملف | الدور |
|---|---|
| `Emtehani.API/TeachingEndpoints.cs` | كورسات، محتوى، تسجيل، مواد، وصول موقّع، نظرة عامة |
| `Emtehani.API/TeachingGroupEndpoints.cs` | مجموعات، عضويات، جداول، حصص، حضور، QR |
| `Emtehani.API/TeachingCommunicationEndpoints.cs` | واجبات، إعلانات، إشعارات، تفضيلات |
| `Emtehani.API/TeachingFinanceEndpoints.cs` | اشتراك المنصة، مدفوعات المدرس↔الطالب، باقات، كوبونات، تقارير، تصدير |
| `Emtehani.API/ChatGovernanceEndpoints.cs` | أوضاع الشات، حذف/تثبيت/اعتماد/كتم/بحث/تدقيق |
| `Emtehani.API/AdminReportEndpoints.cs` | تقارير الإدارة وتصدير CSV |
| `Emtehani.API/TeachingHelpers.cs` | نطاق الوصول، الصلاحيات، التدقيق، الأدوات المشتركة |
| `Emtehani.Domain/Services/TeachingPermissions.cs` | تعريف الصلاحيات |
| `Emtehani.Domain/Services/SessionStatusCalculator.cs` | الحالة الزمنية للحصص |
| `Emtehani.Domain/Entities/TeachingEntities.cs` | كيانات التعليم والمالية والإعلانات |
| `Emtehani.Infrastructure/Persistence/TeachingSchema.cs` | DDL idempotent |
| `Emtehani.Infrastructure/Persistence/PlatformDataUpgrade.cs` | ترقية بيانات المنصة والخطط |

عدد مسارات API المضافة/الموجودة: **227** مسارًا عبر ملفات الـAPI.

---

## 5. Frontend — الصفحات والتنقل

صفحات جديدة:
- `TeachingCoursesPage.jsx` — كورسات/وحدات/دروس/مواد.
- `TeachingGroupsPage.jsx` — مجموعات/أعضاء/جداول/حصص/حضور/QR.
- `TeachingFinancePage.jsx` — باقات/مستحقات/مدفوعات/تسويات/كوبونات.
- `TeachingAssistantsPage.jsx` — مساعدون وصلاحيات.
- `TeachingReportsPage.jsx` — تقارير المدرس.
- `AnnouncementsPage.jsx` — إعلانات حسب الدور.
- `StudentLearningPage.jsx`, `MyCoursesPage.jsx` — تجربة الطالب التعليمية.
- `StudentFinancePage.jsx` — مستحقات ومدفوعات الطالب.
- `AdminPlansPage.jsx` — خطط المنصة.
- `AdminReportsPage.jsx` — تقارير المنصة.
- `AssistantDashboard.jsx` — لوحة المساعد.

تعديلات أساسية:
- `App.jsx`: Lazy loading، توجيه حسب الدور، Hash routing، حماية صفحات.
- `AppShell.jsx`: قوائم تنقل كاملة لكل دور + تسميات.
- `ChatPage.jsx`: حوكمة كاملة وإدارة مرفقات وقراءة.
- `SubscriptionPage.jsx`: اختيار خطة وطلب دفع ومتابعة الحالة.
- `index.css`: أنماط الطباعة، الحركات، احترام تقليل الحركة.

---

## 6. الأدلة والاختبارات

| الاختبار | الأمر | النتيجة |
|---|---|---|
| اختبارات Backend | `dotnet test Emtehani.Tests/Emtehani.Tests.csproj` | **84 نجاح / 0 فشل / 5 متخطى** |
| بناء Backend | `dotnet build` ضمن الاختبارات | نجاح |
| اختبارات Frontend | `npm run test:unit` | **31/31 نجاح** |
| بناء Frontend | `npm run build` | نجاح (مع فحص CSP) |
| اختبارات تكامل جديدة | `TeachingModuleTests.cs` | 5/5 نجاح |

تغطية اختبارات جديدة:
- إنشاء كورس/مجموعة/وحدة/درس/مادة + إصدار رمز وصول + علامة مائية + انعكاس النظرة العامة.
- عزل الكورسات بين مدرسين.
- فرض صلاحيات المساعد على كل طلب.
- تغيير وضع الشات ورفض الوضع غير الصالح.
- دورة اشتراك مدفوع كاملة حتى موافقة الإدارة.

---

## 7. قرارات تقنية موثقة

1. **الإضافات فقط** لنظام الامتحانات؛ لا حذف أو تعطيل.
2. **DDL idempotent** بدل Migrations للحفاظ على توافق الإنتاج الحالي.
3. **الحالة الزمنية للحصص محسوبة** من الوقت الحقيقي + الإلغاء/البدء/الانتهاء.
4. **المالية منفصلة** على مستوى الكيانات والمسارات والتقارير.
5. **الصلاحيات تُفرض في الخادم**؛ الواجهة إرشادية فقط.
6. **رموز محتوى قصيرة العمر** بدل كشف روابط التخزين.
7. **Polling** للإشعارات والشات (كل 4–12 ثانية) لتفادي تعقيد SignalR في الاستضافة الحالية.
8. **CSV + BOM** لتصدير عربي متوافق مع Excel، وطباعة PDF من المتصفح.
9. **توجيه بالحالة + Hash** بدل إضافة React Router (حفاظًا على بنية المشروع).

---

## 7.1 مراجعة الأداء

- الواجهة مقسّمة بـ Lazy loading؛ كل صفحة جديدة تُحمَّل عند الحاجة.
- الحزمة الأساسية بعد البناء ≈ **511KB** (≈156KB gzip)، وباقي الصفحات 12–45KB لكل صفحة.
  لا يوجد انفجار في الحجم، لكن الحزمة الأساسية أكبر من حد 500KB الذي ينبه إليه Vite.
- الحركات تُعطَّل مع `prefers-reduced-motion`.
- الاستعلامات الثقيلة (تقارير/قوائم) تستخدم `AsNoTracking` و`Take` وفهارس على `TeacherId`/`GroupId`/`StudentId`.
- Polling: الشات 4 ثوانٍ داخل المحادثة النشطة و12 ثانية للقائمة؛ الإشعارات تعتمد دورة مماثلة.
  هذا مقبول للاستضافة الحالية، ويُنصح بـ SignalR عند زيادة المستخدمين.

## 7.2 مراجعة الـAPI والواجهة

- 227 مسار API، كل مسار تعليمي يمر عبر `RequireAuthorization` + سياسة `api` + فحص نطاق/صلاحية.
- لا توجد استعلامات SQL مبنية يدويًا من مدخلات.
- كل النماذج تُتحقق من الطول/النوع، والملفات تتحقق من التوقيع الفعلي (Magic Bytes).
- الواجهة لا تعتمد عليها للحماية: كل إجراء حساس يُعاد التحقق منه في الخادم.
- الأخطاء تُعاد كـ JSON عربي موحد مع `traceId`، ولا تُظهر Stack Trace.
- الواجهة تمسك أخطاء الطلبات وتعرض رسائل قابلة للتنفيذ، وتعيد المحاولة حيث يلزم.

## 8. القيود الصريحة (لم يُدَّع إنجازها)

- **النشر:** تم النشر الفعلي (Backend + Frontend) واختبار الصفحات الرئيسية على الإنتاج. التفاصيل في القسم 11.
- **منع تصوير الشاشة:** غير ممكن تقنيًا بنسبة 100%؛ الموجود علامة مائية + رموز + تعطيل التقاط الشاشة في المتصفح.
- **HLS/DRM:** غير منفذ؛ الفيديو يعمل من رابطه الأصلي بعد التحقق.
- **قياس التخزين الفعلي:** حدود الخطط معرّفة لكن لا توجد مهمة قياس تلقائية بعد.
- **SignalR:** غير مستخدم؛ الشات والإشعارات تعتمد Polling.
- **Practice Activities / Lesson Q&A:** مؤجلة (P2) حسب خريطة الميزات.
- **اختبارات PostgreSQL:** موجودة لكنها تُتخطى بدون قاعدة بيانات اختبار.
- **اختبار المتصفح اليدوي:** جولة إنتاج جزئية على صفحات الإدارة (لوحة الإدارة، الخطط، التقارير، الإعلانات) — ناجحة بعد إصلاح `take`. لم تُجرَ جولة كاملة على كل المقاسات وكل الأدوار.

---

## 9. خطوات النشر (تم تنفيذها فعليًا)

### Backend — MonsterASP
1. بناء ونشر `Emtehani.API` (MSDeploy/Publish).
2. **لا تستبدل `appsettings.json` / `appsettings.Production.json`** أثناء النشر.
3. اضبط الأسرار عبر متغيرات بيئة/إعدادات الاستضافة بعد تدويرها (راجع `docs/security-audit.md`).
4. تحقق من `/health` و`/api` بعد النشر.
5. تحقق من تشغيل Bootstrap المخطط مرة واحدة.

### Frontend — Vercel
1. ادفع التغييرات إلى GitHub (بدون أسرار).
2. اترك تكامل Git في Vercel يبني وينشر تلقائيًا.
3. تأكد من `VITE_API_URL` في إعدادات Vercel.
4. تحقق من CSP والاتصال بالـAPI بعد النشر.

### تحقق ما بعد النشر
- تسجيل دخول مدرس جديد → يظهر طلب اختيار الباقة.
- اختيار الباقة المجانية → تُفتح مساحة العمل.
- إنشاء كورس/مجموعة/حصة/واجب.
- فتح مادة كطالب → يعمل الرابط الموقّع وتظهر العلامة المائية.
- إرسال رسالة في شات مغلق → تُرفض من الخادم.
- طلب اشتراك مدفوع → قراءة فقط حتى موافقة الإدارة.

---

## 10. مفتاح الملفات المرجعية

- خريطة الميزات: `docs/feature-mapping-algebaly-emtehani.md`
- التدقيق الأمني: `docs/security-audit.md`
- نشر MonsterASP: `docs/monsterasp-deployment.md`
- جاهزية الإنتاج: `docs/monsterasp-production-readiness.md`
- اختبارات الوحدة/التكامل: `backend/Emtehani.Tests/`

---

## 11. سجل النشر والتحقق (2026-11-06)

### Backend — MonsterASP
- نُشر `Emtehani.API` عبر MSDeploy مع `DoNotDeleteRule` + `AppOffline` + تخطي
  `appsettings*.json` (لم يُستبدل إعداد الإنتاج).
- أثناء أول تشغيل ظهر خطأ SQL Server: `Invalid column name 'GroupId'` في
  `TeachingSchema.EnsureSqlServerAsync`، لأن فهرساً مُفلتراً أُنشئ في نفس دفعة SQL
  التي أضافت العمود. أُصلح باستخدام `EXEC(N'CREATE INDEX ...')` للفهرسين، ثم أُعيد النشر.
- بعد الإصلاح: `/health` = 200، `/api` = 200، و`/api/teaching/overview` = 401 بدون توثيق (سلوك صحيح).
- CORS صحيح لكل من `https://emtehani-opal.vercel.app` و`https://emtehani.vercel.app`.
- إصلاح لاحق: واجهات `GET` للإعلانات كانت تطلب `take` إلزاميًا فترجع 400؛ صار اختياريًا
  (افتراضي 50، حد أقصى 100) مع إضافة `take=100` من الواجهة.

### Frontend — Vercel
- Commit `dbd529c`: كل واجهات التعليم/المالية/الإشراف.
- `7dc538c`: إصلاح قائمة الإعلانات (`take` اختياري + عدم استدعاء واجهات المدرس للإدارة).
- `a1d9f84`: مزامنة `#/admin` و`#/admin-teachers` عند التحديث والروابط المباشرة.
- `fe47236` و`e85a492`: منع تجاوز أزرار التصدير والجدول لحدود البطاقة على الشاشات الضيقة.
- Vercel بنى تلقائيًا من الفرع `main`، والبناء المنشور يحمل الصفحات الجديدة
  (`TeachingCoursesPage`, `TeachingGroupsPage`, `AdminReportsPage`, `AnnouncementsPage`...).

### تحقق المتصفح (Admin على الإنتاج)
- لوحة الإدارة: بيانات حقيقية (3 مدرسين، 21 طالبًا، طلب معلّق واحد) — كل طلبات API = 200.
- الخطط: 4 خطط/1 نشطة، `/api/admin/plans` و`/api/admin/subscriptions` و`/api/admin/platform-payments` = 200.
- التقارير: نظرة عامة وتقرير المدرسين للفترة 2026-11-01 → 2026-11-06 — 200.
- الإعلانات: كانت 400 بسبب `take`؛ أُصلح ونُشر وأُعيد الاختبار (200).
- تصدير CSV: `/api/admin/reports/subscriptions.csv` و`platform-payments.csv` = 200 بنوع `text/csv`.
- مركز الإشعارات يفتح ويعمل، وشاشة إدارة المحادثة (أوضاع/اعتماد/كتم/بحث/سجل) تعمل من الخادم.
- فحص التجاوز الأفقي: `body.scrollWidth == clientWidth` على صفحة التقارير بعد الإصلاح.
- لا أخطاء Console على الصفحات المذكورة.

### ملاحظة أسرار إنتاج (حرجة تشغيليًا)
- `backend/Emtehani.API/appsettings.json` و`appsettings.Production.json` متتبَّعان في Git
  وقد يحتويان أسرار إنتاج حقيقية. يجب تدويرها ونقلها إلى متغيرات بيئة على الاستضافة،
  ثم `git rm --cached` وإضافة النمط إلى `.gitignore` — بدون طباعة القيم.
- لا تُشغّل MSDeploy بدون قاعدة تخطي `appsettings*.json`.

---

## 12. اختبار الأدوار محليًا وإصلاحات المخطط (2026-11-06 → 2026-11-07)

### بيئة الاختبار
- LocalDB جديدة `EmtehaniLocalTest` (مخطط من الصفر عبر `EnsureCreatedAsync` + `TeachingSchema`
  + `PlatformDataUpgrade`)، API على `5210`، Vite على `5173` مع `DEV_API_TARGET` و`VITE_API_URL`.
- حسابات اختبار: مدرس `teacher.local@test.com`، طالب `student.local@test.com`،
  مساعد `assistant.local@test.com`، ومدرس ثانٍ لعزل البيانات. كل بيانات الاختبار محلية فقط.

### إصلاحات مخطط/كيان اكتُشفت أثناء الاختبار
1. **مسارات حذف متعددة (SQL Server 1785)** عند إنشاء الجداول من الصفر:
   `TeachingAssistants.AssistantId` صار `DeleteBehavior.NoAction` ليطابق
   `TeachingSchema` (TeacherId CASCADE، AssistantId NO ACTION). كانت المشكلة مخفية في
   الإنتاج لأن الجداول أُضيفت تدريجيًا، وكانت ستظهر عند استعادة نسخة احتياطية/قاعدة جديدة.
2. **9 أعمدة FK ظلّية** بسبب عدم تطابق أسماء الـNavigation مع بادئة المفتاح
   (`Memberships/GroupId`، `Enrollments/CourseId`، `Sessions/GroupId`،
   `Submissions/AssignmentId`، `Items/PackageId`...). أُضيفت علاقات صريحة
   `HasMany(...).WithOne().HasForeignKey(...)`، وأصبح المخطط النظيف بلا أعمدة ظلّية،
   و`memberCount` في قائمة المجموعات يُرجع القيمة الفعلية.
3. **عدّاد أعضاء المجموعة في الواجهة** كان يقرأ `Members` بينما الـAPI يُرجع `members`،
   فظهر "0 / 20" بجانب قائمة أعضاء صحيحة. أُصلح في `TeachingGroupsPage.jsx`.
4. **إحصائيات الحضور عند الطالب** كانت تقرأ `totals.Present` بينما الـAPI يُرجع
   `present/late/absent/excused`، فظهرت 0% رغم وجود سجل حضور. أُصلح التطبيع في
   `StudentLearningPage.jsx`.

### نتائج التحقق الوظيفي
- **المدرس:** إنشاء/تعديل مجموعة، عضو نشط، جدول، حصة، تسجيل حضور (Present)، واجب،
  وحدة/درس، نشر كورس، صفحات المالية والمساعدين — كلها تعمل مع حفظ فعلي في قاعدة البيانات.
- **المساعد (صلاحيات: Students.View, Groups.View, Sessions.View, Attendance.Manage):**
  - مسموح: `GET /api/teaching/groups` 200، تفاصيل المجموعة 200، الحصص 200،
    قراءة الحضور 200، حفظ الحضور 200، نظرة عامة 200.
  - مرفوض من الخادم 403: قائمة المساعدين، المالية، الكورسات، إنشاء مجموعة،
    تعديل/إلغاء حصة (`Sessions.Manage`)، واجهات المدرس (`/api/teacher/students`)،
    اشتراك المنصة.
- **الطالب:** لوحة الطالب، كورساتي (كورس منشور + وحدة/درس + وصول عبر المجموعة)،
  تعلّمي (مجموعات/حصص/حضور 100% بعد الإصلاح/واجبات)، تسليم واجب بنجاح، مدفوعاتي،
  الإعلانات، وشات المجموعة (إرسال رسالة وحفظها) كلها تعمل.
  - كل واجهات المدرس/المساعد/المالية تُرجع 403 للطالب، والكورس غير الموجود 404.
- **عزل المدرسين:** مدرس ثانٍ (باشتراك Free) يرى 0 مجموعات و0 طلاب، ويحصل على 404 عند
  طلب كورس/مجموعة المدرس الأول، وقائمة حصصه للمجموعة نفسها فارغة.
- **فرض الاشتراك:** المدرس الجديد بلا باقة يحصل على 403 `subscription_required`،
  وبعد اختيار Free تصبح الواجهات 200.

### الاختبارات والبناء
- `dotnet test`: 84 ناجح / 0 فاشل / 5 متجاوز (بعد إصلاحات المخطط).
- `npm run build`: ناجح (Vite)، مع تحذير حجم الحزمة الرئيسية (~511 KB) فقط.
- إعادة إنشاء مخطط SQL Server من الصفر نجحت بالكامل بعد إصلاح مسارات الحذف.

### ملاحظة تحسين واجهة (غير حاجبة)
- واجهة المساعد تعرض بعض أزرار الإدارة (إنشاء/تعديل مجموعة، إدارة حصة) رغم عدم امتلاكه
  الصلاحية؛ الخادم يرفضها دائمًا بـ403. إخفاء هذه الأزرار حسب الصلاحيات تحسين UX لاحق
  ولا يؤثر على أمان النظام.

### تنظيف بيئة الاختبار
- أوقف تشغيل API/Vite، حُذفت قاعدة `EmtehaniLocalTest` وملفات seed المؤقتة،
  ولم تُلمس أي بيانات إنتاج أو shared.

---

## 13. نشر إصلاحات المخطط والواجهة على الإنتاج (2026-11-06)

### Backend — MonsterASP
- نُشرت نسخة الواجهة الخلفية الحاوية لإصلاحات `AppDbContext` (مسار الحذف المتعدد
  والعلاقات الصريحة بدل المفاتيح الظلّية) عبر MSDeploy مع `DoNotDeleteRule`
  و`AppOffline` و**تخطي `appsettings*.json`**.
- بعد النشر: `/health` = 200، `/api/teaching/overview` = 401 بدون توثيق (سلوك صحيح)،
  ورأس CORS يُرجع `https://emtehani-opal.vercel.app`.

### Frontend — Vercel
- الكوميت `2cc3237` (إصلاحات المخطط + عدّاد أعضاء المجموعة + تطبيع إحصائيات الحضور)
  مدفوع إلى `main`، ونُشر تلقائيًا: النشر `GTewuA7L4` بحالة **Ready / Production / Current**
  على `emtehani-opal.vercel.app`.
- **التحقق من المحتوى المنشور فعليًا** (وليس من أسماء الملفات): الحزمة التي يقدّمها
  الدومين الحي تحتوي الإصلاحين:
  - `StudentLearningPage` المنشورة تحتوي `totals:{Present:a.present||0,Late:a.late||0,
    Absent:a.absent||0,Excused:a.excused||0}`.
  - `TeachingGroupsPage` المنشورة تحتوي
    `(…members||[]).filter(e=>e.status==="Active").length`.
  - تحميل الموقع الحي كمدير: لا رسائل Console، والصفحات تُحمّل من نفس حزمة الدخول
    `index-CMt91XC7.js` التي تشير إلى الحزمتين أعلاه.

### ملاحظة تحقق تقنية
- أسماء حزم البناء المحلية (`StudentLearningPage-CLKVp0ih.js`) تختلف عن أسماء إنتاج
  Vercel (`StudentLearningPage-B86bMYuF.js`) لنفس الكود، لأن تثبيت الحزم على Vercel من
  `package-lock.json` ينتج بصمة مختلفة عن بيئة التطوير المحلية. لذلك **التحقق الصحيح
  يكون بمحتوى الملف المنشور، لا باسمه**؛ أسماء الملفات ليست دليلًا على قِدَم النشر.

### تحذير أسرار الإنتاج (لم يُنفّذ تدوير بعد)
- ملفات `backend/Emtehani.API/appsettings.json` و`appsettings.Production.json` ما زالت
  متتبَّعة في Git وقد تحتوي أسرار إنتاج حقيقية. المطلوب: تدوير الأسرار، نقلها إلى متغيرات
  بيئة على الاستضافة، ثم `git rm --cached` وإضافة النمط إلى `.gitignore` — دون طباعة أي قيمة.
- يُمنع تشغيل MSDeploy بدون قاعدة تخطي `appsettings*.json`، وإلا فشل التشغيل (HTTP 500).

---

## 14. ترتيب الأسئلة لكل طالب، قفل الرجوع، وإصلاح شات الإدارة (2026-11-06)

### شات الإدارة ↔ المدرس
- السبب: `CanPostAsync` في `Program.cs` كانت تُرجع `false` لفئة `AdminDirect` لكل
  المستخدمين غير الإداريين، فكان المدرس يرى الرسائل ولا يستطيع الرد.
- الإصلاح: أصبحت `AdminDirect` قابلة للكتابة من طرفي المحادثة، مع بقاء فحص الوصول
  (`ChatAccess.CanAccessAsync`) كما هو. الإدارة لم تكن متأثرة لأنها تُسمح قبل هذا الشرط.

### حماية لقطات الشاشة — ما هو مفعّل فعليًا وما لا يمكن منعه
- المفعّل داخل المتصفح (`useExamLockdown` + `ExamRoomPage`): اعتراض `PrintScreen`
  و`Ctrl+P` و`Ctrl+S`، منع النسخ/القص/اللصق/السحب/قائمة السياق/الطباعة، تعطيل تحديد
  النص داخل ورقة الأسئلة، إخفاء الورقة فورًا عند فقد تركيز النافذة، ورفض
  `getDisplayMedia` (محاولات تسجيل الشاشة)، وتسجيل كل محاولة في تقرير المحاولة
  عبر `/api/submissions/{id}/events`.
- الحدود الواقعية: لا يمكن لأي تطبيق ويب منع تصوير الشاشة بكاميرا خارجية أو أدوات
  التقاط على مستوى نظام التشغيل. لذلك الحماية «ردع + تسجيل + إخفاء» وليست منعًا مطلقًا،
  وهذا موثق بوضوح ولا يُدّعى خلافه.

### تحكم المدرس بالرجوع إلى سؤال تمت الإجابة عنه
- إعداد جديد `Exam.AllowReviewPrevious` (افتراضي `true` للحفاظ على السلوك القديم).
- عند الإيقاف: يُخزَّن أقصى مؤشر وصل إليه الطالب في `Submission.CurrentQuestionIndex`
  (يتقدّم فقط ولا يتراجع)، وتُعتبر كل الأسئلة المجابة قبل هذا المؤشر مقفلة.
- الخادم يفرض القفل في حفظ الإجابات التلقائي وفي التسليم: إجابات الأسئلة المقفلة
  تُتجاهل ولا تُعدَّل، ويُرجع `lockedQuestionIds` و`currentQuestionIndex` لتستعيد
  الواجهة الحالة بعد التحديث. الاختبار التكاملي يثبت أن محاولة تعديل سؤال مقفل لا تغيّر
  الإجابة المحفوظة.
- لا يمنع الإعداد الطالب من الرجوع إلى سؤال **لم يجب عنه**، فقط الأسئلة المجابة.
- `PUT /api/exams/{id}/settings` يسمح بالتعديل قبل أول محاولة فقط، وبعدها يرجع 409.

### الترتيب العشوائي لكل طالب
- `ExamPaperOrder` (Domain) يبني الترتيب من بذرة ثابتة = ExamId + StudentId + salt
  (FNV-1a 64-bit ثم SplitMix64) وتوزيع Fisher-Yates؛ لا يُستخدم الوقت إطلاقًا، لذلك
  تحديث الصفحة لا يعيد الترتيب، وكل طالب يحصل على ترتيب مختلف.
- `ShuffleQuestions`: ترتيب الأسئلة لكل طالب. `ShuffleOptions`: ترتيب اختيارات
  الاختيار من متعدد لكل طالب.
- أسئلة المطابقة: لا تُعاد كتابة مصفوفة الخيارات (لأن التصحيح يعتمد على الفهارس)؛
  يُرسل `optionOrder` لترتيب العمود الأيمن للعرض فقط، مع الحفاظ على صحة التصحيح.
- واجهة المدرس: مفاتيح في إنشاء الامتحان وفي صفحة الامتحان، مقفلة بعد بدء أول محاولة.
- المخطط: أعمدة `Exams.ShuffleQuestions/ShuffleOptions/AllowReviewPrevious` و
  `Submissions.CurrentQuestionIndex` تُضاف تلقائيًا عند بدء التشغيل (SQL Server وNpgsql).

### الاختبارات
- اختبارات وحدة جديدة `ExamPaperOrderTests` (6 حالات): ثبات الترتيب لنفس الطالب،
  اختلافه بين الطلاب، احترام تعطيل العشوائية، ثبات «صح/خطأ»، و`MatchingOrder`.
- اختبار تكامل جديد `ExamSettings_LockAnsweredQuestionsWhenReviewIsDisabled` يغطي:
  تعديل الإعدادات قبل المحاولة، قفل السؤال بعد الإجابة والانتقال، تجاهل تعديله لاحقًا،
  ورفض تعديل الإعدادات بعد بدء المحاولة.
- النتيجة الكلية: **90 ناجحًا، 0 فاشل، 5 متخطى** (اختبارات PostgreSQL تحتاج قاعدة حية).

### النشر والتحقق
- Backend: MSDeploy مع تخطي `appsettings*.json`؛ بعد النشر `/health` = 200،
  و`PUT /api/exams/{id}/settings` بدون توثيق = 401 (أي أن المسار منشور ومحمي).
- Frontend: الكوميت `8456e1d` مدفوع إلى `main` ونُشر تلقائيًا. التحقق من **محتوى**
  الحزم الحي: `index-DwVGuvNK.js` يشير إلى `ExamRoomPage-3tLsLB-1.js` الذي يحتوي
  `lockedQuestionIds`، و`TeacherExamDetail` يحتوي مسار `/settings` ونص قفل الإعدادات،
  و`ExamForm` يحتوي `shuffleQuestions`.

### تحذير الأسرار (متكرر، لم يُنفّذ تدوير)
- `backend/Emtehani.API/appsettings*.json` ما زالت متتبعة وقد تحتوي أسرار إنتاج.
  المطلوب تدويرها ونقلها لمتغيرات بيئة ثم `git rm --cached` — دون طباعة أي قيمة.
  ولا يُشغَّل MSDeploy بدون قاعدة تخطي `appsettings*.json`.
