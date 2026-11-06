import React, { useCallback, useEffect, useState } from 'react';
import {
  BadgePercent, Banknote, Coins, HandCoins, Layers, Receipt, RefreshCw, Wallet,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, PageHeader, Skeleton, StatCard, cn,
} from '../components/ui';
import { request } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';

const money = (value) => `${formatNumber(Number(value) || 0)} ج.م`;
const methodLabels = {
  Cash: 'نقدي', VodafoneCash: 'فودافون كاش', InstaPay: 'إنستا باي', BankTransfer: 'تحويل بنكي', Online: 'أونلاين',
};
const adjustmentLabels = { Discount: 'خصم', Scholarship: 'منحة', Refund: 'استرداد', Correction: 'تصحيح' };

const tabs = [
  { value: 'ledger', label: 'المستحقات' },
  { value: 'payments', label: 'مدفوعاتي' },
  { value: 'packages', label: 'باقاتي' },
];

export default function StudentFinancePage({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ledger');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await request('/api/teaching/my/finance', { token });
      setData(result);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary || {};
  const ledger = data?.ledger || [];
  const payments = data?.payments || [];
  const adjustments = data?.adjustments || [];
  const packages = data?.packages || [];

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="ماليتي"
        title="حسابي المالي"
        description="كل مستحقاتك ومدفوعاتك وباقاتك مع جميع معلميك في كشف واحد."
        action={<Button variant="soft" size="sm" icon={RefreshCw} onClick={load} loading={loading}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Coins} label="إجمالي المستحقات" value={money(summary.charged)} note={`${formatNumber(ledger.length)} بند`} tone="blue" loading={loading} />
        <StatCard icon={HandCoins} label="المدفوع" value={money(summary.paid)} note={`${formatNumber(payments.length)} دفعة`} tone="emerald" loading={loading} />
        <StatCard icon={BadgePercent} label="التسويات" value={money(summary.adjusted)} note={`${formatNumber(adjustments.length)} تسوية`} tone="primary" loading={loading} />
        <StatCard icon={Wallet} label="المتبقي عليك" value={money(summary.balance)} note={`متبقي الباقات: ${money(summary.packageOutstanding)}`} tone={Number(summary.balance) > 0 ? 'warning' : 'emerald'} loading={loading} />
      </div>

      <Card className="p-2">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((item) => (
            <button key={item.value} type="button" onClick={() => setTab(item.value)}
              className={cn('shrink-0 rounded-[10px] px-3.5 py-2 text-[12.5px] font-bold transition', tab === item.value ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-surface-soft hover:text-ink')}>
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      {loading ? <Card className="p-4"><Skeleton className="h-40 w-full" /></Card> : null}

      {!loading && tab === 'ledger' ? (
        ledger.length === 0 ? <Card><EmptyState icon={Receipt} title="لا توجد مستحقات" description="عندما يصدر معلمك مستحقاً سيظهر هنا." /></Card> : (
          <div className="grid gap-2">
            {ledger.map((row) => {
              const outstanding = Number(row.outstanding) || 0;
              return (
                <Card key={row.id} className={cn('p-4', row.isVoid && 'opacity-60')}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={row.isVoid ? 'neutral' : outstanding > 0 ? (new Date(row.dueDateUtc).getTime() < Date.now() ? 'danger' : 'warning') : 'success'}>
                          {row.isVoid ? 'ملغى' : outstanding > 0 ? (new Date(row.dueDateUtc).getTime() < Date.now() ? 'متأخر' : 'غير مدفوع') : 'مدفوع'}
                        </Badge>
                        <span className="text-[10.5px] text-muted">{row.teacherName || 'معلم'}</span>
                      </div>
                      <h3 className="mt-1.5 text-[13px] font-bold text-ink">{row.description || row.kind}</h3>
                      <p className="mt-0.5 text-[11px] text-muted">الاستحقاق: {formatDate(row.dueDateUtc)}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-[15px] font-extrabold text-ink">{money(row.amount)}</p>
                      <p className="text-[11px] text-muted">مدفوع {money(row.paid)}</p>
                      {outstanding > 0 ? <p className="text-[11.5px] font-bold text-danger">متبقي {money(outstanding)}</p> : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : null}

      {!loading && tab === 'payments' ? (
        <div className="grid gap-4">
          {payments.length === 0 ? <Card><EmptyState icon={Banknote} title="لا توجد مدفوعات" description="ستظهر هنا كل دفعة يسجلها معلمك." /></Card> : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-start text-[12px]">
                <thead className="bg-surface-soft text-[11px] font-extrabold text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start">الإيصال</th>
                    <th className="px-4 py-3 text-start">المعلم</th>
                    <th className="px-4 py-3 text-start">المبلغ</th>
                    <th className="px-4 py-3 text-start">الطريقة</th>
                    <th className="px-4 py-3 text-start">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {payments.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-2.5 font-mono text-[10.5px]">{row.receiptNumber || '—'}</td>
                      <td className="px-4 py-2.5 font-bold text-ink">{row.teacherName || '—'}</td>
                      <td className="px-4 py-2.5 font-extrabold">{money(row.amount)}</td>
                      <td className="px-4 py-2.5">{methodLabels[row.method] || row.method}</td>
                      <td className="px-4 py-2.5 text-muted">{formatDate(row.paidAtUtc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {adjustments.length > 0 ? (
            <Card className="p-4">
              <h3 className="mb-2 font-display text-[14px] font-semibold text-ink">التسويات المكتسبة</h3>
              <div className="grid gap-2">
                {adjustments.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-2 rounded-xl border border-line/70 px-3 py-2 text-[11.5px]">
                    <span className="min-w-0 truncate">{adjustmentLabels[row.kind] || row.kind} — {row.reason} <span className="text-muted">· {row.teacherName || ''}</span></span>
                    <span className="shrink-0 font-extrabold text-emerald">{money(row.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {!loading && tab === 'packages' ? (
        packages.length === 0 ? <Card><EmptyState icon={Layers} title="لا توجد باقات" description="باقاتك المشترك بها ستظهر هنا مع تاريخ الانتهاء." /></Card> : (
          <div className="grid gap-3 md:grid-cols-2">
            {packages.map((row) => {
              const remaining = Math.max(0, Number(row.amountDue) - Number(row.amountPaid));
              const expired = row.expiresAtUtc && new Date(row.expiresAtUtc).getTime() < Date.now();
              return (
                <Card key={row.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge tone={expired ? 'danger' : row.status === 'Active' ? 'success' : 'neutral'}>{expired ? 'منتهية' : row.status === 'Active' ? 'نشطة' : row.status}</Badge>
                      <h3 className="mt-1.5 text-[13px] font-bold text-ink">{row.teacherName || 'معلم'}</h3>
                    </div>
                    <Layers size={18} className="text-primary" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
                    <p className="text-muted">المستحق: <span className="font-bold text-ink">{money(row.amountDue)}</span></p>
                    <p className="text-muted">المدفوع: <span className="font-bold text-ink">{money(row.amountPaid)}</span></p>
                    <p className="text-muted">يبدأ: <span className="font-bold text-ink">{formatDate(row.startsAtUtc)}</span></p>
                    <p className="text-muted">ينتهي: <span className="font-bold text-ink">{formatDate(row.expiresAtUtc)}</span></p>
                  </div>
                  {remaining > 0 ? <p className="mt-2 text-[11.5px] font-bold text-danger">متبقي {money(remaining)}</p> : null}
                </Card>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}
