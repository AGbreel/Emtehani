import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BriefcaseBusiness,
  Code2,
  ExternalLink,
  GitBranch,
  Link2,
  Mail,
  Menu,
  MessageCircle,
  Moon,
  Phone,
  Rocket,
  Sun,
  Workflow,
  X,
} from "lucide-react";
import "./DeveloperPage.css";

const PROFILE = {
  name: "Ahmed Gbreel",
  role: "Full Stack Developer & Software Engineer",
  degree: "بكالوريوس الحاسبات والذكاء الاصطناعي، جامعة بنها",
  graduation: "2025",
  location: "القاهرة، مصر",
  email: "ahmedgbreel47@gmail.com",
  phone: "01159862510",
  whatsapp: "201159862510",
  github: "https://github.com/AGbreel",
  linkedin: "https://www.linkedin.com/in/ahmed-gbreel-8465b0352/",
};

const IMAGES = {
  hero: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=1400&q=85",
  about: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=85",
  exam: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1400&q=85",
  ecommerce: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=85",
  portfolio: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1400&q=85",
};

const STACK = [
  { name: "React", slug: "react" },
  { name: "JavaScript", slug: "javascript" },
  { name: "ASP.NET Core", slug: "dotnet" },
  { name: "Vite", slug: "vite" },
  { name: "OpenAPI", slug: "openapiinitiative" },
];

const PROJECTS = [
  {
    key: "exam",
    title: "Exam Platform",
    layout: "featured",
    image: IMAGES.exam,
    tags: ["React", "ASP.NET Core", "SQL Server"],
    category: { ar: "منصة تعليمية", en: "Education platform" },
    description: {
      ar: "منصة لإدارة الاختبارات، إنشاء الأسئلة، تنظيم المحاولات، ومتابعة النتائج في تجربة استخدام واضحة.",
      en: "An exam platform for creating questions, managing attempts, and reviewing results in a clear workflow.",
    },
    alt: {
      ar: "طاولة دراسة عليها كتب ودفاتر.",
      en: "A study desk with books and notebooks.",
    },
  },
  {
    key: "ecommerce",
    title: "E-commerce",
    layout: "standard",
    image: IMAGES.ecommerce,
    tags: ["React", "REST APIs", "SQL Server"],
    category: { ar: "تجارة إلكترونية", en: "E-commerce" },
    description: {
      ar: "متجر إلكتروني قابل للتوسع لعرض المنتجات وتنظيم تجربة التسوق وإدارة الوظائف الأساسية للمتجر.",
      en: "A scalable storefront for presenting products, organizing the shopping experience, and managing core store operations.",
    },
    alt: {
      ar: "متجر ملابس تعرض فيه الملابس على علاقات.",
      en: "A clothing store with garments on racks.",
    },
  },
  {
    key: "erp",
    title: "Educational Center ERP",
    layout: "standard",
    cover: "ERP",
    tags: ["ASP.NET Core", "C#", "SQL Server"],
    category: { ar: "إدارة مركز تعليمي", en: "Education operations" },
    description: {
      ar: "نظام لإدارة عمليات مركز تعليمي، مع وحدات قابلة للتطوير تناسب احتياجات العمل.",
      en: "A system for running an educational center, with modules that can grow with the business.",
    },
  },
  {
    key: "portfolio",
    title: "Portfolio",
    layout: "wide",
    image: IMAGES.portfolio,
    tags: ["React", "Responsive UI", "UI/UX"],
    category: { ar: "موقع شخصي", en: "Personal site" },
    description: {
      ar: "موقع شخصي يعرض المهارات والمشاريع والخدمات ووسائل التواصل بشكل متجاوب.",
      en: "A responsive portfolio for presenting skills, projects, services, and contact channels.",
    },
    alt: {
      ar: "شاشة تعرض أسطراً من كود برمجي.",
      en: "A screen displaying lines of code.",
    },
  },
];

