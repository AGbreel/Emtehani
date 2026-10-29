import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  ExternalLink,
  FileQuestion,
  GraduationCap,
  LockKeyhole,
  Mail,
  Menu,
  Moon,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  Sun,
  TimerReset,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Badge, Button, Card, EmptyState, Logo, SectionHeading, StatusChip, useCountUp } from '../components/ui';

function GithubMark({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2.18c-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

function LinkedinMark({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm6.5 0h3.83v1.64h.05c.53-1 1.84-2.05 3.79-2.05 4.05 0 4.8 2.67 4.8 6.14V21h-4v-5.56c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94V21h-4V9Z" />
    </svg>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (delay = 0) => ({ opacity: 1, y: 0, transition: { delay, duration: 0.55, ease: [0.16, 1, 0.3, 1] } }),
};

const navLinks = [
  { href: '#features', label: 'المزايا' },
  { href: '#workflow', label: 'كيف يعمل' },
  { href: '#faq', label: 'الأسئلة' },
];

function InviteStat({ value, suffix, label }) {
  const number = useCountUp(typeof value === 'number' ? value : 0);
  return (
    <div className="min-w-0">
      <strong className="ui-number block font-display text-[clamp(1.6rem,3vw,2.2rem)] font-semibold leading-none tracking-[-0.05em] text-ink">
        {typeof value === 'number' ? number : value}
        {suffix ? <span className="text-primary">{suffix}</span> : null}
      </strong>
      <span className="mt-2 block text-[11.5px] font-semibold text-muted">{label}</span>
    </div>
  );
}

function LivePreview() {
  const reduce = useReducedMotion();
  const rows = [
    { name: "احمد جبريل", code: "482913", time: "04:12", status: "Active" },
    { name: "محمد العتيبي", code: "718204", time: "03:48", status: "Active" },
    { name: "ليان خالد", code: "650127", time: "02:55", status: "Submitted" },
    { name: "عمر الشمري", code: "913406", time: "--:--", status: "Waiting" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[36px] bg-primary-soft/80 blur-2xl dark:bg-primary-soft/50" />
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 18, rotate: -0.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ delay: 0.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="overflow-hidden rounded-[24px] border border-line bg-surface shadow-[0_30px_80px_-36px_rgba(15,23,42,.5)]"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-[9px] bg-primary text-white"><Radio size={14} /></span>
            <div>
              <p className="text-[10.5px] font-bold text-ink">مركز التحكم</p>
              <p className="text-[8.5px] text-muted">متابعة مباشرة</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-soft px-2 py-1 text-[8.5px] font-bold text-emerald">
            <span className="relative flex size-1.5"><span className="absolute size-full animate-ping rounded-full bg-emerald opacity-70" /><span className="relative size-1.5 rounded-full bg-emerald" /></span>
            الجلسة مفتوحة
          </span>
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-[15px] font-semibold tracking-[-0.03em] text-ink">اختبار الرياضيات · الوحدة الثالثة</h3>
              <p className="mt-1 text-[9px] text-muted">الصف الثالث الثانوي · 24 سؤالاً · 45 دقيقة</p>
            </div>
            <span className="ui-number rounded-[9px] border border-line bg-surface-soft px-2.5 py-1.5 text-[13px] font-bold text-primary">32:14</span>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              ['18', 'نشط'], ['12', 'سلّم'], ['06', 'ينتظر'],
            ].map(([value, label], index) => (
              <div key={label} className="rounded-[12px] border border-line bg-surface-soft px-2.5 py-2">
                <strong className={`ui-number block text-[17px] font-bold ${index === 0 ? 'text-emerald' : index === 1 ? 'text-blue' : 'text-warning'}`}>{value}</strong>
                <span className="text-[8px] text-muted">{label}</span>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-[14px] border border-line">
            {rows.map((row, index) => (
              <div key={row.code} className={`grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2.5 ${index ? 'border-t border-line' : ''}`}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-[8px] font-bold text-primary">{row.name.slice(0, 1)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[9.5px] font-bold text-ink">{row.name}</p>
                    <p className="ui-ltr text-[8px] tracking-wider text-subtle">#{row.code}</p>
                  </div>
                </div>
                <span className="ui-number text-[9px] font-semibold text-muted">{row.time}</span>
                <StatusChip status={row.status} showIcon={false} className="px-1.5 py-1 text-[7.5px]" />
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button type="button" tabIndex={-1} className="h-7 flex-1 rounded-[8px] border border-line bg-surface text-[8.5px] font-bold text-muted">إيقاف مؤقت</button>
            <button type="button" tabIndex={-1} className="h-7 flex-1 rounded-[8px] bg-primary text-[8.5px] font-bold text-white">إنهاء الجلسة</button>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.5 }}
        className="absolute -bottom-7 -right-3 hidden w-[190px] rounded-[16px] border border-line bg-surface p-3 shadow-[0_20px_50px_-28px_rgba(15,23,42,.5)] sm:block"
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold text-muted"><GraduationCap size={11} className="text-primary" />المرحلة والصف</div>
        <div className="flex items-center justify-between gap-2">
          <strong className="text-[12px] font-bold text-ink">ثانوي · الثالث الثانوي</strong>
          <span className="grid size-6 place-items-center rounded-full bg-emerald-soft text-emerald"><Check size={12} /></span>
        </div>
      </motion.div>

      <motion.div
        initial={reduce ? false : { opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.75, duration: 0.45 }}
        className="absolute -left-3 top-24 hidden items-center gap-2 rounded-[12px] border border-line bg-surface px-2.5 py-2 shadow-soft md:flex"
      >
        <span className="grid size-7 place-items-center rounded-[9px] bg-warning-soft text-warning"><TimerReset size={13} /></span>
        <div>
          <p className="text-[8px] text-muted">تمديد تلقائي</p>
          <p className="text-[9px] font-bold text-ink">+ 02:00 دقيقة</p>
        </div>
      </motion.div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description, className = '', tone = 'primary', children }) {
  const tones = {
    primary: 'bg-primary-soft text-primary',
    blue: 'bg-blue-soft text-blue',
    emerald: 'bg-emerald-soft text-emerald',
    warning: 'bg-warning-soft text-warning',
  };
  return (
    <Card className={`group relative overflow-hidden p-5 sm:p-6 ${className}`} hover>
      <div className={`mb-4 grid size-10 place-items-center rounded-[13px] ${tones[tone]}`}><Icon size={19} strokeWidth={1.9} /></div>
      <h3 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-[13px] leading-6 text-muted">{description}</p>
      {children}
    </Card>
  );
}

export default function LandingPage({ onLogin, onRegister, theme, onToggleTheme, onOpenPortfolio }) {
  const reduce = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <div className="min-h-dvh overflow-x-clip bg-canvas text-ink">
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled || menuOpen ? "border-b border-line bg-surface/90 backdrop-blur-xl" : "bg-transparent"}`}
      >
        <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="العودة إلى الأعلى"
          >
            <Logo />
          </button>
          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label="التنقل الرئيسي"
          >
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-[9px] px-3 py-2 text-[12.5px] font-semibold text-muted transition hover:bg-surface-soft hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
              className="grid size-9 place-items-center rounded-[10px] border border-line bg-surface text-muted transition hover:text-ink"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              type="button"
              onClick={onLogin}
              className="hidden h-9 items-center rounded-[10px] px-3 text-[12px] font-bold text-muted transition hover:bg-surface-soft hover:text-ink sm:inline-flex"
            >
              تسجيل الدخول
            </button>
            <Button
              size="sm"
              onClick={onRegister}
              className="hidden sm:inline-flex"
            >
              ابدأ مجاناً
            </Button>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"}
              className="grid size-9 place-items-center rounded-[10px] border border-line bg-surface text-ink md:hidden"
            >
              {menuOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {menuOpen ? (
            <motion.div
              className="border-t border-line bg-surface px-4 py-4 md:hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              <nav className="grid gap-1">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-[10px] px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface-soft hover:text-ink"
                  >
                    {link.label}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenPortfolio();
                  }}
                  className="flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-right text-sm font-semibold text-muted hover:bg-surface-soft"
                >
                  <ExternalLink size={15} />
                  ملف المطور
                </button>
              </nav>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogin();
                  }}
                >
                  تسجيل الدخول
                </Button>
                <Button
                  onClick={() => {
                    setMenuOpen(false);
                    onRegister();
                  }}
                >
                  ابدأ مجاناً
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      <main>
        <section className="relative isolate overflow-hidden pb-16 pt-[124px] sm:pb-20 sm:pt-[144px] lg:pb-24">
          <div className="pointer-events-none absolute inset-0 -z-20 ui-grid-bg opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
          <div className="pointer-events-none absolute -right-32 top-10 -z-10 size-[480px] rounded-full bg-primary-soft/70 blur-[110px] dark:bg-primary-soft/40" />
          <div className="pointer-events-none absolute -left-24 top-[330px] -z-10 size-[360px] rounded-full bg-blue-soft/80 blur-[100px] dark:bg-blue-soft/30" />

          <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.02fr_.98fr] lg:gap-10 lg:px-8">
            <div className="text-center lg:text-right">
              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={0.05}
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[10.5px] font-bold text-muted shadow-sm"
              >
                <span className="grid size-5 place-items-center rounded-full bg-emerald-soft text-emerald">
                  <Sparkles size={11} />
                </span>
                منصة امتحانات عربية صُممت للفصل الحديث
              </motion.div>

              <motion.h1
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={0.1}
                className="mx-auto max-w-[650px] font-display text-[clamp(2.35rem,5.5vw,4.25rem)] font-semibold leading-[1.18] tracking-[-0.055em] text-ink lg:mx-0"
              >
                امتحانات أونلاين
                <span className="relative mx-1.5 inline-block text-primary">
                  بتحكّم كامل
                  <svg
                    className="absolute -bottom-1.5 right-0 h-2.5 w-full text-primary/30"
                    viewBox="0 0 200 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 9C50 2 130 1 198 7"
                      stroke="currentColor"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                من أول دقيقة.
              </motion.h1>

              <motion.p
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={0.18}
                className="mx-auto mt-5 max-w-[540px] text-[13.5px] leading-8 text-muted sm:text-[15px] lg:mx-0"
              >
                أنشئ الامتحان، وحدّد مرحلته وصفه، افتح الجلسة، وتابع كل محاولة
                لحظة بلحظة. واجهة عربية واحدة، بدون تعقيد.
              </motion.p>

              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={0.26}
                className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row lg:justify-start"
              >
                <Button
                  size="lg"
                  onClick={onRegister}
                  iconEnd={ArrowLeft}
                  className="w-full sm:w-auto"
                >
                  ابدأ مجاناً
                </Button>
                <a
                  href="#workflow"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-line bg-surface px-6 text-sm font-bold text-ink shadow-soft transition hover:border-line-strong hover:bg-surface-soft sm:w-auto"
                >
                  <span className="grid size-6 place-items-center rounded-full bg-primary-soft text-primary">
                    <Play size={10} fill="currentColor" />
                  </span>
                  شاهد كيف يعمل
                </a>
              </motion.div>

              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={0.34}
                className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-semibold text-subtle lg:justify-start"
              >
                {[
                  "بدون تثبيت",
                  "واجهة RTL أصلية",
                  "تصحيح تلقائي",
                  "تصدير CSV",
                ].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald" />
                    {item}
                  </span>
                ))}
              </motion.div>
            </div>

            <div className="relative mt-2 lg:mt-0">
              <LivePreview />
            </div>
          </div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.55 }}
            className="mx-auto mt-16 max-w-[1100px] px-4 sm:px-6 lg:mt-20 lg:px-8"
          >
            <div className="grid grid-cols-2 gap-6 rounded-[22px] border border-line bg-surface/80 px-5 py-6 shadow-soft backdrop-blur-sm sm:grid-cols-4 sm:px-8">
              <InviteStat value={6} label="أنواع أسئلة جاهزة" />
              <InviteStat
                value={3}
                suffix=" ثوانٍ"
                label="تحديث لوحة المتابعة"
              />
              <InviteStat value="100%" label="واجهة عربية RTL" />
              <InviteStat value="CSV" label="تصدير النتائج والحضور" />
            </div>
          </motion.div>
        </section>

        <section id="features" className="scroll-mt-24 py-16 sm:py-20">
          <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="كل ما تحتاجه"
              title="من إنشاء الامتحان إلى آخر نتيجة."
              description="أدوات مترابطة تقلّل العمل اليدوي وتمنحك صورة واضحة عن الجلسة، بدون تبديل بين عشر أدوات."
            />

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={GraduationCap}
                title="ظهور حسب المرحلة والصف"
                description="لا روابط ولا أكواد يدوية. يرى الطالب امتحانات مدرسيه المطابقة لمرحلته وصفه فقط، ويبدأها من حسابه مباشرة."
                className="sm:col-span-2 lg:col-span-1"
                tone="primary"
              >
                <div className="mt-5 rounded-[13px] border border-line bg-surface-soft p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-muted">
                      المرحلة والصف
                    </span>
                    <Badge tone="emerald" dot>
                      مرتب بالحساب
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <strong className="text-[13px] font-bold text-ink">
                      ثانوي · الثالث الثانوي
                    </strong>
                    <span className="text-[9px] text-subtle">احمد جبريل</span>
                  </div>
                </div>
              </FeatureCard>

              <FeatureCard
                icon={Radio}
                title="غرفة انتظار منظّمة"
                description="يدخل الطلاب ويظهرون للمدرس قبل بدء الامتحان. لا يبدأ الوقت قبل أن تفتح الجلسة بنفسك."
                tone="emerald"
              >
                <div className="mt-5 flex items-center gap-2 rounded-[12px] bg-emerald-soft px-3 py-2.5 text-[9.5px] font-semibold text-emerald">
                  <span className="relative flex size-2">
                    <span className="absolute size-full animate-ping rounded-full bg-emerald opacity-60" />
                    <span className="relative size-2 rounded-full bg-emerald" />
                  </span>
                  18 طالباً في غرفة الانتظار
                </div>
              </FeatureCard>

              <FeatureCard
                icon={Zap}
                title="تحكّم فوري بالجلسة"
                description="افتح، أوقف مؤقتاً، استأنف، أو أنهِ الامتحان. الوقت الإضافي يُحسب تلقائياً عند الاستئناف."
                tone="warning"
              >
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {["فتح", "إيقاف", "استئناف", "إنهاء"].map((label, index) => (
                    <span
                      key={label}
                      className={`rounded-[7px] px-2 py-1 text-[8.5px] font-bold ${index === 0 ? "bg-primary text-white" : "border border-line bg-surface text-muted"}`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </FeatureCard>

              <FeatureCard
                icon={BarChart3}
                title="متابعة مباشرة"
                description="اعرف من بدأ، من سلّم، من انقطع، ومن ما زال في غرفة الانتظار، مع تحديث تلقائي كل 3 ثوانٍ."
                tone="blue"
              >
                <div className="mt-5 grid grid-cols-3 gap-1.5">
                  {[
                    ["18", "نشط"],
                    ["12", "سلّم"],
                    ["06", "ينتظر"],
                  ].map(([v, l]) => (
                    <div
                      key={l}
                      className="rounded-[10px] border border-line bg-surface-soft p-2 text-center"
                    >
                      <strong className="ui-number block text-sm text-ink">
                        {v}
                      </strong>
                      <span className="text-[8px] text-muted">{l}</span>
                    </div>
                  ))}
                </div>
              </FeatureCard>

              <FeatureCard
                icon={Download}
                title="نتائج قابلة للمشاركة"
                description="صدّر النتائج بصيغة CSV، أو راجع إجابات المقالات يدوياً من شاشة واحدة."
                tone="emerald"
              >
                <div className="mt-5 flex items-center justify-between rounded-[12px] border border-line bg-surface-soft px-3 py-2">
                  <span className="ui-ltr text-[9px] text-muted">
                    results_math.csv
                  </span>
                  <span className="grid size-6 place-items-center rounded-full bg-emerald-soft text-emerald">
                    <Download size={12} />
                  </span>
                </div>
              </FeatureCard>

              <FeatureCard
                icon={ShieldCheck}
                title="عدالة أكبر في التصحيح"
                description="تصحيح تلقائي فوري للاختيار من متعدد والصواب والخطأ، وقائمة منفصلة للمراجعة اليدوية."
                tone="primary"
              >
                <div className="mt-5 flex items-center justify-between rounded-[12px] border border-line bg-surface-soft px-3 py-2.5">
                  <span className="text-[9.5px] font-semibold text-muted">
                    الدرجة النهائية
                  </span>
                  <span className="ui-number rounded-[7px] bg-primary-soft px-2 py-1 text-[12px] font-bold text-primary">
                    48 / 50
                  </span>
                </div>
              </FeatureCard>
            </div>
          </div>
        </section>

        <section
          id="workflow"
          className="scroll-mt-24 border-y border-line bg-surface-soft/55 py-16 sm:py-20"
        >
          <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="ثلاث خطوات"
              title="من الفكرة إلى الجلسة المباشرة."
              description="لا تحتاج إعداداً طويلاً. أنشئ الامتحان، وانشره وافتح الجلسة عندما تكون جاهزاً."
              align="center"
            />
            <div className="relative mt-10 grid gap-4 md:grid-cols-3">
              <div className="absolute inset-x-[16%] top-8 hidden h-px bg-line md:block" />
              {[
                {
                  step: "01",
                  icon: FileQuestion,
                  title: "أنشئ الامتحان",
                  text: "أضف الأسئلة والدرجات والمدة، وحدّد موعد الجلسة إن أردت.",
                },
                {
                  step: "02",
                  icon: GraduationCap,
                  title: "مرحلة وصف دقيقان",
                  text: "حدّد المرحلة والصف عند إنشاء الامتحان، ولن يظهر إلا للطلاب المؤهلين المسجلين لديك.",
                },
                {
                  step: "03",
                  icon: Radio,
                  title: "افتح وتابع",
                  text: "افتح الجلسة، راقب الحضور والتسليم، وتحكّم بالوقت من لوحة واحدة.",
                },
              ].map((item) => (
                <motion.div
                  key={item.step}
                  initial={reduce ? false : { opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45 }}
                  className="relative rounded-card border border-line bg-surface p-5 shadow-soft"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-[14px] bg-primary text-white shadow-[0_12px_24px_-14px_var(--app-primary)]">
                      <item.icon size={20} />
                    </span>
                    <span className="ui-number font-display text-2xl font-semibold text-line-strong">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-[15px] font-semibold text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-muted">
                    {item.text}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 pb-16 sm:pb-20">
          <div className="mx-auto grid max-w-[1240px] gap-6 px-4 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:gap-12 lg:px-8">
            <div>
              <span className="mb-2.5 inline-flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] text-primary">
                <Sparkles size={13} />
                أسئلة سريعة
              </span>
              <h2 className="font-display text-[clamp(1.55rem,3vw,2.25rem)] font-semibold leading-[1.3] tracking-[-0.04em]">
                قبل أن تبدأ، هذه الإجابات.
              </h2>
              <p className="mt-2 text-[13.5px] leading-7 text-muted">
                لو احتجت تفاصيل أكثر، تواصل مباشرة مع فريق التطوير.
              </p>
              <a
                href="mailto:ahmedgbreel47@gmail.com"
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[11px] border border-line bg-surface px-3.5 py-2.5 text-[12px] font-bold text-ink shadow-soft transition hover:border-primary/40 hover:text-primary"
              >
                <Mail size={14} />
                راسلنا
              </a>
            </div>
            <div className="grid gap-2.5">
              {[
                [
                  "هل أحتاج تثبيت أي برنامج؟",
                  "لا. المنصة تعمل من المتصفح على الكمبيوتر أو الجوال. سجّل الدخول وابدأ.",
                ],
                [
                  "كيف يدخل الطالب الامتحان؟",
                  "بعد تسجيل الدخول تظهر للطالب امتحانات مدرسيه المطابقة لمرحلته وصفه. يختار الامتحان ليبدأ أو يستكمل محاولته مباشرة دون الحاجة إلى كود.",
                ],
                [
                  "هل يمكن إيقاف الامتحان مؤقتاً؟",
                  "نعم. عند الإيقاف يتوقف الوقت، وعند الاستئناف يُضاف زمن التوقف تلقائياً إلى وقت الطلاب.",
                ],
                [
                  "هل تصحح الأسئلة المقالية تلقائياً؟",
                  "الاختيار من متعدد والصواب والخطأ تُصحح تلقائياً. المقالات تظهر في قائمة مراجعة يدوية للمدرس.",
                ],
              ].map(([question, answer]) => (
                <details
                  key={question}
                  className="group rounded-[14px] border border-line bg-surface px-4 py-3.5 shadow-soft open:border-primary/25"
                >
                  <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-bold text-ink">
                    {question}
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-soft text-muted transition group-open:rotate-45 group-open:bg-primary-soft group-open:text-primary">
                      <span className="text-base leading-none">+</span>
                    </span>
                  </summary>
                  <p className="mt-2.5 border-t border-line pt-3 text-[13px] leading-7 text-muted">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-16 sm:pb-20">
          <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-[28px] bg-[#10172e] px-6 py-10 text-white shadow-[0_30px_80px_-40px_rgba(15,23,42,.8)] sm:px-10 sm:py-12 dark:bg-[#0a1120] dark:ring-1 dark:ring-line">
              <div className="pointer-events-none absolute -left-20 -top-28 size-72 rounded-full bg-primary/30 blur-[80px]" />
              <div className="pointer-events-none absolute -bottom-32 right-1/3 size-64 rounded-full bg-emerald/15 blur-[80px]" />
              <div className="relative grid items-center gap-6 lg:grid-cols-[1fr_auto]">
                <div className="max-w-xl">
                  <Badge tone="primary" className="bg-white/10 text-white">
                    ابدأ اليوم
                  </Badge>
                  <h2 className="mt-4 font-display text-[clamp(1.7rem,3.4vw,2.6rem)] font-semibold leading-[1.3] tracking-[-0.04em]">
                    جاهز تفتح أول جلسة امتحان؟
                  </h2>
                  <p className="mt-2 max-w-lg text-[13.5px] leading-7 text-white/75">
                    أنشئ حسابك، ابنِ الامتحان الأول، وجرّب غرفة الانتظار مع
                    طلابك. البداية لا تحتاج أكثر من دقائق.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                  <Button
                    size="lg"
                    onClick={onRegister}
                    iconEnd={ArrowLeft}
                    className="!bg-white !text-[#10172e] shadow-none hover:!bg-white/90"
                  >
                    ابدأ مجاناً
                  </Button>
                  <button
                    type="button"
                    onClick={onLogin}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-[14px] border border-white/20 px-6 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    لدي حساب
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_.6fr_.6fr_.8fr]">
            <div>
              <Logo />
              <p className="mt-3 max-w-[280px] text-[12.5px] leading-6 text-muted">
                منصة عربية للامتحانات الرقمية، تركّز على وضوح التجربة وتحكّم
                المدرس في كل خطوة.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <a
                  href="https://github.com/AGbreel"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="GitHub"
                  className="grid size-8 place-items-center rounded-[9px] border border-line text-muted transition hover:border-line-strong hover:text-ink"
                >
                  <GithubMark size={14} />
                </a>
                <a
                  href="https://www.linkedin.com/in/ahmed-gbreel-8465b0352/"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="LinkedIn"
                  className="grid size-8 place-items-center rounded-[9px] border border-line text-muted transition hover:border-line-strong hover:text-ink"
                >
                  <LinkedinMark size={14} />
                </a>
                <a
                  href="mailto:ahmedgbreel47@gmail.com"
                  aria-label="البريد الإلكتروني"
                  className="grid size-8 place-items-center rounded-[9px] border border-line text-muted transition hover:border-line-strong hover:text-ink"
                >
                  <Mail size={14} />
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-[12px] font-extrabold text-ink">المنصة</h3>
              <div className="mt-3 grid gap-2.5 text-[12px] text-muted">
                <a href="#features" className="transition hover:text-primary">
                  المزايا
                </a>
                <a href="#workflow" className="transition hover:text-primary">
                  كيف يعمل
                </a>
                <a href="#faq" className="transition hover:text-primary">
                  الأسئلة الشائعة
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-[12px] font-extrabold text-ink">الحساب</h3>
              <div className="mt-3 grid gap-2.5 text-[12px] text-muted">
                <button
                  type="button"
                  onClick={onLogin}
                  className="text-right transition hover:text-primary"
                >
                  تسجيل الدخول
                </button>
                <button
                  type="button"
                  onClick={onRegister}
                  className="text-right transition hover:text-primary"
                >
                  حساب جديد
                </button>
                <button
                  type="button"
                  onClick={onOpenPortfolio}
                  className="text-right transition hover:text-primary"
                >
                  ملف المطور
                </button>
              </div>
            </div>
            <div>
              <h3 className="text-[12px] font-extrabold text-ink">تواصل</h3>
              <div className="mt-3 grid gap-2.5 text-[12px] text-muted">
                <a
                  href="mailto:ahmedgbreel47@gmail.com"
                  className="ui-ltr text-left transition hover:text-primary"
                >
                  ahmedgbreel47@gmail.com
                </a>
                <span className="inline-flex items-center gap-1 text-emerald">
                  <ShieldCheck size={11} />
                  بيانات الدخول محمية
                </span>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-line pt-5 text-[11px] text-subtle sm:flex-row">
            <span>
              © {new Date().getFullYear()} امتحاني. جميع الحقوق محفوظة.
            </span>
            <span>
              صُنع بعناية للفصول العربية ·{" "}
              <button
                type="button"
                onClick={onOpenPortfolio}
                className="font-bold text-muted hover:text-primary"
              >
                Ahmed Gbreel
              </button>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
