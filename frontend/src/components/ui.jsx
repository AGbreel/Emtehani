import React, { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Eye,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';

export function cn(...values) {
  return values.filter(Boolean).join(' ');
}

export function Logo({ compact = false, className = '' }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className="grid size-10 place-items-center rounded-[14px] bg-primary text-white shadow-[0_10px_24px_-12px_var(--app-primary)]">
        <BookOpen size={20} strokeWidth={2.2} />
      </span>
      {!compact ? (
        <span className="flex flex-col leading-none">
          <strong className="font-display text-[1.3rem] font-semibold tracking-[-0.04em] text-ink">امتحاني</strong>
          <span className="mt-1 text-[10.5px] font-medium tracking-[0.16em] text-muted">EMTEHANI</span>
        </span>
      ) : null}
    </span>
  );
}

const buttonVariants = {
  primary: 'bg-primary text-white shadow-[0_14px_30px_-18px_var(--app-primary)] hover:bg-primary-strong',
  secondary: 'border border-line bg-surface text-ink shadow-soft hover:border-line-strong hover:bg-surface-soft',
  ghost: 'bg-transparent text-muted hover:bg-surface-soft hover:text-ink',
  soft: 'bg-primary-soft text-primary hover:bg-primary hover:text-white',
  success: 'bg-emerald text-white shadow-[0_14px_30px_-18px_var(--app-emerald)] hover:brightness-95',
  danger: 'bg-danger text-white shadow-[0_14px_30px_-18px_var(--app-danger)] hover:brightness-95',
  warning: 'bg-warning text-white shadow-[0_14px_30px_-18px_var(--app-warning)] hover:brightness-95',
};

const buttonSizes = {
  xs: 'h-8 rounded-[9px] px-3 text-[12px]',
  sm: 'h-9 rounded-[10px] px-3.5 text-[13px]',
  md: 'h-11 rounded-[12px] px-5 text-sm',
  lg: 'h-12 rounded-[14px] px-6 text-[15px]',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  disabled,
  icon: Icon,
  iconEnd: IconEnd,
  type = 'button',
  ...props
}) {
  return (
    <motion.button
      type={type}
      whileTap={{ scale: disabled || loading ? 1 : 0.985 }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 font-semibold transition-[background-color,color,border-color,box-shadow,transform] duration-200 disabled:pointer-events-none disabled:opacity-55',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle size={16} className="animate-spin" /> : Icon ? <Icon size={16} strokeWidth={2.1} /> : null}
      {children}
      {IconEnd ? <IconEnd size={16} strokeWidth={2.1} /> : null}
    </motion.button>
  );
}

export function IconButton({ label, children, className = '', variant = 'secondary', ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-[10px] border text-muted transition hover:border-line-strong hover:bg-surface-soft hover:text-ink disabled:pointer-events-none disabled:opacity-50',
        variant === 'secondary' ? 'border-line bg-surface' : 'border-transparent bg-transparent',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '', as = 'div', hover = false, ...props }) {
  const Component = as;
  return (
    <Component
      {...props}
      className={cn(
        'rounded-card border border-line bg-surface shadow-soft',
        hover && 'transition duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card',
        className,
      )}
    >
      {children}
    </Component>
  );
}

const badgeTones = {
  neutral: 'bg-surface-soft text-muted border-line',
  primary: 'bg-primary-soft text-primary border-transparent',
  blue: 'bg-blue-soft text-blue border-transparent',
  emerald: 'bg-emerald-soft text-emerald border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
};

export function Badge({ children, tone = 'neutral', className = '', dot = false }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-bold leading-none', badgeTones[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

const statusMap = {
  Draft: { label: 'مسودة', tone: 'neutral', icon: FileText },
  Published: { label: 'منشور', tone: 'blue', icon: Eye },
  Scheduled: { label: 'مجدول', tone: 'blue', icon: Clock3 },
  Waiting: { label: 'بانتظار البدء', tone: 'warning', icon: Clock3 },
  Active: { label: 'نشط الآن', tone: 'emerald', icon: Radio },
  Paused: { label: 'متوقف مؤقتاً', tone: 'warning', icon: LockKeyhole },
  Finished: { label: 'منتهي', tone: 'neutral', icon: CheckCircle2 },
  Invited: { label: 'لم يدخل بعد', tone: 'neutral', icon: Clock3 },
  Submitted: { label: 'تم التسليم', tone: 'emerald', icon: CheckCircle2 },
  Disconnected: { label: 'انقطع الاتصال', tone: 'danger', icon: XCircle },
  Absent: { label: 'غائب', tone: 'danger', icon: XCircle },
  InProgress: { label: 'قيد الحل', tone: 'blue', icon: Radio },
  NeedsReview: { label: 'قيد المراجعة', tone: 'warning', icon: FileText },
  Reviewed: { label: 'تم التصحيح', tone: 'emerald', icon: CheckCircle2 },
  Processing: { label: 'جارٍ المعالجة', tone: 'blue', icon: LoaderCircle },
  Abandoned: { label: 'محاولة متوقفة', tone: 'danger', icon: XCircle },
  Passed: { label: 'ناجح', tone: 'emerald', icon: CheckCircle2 },
};

export function StatusChip({ status, className = '', showIcon = true }) {
  const meta = statusMap[status] || { label: status || 'غير محدد', tone: 'neutral', icon: AlertTriangle };
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} className={cn('gap-1.5 py-1.5', className)}>
      {showIcon ? <Icon size={12} strokeWidth={2.2} /> : <span className="size-1.5 rounded-full bg-current" />}
      {meta.label}
    </Badge>
  );
}

