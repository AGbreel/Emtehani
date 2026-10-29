import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  BookOpen,
  BookOpenCheck,
  ClipboardCheck,
  ExternalLink,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  PlusCircle,
  Sun,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Avatar, cn, IconButton, Logo, StatusChip } from './ui';

const teacherNav = [
  { key: 'dashboard', label: 'مركز التحكم', shortLabel: 'المركز', icon: LayoutDashboard },
  { key: 'exams', label: 'الامتحانات', shortLabel: 'اختبارات', icon: FileText },
  { key: 'create', label: 'إنشاء امتحان', shortLabel: 'إنشاء', icon: PlusCircle },
  { key: 'results', label: 'النتائج', icon: BarChart3 },
  { key: 'essays', label: 'مراجعة المقالات', icon: ClipboardCheck },
  { key: 'requests', label: 'طلبات الطلاب', icon: UserRound },
  { key: 'students', label: 'إدارة الطلاب', shortLabel: 'الطلاب', icon: Users },
  { key: 'audit', label: 'سجل النشاط', icon: History },
];

const studentNav = [
  { key: 'dashboard', label: 'نظرة عامة', shortLabel: 'الرئيسية', icon: LayoutDashboard },
  { key: 'available', label: 'الامتحانات المتاحة', shortLabel: 'المتاحة', icon: BookOpenCheck },
  { key: 'results', label: 'نتائجي', icon: BarChart3 },
  { key: 'teachers', label: 'المدرسون', icon: GraduationCap },
];

const pageMeta = {
  dashboard: { title: 'مركز التحكم', eyebrow: 'مساحة العمل' },
  exams: { title: 'الامتحانات', eyebrow: 'إدارة المحتوى' },
  create: { title: 'إنشاء امتحان', eyebrow: 'بناء جديد' },
  'exam-detail': { title: 'تفاصيل الامتحان', eyebrow: 'إدارة الجلسة' },
  results: { title: 'النتائج والتحليلات', eyebrow: 'متابعة الأداء' },
  essays: { title: 'مراجعة المقالات', eyebrow: 'تصحيح يدوي' },
  requests: { title: 'طلبات الطلاب', eyebrow: 'إدارة التسجيل' },
  students: { title: 'إدارة الطلاب', eyebrow: 'متابعة الطلاب' },
  teachers: { title: 'المدرسون', eyebrow: 'اختيار المدرس' },
  audit: { title: 'سجل النشاط', eyebrow: 'تتبع العمليات' },
  available: { title: 'الامتحانات المتاحة', eyebrow: 'بوابة الطالب' },
  lobby: { title: 'غرفة الانتظار', eyebrow: 'الامتحان' },
  take: { title: 'أداء الامتحان', eyebrow: 'جلسة نشطة' },
  review: { title: 'مراجعة المحاولة', eyebrow: 'النتائج' },
  'essay-review': { title: 'تصحيح المحاولة', eyebrow: 'مراجعة يدوية' },
};

function NavButton({ item, active, onClick, compact = false }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-right text-[13px] font-semibold transition',
        active ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-soft hover:text-ink',
        compact && 'justify-center px-1 py-2',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.9} className="shrink-0" />
      <span className={cn('flex-1 truncate', compact && 'sr-only')}>{item.label}</span>
      {active ? <motion.span layoutId="nav-active" className="absolute inset-y-2 right-0 w-[3px] rounded-full bg-primary" /> : null}
    </button>
  );
}

function SidebarContent({ user, nav, activePage, onNavigate, onLogout, onClose, theme, onToggleTheme }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-5 pt-5">
        <button type="button" onClick={() => onNavigate('dashboard')} className="rounded-lg"><Logo /></button>
        <IconButton label="إغلاق القائمة" onClick={onClose} className="lg:hidden"><X size={17} /></IconButton>
      </div>

      <div className="mx-4 mb-5 flex items-center gap-3 rounded-[16px] border border-line bg-surface-soft p-3">
        <Avatar name={user?.fullName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-ink">{user?.fullName || 'مستخدم امتحاني'}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
            <UserRound size={11} />
            {user?.role === 'Teacher' ? 'حساب مدرس' : 'حساب طالب'}
          </div>
        </div>
        <StatusChip status="Active" showIcon={false} className="px-2 py-1 text-[10px]" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        <p className="mb-2 px-3 text-[10.5px] font-extrabold tracking-[0.16em] text-subtle">القائمة الرئيسية</p>
        <div className="grid gap-1">
          {nav.map((item) => (
            <NavButton key={item.key} item={item} active={activePage === item.key} onClick={() => { onNavigate(item.key); onClose?.(); }} />
          ))}
        </div>

        <div className="my-4 border-t border-line" />
        <p className="mb-2 px-3 text-[10.5px] font-extrabold tracking-[0.16em] text-subtle">روابط سريعة</p>
        <button type="button" onClick={() => onNavigate('portfolio')} className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-right text-[13px] font-semibold text-muted transition hover:bg-surface-soft hover:text-ink">
          <ExternalLink size={17} />
          <span className="flex-1">ملف المطور</span>
        </button>
        <a href="mailto:ahmedgbreel47@gmail.com" className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13px] font-semibold text-muted transition hover:bg-surface-soft hover:text-ink">
          <LifeBuoy size={17} />
          <span className="flex-1">المساعدة والدعم</span>
        </a>
      </nav>

      <div className="border-t border-line p-4">
        <div className="mb-3 rounded-[16px] border border-primary/15 bg-primary-soft p-3.5">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-bold text-primary"><BookOpen size={14} /> إعدادات العرض</div>
          <p className="text-[11px] leading-5 text-muted">بدّل بين الوضع الفاتح والداكن حسب راحتك.</p>
          <button type="button" onClick={onToggleTheme} className="mt-2.5 inline-flex min-h-9 items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-[11.5px] font-bold text-ink shadow-sm">
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            {theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
          </button>
        </div>
        <button type="button" onClick={onLogout} className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13px] font-semibold text-muted transition hover:bg-danger-soft hover:text-danger">
          <LogOut size={17} />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}