const SERVICES = [
  {
    icon: Code2,
    title: { ar: "تطوير مواقع الويب", en: "Web development" },
    description: {
      ar: "مواقع حديثة وسريعة ومتجاوبة مع الموبايل والكمبيوتر، بتجربة استخدام واضحة.",
      en: "Modern, fast, responsive websites with a clear user experience.",
    },
  },
  {
    icon: Workflow,
    title: { ar: "أنظمة إدارية مخصصة", en: "Custom admin systems" },
    description: {
      ar: "لوحات تحكم وأنظمة لإدارة العمليات والبيانات بما يناسب طبيعة مشروعك.",
      en: "Dashboards and systems for managing operations and data around your workflow.",
    },
  },
  {
    icon: BriefcaseBusiness,
    title: { ar: "متاجر إلكترونية", en: "E-commerce" },
    description: {
      ar: "بناء متاجر قابلة للتوسع وتنظيم المنتجات والواجهات وتكاملات الـ API حسب المتطلبات.",
      en: "Scalable stores with product management, storefronts, and API integrations.",
    },
  },
  {
    icon: Rocket,
    title: { ar: "Back-end وواجهات API", en: "Back-end and APIs" },
    description: {
      ar: "تطوير خدمات خلفية منظمة باستخدام ASP.NET Core وSQL Server مع الاهتمام بقابلية الصيانة.",
      en: "Organized services with ASP.NET Core and SQL Server, built for maintainability.",
    },
  },
];

const STEPS = [
  {
    title: { ar: "نفهم الفكرة", en: "Understand" },
    description: {
      ar: "نحدد أهداف المشروع والمستخدمين والوظائف المطلوبة.",
      en: "Define goals, users, and the features your project needs.",
    },
  },
  {
    title: { ar: "نخطط ونصمم", en: "Plan and design" },
    description: {
      ar: "نرتب الأولويات ونحدد تجربة الاستخدام والبنية التقنية.",
      en: "Prioritize features and map the user experience and architecture.",
    },
  },
  {
    title: { ar: "نطور ونختبر", en: "Build and test" },
    description: {
      ar: "نبني الحل على مراحل ونراجع الوظائف قبل التسليم.",
      en: "Develop in stages and validate functionality before delivery.",
    },
  },
  {
    title: { ar: "نسلم وندعم", en: "Deliver and support" },
    description: {
      ar: "نسلم المشروع مع توضيح طريقة التشغيل والخطوات التالية.",
      en: "Hand over the project with setup guidance and next steps.",
    },
  },
];

