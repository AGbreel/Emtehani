import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck, CalendarDays, CheckCircle2, CreditCard, History, Info, RefreshCw,
  ShieldCheck, Sparkles, Wallet,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader,
  Select, Skeleton, StatCard, cn,
} from '../components/ui';
import ImageUploader from '../components/ImageUploader';
import PaymentDetails, { methodOptions, usePaymentMethods } from '../components/PaymentDetails';
import { request } from '../lib/api';
import { methodLabel } from '../lib/paymentMethods';
import { formatDate, formatNumber } from '../lib/format';

const featureLabels = {
  exams: 'إنشاء وإدارة الامتحانات',
  exam_creation: 'إنشاء الامتحانات',
  students: 'إدارة الطلاب المرتبطين',
  student_management: 'إدارة الطلاب',
  results: 'متابعة النتائج والتحليلات',
  analytics: 'تحليلات الأداء',
  essay_review: 'مراجعة الإجابات المقالية',
  manual_grading: 'التصحيح اليدوي',
  audit_log: 'سجل النشاط',
  invitations: 'دعوة الطلاب',
  academic_history: 'السجل الأكاديمي للطلاب',
};

function featureLabel(key) {
  return featureLabels[key] || key.replace(/[_-]/g, ' ');
}

const statusMeta = {
  Confirmed: { label: 'مؤكد', tone: 'emerald' },
  Pending: { label: 'بانتظار الدفع', tone: 'warning' },
  Suspended: { label: 'موقوف', tone: 'danger' },
  Cancelled: { label: 'ملغي', tone: 'danger' },
  Rejected: { label: 'مرفوض', tone: 'danger' },
  Expired: { label: 'منتهي', tone: 'neutral' },
  Grace: { label: 'فترة سماح', tone: 'info' },
};

const money = (value, currency = 'EGP') => `${formatNumber(Number(value) || 0)} ${currency === 'EGP' ? 'ج.م' : currency}`;

