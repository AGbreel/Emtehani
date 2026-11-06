import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarDays, CheckCircle2, CreditCard, Info, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Skeleton, StatCard } from '../components/ui';
import { request } from '../lib/api';
import { formatDate } from '../lib/format';

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
  Pending: { label: 'بانتظار التأكيد', tone: 'warning' },
  Cancelled: { label: 'ملغي', tone: 'danger' },
  Expired: { label: 'منتهي', tone: 'neutral' },
};

export default function SubscriptionPage({ token, onConfirmed }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyCode, setBusyCode] = useState('');

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await request('/api/teacher/subscription', { token });
      setData(result);
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

  async function choose(plan) {
    setBusyCode(plan.code);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/teacher/subscription', {
        token,
        method: 'POST',
        body: JSON.stringify({ planCode: plan.code }),
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
    <div>
      <PageHeader
        eyebrow="الخطة الحالية"
        title="الاشتراك"
        description="باقة Free متاحة الآن دون أي رسوم أو وسائل دفع. بنية الباقات جاهزة لإضافة خطط أخرى مستقبلاً."
        action={<Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}
      {requiresSelection ? (
        <Alert tone="warning" className="mb-4" title="اختر باقتك للمتابعة">
          تم إنشاء حساب المدرس بنجاح. اختر باقة Free لتأكيد الاشتراك. لا توجد رسوم، ولن يُطلب منك أي وسيلة دفع.
        </Alert>
      ) : null}

      <div className="ui-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CreditCard} label="الباقة الحالية" value={subscription?.planName || 'Free'} note={subscription?.planCode || 'free'} />
        <StatCard icon={BadgeCheck} label="حالة الاشتراك" value={status?.label || 'غير مختار'} note={subscription?.confirmedAtUtc ? `تم التأكيد ${formatDate(subscription.confirmedAtUtc)}` : 'بانتظار التأكيد'} tone={subscription?.status === 'Confirmed' ? 'emerald' : 'warning'} />
        <StatCard icon={CalendarDays} label="تاريخ البداية" value={subscription?.startedAtUtc ? formatDate(subscription.startedAtUtc) : '—'} note="يُحفظ عند التأكيد" tone="primary" />
        <StatCard icon={ShieldCheck} label="تاريخ الانتهاء" value={subscription?.endsAtUtc ? formatDate(subscription.endsAtUtc) : 'بدون نهاية'} note="الباقة المجانية مفتوحة" tone="neutral" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[14px] font-bold text-ink">الباقات المتاحة</h2>
              <p className="mt-0.5 text-[11px] text-muted">لا تُعرض أسعار أو باقات مدفوعة حالياً.</p>
            </div>
            <Badge tone="primary">{plans.length} باقة</Badge>
          </div>

          {plans.length === 0 ? (
            <EmptyState icon={CreditCard} title="لا توجد باقات مفعّلة" description="تواصل مع إدارة المنصة لتفعيل باقة Free." className="py-8" />
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {plans.map((plan) => {
                const isCurrent = subscription?.planId === plan.id;
                const confirmed = isCurrent && subscription?.status === 'Confirmed';
                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-[16px] border p-4 transition ${isCurrent ? 'border-primary bg-primary-soft/40' : 'border-line bg-surface'}`}
                    data-testid={`plan-${plan.code}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-[15px] font-bold text-ink">{plan.name}</h3>
                          {plan.isDefault ? <Badge tone="emerald">الافتراضية</Badge> : null}
                        </div>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-subtle" dir="ltr">{plan.code}</p>
                      </div>
                      <span className="grid size-9 place-items-center rounded-[10px] bg-surface text-primary"><CreditCard size={17} /></span>
                    </div>

                    <p className="mt-2 min-h-10 text-[11.5px] leading-6 text-muted">{plan.description || 'باقة متاحة ضمن المنصة.'}</p>

                    <ul className="mt-3 grid flex-1 gap-1.5">
                      {(plan.features || []).map((feature) => (
                        <li key={feature} className="flex items-center gap-1.5 text-[11.5px] text-ink"><CheckCircle2 size={12} className="shrink-0 text-emerald" />{featureLabel(feature)}</li>
                      ))}
                    </ul>

                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                      <span className="text-[10.5px] text-subtle">{confirmed ? 'باقتك الحالية' : 'بدون رسوم'}</span>
                      <Button
                        size="xs"
                        icon={confirmed ? CheckCircle2 : Sparkles}
                        variant={confirmed ? 'secondary' : 'primary'}
                        disabled={confirmed}
                        loading={busyCode === plan.code}
                        onClick={() => choose(plan)}
                      >
                        {confirmed ? 'مؤكدة' : isCurrent ? 'تأكيد الباقة' : 'اختيار الباقة'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 rounded-[12px] border border-line bg-surface-soft p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink"><Info size={12} className="text-primary" />لا يوجد دفع إلكتروني الآن</p>
            <p className="mt-1 text-[10.5px] leading-5 text-muted">اختيار الباقة يفعّل الاشتراك فوراً دون أي خصم أو بوابة دفع. عند إضافة باقات مدفوعة لاحقاً ستُضاف كخطط جديدة بنفس البنية.</p>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-[13.5px] font-bold text-ink">مميزات باقتك</h2>
          <p className="mt-0.5 text-[10.5px] text-muted">تُدار من إعدادات النظام وتظهر تلقائياً هنا.</p>
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
          <p className="mt-3 border-t border-line pt-3 text-[10px] leading-5 text-subtle">ليس هناك حد افتراضي لعدد الطلاب أو الامتحانات. أي حدود مستقبلية ستُحدد بقرار واضح من إعدادات النظام.</p>
        </Card>
      </div>
    </div>
  );
}
