import React, { useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { formatSessionRemaining, getSessionState } from '../lib/session';
import { cn } from './ui';

function formatRemaining(ms) {
  return formatSessionRemaining(ms);
}

/**
 * Renders the fixed 24-hour login session countdown in every authenticated screen.
 * The five-minute warning and expiry are based on server time, not the local clock.
 */
export default function SessionCountdown({ className = '', compact = false }) {
  const [state, setState] = useState(() => getSessionState());
  const expiredEventSent = useRef(false);

  useEffect(() => {
    function tick() {
      const next = getSessionState();
      setState(next);
      if (next && next.remainingMs <= 0 && !expiredEventSent.current) {
        expiredEventSent.current = true;
        window.dispatchEvent(new CustomEvent('emtehani:session-expired'));
      }
    }
    tick();
    const interval = window.setInterval(tick, 1000);
    window.addEventListener('emtehani:session-updated', tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('emtehani:session-updated', tick);
    };
  }, []);

  if (!state) return null;
  const warning = state.remainingMs > 0 && state.remainingMs <= 5 * 60 * 1000;
  const expired = state.remainingMs <= 0;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-[10.5px] font-semibold',
        expired || warning ? 'border-warning/30 bg-warning-soft text-warning' : 'border-line bg-surface-soft text-muted',
        className,
      )}
      title="مدة الجلسة ثابتة 24 ساعة من تسجيل الدخول، ولا تمددها إعادة تحميل الصفحة."
      role="status"
      aria-live={warning ? 'polite' : 'off'}
      data-testid="session-countdown"
    >
      <Clock3 size={12} />
      <span className="ui-number" dir="ltr">{formatRemaining(state.remainingMs)}</span>
      <span className={cn(compact && 'sr-only')}>{expired ? 'انتهت الجلسة' : warning ? 'تنتهي الجلسة قريباً' : 'متبقي من الجلسة'}</span>
    </div>
  );
}
