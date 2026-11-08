/**
 * =============================================================================
 *  بورتفوليو المطور — كل البيانات في ملف واحد
 * =============================================================================
 *  عدّل القيم هنا مباشرة، أو من لوحة الإدارة → «بورتفوليو المطور».
 *  ما تحفظه من لوحة الإدارة يُخزَّن على الخادم ويظهر فوراً على الصفحة العامة،
 *  وما تتركه هنا يعمل كنسخة افتراضية إذا لم يُحفظ شيء بعد.
 *
 *  لإضافة مشروع: انسخ أي كائن داخل projects وعدّل قيمه.
 *  للحذف: احذف الكائن بالكامل.
 *  النصوص التي تظهر بالعربية والإنجليزية تأخذ الشكل: { ar: "…", en: "…" }.
 * =============================================================================
 */

export const DEFAULT_PORTFOLIO = {
  profile: {
    name: "أحمد جبريل",
    nameEn: "Ahmed Gbreel",
    role: { ar: "مطور Full Stack ومهندس برمجيات", en: "Full Stack Developer & Software Engineer" },
    degree: { ar: "بكالوريوس الحاسبات والذكاء الاصطناعي، جامعة بنها", en: "BSc in Computers and Artificial Intelligence, Benha University" },
    graduation: "2025",
    experienceYears: "2+",
    location: { ar: "القاهرة، مصر", en: "Cairo, Egypt" },
    email: "ahmedgbreel47@gmail.com",
    phone: "01159862510",
    whatsapp: "201159862510",
    github: "https://github.com/AGbreel",
    linkedin: "https://www.linkedin.com/in/ahmed-gbreel-8465b0352/",
    avatarUrl: "/developer-portrait.jpg",
    availability: { ar: "متاح لاستقبال مشاريع جديدة", en: "Available for new projects" },
  },

  hero: {
    headlineA: { ar: "أبني منتجات", en: "I build digital" },
    headlineB: { ar: "رقمية تعمل.", en: "products that work." },
    intro: {
      ar: "مطور Full Stack من القاهرة. أبني تطبيقات ويب واضحة، سريعة، وقابلة للتطوير، من الواجهة إلى قاعدة البيانات.",
      en: "Full Stack developer based in Cairo. I build clear, fast web applications that stay maintainable as they grow.",
    },
    caption: { ar: "أحمد جبريل · من مساحة العمل", en: "Ahmed Gbreel · from the workspace" },
  },

  about: {
    title: { ar: "أفهم المشكلة قبل أن أكتب الكود.", en: "I understand the problem before writing code." },
    text: {
      ar: "خريج كلية الحاسبات والذكاء الاصطناعي بجامعة بنها عام 2025، وأعمل في تطوير البرمجيات منذ سنتين. أبدأ بفهم احتياج المشروع، ثم أبني حلاً واضحاً يمكن تشغيله وصيانته مع نمو العمل.",
      en: "I graduated from the Faculty of Computers and Artificial Intelligence at Benha University in 2025 and have two years of software development experience. I start by understanding the business need, then build a clear solution that can run and scale with the work.",
    },
    caption: { ar: "تفاصيل من المكتب.", en: "A detail from the desk." },
    imageUrl: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=85",
    facts: [
      { label: { ar: "المؤهل", en: "Degree" }, value: { ar: "بكالوريوس الحاسبات والذكاء الاصطناعي", en: "BSc in Computers and AI" } },
      { label: { ar: "التخرج", en: "Graduation" }, value: { ar: "2025", en: "2025" } },
      { label: { ar: "الموقع", en: "Location" }, value: { ar: "القاهرة، مصر", en: "Cairo, Egypt" } },
      { label: { ar: "اللغات", en: "Languages" }, value: { ar: "العربية · الإنجليزية", en: "Arabic · English" } },
    ],
  },

  work: {
    title: { ar: "مشاريع تحل مشكلات حقيقية.", en: "Projects that solve real problems." },
    text: {
      ar: "أعمال أبنيها بمنهج واضح: نطاق محدد، تجربة استخدام مفهومة، وكود يمكن تطويره.",
      en: "Work built with a clear scope, a readable user experience, and code that can keep evolving.",
    },
  },

  how: {
    title: { ar: "من أول مكالمة إلى الإطلاق.", en: "From the first call to launch." },
    text: {
      ar: "نطاق واضح، بناء قابل للصيانة، وتسليم يمكنك تشغيله بثقة.",
      en: "A clear scope, a maintainable build, and a handover you can run with confidence.",
    },
  },

  stack: [
    { name: "React", slug: "react" },
    { name: "JavaScript", slug: "javascript" },
    { name: "TypeScript", slug: "typescript" },
    { name: "ASP.NET Core", slug: "dotnet" },
    { name: "Vite", slug: "vite" },
    { name: "SQL Server", slug: "" },
    { name: "Git", slug: "git" },
    { name: "Docker", slug: "docker" },
  ],

  projects: [
    {
      id: "emtehani",
      title: "منصة امتحاني",
      layout: "featured",
      cover: "EMT",
      imageUrl: "",
      category: { ar: "منصة تعليمية متعددة المدرسين", en: "Multi-tenant education platform" },
      description: {
        ar: "منصة SaaS لإدارة الاختبارات والكورسات والمجموعات والمدفوعات، مع عزل كامل لبيانات كل مدرس ولوحة إدارة مركزية ومراقبة مباشرة للامتحانات.",
        en: "A SaaS platform for exams, courses, groups, and payments with strict per-teacher isolation, a central admin dashboard, and live exam proctoring.",
      },
      alt: { ar: "شاشة منصة امتحاني", en: "Emtehani platform screen" },
      tags: ["React", "ASP.NET Core", "SQL Server", "SignalR"],
      link: "https://emtehani-opal.vercel.app",
      repo: "https://github.com/AGbreel/Emtehani",
      year: "2026",
    },
    {
      id: "erp",
      title: "Educational Center ERP",
      layout: "standard",
      cover: "ERP",
      imageUrl: "",
      category: { ar: "إدارة مركز تعليمي", en: "Education operations" },
      description: {
        ar: "نظام لإدارة عمليات مركز تعليمي: الطلاب، المجموعات، الحصص، الحضور، والتحصيل، مع وحدات قابلة للتطوير تناسب احتياجات العمل.",
        en: "A system for running an educational center: students, groups, sessions, attendance, and collections, with modules that grow with the business.",
      },
      alt: { ar: "لوحة إدارة مركز تعليمي", en: "Educational center dashboard" },
      tags: ["ASP.NET Core", "C#", "SQL Server"],
      link: "",
      repo: "",
      year: "2025",
    },
    {
      id: "ecommerce",
      title: "E-commerce",
      layout: "standard",
      cover: "SHOP",
      imageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=85",
      category: { ar: "تجارة إلكترونية", en: "E-commerce" },
      description: {
        ar: "متجر إلكتروني قابل للتوسع لعرض المنتجات وتنظيم تجربة التسوق وإدارة الوظائف الأساسية للمتجر.",
        en: "A scalable storefront for presenting products, organizing the shopping experience, and managing core store operations.",
      },
      alt: { ar: "متجر ملابس تعرض فيه الملابس على علاقات.", en: "A clothing store with garments on racks." },
      tags: ["React", "REST APIs", "SQL Server"],
      link: "",
      repo: "",
      year: "2025",
    },
    {
      id: "portfolio",
      title: "Portfolio",
      layout: "wide",
      cover: "PORT",
      imageUrl: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1400&q=85",
      category: { ar: "موقع شخصي", en: "Personal site" },
      description: {
        ar: "موقع شخصي يعرض المهارات والمشاريع والخدمات ووسائل التواصل بشكل متجاوب، مع حركات خفيفة وتجربة عربية وإنجليزية.",
        en: "A responsive portfolio presenting skills, projects, services, and contact channels with subtle motion in Arabic and English.",
      },
      alt: { ar: "شاشة تعرض أسطراً من كود برمجي.", en: "A screen displaying lines of code." },
      tags: ["React", "Responsive UI", "UI/UX"],
      link: "",
      repo: "",
      year: "2026",
    },
  ],

  services: [
    {
      icon: "code",
      title: { ar: "تطوير مواقع الويب", en: "Web development" },
      description: {
        ar: "مواقع حديثة وسريعة ومتجاوبة مع الموبايل والكمبيوتر، بتجربة استخدام واضحة.",
        en: "Modern, fast, responsive websites with a clear user experience.",
      },
    },
    {
      icon: "workflow",
      title: { ar: "أنظمة إدارية مخصصة", en: "Custom admin systems" },
      description: {
        ar: "لوحات تحكم وأنظمة لإدارة العمليات والبيانات بما يناسب طبيعة مشروعك.",
        en: "Dashboards and systems for managing operations and data around your workflow.",
      },
    },
    {
      icon: "briefcase",
      title: { ar: "متاجر إلكترونية", en: "E-commerce" },
      description: {
        ar: "بناء متاجر قابلة للتوسع وتنظيم المنتجات والواجهات وتكاملات الـ API حسب المتطلبات.",
        en: "Scalable stores with product management, storefronts, and API integrations.",
      },
    },
    {
      icon: "rocket",
      title: { ar: "Back-end وواجهات API", en: "Back-end and APIs" },
      description: {
        ar: "تطوير خدمات خلفية منظمة باستخدام ASP.NET Core وSQL Server مع الاهتمام بقابلية الصيانة.",
        en: "Organized services with ASP.NET Core and SQL Server, built for maintainability.",
      },
    },
  ],

  steps: [
    {
      title: { ar: "نفهم الفكرة", en: "Understand" },
      description: { ar: "نحدد أهداف المشروع والمستخدمين والوظائف المطلوبة.", en: "Define goals, users, and the features your project needs." },
    },
    {
      title: { ar: "نخطط ونصمم", en: "Plan and design" },
      description: { ar: "نرتب الأولويات ونحدد تجربة الاستخدام والبنية التقنية.", en: "Prioritize features and map the user experience and architecture." },
    },
    {
      title: { ar: "نطور ونختبر", en: "Build and test" },
      description: { ar: "نبني الحل على مراحل ونراجع الوظائف قبل التسليم.", en: "Develop in stages and validate functionality before delivery." },
    },
    {
      title: { ar: "نسلم وندعم", en: "Deliver and support" },
      description: { ar: "نسلم المشروع مع توضيح طريقة التشغيل والخطوات التالية.", en: "Hand over the project with setup guidance and next steps." },
    },
  ],

  contact: {
    title: { ar: "لديك فكرة؟ لنبدأ.", en: "Have an idea? Let's start." },
    text: {
      ar: "أرسل تفاصيل المشروع، وسأعود إليك بخطة واضحة للنطاق والخطوات التالية.",
      en: "Send the project details and I'll reply with a clear scope and next steps.",
    },
    formNote: {
      ar: "سيفتح واتساب برسالة جاهزة. لا يتم تخزين بياناتك في هذا الموقع.",
      en: "WhatsApp will open with your details prefilled. This form does not store your data.",
    },
  },
};

export function clonePortfolio(value = DEFAULT_PORTFOLIO) {
  return JSON.parse(JSON.stringify(value));
}

/** Stored documents override defaults field by field; arrays replace their defaults. */
export function mergePortfolio(stored) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return clonePortfolio();
  return mergeNode(clonePortfolio(), stored);
}

function mergeNode(base, patch) {
  const output = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      output[key] = value;
    } else if (value && typeof value === "object") {
      const current = output[key];
      output[key] = mergeNode(current && typeof current === "object" && !Array.isArray(current) ? current : {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}
