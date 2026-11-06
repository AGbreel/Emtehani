import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck, Ban, CheckCircle2, Crown, Pencil, Plus, RefreshCw, Search,
  ShieldCheck, Users, Wallet, XCircle,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal,
  PageHeader, Select, Skeleton, StatCard, Textarea, cn,
} from '../components/ui';
import { request } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';

const money = (value, currency = 'EGP') => `${formatNumber(Number(value) || 0)} ${currency === 'EGP' ? 'ج.م' : currency}`;

const tabs = [
  { value: 'plans', label: 'الخطط' },
  { value: 'subscriptions', label: 'اشتراكات المدرسين' },
  { value: 'payments', label: 'مدفوعات المنصة' },
];

const statusLabels = {
  Confirmed: 'مؤكد', Pending: 'بانتظار المراجعة', Expired: 'منتهي', Suspended: 'موقوف',
  Cancelled: 'ملغى', Rejected: 'مرفوض', Approved: 'مقبول', Grace: 'فترة سماح',
};
const statusTones = {
  Confirmed: 'success', Pending: 'warning', Expired: 'neutral', Suspended: 'danger',
  Cancelled: 'danger', Rejected: 'danger', Approved: 'success', Grace: 'info',
};

const emptyPlan = {
  code: '', name: '', description: '', isActive: true, isDefault: false, isPublic: true, sortOrder: 0,
  price: 0, currency: 'EGP', billingPeriodDays: 30, trialDays: 0, graceDays: 7,
  maxStudents: 0, maxCourses: 0, maxGroups: 0, maxAssistants: 0, storageMb: 0, maxVideoMinutes: 0,
  featuresJson: '[]',
};

