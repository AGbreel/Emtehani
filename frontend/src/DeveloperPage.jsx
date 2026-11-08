import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Braces,
  BriefcaseBusiness,
  Code2,
  Cpu,
  Database,
  ExternalLink,
  GitBranch,
  Globe2,
  GraduationCap,
  Link2,
  Mail,
  Menu,
  MessageCircle,
  Moon,
  Palette,
  Phone,
  Rocket,
  Smartphone,
  Sparkles,
  Sun,
  Terminal,
  Workflow,
  X,
} from "lucide-react";
import { assetUrl, request } from "./lib/api";
import { clonePortfolio, mergePortfolio } from "./developerPortfolio";
import "./DeveloperPage.css";

const SERVICE_ICONS = {
  code: Code2,
  workflow: Workflow,
  briefcase: BriefcaseBusiness,
  rocket: Rocket,
  database: Database,
  sparkles: Sparkles,
  mobile: Smartphone,
  design: Palette,
  globe: Globe2,
  terminal: Terminal,
  cpu: Cpu,
  braces: Braces,
};

const UI = {
  ar: {
    navAbout: "نبذة",
    navWork: "المشاريع",
    navServices: "الخدمات",
    navContact: "تواصل",
    primaryCta: "ناقش مشروعك",
    secondaryCta: "شاهد الأعمال",
    stackLabel: "أدوات أعمل بها",
    servicesHeading: "ما أقدمه",
    processTitle: "طريقة العمل",
    yearsLabel: "سنوات خبرة",
    projectsLabel: "مشروع منشور",
    techLabel: "تقنية في حزمتي",
    viewProject: "زيارة المشروع",
    viewCode: "الكود",
    noProjects: "أضف أول مشروع من لوحة الإدارة ليظهر هنا.",
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
    footer: "جميع الحقوق محفوظة.",
    top: "إلى الأعلى",
    back: "العودة إلى منصة امتحاني",
    switchLanguage: "Switch to English",
    light: "تفعيل الوضع الفاتح",
    dark: "تفعيل الوضع الداكن",
  },
  en: {
    navAbout: "About",
    navWork: "Work",
    navServices: "Services",
    navContact: "Contact",
    primaryCta: "Discuss your project",
    secondaryCta: "See the work",
    stackLabel: "Tools I work with",
    servicesHeading: "What I do",
    processTitle: "The process",
    yearsLabel: "Years of experience",
    projectsLabel: "Shipped projects",
    techLabel: "Tools in my stack",
    viewProject: "Visit project",
    viewCode: "Source code",
    noProjects: "The first project will appear here once it is added from the dashboard.",
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
    footer: "All rights reserved.",
    top: "Back to top",
    back: "Back to Emtehani",
    switchLanguage: "التبديل إلى العربية",
    light: "Switch to light mode",
    dark: "Switch to dark mode",
  },
};

const CODE_GLYPHS = ["</>", "{ }", "=>", "const", "( )", "npm run dev", "0101"];

function text(value, lang) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[lang] || value.ar || value.en || "";
}

