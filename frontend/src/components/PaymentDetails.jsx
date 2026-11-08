import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Building2, Check, Copy, CreditCard, GraduationCap, Landmark, ShieldCheck, Smartphone, Wallet } from 'lucide-react';
import { request } from '../lib/api';
import { PAYMENT_METHODS, methodLabel } from '../lib/paymentMethods';
import { cn } from './ui';

const icons = {
  InstaPay: Smartphone,
  VodafoneCash: Wallet,
  BankTransfer: Landmark,
  Cash: Building2,
  Online: CreditCard,
};

let cached = { key: '', at: 0, data: null };
const CACHE_TTL = 60_000;

function cacheKey(token, teacherId) {
  return `${token}:${teacherId ? `teacher:${teacherId}` : 'platform'}`;
}

function endpointFor(teacherId) {
  return teacherId ? `/api/teachers/${teacherId}/payment-methods` : '/api/payment-methods';
}

/**
 * Payment numbers depend on who receives the money:
 * - teacherId set → that teacher's own collection numbers (course/group payments)
 * - no teacherId → the administration's numbers (teacher paying for a platform plan)
 */
export function usePaymentMethods(token, teacherId = null) {
  const key = cacheKey(token, teacherId);
  const fresh = cached.data && cached.key === key && Date.now() - cached.at < CACHE_TTL;
  const [state, setState] = useState(() => ({
    items: fresh ? cached.data.items : [],
    note: fresh ? cached.data.note : '',
    teacherName: fresh ? cached.data.teacherName : '',
    loading: !fresh,
  }));

  useEffect(() => {
    let alive = true;
    const currentKey = cacheKey(token, teacherId);
    const usable = cached.data && cached.key === currentKey && Date.now() - cached.at < CACHE_TTL;
    if (usable) {
      setState({ items: cached.data.items, note: cached.data.note, teacherName: cached.data.teacherName, loading: false });
      return () => { alive = false; };
    }
    setState((prev) => ({ ...prev, loading: true }));
    request(endpointFor(teacherId), { token })
      .then((result) => {
        if (!alive) return;
        const data = {
          items: Array.isArray(result?.items) ? result.items : [],
          note: result?.note || '',
          teacherName: result?.teacherName || '',
        };
        cached = { key: currentKey, at: Date.now(), data };
        setState({ ...data, loading: false });
      })
      .catch(() => { if (alive) setState((prev) => ({ ...prev, loading: false })); });
    return () => { alive = false; };
  }, [token, teacherId]);

  return state;
}

export function methodOptions(items) {
  const list = (items || []).filter((item) => item.enabled);
  return list.length ? list.map((item) => ({ value: item.code, label: item.label || methodLabel(item.code) })) : PAYMENT_METHODS;
}

export default function PaymentDetails({ token, method, teacherId = null, teacherName = '', className = '' }) {
  const { items, note, loading, teacherName: resolvedTeacherName } = usePaymentMethods(token, teacherId);
  const [copied, setCopied] = useState(false);
  const forTeacher = Boolean(teacherId);
  const receiver = resolvedTeacherName || teacherName;

  if (!method) return null;
  if (loading) {
    return (
      <div className={cn('relative overflow-hidden rounded-[16px] border border-line bg-surface-soft/60 p-3.5', className)} aria-hidden="true">
        <div className="flex items-center gap-2.5">
          <span className="relative grid size-9 place-items-center rounded-[11px] bg-primary/15 text-primary">
            <span className="absolute inset-0 rounded-[11px] border border-primary/30" style={{ animation: 'ui-pulse-ring 1.8s ease-out infinite' }} />
            <LoaderRing />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block h-2.5 w-32 rounded-full bg-line/80" style={{ animation: 'ui-shimmer 1.6s linear infinite', backgroundImage: 'linear-gradient(90deg,transparent,var(--app-surface),transparent)', backgroundSize: '220% 100%' }} />
            <span className="mt-2 block h-3.5 w-40 rounded-full bg-line/70" />
          </div>
        </div>
      </div>
    );
  }

  const item = (items || []).find((entry) => entry.code === method && entry.enabled);
  const Icon = icons[method] || CreditCard;

  async function copy() {
    if (!item?.number) return;
    try {
      await navigator.clipboard.writeText(item.number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (!item) {
    return (
      <div className={cn('flex items-start gap-2 rounded-[14px] border border-warning/30 bg-warning-soft px-3.5 py-3 text-[11.5px] leading-6 text-ink', className)}>
        <Icon size={15} className="mt-0.5 shrink-0 text-warning" />
        <span>
          {forTeacher
            ? <>لم يضبط {receiver ? `«${receiver}»` : 'المدرس'} بيانات «{methodLabel(method)}» بعد. أرسل صورة التحويل وسيُراجع المدرس طلبك.</>
            : <>لم تضبط الإدارة بيانات «{methodLabel(method)}» بعد. تواصل مع الإدارة لتفعيل التحويل.</>}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('relative overflow-hidden rounded-[16px] border p-3.5', forTeacher ? 'border-emerald/30 bg-gradient-to-l from-emerald-soft/60 via-surface to-surface' : 'border-primary/25 bg-gradient-to-l from-primary-soft/70 via-surface to-surface', className)}
    >
      <div className={cn('pointer-events-none absolute -left-8 -top-10 size-24 rounded-full blur-2xl', forTeacher ? 'bg-emerald/15' : 'bg-primary/15')} />
      <div className="relative mb-2.5 flex items-center gap-1.5 text-[10.5px] font-bold text-muted">
        {forTeacher ? <GraduationCap size={13} className="text-emerald" /> : <ShieldCheck size={13} className="text-primary" />}
        {forTeacher ? `التحويل يذهب إلى المدرس${receiver ? `: ${receiver}` : ''}` : 'تحويل اشتراك المنصة يذهب إلى إدارة المنصة'}
      </div>
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-[11px] text-white shadow-soft', forTeacher ? 'bg-emerald' : 'bg-primary')}>
            <Icon size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold text-muted">حوّل على بيانات {item.label || methodLabel(method)}</p>
            <p dir="ltr" className="mt-0.5 truncate text-left font-mono text-[15px] font-black tracking-wide text-ink">{item.number || '—'}</p>
            {item.accountName ? <p className="mt-0.5 truncate text-[11px] font-bold text-muted">{item.accountName}</p> : null}
          </div>
        </div>
        {item.number ? (
          <button
            type="button"
            onClick={copy}
            className={cn('inline-flex shrink-0 items-center gap-1 rounded-lg border bg-surface px-2.5 py-1.5 text-[10.5px] font-bold transition', forTeacher ? 'border-emerald/30 text-emerald hover:bg-emerald-soft' : 'border-primary/25 text-primary hover:bg-primary-soft')}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'تم النسخ' : 'نسخ الرقم'}
          </button>
        ) : null}
      </div>
      {item.note ? <p className="relative mt-2 rounded-lg bg-surface/80 px-2.5 py-1.5 text-[10.5px] leading-5 text-muted">{item.note}</p> : null}
      {note ? <p className="relative mt-1.5 text-[10.5px] leading-5 text-subtle">{note}</p> : null}
    </motion.div>
  );
}

function LoaderRing() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 animate-spin" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.4" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