export function Avatar({ name = '', size = 'md', className = '' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-primary-soft font-display font-semibold text-primary',
        size === 'sm' ? 'size-8 text-xs' : size === 'lg' ? 'size-12 text-lg' : 'size-10 text-sm',
        className,
      )}
      aria-hidden="true"
    >
      {initials || 'م'}
    </span>
  );
}

export function Field({ label, hint, error, children, className = '', id }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-bold text-ink">{label}</label>
      {children}
      {error ? <p className="text-[12px] font-semibold text-danger">{error}</p> : hint ? <p className="text-[12px] leading-5 text-muted">{hint}</p> : null}
    </div>
  );
}

const controlClass = 'w-full rounded-[12px] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-subtle hover:border-line-strong focus:border-primary focus:ring-4 focus:ring-primary-soft disabled:opacity-60';

export function Input({ className = '', ...props }) {
  return <input className={cn(controlClass, 'h-11', className)} {...props} />;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={cn(controlClass, 'min-h-28 resize-y', className)} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return <select className={cn(controlClass, 'h-11', className)} {...props}>{children}</select>;
}

export function Checkbox({ label, className = '', ...props }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-line bg-surface px-3.5 py-3 text-xs leading-6 text-muted transition hover:border-line-strong', className)}>
      <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function SectionHeading({ eyebrow, title, description, action, align = 'start', className = '' }) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', align === 'center' && 'text-center sm:flex-col sm:items-center', className)}>
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow ? <div className="mb-2.5 inline-flex items-center gap-2 text-[11.5px] font-extrabold tracking-[0.14em] text-primary"><Sparkles size={13} />{eyebrow}</div> : null}
        <h2 className="font-display text-[clamp(1.55rem,3vw,2.35rem)] font-semibold leading-[1.3] tracking-[-0.04em] text-ink">{title}</h2>
        {description ? <p className="mt-2 max-w-xl text-[14px] leading-7 text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action, className = '' }) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div>
        {eyebrow ? <span className="mb-1.5 block text-[11.5px] font-extrabold tracking-[0.16em] text-primary">{eyebrow}</span> : null}
        <h1 className="font-display text-[clamp(1.55rem,3vw,2.1rem)] font-semibold leading-tight tracking-[-0.04em] text-ink">{title}</h1>
        {description ? <p className="mt-1.5 text-[13.5px] leading-6 text-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, note, tone = 'primary', className = '', loading = false }) {
  const toneClasses = {
    primary: 'bg-primary-soft text-primary',
    blue: 'bg-blue-soft text-blue',
    emerald: 'bg-emerald-soft text-emerald',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  };
  return (
    <Card className={cn('group relative overflow-hidden p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[12.5px] font-bold text-muted">{label}</span>
        {Icon ? <span className={cn('grid size-9 place-items-center rounded-[11px]', toneClasses[tone])}><Icon size={18} strokeWidth={2.1} /></span> : null}
      </div>
      {loading ? <div className="ui-shimmer mt-4 h-9 w-20 rounded-lg" /> : <strong className="ui-number mt-2 block font-display text-[2rem] font-semibold leading-tight text-ink">{value}</strong>}
      {note ? <p className="mt-1 text-[11.5px] leading-5 text-subtle">{note}</p> : null}
      <span className="pointer-events-none absolute -bottom-8 -left-6 size-20 rounded-full bg-primary-soft opacity-0 blur-2xl transition group-hover:opacity-100" />
    </Card>
  );
}

export function ProgressBar({ value = 0, className = '', tone = 'primary' }) {
  const tones = { primary: 'bg-primary', blue: 'bg-blue', emerald: 'bg-emerald', warning: 'bg-warning', danger: 'bg-danger' };
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-surface-soft', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className={cn('h-full rounded-full', tones[tone])} initial={false} animate={{ width: `${Math.min(100, Math.max(0, value))}%` }} transition={{ duration: 0.35, ease: 'easeOut' }} />
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={cn('ui-shimmer rounded-[10px]', className)} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="grid gap-3 p-4" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="grid grid-cols-[1.4fr_.7fr_.6fr_.5fr] items-center gap-4 rounded-xl border border-line/60 p-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = FileText, title, description, action, className = '' }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-5 py-12 text-center', className)}>
      <div className="relative mb-4 grid size-14 place-items-center rounded-[18px] border border-line bg-surface-soft text-muted">
        <Icon size={23} strokeWidth={1.7} />
        <span className="absolute inset-0 -z-10 rounded-[18px] bg-primary-soft blur-xl" />
      </div>
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-[13px] leading-6 text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Alert({ tone = 'danger', title, children, onClose, className = '' }) {
  const tones = {
    danger: 'border-danger/20 bg-danger-soft text-danger',
    warning: 'border-warning/20 bg-warning-soft text-warning',
    success: 'border-emerald/20 bg-emerald-soft text-emerald',
    info: 'border-primary/20 bg-primary-soft text-primary',
  };
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? ShieldCheck : AlertTriangle;
  return (
    <div className={cn('flex items-start gap-3 rounded-[14px] border px-3.5 py-3 text-[13px] leading-6', tones[tone], className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={17} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <strong className="block text-[13px] font-bold">{title}</strong> : null}
        <div>{children}</div>
      </div>
      {onClose ? <button type="button" onClick={onClose} className="mt-0.5 opacity-70 hover:opacity-100" aria-label="إغلاق التنبيه"><X size={15} /></button> : null}
    </div>
  );
}

export function Modal({ open, onClose, title, description, icon: Icon = ShieldCheck, tone = 'primary', children, footer, size = 'md' }) {
  const reduce = useReducedMotion();
  const closeRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const tones = {
    primary: 'bg-primary-soft text-primary',
    success: 'bg-emerald-soft text-emerald',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(3,7,18,.58)] p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn('relative w-full overflow-hidden rounded-[24px] border border-line bg-surface p-5 shadow-[0_30px_100px_-20px_rgba(0,0,0,.45)] sm:p-6', size === 'lg' ? 'max-w-2xl' : size === 'sm' ? 'max-w-sm' : 'max-w-md')}
            initial={reduce ? false : { opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? {} : { opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <button ref={closeRef} type="button" onClick={onClose} className="absolute left-4 top-4 grid size-8 place-items-center rounded-full text-muted transition hover:bg-surface-soft hover:text-ink" aria-label="إغلاق النافذة">
              <X size={17} />
            </button>
            <div className={cn('mb-4 grid size-12 place-items-center rounded-[16px]', tones[tone])}>
              <Icon size={23} />
            </div>
            <h2 id={titleId} className="font-display text-xl font-semibold tracking-[-0.03em] text-ink">{title}</h2>
            {description ? <p className="mt-2 text-[13px] leading-6 text-muted">{description}</p> : null}
            {children ? <div className="mt-5">{children}</div> : null}
            {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function Spinner({ label = 'جارٍ التحميل' }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted" role="status">
      <LoaderCircle size={16} className="animate-spin" />
      {label}
    </span>
  );
}

export function LiveDot({ label = 'مباشر', tone = 'emerald', className = '' }) {
  const colors = { emerald: 'bg-emerald', danger: 'bg-danger', warning: 'bg-warning', primary: 'bg-primary' };
  return (
    <span className={cn('inline-flex items-center gap-2 text-[11.5px] font-bold text-muted', className)}>
      <span className="relative flex size-2">
        <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', colors[tone])} />
        <span className={cn('relative inline-flex size-2 rounded-full', colors[tone])} />
      </span>
      {label}
    </span>
  );
}

export function Segmented({ options, value, onChange, className = '', ariaLabel }) {
  return (
    <div className={cn('inline-flex rounded-[12px] border border-line bg-surface-soft p-1', className)} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn('relative flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[12px] font-bold transition', value === option.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          {option.icon ? <option.icon size={13} /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CopyChip({ value, label = 'نسخ', className = '', onCopied }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(value));
    } catch {
      const area = document.createElement('textarea');
      area.value = String(value);
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    onCopied?.();
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button type="button" onClick={copy} className={cn('inline-flex items-center gap-1.5 rounded-[9px] border border-line bg-surface px-2.5 py-1.5 font-mono text-[12px] font-bold tracking-[0.08em] text-primary transition hover:border-primary/40 hover:bg-primary-soft', className)}>
      <span className="ui-ltr">{value}</span>
      {copied ? <Check size={13} className="text-emerald" /> : <span className="text-[10px] font-bold text-muted">{label}</span>}
    </button>
  );
}

export function BackButton({ children = 'رجوع', onClick, className = '' }) {
  return (
    <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1.5 text-[12px] font-bold text-muted transition hover:text-primary', className)}>
      <ChevronLeft size={14} className="rotate-180" />
      {children}
    </button>
  );
}

export function useCountUp(target, duration = 1200) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) { setValue(target); return; }
    let frame = 0;
    const started = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduce]);
  return value;
}
