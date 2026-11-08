import React, { useCallback, useEffect, useState } from 'react';
import {
  BadgePercent, Banknote, ClipboardCheck, Coins, HandCoins, Layers, Plus, Receipt, RefreshCw, Send, Wallet,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, StatCard, Textarea, cn,
} from '../components/ui';
import { request } from '../lib/api';
import ImageUploader from '../components/ImageUploader';
import { formatDate, formatNumber } from '../lib/format';

const money = (value) => `${formatNumber(Number(value) || 0)} ج.م`;
const methodLabels = {
  Cash: 'نقدي', VodafoneCash: 'فودافون كاش', InstaPay: 'إنستا باي', BankTransfer: 'تحويل بنكي', Online: 'أونلاين',
};
const adjustmentLabels = { Discount: 'خصم', Scholarship: 'منحة', Refund: 'استرداد', Correction: 'تصحيح' };
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString('ar-EG', { month: 'long' }));
const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i);

const tabs = [
  { value: 'ledger', label: 'المستحقات' },
  { value: 'payments', label: 'مدفوعاتي' },
  { value: 'requests', label: 'طلبات الدفع' },
  { value: 'packages', label: 'باقاتي' },
];

const emptyRequest = () => ({
  groupId: '', amount: '', coverageType: 'Month', sessionsCount: '',
  periodMonth: new Date().getMonth() + 1, periodYear: new Date().getFullYear(),
  method: 'Cash', reference: '', notes: '', receiptUrl: '',
});