const COPY = {
  ar: {
    navAbout: "نبذة",
    navWork: "المشاريع",
    navServices: "الخدمات",
    navContact: "تواصل",
    primaryCta: "ناقش مشروعك",
    secondaryCta: "شاهد الأعمال",
    headlineA: "أبني منتجات",
    headlineB: "رقمية تعمل.",
    intro: "مطور Full Stack من القاهرة. أبني تطبيقات ويب واضحة، سريعة، وقابلة للتطوير، من الواجهة إلى قاعدة البيانات.",
    heroAlt: "مكتب مطور بحاسوب مفتوح على محرر أكواد.",
    heroCaption: "من مساحة العمل.",
    stackLabel: "أدوات أعمل بها",
    aboutTitle: "أفهم المشكلة قبل أن أكتب الكود.",
    aboutText: "خريج كلية الحاسبات والذكاء الاصطناعي بجامعة بنها عام 2025، وأعمل في تطوير البرمجيات منذ سنتين. أبدأ بفهم احتياج المشروع، ثم أبني حلاً واضحاً يمكن تشغيله وصيانته مع نمو العمل.",
    aboutAlt: "لابتوب مفتوح على محرر أكواد.",
    aboutCaption: "تفاصيل من المكتب.",
    facts: [
      ["المؤهل", "بكالوريوس الحاسبات والذكاء الاصطناعي"],
      ["التخرج", "2025"],
      ["الموقع", "القاهرة، مصر"],
      ["الإنجليزية", "متوسط"],
    ],
    workTitle: "مشاريع تحل مشكلات حقيقية.",
    workText: "أعمال أبنيها بمنهج واضح: نطاق محدد، تجربة استخدام مفهومة، وكود يمكن تطويره.",
    howTitle: "من أول مكالمة إلى الإطلاق.",
    howText: "نطاق واضح، بناء قابل للصيانة، وتسليم يمكنك تشغيله بثقة.",
    servicesHeading: "ما أقدمه",
    processTitle: "طريقة العمل",
    contactTitle: "لديك فكرة؟ لنبدأ.",
    contactText: "أرسل تفاصيل المشروع، وسأعود إليك بخطة واضحة للنطاق والخطوات التالية.",
    email: "البريد الإلكتروني",
    whatsapp: "واتساب",
    github: "GitHub",
    linkedin: "LinkedIn",
    phone: "الهاتف",
    formName: "اسمك",
    formEmail: "بريدك الإلكتروني",
    formType: "نوع المشروع",
    formBudget: "الميزانية التقريبية (اختياري)",
    formDetails: "تفاصيل المشروع",
    formSubmit: "أرسل عبر واتساب",
    namePlaceholder: "اكتب اسمك",
    emailPlaceholder: "name@example.com",
    detailsPlaceholder: "ما الفكرة؟ وما أهم الوظائف التي تحتاجها؟",
    selectProject: "اختر نوع المشروع",
    website: "موقع تعريفي",
    ecommerce: "متجر إلكتروني",
    admin: "نظام إداري / ERP",
    education: "منصة تعليمية",
    api: "Back-end / API",
    other: "مشروع آخر",
    budgetPlaceholder: "مثال: قابل للنقاش",
    formNote: "سيفتح واتساب برسالة جاهزة. لا يتم تخزين بياناتك في هذا الموقع.",
    footer: "أحمد جبريل. جميع الحقوق محفوظة.",
    top: "إلى الأعلى",
  },
  en: {
    navAbout: "About",
    navWork: "Work",
    navServices: "Services",
    navContact: "Contact",
    primaryCta: "Discuss your project",
    secondaryCta: "See the work",
    headlineA: "I build digital",
    headlineB: "products that work.",
    intro: "Full Stack developer based in Cairo. I build clear, fast web applications that stay maintainable as they grow.",
    heroAlt: "A developer desk with a laptop open on a code editor.",
    heroCaption: "From the workspace.",
    stackLabel: "Tools I work with",
    aboutTitle: "I understand the problem before writing code.",
    aboutText: "I graduated from the Faculty of Computers and Artificial Intelligence at Benha University in 2025 and have two years of software development experience. I start by understanding the business need, then build a clear solution that can run and scale with the work.",
    aboutAlt: "A laptop open on a code editor.",
    aboutCaption: "A detail from the desk.",
    facts: [
      ["Degree", "BSc in Computers and AI, Benha University"],
      ["Graduation", "2025"],
      ["Location", "Cairo, Egypt"],
      ["English", "Intermediate"],
    ],
    workTitle: "Projects that solve real problems.",
    workText: "Work built with a clear scope, a readable user experience, and code that can keep evolving.",
    howTitle: "From the first call to launch.",
    howText: "A clear scope, a maintainable build, and a handover you can run with confidence.",
    servicesHeading: "What I do",
    processTitle: "The process",
    contactTitle: "Have an idea? Let's\u00a0start.",
    contactText: "Send the project details and I'll reply with a clear scope and next steps.",
    email: "Email",
    whatsapp: "WhatsApp",
    github: "GitHub",
    linkedin: "LinkedIn",
    phone: "Phone",
    formName: "Your name",
    formEmail: "Your email",
    formType: "Project type",
    formBudget: "Estimated budget (optional)",
    formDetails: "Project details",
    formSubmit: "Send via WhatsApp",
    namePlaceholder: "Your name",
    emailPlaceholder: "name@example.com",
    detailsPlaceholder: "What is the idea, and which features matter most?",
    selectProject: "Choose project type",
    website: "Business website",
    ecommerce: "E-commerce store",
    admin: "Admin system / ERP",
    education: "Education platform",
    api: "Back-end / API",
    other: "Other project",
    budgetPlaceholder: "e.g. Open to discussion",
    formNote: "WhatsApp will open with your details prefilled. This form does not store your data.",
    footer: "Ahmed Gbreel. All rights reserved.",
    top: "Back to top",
  },
};

