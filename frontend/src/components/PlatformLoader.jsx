import React, { useEffect, useState } from 'react';
import { BookOpen, GraduationCap, Sparkles } from 'lucide-react';

const defaultHints = [
  'نرتّب كتبك وملفاتك...',
  'نجهّز الاختبارات والدروس...',
  'نضبط مساحتك التعليمية...',
  'لحظات وتبدأ...',
];

const sparks = [
  { top: '12%', left: '20%' },
  { top: '82%', left: '14%' },
  { top: '18%', left: '84%' },
  { top: '88%', left: '80%' },
  { top: '48%', left: '4%' },
  { top: '6%', left: '60%' },
];

export function LoaderDots({ className = '' }) {
  return (
    <span className={`inline-flex translate-y-[1px] items-center gap-[3px] ${className}`} aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-1 rounded-full bg-current"
          style={{ animation: `ui-bounce-dot 1.2s ease-in-out ${index * 0.16}s infinite` }}
        />
      ))}
    </span>
  );
}

/**
 * Branded education loader: orbiting rings, a floating graduation cap,
 * twinkling sparks, rotating hints and an indeterminate shimmer bar.
 */
export default function PlatformLoader({ label = 'جارٍ تجهيز مساحتك...', hints, className = '' }) {
  const messages = hints?.length ? hints : defaultHints;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % messages.length), 1900);
    return () => window.clearInterval(timer);
  }, [messages.length]);

  return (
    <div className={`flex flex-col items-center text-center ${className}`} role="status" aria-live="polite">
      <div className="relative grid size-36 place-items-center">
        <span
          className="absolute inset-2 rounded-full opacity-40 blur-2xl"
          style={{
            background: 'conic-gradient(from 0deg, var(--app-primary), transparent 35%, var(--app-emerald), transparent 70%, var(--app-primary))',
            animation: 'ui-aurora-drift 6s linear infinite',
          }}
        />
        <span
          className="absolute inset-0 rounded-full border border-dashed border-primary/35"
          style={{ animation: 'ui-spin-slow 16s linear infinite' }}
        >
          <span
            className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-primary"
            style={{ boxShadow: '0 0 14px var(--app-primary)' }}
          />
        </span>
        <span
          className="absolute inset-4 rounded-full border border-emerald/25"
          style={{ animation: 'ui-spin-slow 10s linear infinite reverse' }}
        >
          <span
            className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-emerald"
            style={{ boxShadow: '0 0 12px var(--app-emerald)' }}
          />
        </span>
        <span
          className="absolute inset-0 rounded-full border border-primary/30"
          style={{ animation: 'ui-pulse-ring 2.6s ease-out infinite' }}
        />
        <span
          className="relative grid size-[74px] place-items-center rounded-[26px] bg-surface shadow-card ring-1 ring-line"
          style={{ animation: 'ui-float 3.2s ease-in-out infinite' }}
        >
          <GraduationCap size={34} className="text-primary" />
          <span
            className="absolute -left-2 -top-2 grid size-7 place-items-center rounded-xl bg-primary text-white shadow-soft"
            style={{ animation: 'ui-float 2.4s ease-in-out .4s infinite' }}
          >
            <BookOpen size={14} />
          </span>
          <Sparkles
            size={13}
            className="absolute -right-1 top-1 text-emerald"
            style={{ animation: 'ui-twinkle 2s ease-in-out infinite' }}
          />
        </span>
        {sparks.map((spot, i) => (
          <span
            key={`${spot.top}-${spot.left}`}
            className="absolute size-1 rounded-full bg-primary"
            style={{ ...spot, animation: `ui-twinkle 2.4s ease-in-out ${i * 0.32}s infinite` }}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3.5 py-1.5 shadow-soft backdrop-blur">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald" />
        </span>
        <span className="text-[11px] font-bold text-ink">{label}</span>
      </div>

      <p key={index} className="mt-2.5 flex items-center gap-1 text-[10.5px] text-muted" style={{ animation: 'ui-rise-in .45s ease both' }}>
        {messages[index]}
        <LoaderDots />
      </p>

      <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-line/50" aria-hidden="true">
        <span
          className="block h-full w-16 rounded-full"
          style={{
            backgroundImage: 'linear-gradient(90deg, var(--app-primary), var(--app-emerald), var(--app-primary))',
            backgroundSize: '200% 100%',
            animation: 'ui-loader-run 1.7s cubic-bezier(.45,0,.55,1) infinite, ui-gradient-pan 2.2s linear infinite',
          }}
        />
      </div>
    </div>
  );
}
