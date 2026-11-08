import React, { useCallback, useEffect, useState } from 'react';
import { Building2, CreditCard, Landmark, Save, Smartphone, Wallet } from 'lucide-react';
import { Alert, Button, Card, Field, Input, Skeleton, Textarea, cn } from './ui';
import { request } from '../lib/api';

const meta = {
  InstaPay: { icon: Smartphone, placeholder: '01000000000' },
  VodafoneCash: { icon: Wallet, placeholder: '01000000000' },
  BankTransfer: { icon: Landmark, placeholder: 'EG00 0000 0000 0000 0000 0000 000' },
  Cash: { icon: Building2, placeholder: 'عنوان الاستلام أو ملاحظة' },
  Online: { icon: CreditCard, placeholder: 'رابط الدفع أو بيانات المحفظة' },
};

export default function PaymentMethodsEditor({
  token,
  endpoint,
  title,
  description,
  noteLabel = 'ملاحظة عامة تظهر أسفل بيانات التحويل',
  notePlaceholder = 'مثال: بعد التحويل أرسل صورة الإيصال مع رقم العملية حتى يُراجع الطلب.',
  saveLabel = 'حفظ البيانات',
  onSaved,
}) {
  const [items, setItems] = useState([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await request(endpoint, { token });
      setItems(Array.isArray(result?.items) ? result.items : []);
      setNote(result?.note || '');
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [endpoint, token]);

  useEffect(() => { load(); }, [load]);

  function patch(code, change) {
    setItems((prev) => prev.map((item) => (item.code === code ? { ...item, ...change } : item)));
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const result = await request(endpoint, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          note: note || null,
          methods: items.map((item) => ({
            code: item.code,
            number: item.number || null,
            accountName: item.accountName || null,
            note: item.note || null,
            enabled: Boolean(item.enabled),
          })),
        }),
      });
      setItems(Array.isArray(result?.items) ? result.items : items);
      setNote(result?.note || '');
      setNotice(result?.message || 'تم حفظ بيانات التحصيل.');
      window.setTimeout(() => setNotice(''), 3200);
      onSaved?.(result);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-40 rounded-card" />)}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert> : null}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-[14px] font-bold text-ink"><Wallet size={15} className="text-primary" /> {title}</h2>
            {description ? <p className="mt-1 text-[11.5px] leading-6 text-muted">{description}</p> : null}
          </div>
          <Button size="sm" icon={Save} loading={busy} onClick={save}>{saveLabel}</Button>
        </div>
        <Field label={noteLabel} className="mt-4">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" placeholder={notePlaceholder} />
        </Field>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const details = meta[item.code] || { icon: Wallet, placeholder: '' };
          const Icon = details.icon;
          return (
            <Card key={item.code} className={cn('p-4', item.enabled && 'ring-1 ring-primary/20')}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn('grid size-9 place-items-center rounded-[11px]', item.enabled ? 'bg-primary-soft text-primary' : 'bg-surface-soft text-muted')}><Icon size={16} /></span>
                  <div>
                    <p className="text-[13px] font-bold text-ink">{item.label}</p>
                    <p className="font-mono text-[10px] text-subtle" dir="ltr">{item.code}</p>
                  </div>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
                  <input type="checkbox" className="accent-primary" checked={Boolean(item.enabled)} onChange={(e) => patch(item.code, { enabled: e.target.checked })} />
                  مفعّل
                </label>
              </div>
              <div className="mt-3 grid gap-2.5">
                <Field label={item.code === 'BankTransfer' ? 'IBAN / رقم الحساب' : 'الرقم / بيانات التحويل'}>
                  <Input value={item.number || ''} onChange={(e) => patch(item.code, { number: e.target.value })} dir="ltr" placeholder={details.placeholder} />
                </Field>
                <Field label="اسم المستلم / الحساب">
                  <Input value={item.accountName || ''} onChange={(e) => patch(item.code, { accountName: e.target.value })} placeholder="مثال: منصة امتحاني" />
                </Field>
                <Field label="تعليمات إضافية (اختياري)">
                  <Input value={item.note || ''} onChange={(e) => patch(item.code, { note: e.target.value })} />
                </Field>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
