import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, ExternalLink,
  GitBranch, Link2, Mail, Menu, MessageCircle, Moon, Phone, Sun, X,
} from "lucide-react";
import { PROFILE, IMAGES, STACK, PROJECTS, SERVICES, STEPS, COPY } from "./developerData.js";
import "./DeveloperPage.css";

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
    const message = `${PROFILE.inquiryGreeting}\n${fields.join("\n")}`;
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
          <a className="pf-brand" href="#portfolio-home" onClick={menuOpen ? closeMenu : undefined} aria-label={isArabic ? `${PROFILE.nameAr}، الصفحة الرئيسية` : `${PROFILE.name}, home`}>
            <span className="pf-brand-mark" aria-hidden="true">{PROFILE.initials}</span>
            <span className="pf-brand-copy">
              <strong>{isArabic ? PROFILE.nameAr : PROFILE.name}</strong>
              <small>{PROFILE.shortRole}</small>
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
            <img className="translate-y-2" src={IMAGES.hero} alt={copy.heroAlt} loading="eager" fetchPriority="high" />
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
                <span><small>{copy.github}</small><strong dir="ltr">{PROFILE.githubLabel}</strong></span>
                <ExternalLink size={14} />
              </a>
              <a className="pf-contact-link" href={PROFILE.linkedin} target="_blank" rel="noreferrer">
                <Link2 size={17} />
                <span><small>{copy.linkedin}</small><strong dir="ltr">{PROFILE.linkedinLabel}</strong></span>
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
          <span className="pf-footer-mark" aria-hidden="true">{PROFILE.initials}</span>
          <span>{isArabic ? PROFILE.nameAr : PROFILE.name}</span>
        </a>
        <p>© {new Date().getFullYear()} {copy.footer}</p>
        <a href="#portfolio-home">{copy.top} <ArrowUp size={14} /></a>
      </footer>
    </main>
  );
}
