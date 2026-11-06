# امتحاني — Emtehani

> منصة عربية لإدارة الامتحانات المدرسية من البداية إلى النتيجة: إنشاء الامتحان، غرفة انتظار، جلسة مباشرة، تصحيح، ومراجعة.

**Canonical URL:** https://emtehani.vercel.app/
**Language:** Arabic (RTL) — English summary below
**Contact:** ahmedgbreel47@gmail.com

---

## ما هي المنصة؟

امتحاني منصة عربية (RTL) للمدرسين والطلاب. ينشئ المدرس امتحاناً بأسئلة من أنواع متعددة ويحدد المرحلة والصف، ثم يفتح الجلسة ويتابع الحضور والتسليم. يرى الطالب فقط امتحانات مدرسيه المطابقة لمرحلته وصفه، ويبدأ أو يستكمل محاولته من حسابه مباشرة.

### المزايا

- **ظهور حسب المرحلة والصف:** لا روابط ولا أكواد يدوية للطلاب؛ تظهر الامتحانات المطابقة للمرحلة والصف لمن هم مسجلون لدى المدرس.
- **غرفة انتظار منظّمة:** يدخل الطلاب ويظهرون للمدرس قبل بدء الامتحان، ولا يبدأ الوقت قبل أن يفتح المدرس الجلسة.
- **تحكّم فوري بالجلسة:** فتح، إيقاف مؤقت، استئناف، وإنهاء. عند الاستئناف يُضاف زمن التوقف تلقائياً إلى وقت الطلاب.
- **متابعة مباشرة:** حالة كل طالب (نشط، سلّم، منقطع، في الانتظار) مع تحديث تلقائي كل 3 ثوانٍ.
- **ستة أنواع أسئلة:** اختيار من متعدد، صواب/خطأ، إجابة قصيرة، مقالي، ملء الفراغ، ومطابقة.
- **تصحيح ومراجعة:** تصحيح تلقائي فوري للاختيار من متعدد والصواب/الخطأ، وقائمة مراجعة يدوية للمقالات.
- **نتائج قابلة للتصدير:** تصدير النتائج والحضور بصيغة CSV.
- **حماية أثناء الامتحان:** تسجيل محاولات فقدان التركيز والنسخ ولقطات الشاشة، مع استئناف آمن بعد انقطاع الجلسة.

### كيف يعمل

1. **أنشئ الامتحان:** أضف الأسئلة والدرجات والمدة، وحدد موعد الجلسة إن أردت.
2. **حدد المرحلة والصف:** لن يظهر الامتحان إلا للطلاب المؤهلين المسجلين لدى المدرس.
3. **افتح وتابع:** افتح الجلسة، راقب الحضور والتسليم، وتحكّم بالوقت من لوحة واحدة.

### الأسئلة الشائعة

**هل أحتاج تثبيت أي برنامج؟**
لا. تعمل المنصة من المتصفح على الكمبيوتر أو الجوال. سجّل الدخول وابدأ.

**كيف يدخل الطالب الامتحان؟**
بعد تسجيل الدخول تظهر للطالب امتحانات مدرسيه المطابقة لمرحلته وصفه. يختار الامتحان ليبدأ أو يستكمل محاولته مباشرة دون الحاجة إلى كود.

**هل يمكن إيقاف الامتحان مؤقتاً؟**
نعم. عند الإيقاف يتوقف الوقت، وعند الاستئناف يُضاف زمن التوقف تلقائياً إلى وقت الطلاب.

**هل تُصحح الأسئلة المقالية تلقائياً؟**
الاختيار من متعدد والصواب/الخطأ تُصحح تلقائياً. المقالات تظهر في قائمة مراجعة يدوية للمدرس.

### الأدوار والوصول

- **مدرس (Teacher):** ينشئ الامتحانات ويدير الجلسات ويراجع النتائج والطلاب المرتبطين به.
- **طالب (Student):** يسجّل حساباً بمرحلته وصفه، يرسل طلب ارتباط لمدرس، ويدخل الامتحانات المتاحة له فقط.
- الوصول إلى بيانات الطلاب والمدرسين والامتحانات يتطلب حساباً موثقاً وصلاحية دور، ويُفرض في الخادم لا في الواجهة.

### المصادقة

تسجيل الدخول بالبريد الإلكتروني وكلمة المرور، مع رمز وصول JWT قصير العمر ورمز تجديد دوّار. لا توجد حالياً خدمة OAuth 2.0 / OpenID Connect ولا تسجيل عملاء ديناميكي (DCR). التفاصيل الكاملة في [auth.md](https://emtehani.vercel.app/auth.md).

### روابط للمطورين والوكلاء

- [توثيق API](https://emtehani.vercel.app/api-docs/)
- [API Catalog (RFC 9727)](https://emtehani.vercel.app/.well-known/api-catalog)
- [OpenAPI Specification](https://emtehani.runasp.net/swagger/v1/swagger.json)
- [AI Catalog / ARD Manifest](https://emtehani.vercel.app/.well-known/ai-catalog.json)
- [MCP Server Card](https://emtehani.vercel.app/.well-known/mcp/server-card.json)
- [Agent Skills Index](https://emtehani.vercel.app/.well-known/agent-skills/index.json)
- [llms.txt](https://emtehani.vercel.app/llms.txt)
- [robots.txt](https://emtehani.vercel.app/robots.txt)
- [Sitemap](https://emtehani.vercel.app/sitemap.xml)

### بيانات خاصة — غير متاحة للفهرسة

لوحات التحكم، صفحات الطلاب والمدرسين، الامتحانات، الإجابات، النتائج، وواجهات API المحمية ليست محتوى عاماً. لا تسمح المنصة لفهارس البحث أو وكلاء الذكاء الاصطناعي بالوصول إليها، ولا تتجاوز أدوات الويب صلاحيات المستخدم أو مصادقة الخادم.

---

## English summary

Emtehani is an Arabic-first (RTL) school exam platform. Teachers create exams with six question types, assign a stage and grade, open a live session, monitor attendance and submissions, and review results. Students only see exams from teachers they are linked to that match their stage and grade.

**Key capabilities:** stage/grade-scoped exam discovery, waiting room, pause/resume with automatic time compensation, live monitoring, six question types, automatic grading for objective questions, manual essay review, CSV export, and focus-loss/copy/screenshot event tracking.

**Access:** email/password authentication with short-lived JWT access tokens and rotating refresh tokens. Role-based authorization (`Teacher`, `Student`) is enforced server-side. There is no OAuth 2.0/OpenID Connect authorization server and no dynamic client registration.

**Public discovery resources:** [API documentation](https://emtehani.vercel.app/api-docs/), [API catalog](https://emtehani.vercel.app/.well-known/api-catalog), [OpenAPI](https://emtehani.runasp.net/swagger/v1/swagger.json), [AI catalog](https://emtehani.vercel.app/.well-known/ai-catalog.json), [MCP server card](https://emtehani.vercel.app/.well-known/mcp/server-card.json), [Agent Skills](https://emtehani.vercel.app/.well-known/agent-skills/index.json).

**Privacy:** dashboards, student/teacher records, exams, answers, results, and authenticated API endpoints are private. They are excluded from crawling, sitemaps, and all agent discovery documents. Agent tools never bypass server-side authentication or authorization.