export default function StudentFinancePage({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ledger');
  const [requests, setRequests] = useState([]);
  const [courseRequests, setCourseRequests] = useState([]);
  const [groups, setGroups] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyRequest);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const flash = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3400);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [result, requestData, groupData, courseData] = await Promise.all([
        request('/api/teaching/my/finance', { token }),
        request('/api/teaching/my/payment-requests', { token }),
        request('/api/teaching/my/groups', { token }),
        request('/api/teaching/my/course-requests', { token }).catch(() => ({ items: [] })),
      ]);
      setData(result);
      setRequests(requestData?.items || []);
      setCourseRequests(courseData?.items || []);
      setGroups((groupData?.items || []).filter((row) => (row.status || 'Active') === 'Active'));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function submitRequest() {
    setFormError('');
    if (!form.groupId) return setFormError('اختر المجموعة.');
    if (!(Number(form.amount) > 0)) return setFormError('اكتب المبلغ الذي دفعته.');
    if (form.coverageType === 'Sessions' && !(Number(form.sessionsCount) > 0)) return setFormError('حدد عدد الحصص.');
    if (form.method !== 'Cash' && !form.receiptUrl) return setFormError('أرفق صورة سكرين التحويل أو الإيصال.');
    setBusy(true);
    try {
      await request('/api/teaching/my/payment-requests', {
        token, method: 'POST',
        body: JSON.stringify({
          groupId: form.groupId,
          amount: Number(form.amount),
          coverageType: form.coverageType,
          sessionsCount: form.coverageType === 'Sessions' ? Number(form.sessionsCount) : null,
          periodMonth: form.coverageType === 'Month' ? Number(form.periodMonth) : null,
          periodYear: form.coverageType === 'Month' ? Number(form.periodYear) : null,
          method: form.method,
          reference: form.reference || null,
          notes: form.notes || null,
          receiptUrl: form.receiptUrl || null,
        }),
      });
      setFormOpen(false);
      setForm(emptyRequest());
      flash('تم إرسال طلب الدفع للمدرس. سيصلك إشعار عند التأكيد.');
      await load();
    } catch (err) { setFormError(err.message); } finally { setBusy(false); }
  }

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
      {notice ? <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert> : null}

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

      {!loading && tab === 'requests' ? (
        <div className="grid gap-4">
          <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div className="min-w-0">
              <h3 className="font-display text-[15px] font-semibold text-ink">طلبات دفع المجموعات</h3>
              <p className="mt-0.5 text-[11.5px] text-muted">أرسل طلباً بالمبلغ وعدد الحصص أو الشهر، وسيؤكده معلمك.</p>
            </div>
            <Button size="sm" icon={Plus} disabled={groups.length === 0} onClick={() => { setForm(emptyRequest()); setFormError(''); setFormOpen(true); }}>طلب دفع جديد</Button>
          </Card>

          {groups.length === 0 ? <Alert tone="info">تحتاج للانضمام إلى مجموعة مقبولة من معلمك أولاً حتى تستطيع إرسال طلب دفع.</Alert> : null}

          {requests.length === 0 ? (
            <Card><EmptyState icon={ClipboardCheck} title="لا توجد طلبات دفع" description="عند إرسال طلب ستتابع حالته هنا حتى يؤكده معلمك." /></Card>
          ) : (
            <div className="grid gap-2">
              {requests.map((row) => (
                <Card key={row.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={row.status === 'Approved' ? 'success' : row.status === 'Rejected' ? 'danger' : 'warning'}>
                          {row.status === 'Approved' ? 'مؤكد' : row.status === 'Rejected' ? 'مرفوض' : 'بانتظار تأكيد المدرس'}
                        </Badge>
                        <Badge tone="neutral">{row.groupName || 'مجموعة'}</Badge>
                        <span className="text-[10.5px] text-muted">{row.teacherName || 'معلم'}</span>
                      </div>
                      <p className="mt-1.5 text-[13px] font-bold text-ink">
                        {money(row.amount)} · {row.coverageType === 'Sessions'
                          ? `${formatNumber(row.sessionsCount || 0)} حصة`
                          : `شهر ${MONTHS[(Number(row.periodMonth) || 1) - 1]} ${row.periodYear || ''}`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">{methodLabels[row.method] || row.method} · {formatDate(row.createdAtUtc)}</p>
                      {row.notes ? <p className="mt-0.5 text-[11px] text-subtle">{row.notes}</p> : null}
                      {row.reviewNote ? <p className="mt-1 text-[11px] font-bold text-ink">ملاحظة المدرس: {row.reviewNote}</p> : null}
                      {row.status === 'Approved' && row.receiptNumber ? <p className="mt-1 font-mono text-[10.5px] text-emerald">إيصال: {row.receiptNumber}</p> : null}
                      {row.receiptUrl ? <a href={row.receiptUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-[11px] font-bold text-primary underline">عرض صورة التحويل</a> : null}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div className="min-w-0">
              <h3 className="font-display text-[15px] font-semibold text-ink">طلبات اشتراك الكورسات</h3>
              <p className="mt-0.5 text-[11.5px] text-muted">طلبات اشتراكك في الكورسات المدفوعة مع صورة التحويل وحالتها.</p>
            </div>
          </Card>
          {courseRequests.length === 0 ? (
            <Card><EmptyState icon={ClipboardCheck} title="لا توجد طلبات كورسات" description="افتح أي كورس مدفوع من «استكشف» وأرسل سكرين التحويل لمعلمك." /></Card>
          ) : (
            <div className="grid gap-2">
              {courseRequests.map((row) => (
                <Card key={row.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={row.status === 'Approved' ? 'success' : row.status === 'Rejected' ? 'danger' : 'warning'}>
                          {row.status === 'Approved' ? 'مؤكد' : row.status === 'Rejected' ? 'مرفوض' : 'بانتظار تأكيد المدرس'}
                        </Badge>
                        <Badge tone="blue">{row.courseTitle || 'كورس'}</Badge>
                        <span className="text-[10.5px] text-muted">{row.teacherName || 'معلم'}</span>
                      </div>
                      <p className="mt-1.5 text-[13px] font-bold text-ink">{money(row.amount)}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{methodLabels[row.method] || row.method} · {formatDate(row.createdAtUtc)}</p>
                      {row.notes ? <p className="mt-0.5 text-[11px] text-subtle">{row.notes}</p> : null}
                      {row.reviewNote ? <p className="mt-1 text-[11px] font-bold text-ink">ملاحظة المدرس: {row.reviewNote}</p> : null}
                      {row.receiptUrl ? <a href={row.receiptUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-[11px] font-bold text-primary underline">عرض صورة التحويل</a> : null}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
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

      {formOpen ? (
        <Modal open onClose={() => setFormOpen(false)} icon={Send} title="طلب دفع جديد"
          description="اكتب المبلغ وحدد إن كان مدفوعاً عن عدد حصص أو عن شهر، وسيراجعه معلمك."
          footer={<>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>إلغاء</Button>
            <Button icon={Send} loading={busy} onClick={submitRequest}>إرسال الطلب</Button>
          </>}>
          <div className="grid gap-4">
            {formError ? <Alert tone="danger">{formError}</Alert> : null}
            <Field label="المجموعة">
              <Select value={form.groupId} onChange={(e) => setForm((p) => ({ ...p, groupId: e.target.value }))}>
                <option value="">اختر المجموعة</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}{group.teacherName ? ` — ${group.teacherName}` : ''}</option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="المبلغ المدفوع (ج.م)" hint="اكتب المبلغ الذي دفعته فعلاً.">
                <Input type="number" min="0" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
              </Field>
              <Field label="طريقة الدفع">
                <Select value={form.method} onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}>
                  {Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label="الدفع مقابل">
                <Select value={form.coverageType} onChange={(e) => setForm((p) => ({ ...p, coverageType: e.target.value }))}>
                  <option value="Month">شهر</option>
                  <option value="Sessions">عدد حصص</option>
                </Select>
              </Field>
              {form.coverageType === 'Sessions' ? (
                <Field label="عدد الحصص">
                  <Input type="number" min="1" max="200" value={form.sessionsCount} onChange={(e) => setForm((p) => ({ ...p, sessionsCount: e.target.value }))} />
                </Field>
              ) : (
                <>
                  <Field label="الشهر">
                    <Select value={form.periodMonth} onChange={(e) => setForm((p) => ({ ...p, periodMonth: e.target.value }))}>
                      {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
                    </Select>
                  </Field>
                  <Field label="السنة">
                    <Select value={form.periodYear} onChange={(e) => setForm((p) => ({ ...p, periodYear: e.target.value }))}>
                      {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
                    </Select>
                  </Field>
                </>
              )}
              <Field label="المرجع / رقم العملية (اختياري)">
                <Input value={form.reference} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} />
              </Field>
            </div>
            <Field label="ملاحظات (اختياري)">
              <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="min-h-20" />
            </Field>
            <ImageUploader token={token} value={form.receiptUrl || ''} onChange={(url) => setForm((p) => ({ ...p, receiptUrl: url }))}
              label={form.method === 'Cash' ? 'صورة التحويل (اختياري)' : 'صورة التحويل (مطلوبة)'}
              hint={form.method === 'Cash' ? 'اختياري للدفع النقدي — يمكنك إرفاق إيصال إن وُجد.' : 'لازم ترفع سكرين التحويل (InstaPay / فودافون كاش / تحويل بنكي) قبل إرسال الطلب.'} />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
