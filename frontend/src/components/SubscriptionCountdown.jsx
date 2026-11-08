import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarClock, Crown, RefreshCw, Sparkles } from 'lucide-react';
import { Button, cn } from './ui';

const pad = (value) => String(value).padStart(2, '0');

/** Decorated live countdown for the teacher's platform subscription. */
export default function SubscriptionCountdown({ subscription, serverUtc, onRenew, className = '' }) {
  const endsAt = subscription?.endsAtUtc ? new Date(subscription.endsAtUtc).getTime() : null;
  const startsAt = subscription?.startsAtUtc ? new Date(subscription.startsAtUtc).getTime() : null;

  const skew = useMemo(() => {
    const server = serverUtc ? new Date(serverUtc).getTime() : Date.now();
    return Number.isFinite(server) ? Date.now() - server : 0;
  }, [serverUtc]);

  const [remaining, setRemaining] = useState(() => (endsAt ? Math.max(0, Math.floor((endsAt - Date.now()) / 1000)) : 0));

  useEffect(() => {
    if (!endsAt) return undefined;
    const tick = () => setRemaining(Math.max(0, Math.floor((endsAt - (Date.now() - skew)) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt, skew]);

  if (!endsAt) return null;

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const expired = remaining <= 0;
  const urgent = !expired && remaining <= 3 * 24 * 60 * 60;
  const warning = !expired && !urgent && remaining <= 7 * 24 * 60 * 60;

  const total = startsAt && endsAt > startsAt ? endsAt - startsAt : null;
  const consumed = total ? Math.min(100, Math.max(0, Math.round(((total - remaining * 1000) / total) * 100))) : null;

  const segments = [
    { value: days, label: 'يوم' },
    { value: hours, label: 'ساعة' },
    { value: minutes, label: 'دقيقة' },
    { value: seconds, label: 'ثانية' },
  ];

  return (
    <motion.section
      animate={urgent || expired ? { x: [0, -3, 3, -3, 3, 0], rotate: [0, -0.35, 0.35, 0] } : { x: 0, rotate: 0 }}
      transition={urgent || expired ? { duration: 0.6, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' } : { duration: 0.3 }}
      className={cn(
        'relative overflow-hidden rounded-[22px] border p-5 shadow-[0_22px_60px_-34px_rgba(11,61,46,.55)]',
        expired
          ? 'border-danger/40 bg-gradient-to-bl from-[#4c0b12] via-[#7c1520] to-[#3a0a10] text-white'
          : urgent
            ? 'border-danger/35 bg-gradient-to-bl from-[#7c1520] via-[#a41e2c] to-[#611018] text-white'
            : 'border-[#d4af37]/45 bg-gradient-to-bl from-[#0b3d2e] via-[#11503c] to-[#083024] text-white',
        className,
      )}
      role="timer"
      aria-live={urgent ? 'polite' : 'off'}
      aria-label="الوقت المتبقي في باقتك"
    >
      <div className="pointer-events-none absolute -right-10 -top-14 size-44 rounded-full bg-[#d4af37]/25 blur-3xl" />
      <div className="pointer-events-none absolute -left-12 bottom-0 size-40 rounded-full bg-emerald/25 blur-3xl" />
      <Sparkles className="pointer-events-none absolute left-4 top-4 size-4 text-[#f0d37a]/70" aria-hidden />
      <Sparkles className="pointer-events-none absolute bottom-5 right-5 size-3 text-[#f0d37a]/60" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-[#f0d37a]/80 to-transparent" />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[14px] border border-[#d4af37]/50 bg-white/10 text-[#f0d37a] shadow-inner">
            {expired ? <CalendarClock size={21} /> : <Crown size={21} />}
          </span>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.22em] text-[#f0d37a]/90">باقة المنصة</p>
            <p className="truncate text-[15px] font-extrabold">{subscription?.planName || 'اشتراكك'}</p>
            <p className="mt-0.5 text-[11px] text-white/70">
              {expired ? 'انتهت الباقة — جدّد لتستعيد كل الميزات' : urgent ? 'الوقت يقترب من النهاية — جدّد الآن' : 'الوقت المتبقي قبل انتهاء الاشتراك'}
            </p>
          </div>
        </div>
        {onRenew ? (
          <Button
            size="sm"
            icon={RefreshCw}
            onClick={onRenew}
            className={cn(
              'shrink-0 border border-[#d4af37]/50 shadow-none',
              urgent || expired ? 'bg-white text-danger hover:bg-white/90' : 'bg-[#d4af37] text-[#12241b] hover:bg-[#e6c24a]',
            )}
          >
            تجديد الباقة
          </Button>
        ) : null}
      </div>

      <div dir="ltr" className="relative mt-4 grid grid-cols-4 gap-2 sm:gap-2.5">
        {segments.map((segment, index) => (
          <React.Fragment key={segment.label}>
            <motion.div
              animate={urgent && index === 3 ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={urgent && index === 3 ? { duration: 1, repeat: Infinity } : { duration: 0.2 }}
              className={cn(
                'relative overflow-hidden rounded-[14px] border px-1 py-2.5 text-center backdrop-blur-sm sm:py-3',
                urgent || expired ? 'border-white/20 bg-black/20' : 'border-white/15 bg-white/[0.07]',
              )}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-white/40 to-transparent" />
              <span className="block font-mono text-[22px] font-black tabular-nums leading-none tracking-wider sm:text-[26px]">{pad(segment.value)}</span>
              <span className="mt-1.5 block text-[9.5px] font-bold text-white/65">{segment.label}</span>
            </motion.div>
          </React.Fragment>
        ))}
      </div>

      {consumed !== null ? (
        <div className="relative mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${consumed}%` }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className={cn('h-full rounded-full', urgent || expired ? 'bg-white' : 'bg-gradient-to-l from-[#f0d37a] to-[#d4af37]')}
            />
          </div>
          <p className="mt-1.5 text-end text-[10px] font-bold text-white/60">تم استهلاك {consumed}% من مدة الباقة</p>
        </div>
      ) : null}
    </motion.section>
  );
}
