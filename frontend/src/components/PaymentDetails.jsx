import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Building2, Check, Copy, CreditCard, Landmark, Smartphone, Wallet } from 'lucide-react';
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

let cached = { token: '', at: 0, data: null };
const CACHE_TTL = 60_000;

export function usePaymentMethods(token) {
  const fresh = cached.data && cached.token === token && Date.now() - cached.at < CACHE_TTL;
  const [state, setState] = useState(() => ({
    items: fresh ? cached.data.items : [],
    note: fresh ? cached.data.note : '',
    loading: !fresh,
  }));

  useEffect(() => {
    let alive = true;
    const usable = cached.data && cached.token === token && Date.now() - cached.at < CACHE_TTL;
    if (usable) {
      setState({ items: cached.data.items, note: cached.data.note, loading: false });
      return () => { alive = false; };
    }
    request('/api/payment-methods', { token })
      .then((result) => {
        if (!alive) return;
        const data = { items: Array.isArray(result?.items) ? result.items : [], note: result?.note || '' };
        cached = { token, at: Date.now(), data };
        setState({ ...data, loading: false });
      })
      .catch(() => { if (alive) setState((prev) => ({ ...prev, loading: false })); });
    return () => { alive = false; };
  }, [token]);

  return state;
}

export function methodOptions(items) {
  const list = (items || []).filter((item) => item.enabled);
  return list.length ? list.map((item) => ({ value: item.code, label: item.label || methodLabel(item.code) })) : PAYMENT_METHODS;
}

export default function PaymentDetails({ token, method, className = '' }) {
  const { items, note, loading } = usePaymentMethods(token);
  const [copied, setCopied] = useState(false);

  if (!method) return null;
  if (loading) {
    return <div className={cn('h-16 animate-pulse rounded-[14px] border border-line bg-surface-soft', className)} />;
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
        <span>لم تضبط الإدارة بيانات «{methodLabel(method)}» بعد. أضف رقم العملية وصورة الإيصال وسيُراجع طلبك.</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('relative overflow-hidden rounded-[16px] border border-primary/25 bg-gradient-to-l from-primary-soft/70 via-surface to-surface p-3.5', className)}
    >
      <div className="pointer-events-none absolute -left-8 -top-10 size-24 rounded-full bg-primary/15 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-primary text-white shadow-[0_10px_22px_-14px_var(--app-primary)]">
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
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-primary/25 bg-surface px-2.5 py-1.5 text-[10.5px] font-bold text-primary transition hover:bg-primary-soft"
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