export default function AdminPlansPage({ token }) {
  const [tab, setTab] = useState('plans');
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyPlan);
  const [modalError, setModalError] = useState('');
  const [note, setNote] = useState('');

  const flash = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [planData, subscriptionData, paymentData] = await Promise.all([
        request('/api/admin/plans', { token }),
        request('/api/admin/subscriptions', { token }),
        request('/api/admin/platform-payments', { token }),
      ]);
      setPlans(planData?.items || []);
      setSubscriptions(subscriptionData?.items || []);
      setPayments(paymentData?.items || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const activeSubscriptions = subscriptions.filter((item) => item.status === 'Confirmed').length;
  const pendingPayments = payments.filter((item) => item.status === 'Pending');
  const monthlyRevenue = subscriptions
    .filter((item) => item.status === 'Confirmed')
    .reduce((sum, item) => {
      const plan = plans.find((p) => p.id === item.planId);
      return sum + (Number(plan?.price) || 0);
    }, 0);

  const filteredSubscriptions = useMemo(() => {
    const term = search.trim();
    return subscriptions.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (!term) return true;
      return (item.teacherName || '').includes(term) || (item.email || '').includes(term) || (item.planName || '').includes(term);
    });
  }, [subscriptions, search, statusFilter]);

  const filteredPayments = useMemo(() => {
    if (!statusFilter) return payments;
    return payments.filter((item) => item.status === statusFilter);
  }, [payments, statusFilter]);

  function openPlan(plan = null) {
    setEditing(plan);
    setForm(plan ? {
      ...emptyPlan,
      ...plan,
      description: plan.description || '',
      featuresJson: plan.featuresJson || '[]',
    } : { ...emptyPlan });
    setModalError('');
    setModal('plan');
  }

  async function savePlan() {
    setModalError('');
    if (!form.name?.trim()) return setModalError('اسم الخطة مطلوب.');
    if (!editing && !/^[a-z0-9_-]{2,40}$/i.test(form.code || '')) return setModalError('كود الخطة مطلوب (حروف إنجليزية وأرقام وشرطات).');
    if (Number(form.price) < 0) return setModalError('السعر لا يكون سالباً.');
    setBusy('plan');
    try {
      const payload = {
        code: (form.code || '').trim().toLowerCase(),
        name: form.name.trim(),
        description: form.description || null,
        isActive: Boolean(form.isActive),
        isDefault: Boolean(form.isDefault),
        isPublic: Boolean(form.isPublic),
        sortOrder: Number(form.sortOrder) || 0,
        price: Number(form.price) || 0,
        currency: form.currency || 'EGP',
        billingPeriodDays: Math.max(1, Number(form.billingPeriodDays) || 30),
        trialDays: Math.max(0, Number(form.trialDays) || 0),
        graceDays: Math.max(0, Number(form.graceDays) || 0),
        maxStudents: Math.max(0, Number(form.maxStudents) || 0),
        maxCourses: Math.max(0, Number(form.maxCourses) || 0),
        maxGroups: Math.max(0, Number(form.maxGroups) || 0),
        maxAssistants: Math.max(0, Number(form.maxAssistants) || 0),
        storageMb: Math.max(0, Number(form.storageMb) || 0),
        maxVideoMinutes: Math.max(0, Number(form.maxVideoMinutes) || 0),
        featuresJson: form.featuresJson || '[]',
      };
      if (editing) await request(`/api/admin/plans/${editing.id}`, { token, method: 'PUT', body: JSON.stringify(payload) });
      else await request('/api/admin/plans', { token, method: 'POST', body: JSON.stringify(payload) });
      setModal(null);
      flash(editing ? 'تم تحديث الخطة.' : 'تم إنشاء الخطة.');
      await load();
    } catch (err) { setModalError(err.message); } finally { setBusy(''); }
  }

  async function activate(item) {
    const days = window.prompt(`عدد أيام التفعيل لاشتراك ${item.teacherName} (اتركه فارغاً لاستخدام مدة الخطة):`, '');
    if (days === null) return;
    setBusy(item.id);
    try {
      await request(`/api/admin/subscriptions/${item.id}/activate`, {
        token, method: 'POST', body: JSON.stringify({ days: days ? Number(days) : null }),
      });
      flash('تم تفعيل الاشتراك وإشعار المدرس.');
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  async function stopSubscription(item, action) {
    const reason = window.prompt(action === 'suspend' ? 'سبب إيقاف الاشتراك:' : 'سبب إلغاء الاشتراك:');
    if (!reason?.trim()) return;
    setBusy(item.id);
    try {
      await request(`/api/admin/subscriptions/${item.id}/${action}`, {
        token, method: 'POST', body: JSON.stringify({ reason: reason.trim() }),
      });
      flash(action === 'suspend' ? 'تم إيقاف الاشتراك.' : 'تم إلغاء الاشتراك مع الاحتفاظ بالبيانات.');
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  async function reviewPayment(item, action) {
    setNote('');
    setModalError('');
    setModal({ type: 'review', payment: item, action });
  }

  async function confirmReview() {
    setBusy('review');
    try {
      await request(`/api/admin/platform-payments/${modal.payment.id}/${modal.action}`, {
        token, method: 'POST', body: JSON.stringify({ note: note || null }),
      });
      setModal(null);
      flash(modal.action === 'approve' ? 'تم قبول الدفعة وتفعيل الاشتراك.' : 'تم رفض الدفعة وإشعار المدرس.');
      await load();
    } catch (err) { setModalError(err.message); } finally { setBusy(''); }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="إدارة المنصة"
        title="الخطط والاشتراكات"
        description="تحكم في خطط المدرسين وأسعارها، راجع مدفوعاتهم، وفعّل الاشتراكات — كل ذلك منفصل عن أموال الطلاب."
        action={<div className="flex flex-wrap gap-2">
          <Button variant="soft" size="sm" icon={RefreshCw} onClick={load} loading={loading}>تحديث</Button>
          {tab === 'plans' ? <Button size="sm" icon={Plus} onClick={() => openPlan(null)}>خطة جديدة</Button> : null}
        </div>}
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Crown} label="الخطط" value={formatNumber(plans.length)} note={`${formatNumber(plans.filter((p) => p.isActive).length)} نشطة`} tone="primary" />
        <StatCard icon={Users} label="اشتراكات مؤكدة" value={formatNumber(activeSubscriptions)} note={`${formatNumber(subscriptions.length)} إجمالاً`} tone="emerald" />
        <StatCard icon={Wallet} label="قيمة الاشتراكات الشهرية" value={money(monthlyRevenue)} note="تقديري حسب الخطط" tone="blue" />
        <StatCard icon={ShieldCheck} label="مدفوعات بانتظار المراجعة" value={formatNumber(pendingPayments.length)} note="تحتاج قراراً" tone={pendingPayments.length ? 'warning' : 'emerald'} />
      </div>

      <Card className="p-2">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((item) => (
            <button key={item.value} type="button" onClick={() => { setTab(item.value); setStatusFilter(''); }}
              className={cn('shrink-0 rounded-[10px] px-3.5 py-2 text-[12.5px] font-bold transition', tab === item.value ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-surface-soft hover:text-ink')}>
              {item.label}
              {item.value === 'payments' && pendingPayments.length ? <span className="ms-1.5 rounded-full bg-danger px-1.5 text-[10px] text-white">{pendingPayments.length}</span> : null}
            </button>
          ))}
        </div>
      </Card>

      {loading ? <Card className="p-4"><Skeleton className="h-40 w-full" /></Card> : null}

      {!loading && tab === 'plans' ? (
        plans.length === 0 ? <Card><EmptyState icon={Crown} title="لا توجد خطط" description="أنشئ أول خطة اشتراك للمدرسين." /></Card> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <Card key={plan.id} className={cn('p-4', plan.isDefault && 'ring-1 ring-primary/25')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={plan.isActive ? 'success' : 'neutral'}>{plan.isActive ? 'نشطة' : 'متوقفة'}</Badge>
                      {plan.isDefault ? <Badge tone="primary">افتراضية</Badge> : null}
                      {plan.isPublic ? <Badge tone="info">عامة</Badge> : null}
                    </div>
                    <h3 className="mt-1.5 font-display text-[15px] font-semibold text-ink">{plan.name}</h3>
                    <p className="font-mono text-[10.5px] text-muted">{plan.code}</p>
                  </div>
                  <IconButton label="تعديل الخطة" onClick={() => openPlan(plan)}><Pencil size={15} /></IconButton>
                </div>
                <p className="mt-2 text-[19px] font-extrabold text-primary">{money(plan.price, plan.currency)}</p>
                <p className="text-[11px] text-muted">كل {formatNumber(plan.billingPeriodDays)} يوم</p>
                {plan.description ? <p className="mt-2 line-clamp-2 text-[11.5px] leading-6 text-muted">{plan.description}</p> : null}
                <div className="mt-3 grid grid-cols-2 gap-1 text-[10.5px] text-muted">
                  <span>طلاب: {plan.maxStudents ? formatNumber(plan.maxStudents) : '∞'}</span>
                  <span>كورسات: {plan.maxCourses ? formatNumber(plan.maxCourses) : '∞'}</span>
                  <span>مجموعات: {plan.maxGroups ? formatNumber(plan.maxGroups) : '∞'}</span>
                  <span>مساعدون: {plan.maxAssistants ? formatNumber(plan.maxAssistants) : '∞'}</span>
                </div>
                <p className="mt-3 text-[10.5px] text-muted">مشتركون نشطون: {formatNumber(plan.activeSubscriptions)} · سماح {formatNumber(plan.graceDays)} يوم</p>
              </Card>
            ))}
          </div>
        )
      ) : null}

      {!loading && tab === 'subscriptions' ? (
        <div className="grid gap-4">
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو البريد..." className="flex-1" />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
              <option value="">كل الحالات</option>
              {['Confirmed', 'Pending', 'Grace', 'Expired', 'Suspended', 'Cancelled', 'Rejected'].map((status) => (
                <option key={status} value={status}>{statusLabels[status]}</option>
              ))}
            </Select>
          </Card>
          {filteredSubscriptions.length === 0 ? <Card><EmptyState icon={Users} title="لا توجد اشتراكات" description="ستظهر اشتراكات المدرسين هنا." /></Card> : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-start text-[12px]">
                <thead className="bg-surface-soft text-[11px] font-extrabold text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start">المدرس</th>
                    <th className="px-4 py-3 text-start">الخطة</th>
                    <th className="px-4 py-3 text-start">الحالة</th>
                    <th className="px-4 py-3 text-start">ينتهي</th>
                    <th className="px-4 py-3 text-start">المتبقي</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredSubscriptions.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-bold text-ink">{item.teacherName || '—'}</p>
                        <p className="text-[10.5px] text-muted">{item.email}</p>
                      </td>
                      <td className="px-4 py-2.5">{item.planName || item.planCode || '—'}</td>
                      <td className="px-4 py-2.5"><Badge tone={statusTones[item.status] || 'neutral'}>{statusLabels[item.status] || item.status}</Badge></td>
                      <td className="px-4 py-2.5 text-muted">{formatDate(item.endsAtUtc)}</td>
                      <td className={cn('px-4 py-2.5 font-bold', (item.daysLeft ?? 1) <= 5 ? 'text-danger' : 'text-ink')}>{item.endsAtUtc ? `${formatNumber(item.daysLeft)} يوم` : '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <Button size="xs" variant="soft" icon={BadgeCheck} loading={busy === item.id} onClick={() => activate(item)}>تفعيل</Button>
                          {item.status === 'Confirmed' ? <IconButton label="إيقاف" tone="danger" onClick={() => stopSubscription(item, 'suspend')}><Ban size={14} /></IconButton> : null}
                          {item.status !== 'Cancelled' ? <IconButton label="إلغاء" tone="danger" onClick={() => stopSubscription(item, 'cancel')}><XCircle size={14} /></IconButton> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      ) : null}

      {!loading && tab === 'payments' ? (
        <div className="grid gap-4">
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
              <option value="">كل الحالات</option>
              {['Pending', 'Approved', 'Rejected'].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
            </Select>
            <span className="ms-auto text-[11.5px] text-muted">{formatNumber(filteredPayments.length)} دفعة</span>
          </Card>
          {filteredPayments.length === 0 ? <Card><EmptyState icon={Wallet} title="لا توجد مدفوعات" description="عندما يرسل مدرس إثبات دفع سيظهر هنا للمراجعة." /></Card> : (
            <div className="grid gap-2">
              {filteredPayments.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={statusTones[item.status] || 'neutral'}>{statusLabels[item.status] || item.status}</Badge>
                        <span className="text-[10.5px] text-muted">{formatDate(item.createdAtUtc)}</span>
                      </div>
                      <p className="mt-1 text-[13px] font-bold text-ink">{item.teacherName || item.teacherId}</p>
                      <p className="text-[11px] text-muted">{item.teacherEmail} · {item.method || '—'} · {item.reference || 'بدون مرجع'}</p>
                      {item.adminNote ? <p className="mt-1 text-[11px] text-muted">ملاحظة: {item.adminNote}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[16px] font-extrabold text-primary">{money(item.amount, item.currency)}</span>
                      {item.receiptUrl ? <a href={item.receiptUrl} target="_blank" rel="noreferrer"><Button size="xs" variant="soft">الإيصال</Button></a> : null}
                      {item.status === 'Pending' ? (
                        <>
                          <Button size="xs" variant="success" icon={CheckCircle2} onClick={() => reviewPayment(item, 'approve')}>قبول</Button>
                          <Button size="xs" variant="danger" icon={XCircle} onClick={() => reviewPayment(item, 'reject')}>رفض</Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {modal === 'plan' ? (
        <Modal open onClose={() => setModal(null)} size="xl" icon={Crown} title={editing ? 'تعديل الخطة' : 'خطة جديدة'}
          footer={<><Button variant="ghost" onClick={() => setModal(null)}>إلغاء</Button><Button loading={busy === 'plan'} onClick={savePlan}>حفظ</Button></>}>
          <div className="grid gap-4">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="كود الخطة"><Input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} disabled={Boolean(editing)} dir="ltr" /></Field>
              <Field label="اسم الخطة"><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field>
              <Field label="السعر"><Input type="number" min="0" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} /></Field>
              <Field label="العملة"><Input value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} dir="ltr" /></Field>
              <Field label="مدة الدورة (أيام)"><Input type="number" min="1" value={form.billingPeriodDays} onChange={(e) => setForm((p) => ({ ...p, billingPeriodDays: e.target.value }))} /></Field>
              <Field label="أيام تجربة"><Input type="number" min="0" value={form.trialDays} onChange={(e) => setForm((p) => ({ ...p, trialDays: e.target.value }))} /></Field>
              <Field label="أيام السماح بعد الانتهاء"><Input type="number" min="0" value={form.graceDays} onChange={(e) => setForm((p) => ({ ...p, graceDays: e.target.value }))} /></Field>
              <Field label="الترتيب"><Input type="number" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))} /></Field>
              <Field label="حد الطلاب (0 = غير محدود)"><Input type="number" min="0" value={form.maxStudents} onChange={(e) => setForm((p) => ({ ...p, maxStudents: e.target.value }))} /></Field>
              <Field label="حد الكورسات"><Input type="number" min="0" value={form.maxCourses} onChange={(e) => setForm((p) => ({ ...p, maxCourses: e.target.value }))} /></Field>
              <Field label="حد المجموعات"><Input type="number" min="0" value={form.maxGroups} onChange={(e) => setForm((p) => ({ ...p, maxGroups: e.target.value }))} /></Field>
              <Field label="حد المساعدين"><Input type="number" min="0" value={form.maxAssistants} onChange={(e) => setForm((p) => ({ ...p, maxAssistants: e.target.value }))} /></Field>
              <Field label="مساحة التخزين (MB)"><Input type="number" min="0" value={form.storageMb} onChange={(e) => setForm((p) => ({ ...p, storageMb: e.target.value }))} /></Field>
              <Field label="حد دقائق الفيديو"><Input type="number" min="0" value={form.maxVideoMinutes} onChange={(e) => setForm((p) => ({ ...p, maxVideoMinutes: e.target.value }))} /></Field>
            </div>
            <Field label="الوصف"><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="min-h-16" /></Field>
            <Field label="المزايا (JSON مصفوفة نصوص)" hint='مثال: ["دعم فني", "تقارير متقدمة"]'>
              <Textarea value={form.featuresJson} onChange={(e) => setForm((p) => ({ ...p, featuresJson: e.target.value }))} dir="ltr" className="min-h-16 font-mono text-[11px]" />
            </Field>
            <div className="flex flex-wrap gap-4 text-xs font-bold">
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />نشطة</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={form.isDefault} onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))} />افتراضية</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={form.isPublic} onChange={(e) => setForm((p) => ({ ...p, isPublic: e.target.checked }))} />ظاهرة للمدرسين</label>
            </div>
          </div>
        </Modal>
      ) : null}

      {modal?.type === 'review' ? (
        <Modal open onClose={() => setModal(null)} icon={modal.action === 'approve' ? CheckCircle2 : XCircle}
          tone={modal.action === 'approve' ? 'success' : 'danger'}
          title={modal.action === 'approve' ? 'قبول دفعة الاشتراك' : 'رفض دفعة الاشتراك'}
          description={`${modal.payment.teacherName || ''} — ${money(modal.payment.amount, modal.payment.currency)}`}
          footer={<><Button variant="ghost" onClick={() => setModal(null)}>إلغاء</Button><Button variant={modal.action === 'approve' ? 'success' : 'danger'} loading={busy === 'review'} onClick={confirmReview}>{modal.action === 'approve' ? 'قبول وتفعيل' : 'رفض'}</Button></>}>
          <div className="grid gap-3">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <Field label="ملاحظة للمدرس (اختياري)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" /></Field>
            {modal.action === 'approve' ? <Alert tone="info">سيتم تفعيل الاشتراك حسب مدة الخطة والدفعة، وإرسال إشعار للمدرس.</Alert> : <Alert tone="warning">سيتم رفض الدفعة وإشعار المدرس بالسبب.</Alert>}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