export default function AppShell({ user, page, activePage, title, subtitle, children, onNavigate, onLogout, theme, onToggleTheme }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = user?.role === 'Teacher' ? teacherNav : studentNav;
  const meta = pageMeta[page] || pageMeta.dashboard;
  const visibleNav = nav.slice(0, 4);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <a href="#main-content" className="fixed right-4 top-4 z-[100] -translate-y-24 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-card transition focus:translate-y-0">تجاوز إلى المحتوى</a>
      <aside className="fixed inset-y-0 right-0 z-40 hidden w-[280px] border-l border-line bg-surface lg:block">
        <SidebarContent user={user} nav={nav} activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} />
      </aside>

      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.button type="button" aria-label="إغلاق القائمة" className="fixed inset-0 z-50 bg-[rgba(3,7,18,.5)] backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside role="dialog" aria-modal="true" aria-label="قائمة التنقل" className="fixed inset-y-0 right-0 z-[60] w-[min(88vw,310px)] border-l border-line bg-surface shadow-2xl lg:hidden" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 360, damping: 34 }}>
              <SidebarContent user={user} nav={nav} activePage={activePage} onNavigate={onNavigate} onLogout={onLogout} onClose={() => setMobileOpen(false)} theme={theme} onToggleTheme={onToggleTheme} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="lg:mr-[280px]">
        <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--app-bg)_88%,transparent)] backdrop-blur-xl">
          <div className="mx-auto flex h-[68px] max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2.5">
              <IconButton label="فتح القائمة" onClick={() => setMobileOpen(true)} className="lg:hidden"><Menu size={18} /></IconButton>
              <div className="min-w-0">
                <p className="truncate text-[10.5px] font-extrabold tracking-[0.16em] text-primary">{meta.eyebrow}</p>
                <h1 className="truncate font-display text-[1.1rem] font-semibold tracking-[-0.02em] text-ink sm:text-[1.2rem]">{title || meta.title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <IconButton label={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'} onClick={onToggleTheme} className="hidden sm:grid">
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </IconButton>
              <button type="button" onClick={() => onNavigate('portfolio')} className="hidden h-9 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[11px] font-bold text-muted transition hover:border-line-strong hover:text-ink sm:inline-flex">
                <ExternalLink size={13} />
                ملف المطور
              </button>
              <div className="mx-1 hidden h-6 w-px bg-line sm:block" />
              <div className="flex items-center gap-2 rounded-[12px] border border-line bg-surface py-1 pe-2.5 ps-1">
                <Avatar name={user?.fullName} size="sm" />
                <div className="hidden min-w-0 sm:block">
                  <p className="max-w-[120px] truncate text-[11.5px] font-bold leading-tight text-ink">{user?.fullName}</p>
                  <p className="text-[10px] text-muted">{user?.role === 'Teacher' ? 'مدرس' : 'طالب'}</p>
                </div>
                <button type="button" onClick={onLogout} aria-label="تسجيل الخروج" title="تسجيل الخروج" className="ms-1 text-subtle transition hover:text-danger"><LogOut size={14} /></button>
              </div>
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 pb-28 pt-5 outline-none sm:px-6 sm:pt-6 lg:px-8 lg:pb-10">
          {subtitle ? <p className="mb-5 max-w-2xl text-[12px] leading-6 text-muted">{subtitle}</p> : null}
          {children}
        </main>

        <footer className="hidden border-t border-line px-8 py-5 text-[11px] text-subtle lg:flex lg:items-center lg:justify-between">
          <span>© {new Date().getFullYear()} امتحاني. تجربة امتحانات عربية أكثر وضوحاً.</span>
          <button type="button" onClick={() => onNavigate('portfolio')} className="font-semibold transition hover:text-primary">تم التطوير بواسطة Ahmed Gbreel</button>
        </footer>
      </div>

      <nav aria-label="التنقل السفلي" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-between">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.key;
            return (
              <button key={item.key} type="button" aria-current={active ? 'page' : undefined} onClick={() => onNavigate(item.key)} className={cn('flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[10px] px-1 py-1.5 text-[10.5px] font-bold transition', active ? 'text-primary' : 'text-muted')}>
                <span className={cn('grid size-8 place-items-center rounded-[9px]', active ? 'bg-primary-soft' : '')}><Icon size={17} /></span>
                <span className="max-w-full truncate">{item.shortLabel || item.label}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setMobileOpen(true)} className="flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[10px] px-1 py-1.5 text-[10.5px] font-bold text-muted">
            <span className="grid size-8 place-items-center rounded-[9px]"><Menu size={17} /></span>
            <span>المزيد</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