function safeHref(value) {
  const next = (value || "").trim();
  if (!next) return "";
  if (/^https?:\/\//i.test(next) || /^(mailto|tel):/i.test(next)) return next;
  return "";
}

function safeImage(value) {
  const next = (value || "").trim();
  if (!next) return "";
  if (/^https?:\/\//i.test(next) || next.startsWith("/")) return assetUrl(next);
  return "";
}

function displayUrl(value) {
  return (value || "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

function digits(value) {
  return (value || "").replace(/\D/g, "");
}

function initialsOf(profile) {
  const source = profile?.nameEn || profile?.name || "AG";
  return source.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "AG";
}

export default function DeveloperPage({ onBack, theme = "dark", onThemeChange }) {
  const [language, setLanguage] = useState("ar");
  const [menuOpen, setMenuOpen] = useState(false);
  const [portfolio, setPortfolio] = useState(() => clonePortfolio());
  const [progress, setProgress] = useState(0);
  const previousOverflowRef = useRef("");
  const glowRef = useRef(null);
  const isArabic = language === "ar";
  const lang = isArabic ? "ar" : "en";
  const ui = UI[lang];
  const isDark = theme === "dark";

  const profile = portfolio.profile || {};
  const hero = portfolio.hero || {};
  const about = portfolio.about || {};
  const work = portfolio.work || {};
  const how = portfolio.how || {};
  const contact = portfolio.contact || {};
  const projects = Array.isArray(portfolio.projects) ? portfolio.projects : [];
  const services = Array.isArray(portfolio.services) ? portfolio.services : [];
  const steps = Array.isArray(portfolio.steps) ? portfolio.steps : [];
  const stack = Array.isArray(portfolio.stack) ? portfolio.stack.filter((item) => item?.name) : [];
  const facts = Array.isArray(about.facts) ? about.facts : [];
  const avatar = safeImage(profile.avatarUrl);
  const whatsapp = digits(profile.whatsapp);
  const availability = text(profile.availability, lang);

  useEffect(() => {
    let alive = true;
    request("/api/developer/portfolio")
      .then((result) => {
        if (alive && result?.data) setPortfolio(mergePortfolio(result.data));
      })
      .catch(() => { /* the default document keeps the page usable offline */ });
    return () => { alive = false; };
  }, []);

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
  }, [language, portfolio]);

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

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frame = 0;
    const move = (event) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        glowRef.current?.style.setProperty("--x", `${event.clientX}px`);
        glowRef.current?.style.setProperty("--y", `${event.clientY}px`);
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

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

  function tilt(event) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty("--rx", `${(-y * 4).toFixed(2)}deg`);
    node.style.setProperty("--ry", `${(x * 5).toFixed(2)}deg`);
  }

  function resetTilt(event) {
    event.currentTarget.style.setProperty("--rx", "0deg");
    event.currentTarget.style.setProperty("--ry", "0deg");
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
    const message = `Hello ${profile.nameEn || "Ahmed"}, I'd like to discuss a project:\n${fields.join("\n")}`;
    window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  const navLinks = [
    { href: "#about", label: ui.navAbout },
    { href: "#work", label: ui.navWork },
    { href: "#services", label: ui.navServices },
    { href: "#contact", label: ui.navContact },
  ];

  const contactLinks = [
    { key: "email", icon: Mail, label: ui.email, value: profile.email, href: profile.email ? `mailto:${profile.email}` : "" },
    { key: "whatsapp", icon: MessageCircle, label: ui.whatsapp, value: whatsapp ? `+${whatsapp}` : "", href: whatsapp ? `https://wa.me/${whatsapp}` : "" },
    { key: "github", icon: GitBranch, label: ui.github, value: displayUrl(profile.github), href: safeHref(profile.github) },
    { key: "linkedin", icon: Link2, label: ui.linkedin, value: displayUrl(profile.linkedin), href: safeHref(profile.linkedin) },
    { key: "phone", icon: Phone, label: ui.phone, value: profile.phone, href: profile.phone ? `tel:${digits(profile.phone)}` : "" },
  ].filter((item) => item.href && item.value);

  const marqueeStack = stack.length ? [...stack, ...stack] : [];

  return (
    <main
      className={`portfolio-page ${isDark ? "is-dark" : "is-light"}`}
      dir={isArabic ? "rtl" : "ltr"}
      lang={lang}
    >
      <div className="pf-bg" aria-hidden="true">
        <span className="pf-grid" />
        <span className="pf-orb pf-orb--a" />
        <span className="pf-orb pf-orb--b" />
        <span className="pf-orb pf-orb--c" />
        {CODE_GLYPHS.map((glyph, index) => (
          <span key={glyph} className={`pf-glyph pf-glyph--${index + 1}`}>{glyph}</span>
        ))}
      </div>
      <div className="pf-glow" ref={glowRef} aria-hidden="true" />
      <span className="pf-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />

      <div className="pf-content">
        <header className="pf-nav">
          <div className="pf-nav-inner">
            <a className="pf-brand" href="#portfolio-home" onClick={menuOpen ? closeMenu : undefined} aria-label={`${profile.name || "Ahmed Gbreel"} — ${isArabic ? "الصفحة الرئيسية" : "home"}`}>
              <span className="pf-brand-mark" aria-hidden="true">{initialsOf(profile)}</span>
              <span className="pf-brand-copy">
                <strong>{text(profile.name, lang)}</strong>
                <small>Full Stack Developer</small>
              </span>
            </a>

            <nav className="pf-links" aria-label={isArabic ? "التنقل الرئيسي" : "Main navigation"}>
              {navLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
            </nav>

            <div className="pf-actions">
              <a className="pf-nav-cta" href="#contact">{ui.primaryCta}</a>
              <button type="button" className="pf-icon pf-icon--text" onClick={switchLanguage} aria-label={ui.switchLanguage}>
                {isArabic ? "EN" : "عربي"}
              </button>
              <button type="button" className="pf-icon" onClick={toggleTheme} aria-label={isDark ? ui.light : ui.dark}>
                {isDark ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              {onBack ? (
                <button type="button" className="pf-icon" onClick={onBack} aria-label={ui.back} title={ui.back}>
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
                <a className="pf-mobile-cta" href="#contact" onClick={closeMenu}>{ui.primaryCta}</a>
                <div className="pf-mobile-foot">
                  <Mail size={15} />
                  <span>{ui.email}</span>
                  <a href={`mailto:${profile.email}`} dir="ltr">{profile.email}</a>
                </div>
              </nav>
            </div>
          ) : null}
        </header>

        <section className="pf-hero" id="portfolio-home">
          <div className="pf-hero-copy" data-reveal>
            {availability ? (
              <span className="pf-eyebrow"><span className="pf-live-dot" />{availability}</span>
            ) : null}
            <h1>{text(hero.headlineA, lang)}<br /><span>{text(hero.headlineB, lang)}</span></h1>
            <p>{text(hero.intro, lang)}</p>
            <div className="pf-hero-actions">
              <a className="pf-btn pf-btn--primary" href="#contact">
                {ui.primaryCta}
                <ArrowDown size={16} />
              </a>
              <a className="pf-btn pf-btn--secondary" href="#work">{ui.secondaryCta}</a>
            </div>
            <div className="pf-hero-stats">
              <div><strong>{profile.experienceYears || "2+"}</strong><span>{ui.yearsLabel}</span></div>
              <div><strong>{projects.length}</strong><span>{ui.projectsLabel}</span></div>
              <div><strong>{stack.length}</strong><span>{ui.techLabel}</span></div>
            </div>
          </div>

          <figure
            className="pf-portrait"
            data-reveal
            style={{ "--reveal-delay": "90ms" }}
            onPointerMove={tilt}
            onPointerLeave={resetTilt}
          >
            <div className="pf-portrait-card">
              <span className="pf-portrait-beam" aria-hidden="true" />
              <div className="pf-portrait-photo">
                {avatar ? (
                  <img src={avatar} alt={text(profile.name, lang)} loading="eager" fetchPriority="high" />
                ) : (
                  <span className="pf-portrait-initials">{initialsOf(profile)}</span>
                )}
                <span className="pf-portrait-shade" aria-hidden="true" />
              </div>
              {stack[0]?.name ? <span className="pf-chip pf-chip--a">{stack[0].name}</span> : null}
              {stack[3]?.name ? <span className="pf-chip pf-chip--b">{stack[3].name}</span> : null}
              <span className="pf-chip pf-chip--c"><GraduationCap size={12} />{profile.graduation || "2025"}</span>
              <div className="pf-terminal" aria-hidden="true">
                <div className="pf-terminal-bar"><i /><i /><i /><span>developer.ts</span></div>
                <pre>{`const dev = {
  name: "${profile.nameEn || "Ahmed"}",
  stack: ["React", "ASP.NET"],
  ships: true,
};`}<span className="pf-cursor" /></pre>
              </div>
            </div>
            <figcaption>{text(hero.caption, lang)}</figcaption>
          </figure>
        </section>

        {marqueeStack.length ? (
          <section className="pf-stack" aria-label={ui.stackLabel}>
            <div className="pf-stack-track">
              {marqueeStack.map((item, index) => (
                <span className="pf-stack-item" key={`${item.slug || item.name}-${index}`}>
                  {item.slug ? (
                    <img
                      src={`https://cdn.simpleicons.org/${encodeURIComponent(item.slug || item.name)}/${isDark ? "9fb0ff" : "1e3bff"}`}
                      alt=""
                      width="22"
                      height="22"
                      loading="lazy"
                      onError={(event) => { event.currentTarget.style.display = "none"; }}
                    />
                  ) : null}
                  <span>{item.name}</span>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="pf-section pf-about" id="about">
          <div className="pf-about-grid">
            <div className="pf-about-copy" data-reveal>
              <h2>{text(about.title, lang)}</h2>
              <p>{text(about.text, lang)}</p>
              {facts.length ? (
                <div className="pf-facts">
                  {facts.map((fact, index) => (
                    <div key={`${text(fact.label, lang)}-${index}`}>
                      <span>{text(fact.label, lang)}</span>
                      <strong>{text(fact.value, lang)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <figure className="pf-about-media" data-reveal style={{ "--reveal-delay": "100ms" }}>
              {safeImage(about.imageUrl) ? (
                <div className="pf-about-frame">
                  <img src={safeImage(about.imageUrl)} alt={text(about.caption, lang)} loading="lazy" />
                  <span className="pf-about-badge"><GraduationCap size={14} />{profile.graduation || "2025"}</span>
                </div>
              ) : (
                <div className="pf-code-card" aria-hidden="true">
                  <div className="pf-terminal-bar"><i /><i /><i /><span>about.md</span></div>
                  <pre>{`# ${profile.nameEn || "Ahmed Gbreel"}
role: Full Stack Developer
focus: web · APIs · education
building: clear products that last`}</pre>
                </div>
              )}
              <figcaption>{text(about.caption, lang)}</figcaption>
            </figure>
          </div>
        </section>

        <section className="pf-section pf-work" id="work">
          <div className="pf-section-head" data-reveal>
            <h2>{text(work.title, lang)}</h2>
            <p>{text(work.text, lang)}</p>
          </div>
          {projects.length ? (
            <div className="pf-project-grid">
              {projects.map((project, index) => {
                const projectLink = safeHref(project.link);
                const repoLink = safeHref(project.repo);
                const projectImage = safeImage(project.imageUrl);
                const layout = ["featured", "standard", "wide"].includes(project.layout) ? project.layout : "standard";
                return (
                  <article
                    key={project.id || `${project.title}-${index}`}
                    className={`pf-project pf-project--${layout}`}
                    data-reveal
                    style={{ "--reveal-delay": `${index * 70}ms` }}
                  >
                    {projectImage ? (
                      <div className="pf-project-media">
                        <img src={projectImage} alt={text(project.alt, lang) || project.title} loading="lazy" />
                      </div>
                    ) : (
                      <div className="pf-project-cover" aria-hidden="true">
                        <span className="pf-cover-word">{project.cover || "CODE"}</span>
                        <span className="pf-cover-rule" />
                        <span className="pf-cover-scan" />
                      </div>
                    )}
                    <div className="pf-project-body">
                      <div className="pf-project-top">
                        <span className="pf-project-category">{text(project.category, lang)}</span>
                        {project.year ? <span className="pf-project-year">{project.year}</span> : null}
                      </div>
                      <h3>{project.title}</h3>
                      <p>{text(project.description, lang)}</p>
                      {Array.isArray(project.tags) && project.tags.length ? (
                        <div className="pf-tags">
                          {project.tags.map((tag, tagIndex) => <span key={`${tag}-${tagIndex}`}>{tag}</span>)}
                        </div>
                      ) : null}
                      {projectLink || repoLink ? (
                        <div className="pf-project-actions">
                          {projectLink ? (
                            <a href={projectLink} target="_blank" rel="noreferrer">
                              {ui.viewProject}<ArrowUpRight size={14} />
                            </a>
                          ) : null}
                          {repoLink ? (
                            <a href={repoLink} target="_blank" rel="noreferrer">
                              {ui.viewCode}<GitBranch size={14} />
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="pf-empty">{ui.noProjects}</p>
          )}
        </section>

        {services.length || steps.length ? (
          <section className="pf-section pf-how" id="services">
            <div className="pf-section-head" data-reveal>
              <h2>{text(how.title, lang)}</h2>
              <p>{text(how.text, lang)}</p>
            </div>
            <div className="pf-how-grid">
              {services.length ? (
                <div className="pf-services" data-reveal>
                  <h3 className="pf-services-heading">{ui.servicesHeading}</h3>
                  {services.map((service, index) => {
                    const Icon = SERVICE_ICONS[service.icon] || Code2;
                    return (
                      <article className="pf-service" key={`${text(service.title, lang)}-${index}`}>
                        <span className="pf-service-icon" aria-hidden="true"><Icon size={20} /></span>
                        <div>
                          <h4>{text(service.title, lang)}</h4>
                          <p>{text(service.description, lang)}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
              {steps.length ? (
                <aside className="pf-process" data-reveal style={{ "--reveal-delay": "90ms" }}>
                  <h3>{ui.processTitle}</h3>
                  <ol>
                    {steps.map((step, index) => (
                      <li key={`${text(step.title, lang)}-${index}`}>
                        <span className="pf-step-num">{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <h4>{text(step.title, lang)}</h4>
                          <p>{text(step.description, lang)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </aside>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="pf-contact" id="contact">
          <div className="pf-contact-inner">
            <div className="pf-contact-copy" data-reveal>
              <h2>{text(contact.title, lang)}</h2>
              <p>{text(contact.text, lang)}</p>
              <div className="pf-contact-links">
                {contactLinks.map(({ key, icon: Icon, label, value, href }) => (
                  <a
                    className="pf-contact-link"
                    key={key}
                    href={href}
                    {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                  >
                    <Icon size={17} />
                    <span><small>{label}</small><strong dir="ltr">{value}</strong></span>
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
            </div>

            <form className="pf-form" onSubmit={submitProject} data-reveal style={{ "--reveal-delay": "80ms" }}>
              <label>
                {ui.formName}
                <input name="name" required autoComplete="name" placeholder={ui.namePlaceholder} />
              </label>
              <label>
                {ui.formEmail}
                <input name="email" type="email" dir="ltr" required autoComplete="email" placeholder={ui.emailPlaceholder} />
              </label>
              <label>
                {ui.formType}
                <select name="type" required defaultValue="">
                  <option value="" disabled>{ui.selectProject}</option>
                  <option>{ui.website}</option>
                  <option>{ui.ecommerce}</option>
                  <option>{ui.admin}</option>
                  <option>{ui.education}</option>
                  <option>{ui.api}</option>
                  <option>{ui.other}</option>
                </select>
              </label>
              <label>
                {ui.formBudget}
                <input name="budget" placeholder={ui.budgetPlaceholder} />
              </label>
              <label className="pf-form-full">
                {ui.formDetails}
                <textarea name="details" rows={4} required placeholder={ui.detailsPlaceholder} />
              </label>
              <button className="pf-form-submit" type="submit">
                {ui.formSubmit}
                <ArrowUpRight size={16} />
              </button>
              <small className="pf-form-note">{text(contact.formNote, lang)}</small>
            </form>
          </div>
        </section>

        <footer className="pf-footer">
          <a className="pf-footer-brand" href="#portfolio-home">
            <span className="pf-footer-mark" aria-hidden="true">{initialsOf(profile)}</span>
            <span>{text(profile.name, lang)}</span>
          </a>
          <p>© {new Date().getFullYear()} {text(profile.name, lang)}. {ui.footer}</p>
          <a href="#portfolio-home">{ui.top} <ArrowUp size={14} /></a>
        </footer>
      </div>
    </main>
  );
}