export default function DeveloperPage({ onBack, theme = "dark", onThemeChange }) {
  const [language, setLanguage] = useState("ar");
  const [menuOpen, setMenuOpen] = useState(false);
  const previousOverflowRef = useRef("");
  const isArabic = language === "ar";
  const lang = isArabic ? "ar" : "en";
  const copy = COPY[lang];
  const isDark = theme === "dark";

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll(".portfolio-page [data-reveal]"));
    if (!nodes.length) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((node) => node.classList.add("is-revealed"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [language]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflowRef.current;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function closeMenu() {
    document.body.style.overflow = previousOverflowRef.current;
    setMenuOpen(false);
  }

  function toggleTheme() {
    onThemeChange?.(isDark ? "light" : "dark");
  }

  function switchLanguage() {
    setLanguage(isArabic ? "en" : "ar");
    setMenuOpen(false);
  }

  function submitProject(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = [
      `Name: ${data.get("name") || "-"}`,
      `Email: ${data.get("email") || "-"}`,
      `Project type: ${data.get("type") || "-"}`,
      `Estimated budget: ${data.get("budget") || "Not specified"}`,
      `Project details: ${data.get("details") || "-"}`,
    ];
    const message = `Hello Ahmed, I'd like to discuss a project:\n${fields.join("\n")}`;
    window.open(`https://wa.me/${PROFILE.whatsapp}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  const navLinks = [
    { href: "#about", label: copy.navAbout },
    { href: "#work", label: copy.navWork },
    { href: "#services", label: copy.navServices },
    { href: "#contact", label: copy.navContact },
  ];

  return (
    <main
      className={`portfolio-page ${isDark ? "is-dark" : "is-light"}`}
      dir={isArabic ? "rtl" : "ltr"}
      lang={lang}
    >
      <header className="pf-nav">
        <div className="pf-nav-inner">
          <a className="pf-brand" href="#portfolio-home" onClick={menuOpen ? closeMenu : undefined} aria-label={isArabic ? "أحمد جبريل، الصفحة الرئيسية" : "Ahmed Gbreel, home"}>
            <span className="pf-brand-mark" aria-hidden="true">AG</span>
            <span className="pf-brand-copy">
              <strong>{isArabic ? "أحمد جبريل" : "Ahmed Gbreel"}</strong>
              <small>Full Stack Developer</small>
            </span>
          </a>

          <nav className="pf-links" aria-label={isArabic ? "التنقل الرئيسي" : "Main navigation"}>
            {navLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
          </nav>

          <div className="pf-actions">
            <a className="pf-nav-cta" href="#contact">{copy.primaryCta}</a>
            <button type="button" className="pf-icon pf-icon--text" onClick={switchLanguage} aria-label={isArabic ? "Switch to English" : "التبديل إلى العربية"}>
              {isArabic ? "EN" : "عربي"}
            </button>
            <button type="button" className="pf-icon" onClick={toggleTheme} aria-label={isDark ? (isArabic ? "تفعيل الوضع الفاتح" : "Switch to light mode") : (isArabic ? "تفعيل الوضع الداكن" : "Switch to dark mode")}>
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            {onBack ? (
              <button type="button" className="pf-icon" onClick={onBack} aria-label={isArabic ? "العودة إلى منصة امتحاني" : "Back to Emtehani"} title={isArabic ? "العودة إلى منصة امتحاني" : "Back to Emtehani"}>
                {isArabic ? <ArrowRight size={17} /> : <ArrowLeft size={17} />}
              </button>
            ) : null}
            <button
              type="button"
              className="pf-icon pf-menu-toggle"
              onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
              aria-expanded={menuOpen}
              aria-controls="pf-mobile-menu"
              aria-label={menuOpen ? (isArabic ? "إغلاق القائمة" : "Close menu") : (isArabic ? "فتح القائمة" : "Open menu")}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="pf-mobile-menu" id="pf-mobile-menu">
            <nav aria-label={isArabic ? "التنقل الرئيسي" : "Main navigation"}>
              {navLinks.map((link) => <a key={link.href} href={link.href} onClick={closeMenu}>{link.label}</a>)}
              <a className="pf-mobile-cta" href="#contact" onClick={closeMenu}>{copy.primaryCta}</a>
              <div className="pf-mobile-foot">
                <Mail size={15} />
                <span>{copy.email}</span>
                <a href={`mailto:${PROFILE.email}`} dir="ltr">{PROFILE.email}</a>
              </div>
            </nav>
          </div>
        ) : null}
      </header>

      <section className="pf-hero" id="portfolio-home">
        <div className="pf-hero-copy" data-reveal>
          <h1>{copy.headlineA}<br /><span>{copy.headlineB}</span></h1>
          <p>{copy.intro}</p>
          <div className="pf-hero-actions">
            <a className="pf-btn pf-btn--primary" href="#contact">
              {copy.primaryCta}
              <ArrowDown size={16} />
            </a>
            <a className="pf-btn pf-btn--secondary" href="#work">{copy.secondaryCta}</a>
          </div>
        </div>

        <figure className="pf-hero-visual" data-reveal style={{ "--reveal-delay": "80ms" }}>
          <div className="pf-hero-frame">
            <img src={IMAGES.hero} alt={copy.heroAlt} loading="eager" fetchPriority="high" />
          </div>
          <figcaption>{copy.heroCaption}</figcaption>
        </figure>
      </section>

      <section className="pf-stack" aria-label={copy.stackLabel}>
        {STACK.map(({ name, slug }) => (
          <img
            key={slug}
            src={`https://cdn.simpleicons.org/${slug}/${isDark ? "8b9cff" : "1e3bff"}`}
            alt={name}
            width="24"
            height="24"
            loading="lazy"
          />
        ))}
      </section>

      <section className="pf-section pf-about" id="about">
        <div className="pf-about-grid">
          <div className="pf-about-copy" data-reveal>
            <h2>{copy.aboutTitle}</h2>
            <p>{copy.aboutText}</p>
            <div className="pf-facts">
              {copy.facts.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
          <figure className="pf-about-media" data-reveal style={{ "--reveal-delay": "100ms" }}>
            <img src={IMAGES.about} alt={copy.aboutAlt} loading="lazy" />
            <figcaption>{copy.aboutCaption}</figcaption>
          </figure>
        </div>
      </section>

      <section className="pf-section pf-work" id="work">
        <div className="pf-section-head" data-reveal>
          <h2>{copy.workTitle}</h2>
          <p>{copy.workText}</p>
        </div>
        <div className="pf-project-grid">
          {PROJECTS.map((project, index) => (
            <article
              key={project.key}
              className={`pf-project pf-project--${project.layout}`}
              data-reveal
              style={{ "--reveal-delay": `${index * 70}ms` }}
            >
              {project.image ? (
                <div className="pf-project-media">
                  <img src={project.image} alt={project.alt[lang]} loading="lazy" />
                </div>
              ) : (
                <div className="pf-project-cover" aria-hidden="true">
                  <span className="pf-cover-word">{project.cover}</span>
                  <span className="pf-cover-rule" />
                </div>
              )}
              <div className="pf-project-body">
                <span className="pf-project-category">{project.category[lang]}</span>
                <h3>{project.title}</h3>
                <p>{project.description[lang]}</p>
                <div className="pf-tags">
                  {project.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="pf-section pf-how" id="services">
        <div className="pf-section-head" data-reveal>
          <h2>{copy.howTitle}</h2>
          <p>{copy.howText}</p>
        </div>
        <div className="pf-how-grid">
          <div className="pf-services" data-reveal>
            <h3 className="pf-services-heading">{copy.servicesHeading}</h3>
            {SERVICES.map(({ icon: Icon, title, description }) => (
              <article className="pf-service" key={title.en}>
                <span className="pf-service-icon" aria-hidden="true"><Icon size={20} /></span>
                <div>
                  <h4>{title[lang]}</h4>
                  <p>{description[lang]}</p>
                </div>
              </article>
            ))}
          </div>
          <aside className="pf-process" data-reveal style={{ "--reveal-delay": "90ms" }}>
            <h3>{copy.processTitle}</h3>
            <ol>
              {STEPS.map((step) => (
                <li key={step.title.en}>
                  <h4>{step.title[lang]}</h4>
                  <p>{step.description[lang]}</p>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>

      <section className="pf-contact" id="contact">
        <div className="pf-contact-inner">
          <div className="pf-contact-copy" data-reveal>
            <h2>{copy.contactTitle}</h2>
            <p>{copy.contactText}</p>
            <div className="pf-contact-links">
              <a className="pf-contact-link" href={`mailto:${PROFILE.email}`}>
                <Mail size={17} />
                <span><small>{copy.email}</small><strong dir="ltr">{PROFILE.email}</strong></span>
                <ExternalLink size={14} />
              </a>
              <a className="pf-contact-link" href={`https://wa.me/${PROFILE.whatsapp}`} target="_blank" rel="noreferrer">
                <MessageCircle size={17} />
                <span><small>{copy.whatsapp}</small><strong dir="ltr">+{PROFILE.whatsapp}</strong></span>
                <ExternalLink size={14} />
              </a>
              <a className="pf-contact-link" href={PROFILE.github} target="_blank" rel="noreferrer">
                <GitBranch size={17} />
                <span><small>{copy.github}</small><strong dir="ltr">github.com/AGbreel</strong></span>
                <ExternalLink size={14} />
              </a>
              <a className="pf-contact-link" href={PROFILE.linkedin} target="_blank" rel="noreferrer">
                <Link2 size={17} />
                <span><small>{copy.linkedin}</small><strong dir="ltr">linkedin.com/in/ahmed-gbreel</strong></span>
                <ExternalLink size={14} />
              </a>
              <a className="pf-contact-link" href={`tel:${PROFILE.phone}`}>
                <Phone size={17} />
                <span><small>{copy.phone}</small><strong dir="ltr">{PROFILE.phone}</strong></span>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>

          <form className="pf-form" onSubmit={submitProject} data-reveal style={{ "--reveal-delay": "80ms" }}>
            <label>
              {copy.formName}
              <input name="name" required autoComplete="name" placeholder={copy.namePlaceholder} />
            </label>
            <label>
              {copy.formEmail}
              <input name="email" type="email" dir="ltr" required autoComplete="email" placeholder={copy.emailPlaceholder} />
            </label>
            <label>
              {copy.formType}
              <select name="type" required defaultValue="">
                <option value="" disabled>{copy.selectProject}</option>
                <option>{copy.website}</option>
                <option>{copy.ecommerce}</option>
                <option>{copy.admin}</option>
                <option>{copy.education}</option>
                <option>{copy.api}</option>
                <option>{copy.other}</option>
              </select>
            </label>
            <label>
              {copy.formBudget}
              <input name="budget" placeholder={copy.budgetPlaceholder} />
            </label>
            <label className="pf-form-full">
              {copy.formDetails}
              <textarea name="details" rows={4} required placeholder={copy.detailsPlaceholder} />
            </label>
            <button className="pf-form-submit" type="submit">
              {copy.formSubmit}
              <ArrowUpRight size={16} />
            </button>
            <small className="pf-form-note">{copy.formNote}</small>
          </form>
        </div>
      </section>

      <footer className="pf-footer">
        <a className="pf-footer-brand" href="#portfolio-home">
          <span className="pf-footer-mark" aria-hidden="true">AG</span>
          <span>{isArabic ? "أحمد جبريل" : "Ahmed Gbreel"}</span>
        </a>
        <p>© {new Date().getFullYear()} {copy.footer}</p>
        <a href="#portfolio-home">{copy.top} <ArrowUp size={14} /></a>
      </footer>
    </main>
  );
}