export default function SubscriptionPage({ token, onConfirmed }) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState({ subscriptions: [], payments: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyCode, setBusyCode] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [payForm, setPayForm] = useState({ method: 'VodafoneCash', reference: '', receiptUrl: '', periods: 1 });
  const [payError, setPayError] = useState('');
  const [paying, setPaying] = useState(false);
  const paymentInfo = usePaymentMethods(token);
  const methods = methodOptions(paymentInfo.items);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const [result, historyResult] = await Promise.all([
        request('/api/teacher/subscription', { token }),
        request('/api/teacher/subscription/payments', { token }).catch(() => ({ subscriptions: [], payments: [] })),
      ]);
      setData(result);
      setHistory({ subscriptions: historyResult?.subscriptions || [], payments: historyResult?.payments || [] });
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const subscription = data?.subscription || null;
  const plans = data?.plans || [];
  const status = subscription?.status ? statusMeta[subscription.status] || { label: subscription.status, tone: 'neutral' } : null;
  const features = useMemo(() => subscription?.features || [], [subscription]);
  const requiresSelection = Boolean(data?.requiresSelection);
  const pendingPayment = useMemo(
    () => (history.payments || []).find((payment) => payment.status === 'Pending'),
    [history.payments],
  );

  async function chooseFree(plan) {
    setBusyCode(plan.code);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/teacher/subscription', {
        token, method: 'POST', body: JSON.stringify({ planCode: plan.code }),
      });
      setNotice(result?.message || 'تم تأكيد اشتراكك.');
      onConfirmed?.(result);
      await load(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyCode('');
    }
  }

  function openPaid(plan) {
    setSelectedPlan(plan);
    setPayForm({ method: methods[0]?.value || 'VodafoneCash', reference: '', receiptUrl: '', periods: 1 });
    setPayError('');
  }

  async function submitPaid() {
    if (!payForm.reference.trim() && !payForm.receiptUrl) {
      setPayError('أضف رقم عملية أو صورة إيصال حتى تستطيع الإدارة التحقق من الدفع.');
      return;
    }
    setPaying(true);
    setPayError('');
    try {
      const result = await request('/api/teacher/subscription', {
        token, method: 'POST',
        body: JSON.stringify({
          planCode: selectedPlan.code,
          method: payForm.method,
          reference: payForm.reference || null,
          receiptUrl: payForm.receiptUrl || null,
          periods: Math.max(1, Number(payForm.periods) || 1),
        }),
      });
      setSelectedPlan(null);
      setNotice(result?.message || 'تم تسجيل طلب الاشتراك وسيتم تفعيله بعد مراجعة الدفع.');
      await load(true);
    } catch (err) { setPayError(err.message); } finally { setPaying(false); }
  }

  if (loading) {
    return (
      <div>
        <PageHeader eyebrow="الخطة الحالية" title="الاشتراك" description="اختر الباقة المناسبة لحسابك المدرسي." />
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-80 w-full rounded-card" />
          <Skeleton className="h-80 w-full rounded-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="الخطة الحالية"
        title="الاشتراك"
        description="اشتراكك مع منصة امتحاني منفصل تماماً عن مدفوعات طلابك. الخطط المجانية تُفعّل فوراً، والمدفوعة بعد مراجعة الدفع."
        action={<Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert> : null}
      {requiresSelection && !pendingPayment ? (
        <Alert tone="warning" title="اختر باقتك للمتابعة">
          {plans.some((plan) => Number(plan.price) > 0)
            ? 'اختر خطة مجانية للبدء فوراً، أو خطة مدفوعة وارفع إثبات الدفع لتفعيلها بعد المراجعة.'
            : 'اختر الباقة المناسبة لتأكيد اشتراكك.'}
        </Alert>
      ) : null}
      {pendingPayment ? (
        <Alert tone="info" title="طلب اشتراك قيد المراجعة">
          تم تسجيل دفعة بقيمة {money(pendingPayment.amount, pendingPayment.currency)} بانتظار مراجعة الإدارة
          {pendingPayment.reference ? ` — المرجع: ${pendingPayment.reference}` : ''}.
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CreditCard} label="الباقة الحالية" value={subscription?.planName || '—'} note={subscription?.planCode || 'لم يتم الاختيار'} />
        <StatCard icon={BadgeCheck} label="حالة الاشتراك" value={status?.label || 'غير مختار'} note={subscription?.confirmedAtUtc ? `تم التأكيد ${formatDate(subscription.confirmedAtUtc)}` : 'بانتظار التأكيد'} tone={subscription?.status === 'Confirmed' ? 'emerald' : subscription?.status === 'Pending' ? 'warning' : 'neutral'} />
        <StatCard icon={CalendarDays} label="تاريخ البداية" value={subscription?.startedAtUtc ? formatDate(subscription.startedAtUtc) : '—'} note="يُحفظ عند التأكيد" tone="primary" />
        <StatCard icon={ShieldCheck} label="تاريخ الانتهاء" value={subscription?.endsAtUtc ? formatDate(subscription.endsAtUtc) : 'بدون نهاية'} note={Number(subscription?.price) > 0 ? `كل ${formatNumber(subscription?.billingPeriodDays || 30)} يوم` : 'الخطة المجانية مفتوحة'} tone="neutral" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[14px] font-bold text-ink">الباقات المتاحة</h2>
              <p className="mt-0.5 text-[11px] text-muted">الأسعار والمدد والحدود تُدار من إدارة المنصة.</p>
            </div>
            <Badge tone="primary">{plans.length} باقة</Badge>
          </div>

          {plans.length === 0 ? (
            <EmptyState icon={CreditCard} title="لا توجد باقات مفعّلة" description="تواصل مع إدارة المنصة لتفعيل باقتك." className="py-8" />
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {plans.map((plan) => {
                const isCurrent = subscription?.planId === plan.id;
                const confirmed = isCurrent && subscription?.status === 'Confirmed';
                const isFree = Number(plan.price) <= 0;
                const isPendingPlan = isCurrent && subscription?.status === 'Pending';
                return (
                  <div
                    key={plan.id}
                    className={cn('relative flex flex-col rounded-[16px] border p-4 transition', isCurrent ? 'border-primary bg-primary-soft/40' : 'border-line bg-surface')}
                    data-testid={`plan-${plan.code}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="text-[15px] font-bold text-ink">{plan.name}</h3>
                          {plan.isDefault ? <Badge tone="emerald">الافتراضية</Badge> : null}
                          {!isFree ? <Badge tone="info">مدفوعة</Badge> : null}
                        </div>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-subtle" dir="ltr">{plan.code}</p>
                      </div>
                      <span className="grid size-9 place-items-center rounded-[10px] bg-surface text-primary"><CreditCard size={17} /></span>
                    </div>

                    <p className="mt-2 min-h-10 text-[11.5px] leading-6 text-muted">{plan.description || 'باقة متاحة ضمن المنصة.'}</p>

                    <p className="mt-2 text-[20px] font-extrabold text-primary">
                      {isFree ? 'مجاناً' : money(plan.price, plan.currency)}
                      {!isFree ? <span className="text-[10.5px] font-bold text-muted"> / {formatNumber(plan.billingPeriodDays)} يوم</span> : null}
                    </p>

                    <ul className="mt-3 grid flex-1 gap-1.5">
                      {(plan.features || []).map((feature) => (
                        <li key={feature} className="flex items-center gap-1.5 text-[11.5px] text-ink"><CheckCircle2 size={12} className="shrink-0 text-emerald" />{featureLabel(feature)}</li>
                      ))}
                    </ul>

                    <div className="mt-3 grid grid-cols-2 gap-1 text-[10.5px] text-muted">
                      <span>طلاب: {plan.maxStudents ? formatNumber(plan.maxStudents) : '∞'}</span>
                      <span>كورسات: {plan.maxCourses ? formatNumber(plan.maxCourses) : '∞'}</span>
                      <span>مجموعات: {plan.maxGroups ? formatNumber(plan.maxGroups) : '∞'}</span>
                      <span>مساعدون: {plan.maxAssistants ? formatNumber(plan.maxAssistants) : '∞'}</span>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                      <span className="text-[10.5px] text-subtle">
                        {confirmed ? 'باقتك الحالية' : isPendingPlan ? 'بانتظار مراجعة الدفع' : isFree ? 'بدون رسوم' : `سماح ${formatNumber(plan.graceDays)} يوم`}
                      </span>
                      <Button
                        size="xs"
                        icon={confirmed ? CheckCircle2 : Sparkles}
                        variant={confirmed ? 'secondary' : isPendingPlan ? 'soft' : 'primary'}
                        disabled={confirmed || isPendingPlan}
                        loading={busyCode === plan.code}
                        onClick={() => (isFree ? chooseFree(plan) : openPaid(plan))}
                      >
                        {confirmed ? 'مؤكدة' : isPendingPlan ? 'قيد المراجعة' : isCurrent ? 'تجديد الباقة' : isFree ? 'اختيار الباقة' : 'اشترك الآن'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 rounded-[12px] border border-line bg-surface-soft p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink"><Info size={12} className="text-primary" />كيف يعمل الدفع؟</p>
            <p className="mt-1 text-[10.5px] leading-5 text-muted">
              سجّل الدفع مع رقم العملية أو صورة الإيصال، ثم تراجع الإدارة الطلب وتفعّل الاشتراك. لن يُحذف أي من بياناتك عند انتهاء الاشتراك؛ تتحول للقراءة فقط.
            </p>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="p-4">
            <h2 className="text-[13.5px] font-bold text-ink">مميزات باقتك</h2>
            <p className="mt-0.5 text-[10.5px] text-muted">تُدار من إدارة المنصة وتظهر تلقائياً.</p>
            {features.length === 0 ? (
              <p className="mt-3 rounded-[10px] bg-surface-soft p-3 text-[11px] text-muted">لا توجد مميزات مسجلة لهذه الباقة بعد.</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 rounded-[10px] border border-line bg-surface-soft p-2.5 text-[11.5px] leading-5 text-ink">
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald" />{featureLabel(feature)}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="flex items-center gap-1.5 text-[13.5px] font-bold text-ink"><History size={14} /> سجل المدفوعات</h2>
            {history.payments.length === 0 ? (
              <p className="mt-3 text-[11px] text-muted">لا توجد مدفوعات مسجلة.</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {history.payments.slice(0, 8).map((payment) => (
                  <div key={payment.id} className="rounded-xl border border-line/70 p-2.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-ink">{money(payment.amount, payment.currency)}</span>
                      <Badge tone={payment.status === 'Approved' ? 'success' : payment.status === 'Rejected' ? 'danger' : 'warning'}>
                        {payment.status === 'Approved' ? 'مقبولة' : payment.status === 'Rejected' ? 'مرفوضة' : 'قيد المراجعة'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-muted">{methodLabel(payment.method)} · {formatDate(payment.createdAtUtc)}</p>
                    {payment.adminNote ? <p className="mt-1 text-[10.5px] text-danger">{payment.adminNote}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {selectedPlan ? (
        <Modal open onClose={() => setSelectedPlan(null)} size="lg" icon={Wallet} title={`الاشتراك في ${selectedPlan.name}`}
          description={`${money(selectedPlan.price, selectedPlan.currency)} لكل ${formatNumber(selectedPlan.billingPeriodDays)} يوم — يُفعّل بعد مراجعة الدفع.`}
          footer={<><Button variant="ghost" onClick={() => setSelectedPlan(null)}>إلغاء</Button><Button loading={paying} onClick={submitPaid}>إرسال طلب الاشتراك</Button></>}>
          <div className="grid gap-4">
            {payError ? <Alert tone="danger">{payError}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="طريقة الدفع">
                <Select value={payForm.method} onChange={(e) => setPayForm((p) => ({ ...p, method: e.target.value }))}>
                  {methods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                </Select>
              </Field>
              <Field label="عدد الدورات" hint="كل دورة = مدة الخطة.">
                <Select value={payForm.periods} onChange={(e) => setPayForm((p) => ({ ...p, periods: Number(e.target.value) }))}>
                  {[1, 2, 3, 6, 12].map((period) => <option key={period} value={period}>{period} دورة — {money(Number(selectedPlan.price) * period, selectedPlan.currency)}</option>)}
                </Select>
              </Field>
              <Field label="رقم العملية / المرجع"><Input value={payForm.reference} onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))} dir="ltr" /></Field>
            </div>
            <PaymentDetails token={token} method={payForm.method} />
            <div className="rounded-xl bg-surface-soft p-3 text-[12px] font-bold">
              الإجمالي: <span className="text-primary">{money(Number(selectedPlan.price) * Math.max(1, Number(payForm.periods) || 1), selectedPlan.currency)}</span>
            </div>
            <ImageUploader token={token} value={payForm.receiptUrl} onChange={(url) => setPayForm((p) => ({ ...p, receiptUrl: url }))} label="صورة إيصال الدفع (موصى بها)" hint="ارفع صورة واضحة للإيصال أو استخدم رابطاً آمناً." />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
