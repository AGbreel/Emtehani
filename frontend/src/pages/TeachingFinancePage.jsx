import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowDownCircle, ArrowUpCircle, BadgePercent, Banknote, CalendarClock,
  CheckCircle2, ClipboardCheck, Coins, Download, FileSpreadsheet, HandCoins, Layers, PackagePlus,
  Pencil, Plus, Receipt, RefreshCw, Search, ShieldAlert, TicketPercent, Trash2, TrendingUp,
  UserRoundSearch, Users, Wallet, XCircle,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal,
  PageHeader, Segmented, Select, Skeleton, StatCard, Textarea, cn,
} from '../components/ui';
import { request } from '../lib/api';
import { downloadBlob, formatDate, formatNumber } from '../lib/format';

const money = (value) => `${formatNumber(Number(value) || 0)} ج.م`;
const todayIso = () => new Date().toISOString().slice(0, 10);
const monthStartIso = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
};

const tabs = [
  { value: 'overview', label: 'نظرة عامة' },
  { value: 'charges', label: 'المستحقات' },
  { value: 'payments', label: 'المدفوعات' },
  { value: 'requests', label: 'طلبات الدفع' },
  { value: 'adjustments', label: 'التسويات' },
  { value: 'packages', label: 'الباقات' },
  { value: 'coupons', label: 'الكوبونات' },
];

const chargeStates = [
  { value: '', label: 'الكل' },
  { value: 'Unpaid', label: 'غير مدفوع' },
  { value: 'Paid', label: 'مدفوع' },
  { value: 'Overdue', label: 'متأخر' },
  { value: 'Void', label: 'ملغى' },
];

const stateLabels = { Unpaid: 'غير مدفوع', Paid: 'مدفوع', Overdue: 'متأخر', Void: 'ملغى' };
const stateTones = { Unpaid: 'warning', Paid: 'success', Overdue: 'danger', Void: 'neutral' };

const methods = [
  { value: 'Cash', label: 'نقدي' },
  { value: 'VodafoneCash', label: 'فودافون كاش' },
  { value: 'InstaPay', label: 'إنستا باي' },
  { value: 'BankTransfer', label: 'تحويل بنكي' },
  { value: 'Online', label: 'أونلاين' },
];
const methodLabels = Object.fromEntries(methods.map((item) => [item.value, item.label]));

const adjustmentKinds = [
  { value: 'Discount', label: 'خصم' },
  { value: 'Scholarship', label: 'منحة' },
  { value: 'Refund', label: 'استرداد' },
  { value: 'Correction', label: 'تصحيح' },
];

const packageKinds = [
  { value: 'Course', label: 'كورس' },
  { value: 'Group', label: 'مجموعة' },
  { value: 'Bundle', label: 'باقة مجمعة' },
  { value: 'Sessions', label: 'حصص' },
];

const emptyCharge = { studentId: '', amount: '', kind: 'Manual', dueDate: todayIso(), description: '', groupId: '' };
const emptyPayment = {
  studentId: '', amount: '', method: 'Cash', reference: '', notes: '', chargeId: '', groupId: '',
  coverageType: '', sessionsCount: '', periodMonth: new Date().getMonth() + 1, periodYear: new Date().getFullYear(),
};
const emptyAdjustment = { studentId: '', amount: '', kind: 'Discount', reason: '' };
const emptyPackage = {
  name: '', description: '', kind: 'Course', price: 0, oldPrice: '', durationDays: 30,
  sessionsIncluded: '', capacity: '', isRecurring: false, isActive: true, items: [],
};
const emptyCoupon = { code: '', kind: 'Percent', value: '', maxUses: '', startsAt: '', endsAt: '', isActive: true };

function StudentSelect({ students, value, onChange, label = 'الطالب' }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={onChange}>
        <option value="">اختر الطالب</option>
        {students.map((student) => (
          <option key={student.id} value={student.id}>
            {student.fullName}{student.studentCode ? ` — ${student.studentCode}` : ''}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function Toolbar({ children, className = '' }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

export default function TeachingFinancePage({ token }) {
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [summary, setSummary] = useState(null);
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [range, setRange] = useState({ from: monthStartIso(), to: todayIso() });

  const [charges, setCharges] = useState({ items: [], total: 0, page: 1, pageSize: 25 });
  const [chargeState, setChargeState] = useState('');
  const [payments, setPayments] = useState({ items: [], total: 0, page: 1, pageSize: 25 });
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [requestFilter, setRequestFilter] = useState('Pending');
  const [adjustments, setAdjustments] = useState([]);
  const [packages, setPackages] = useState([]);
  const [coupons, setCoupons] = useState([]);

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [modalError, setModalError] = useState('');
  const [editing, setEditing] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [enrollments, setEnrollments] = useState(null);

  const flash = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3200);
  }, []);

  const query = useCallback((params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) search.set(key, value);
    });
    const text = search.toString();
    return text ? `?${text}` : '';
  }, []);

  const loadOverview = useCallback(async () => {
    const [summaryData, studentsData] = await Promise.all([
      request(`/api/teaching/finance/summary${query({ from: range.from, to: range.to })}`, { token }),
      request('/api/teaching/finance/students', { token }),
    ]);
    setSummary(summaryData);
    setStudents(studentsData?.items || []);
  }, [token, range.from, range.to, query]);

  const loadCharges = useCallback(async (page = 1) => {
    const data = await request(`/api/teaching/finance/charges${query({
      page, pageSize: 25, status: chargeState,
    })}`, { token });
    setCharges({ items: data?.items || [], total: data?.total || 0, page: data?.page || 1, pageSize: data?.pageSize || 25 });
  }, [token, chargeState, query]);

  const loadPayments = useCallback(async (page = 1) => {
    const data = await request(`/api/teaching/finance/payments${query({
      page, pageSize: 25, from: range.from, to: range.to,
    })}`, { token });
    setPayments({ items: data?.items || [], total: data?.total || 0, page: data?.page || 1, pageSize: data?.pageSize || 25 });
  }, [token, range.from, range.to, query]);

  const loadPaymentRequests = useCallback(async (status = 'Pending') => {
    const data = await request(`/api/teaching/finance/payment-requests${query({ status })}`, { token });
    setPaymentRequests(data?.items || []);
  }, [token, query]);

  const loadAdjustments = useCallback(async () => {
    const data = await request('/api/teaching/finance/adjustments', { token });
    setAdjustments(data?.items || []);
  }, [token]);

  const loadPackages = useCallback(async () => {
    const [packageData, couponData, courseData, groupData] = await Promise.all([
      request('/api/teaching/packages', { token }),
      request('/api/teaching/coupons', { token }),
      request('/api/teaching/courses?pageSize=100', { token }).catch(() => ({ items: [] })),
      request('/api/teaching/groups', { token }).catch(() => ({ items: [] })),
    ]);
    setPackages(packageData?.items || []);
    setCoupons(couponData?.items || []);
    setCourses(courseData?.items || []);
    setGroups(groupData?.items || []);
  }, [token]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadOverview(), loadPackages(), loadCharges(), loadPayments(), loadAdjustments(), loadPaymentRequests()]);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [loadOverview, loadPackages, loadCharges, loadPayments, loadAdjustments, loadPaymentRequests]);

  useEffect(() => { initialLoad(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    if (loading) return;
    const run = async () => {
      try {
        if (tab === 'charges') await loadCharges(1);
        else if (tab === 'payments') await loadPayments(1);
        else if (tab === 'requests') await loadPaymentRequests(requestFilter);
        else if (tab === 'adjustments') await loadAdjustments();
        else if (tab === 'packages' || tab === 'coupons') await loadPackages();
        else if (tab === 'overview') await loadOverview();
      } catch (err) { setError(err.message); }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, chargeState, requestFilter]);

  const stats = summary?.range || {};
  const debtors = summary?.debtors || [];
  const byMethod = summary?.byMethod || [];

  const totals = useMemo(() => ({
    charged: summary?.totalCharged || 0,
    paid: summary?.totalPaid || 0,
    adjusted: summary?.totalAdjusted || 0,
    outstanding: summary?.outstanding || 0,
    overdue: summary?.overdue || 0,
    packageOutstanding: summary?.packageOutstanding || 0,
  }), [summary]);

  function openModal(name, initial = {}, target = null) {
    setModal(name);
    setForm(initial);
    setEditing(target);
    setModalError('');
  }

  function closeModal() {
    setModal(null);
    setForm({});
    setEditing(null);
    setModalError('');
  }

  async function submitCharge() {
    setModalError('');
    if (!form.studentId) return setModalError('اختر الطالب.');
    if (!(Number(form.amount) > 0)) return setModalError('قيمة المستحق يجب أن تكون أكبر من صفر.');
    setBusy('charge');
    try {
      await request('/api/teaching/finance/charges', {
        token, method: 'POST',
        body: JSON.stringify({
          studentId: form.studentId,
          amount: Number(form.amount),
          kind: form.kind || 'Manual',
          dueDateUtc: form.dueDate ? `${form.dueDate}T00:00:00Z` : null,
          description: form.description || null,
          groupId: form.groupId || null,
        }),
      });
      closeModal();
      flash('تم إضافة المستحق وإشعار الطالب.');
      await Promise.all([loadCharges(1), loadOverview()]);
    } catch (err) { setModalError(err.message); } finally { setBusy(''); }
  }

  async function submitPayment() {
    setModalError('');
    if (!form.studentId) return setModalError('اختر الطالب.');
    if (!(Number(form.amount) > 0)) return setModalError('قيمة الدفعة يجب أن تكون أكبر من صفر.');
    if (form.coverageType === 'Sessions' && !(Number(form.sessionsCount) > 0)) return setModalError('حدد عدد الحصص المدفوعة.');
    setBusy('payment');
    try {
      const result = await request('/api/teaching/finance/payments', {
        token, method: 'POST',
        body: JSON.stringify({
          studentId: form.studentId,
          amount: Number(form.amount),
          method: form.method,
          reference: form.reference || null,
          notes: form.notes || null,
          chargeId: form.chargeId || null,
          groupId: form.groupId || null,
          coverageType: form.coverageType || null,
          sessionsCount: form.coverageType === 'Sessions' ? Number(form.sessionsCount) || null : null,
          periodMonth: form.coverageType === 'Month' ? Number(form.periodMonth) || null : null,
          periodYear: form.coverageType === 'Month' ? Number(form.periodYear) || null : null,
        }),
      });
      closeModal();
      flash(`تم تسجيل الدفعة — إيصال ${result?.receiptNumber || ''}`);
      await Promise.all([loadPayments(1), loadCharges(1), loadOverview()]);
    } catch (err) { setModalError(err.message); } finally { setBusy(''); }
  }

  async function reviewPaymentRequest(requestId, approve) {
    const note = window.prompt(approve ? 'ملاحظة على القبول (اختياري):' : 'سبب رفض الطلب:');
    if (note === null) return;
    setBusy(`request-${requestId}`);
    try {
      await request(`/api/teaching/finance/payment-requests/${requestId}/${approve ? 'approve' : 'reject'}`, {
        token, method: 'POST', body: JSON.stringify({ note: note.trim() || null }),
      });
      flash(approve ? 'تم تأكيد الدفعة وإشعار الطالب.' : 'تم رفض الطلب وإشعار الطالب.');
      await Promise.all([loadPaymentRequests(requestFilter), loadPayments(1), loadOverview()]);
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  async function submitAdjustment() {
    setModalError('');
    if (!form.studentId) return setModalError('اختر الطالب.');
    if (!(Number(form.amount) > 0)) return setModalError('قيمة التسوية يجب أن تكون أكبر من صفر.');
    if (!form.reason?.trim()) return setModalError('سبب التسوية مطلوب.');
    setBusy('adjustment');
    try {
      await request('/api/teaching/finance/adjustments', {
        token, method: 'POST',
        body: JSON.stringify({
          studentId: form.studentId,
          amount: Number(form.amount),
          kind: form.kind,
          reason: form.reason.trim(),
        }),
      });
      closeModal();
      flash('تم إضافة التسوية المالية.');
      await Promise.all([loadAdjustments(), loadOverview()]);
    } catch (err) { setModalError(err.message); } finally { setBusy(''); }
  }

  async function voidItem(kind, id) {
    const reason = window.prompt('اكتب سبب الإلغاء (سيظل السجل محفوظاً للمراجعة):');
    if (!reason?.trim()) return;
    try {
      await request(`/api/teaching/finance/${kind}/${id}/void`, {
        token, method: 'POST', body: JSON.stringify({ reason: reason.trim() }),
      });
      flash('تم إلغاء العنصر مع الاحتفاظ بالسجل.');
      if (kind === 'charges') await loadCharges(charges.page);
      else if (kind === 'payments') await loadPayments(payments.page);
      await loadOverview();
    } catch (err) { setError(err.message); }
  }

  async function generateBilling() {
    const month = window.prompt('اكتب الشهر بصيغة yyyy-MM', new Date().toISOString().slice(0, 7));
    if (!month) return;
    setBusy('generate');
    try {
      const result = await request('/api/teaching/finance/generate', {
        token, method: 'POST', body: JSON.stringify({ month }),
      });
      flash(`تم إصدار ${formatNumber(result?.created || 0)} مستحق، وتم تجاوز ${formatNumber(result?.skipped || 0)} موجود مسبقاً.`);
      await Promise.all([loadCharges(1), loadOverview()]);
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  async function savePackage() {
    setModalError('');
    if (!form.name?.trim()) return setModalError('اسم الباقة مطلوب.');
    if (!(Number(form.price) >= 0)) return setModalError('سعر الباقة غير صالح.');
    if (!(Number(form.durationDays) > 0)) return setModalError('مدة الباقة يجب أن تكون أكبر من صفر.');
    setBusy('package');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        kind: form.kind,
        price: Number(form.price) || 0,
        oldPrice: form.oldPrice === '' ? null : Number(form.oldPrice) || 0,
        durationDays: Math.max(1, Number(form.durationDays) || 30),
        sessionsIncluded: form.sessionsIncluded === '' ? null : Number(form.sessionsIncluded) || 0,
        capacity: form.capacity === '' ? null : Number(form.capacity) || 0,
        isRecurring: Boolean(form.isRecurring),
        isActive: Boolean(form.isActive),
        availableFromUtc: null,
        availableUntilUtc: null,
        items: (form.items || []).map((item) => ({ itemType: item.itemType, itemId: item.itemId })),
      };
      if (editing?.id) {
        await request(`/api/teaching/packages/${editing.id}`, { token, method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await request('/api/teaching/packages', { token, method: 'POST', body: JSON.stringify(payload) });
      }
      closeModal();
      flash(editing?.id ? 'تم تحديث الباقة.' : 'تم إنشاء الباقة.');
      await loadPackages();
    } catch (err) { setModalError(err.message); } finally { setBusy(''); }
  }

  async function deactivatePackage(item) {
    if (!window.confirm(`إيقاف باقة «${item.name}»؟ لن تُحذف بيانات المسجلين.`)) return;
    try {
      await request(`/api/teaching/packages/${item.id}`, { token, method: 'DELETE' });
      flash('تم إيقاف الباقة.');
      await loadPackages();
    } catch (err) { setError(err.message); }
  }

  async function saveCoupon() {
    setModalError('');
    if (!form.code?.trim()) return setModalError('كود الخصم مطلوب.');
    if (!(Number(form.value) > 0)) return setModalError('قيمة الخصم يجب أن تكون أكبر من صفر.');
    setBusy('coupon');
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        kind: form.kind,
        value: Number(form.value),
        maxUses: form.maxUses === '' ? null : Number(form.maxUses) || 0,
        validFromUtc: form.startsAt ? `${form.startsAt}T00:00:00Z` : null,
        validUntilUtc: form.endsAt ? `${form.endsAt}T23:59:59Z` : null,
        isActive: Boolean(form.isActive),
      };
      if (editing?.id) {
        await request(`/api/teaching/coupons/${editing.id}`, { token, method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await request('/api/teaching/coupons', { token, method: 'POST', body: JSON.stringify(payload) });
      }
      closeModal();
      flash(editing?.id ? 'تم تحديث الكوبون.' : 'تم إنشاء الكوبون.');
      await loadPackages();
    } catch (err) { setModalError(err.message); } finally { setBusy(''); }
  }

  async function openLedger(student) {
    setLedger({ student, data: null });
    setLedgerLoading(true);
    try {
      const data = await request(`/api/teaching/finance/students/${student.id}`, { token });
      setLedger({ student, data });
    } catch (err) { setError(err.message); setLedger(null); } finally { setLedgerLoading(false); }
  }

  async function openEnrollments(packageItem) {
    setEnrollments({ package: packageItem, items: null });
    try {
      const data = await request(`/api/teaching/packages/${packageItem.id}/enrollments`, { token });
      setEnrollments({ package: packageItem, items: data?.items || [] });
    } catch (err) { setError(err.message); setEnrollments(null); }
  }

  async function exportCsv(kind) {
    setBusy(`csv-${kind}`);
    try {
      const blob = await request(`/api/teaching/finance/${kind}.csv${query({ from: range.from, to: range.to })}`, { token });
      downloadBlob(blob, `${kind}-${range.from}-${range.to}.csv`);
      flash('تم تنزيل الملف.');
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  function togglePackageItem(type, id) {
    setForm((prev) => {
      const items = prev.items || [];
      const exists = items.some((item) => item.itemType === type && item.itemId === id);
      return {
        ...prev,
        items: exists
          ? items.filter((item) => !(item.itemType === type && item.itemId === id))
          : [...items, { itemType: type, itemId: id }],
      };
    });
  }

  const chargeStudentName = (id) => students.find((s) => s.id === id)?.fullName || '—';

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="المالية"
        title="الحسابات والمدفوعات"
        description="نظام مستقل لرسوم الطلاب: مستحقات، دفعات، تسويات، باقات وكوبونات — منفصل تماماً عن اشتراكك مع المنصة."
        action={<Toolbar>
          <Button variant="soft" size="sm" icon={RefreshCw} onClick={initialLoad} loading={loading}>تحديث</Button>
          <Button variant="soft" size="sm" icon={FileSpreadsheet} onClick={() => exportCsv('charges')} loading={busy === 'csv-charges'}>المستحقات CSV</Button>
          <Button variant="soft" size="sm" icon={Download} onClick={() => exportCsv('payments')} loading={busy === 'csv-payments'}>المدفوعات CSV</Button>
          <Button size="sm" icon={CalendarClock} onClick={generateBilling} loading={busy === 'generate'}>إصدار مستحقات شهر</Button>
        </Toolbar>}
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <Card className="p-2">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={cn(
                'shrink-0 rounded-[10px] px-3.5 py-2 text-[12.5px] font-bold transition',
                tab === item.value ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-surface-soft hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      {tab === 'overview' ? (
        <div className="grid gap-4">
          <Card className="flex flex-wrap items-end gap-3 p-4">
            <Field label="من"><Input type="date" value={range.from} onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))} /></Field>
            <Field label="إلى"><Input type="date" value={range.to} onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))} /></Field>
            <Button variant="soft" onClick={loadOverview} loading={loading}>تطبيق</Button>
            <span className="ms-auto text-[11.5px] font-bold text-muted">الفترة: {formatDate(summary?.from)} — {formatDate(summary?.to)}</span>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Coins} label="إجمالي المستحقات" value={money(totals.charged)} note={`${formatNumber(stats.chargesCount || 0)} مستحق بالفترة`} tone="blue" loading={loading} />
            <StatCard icon={HandCoins} label="إجمالي المحصل" value={money(totals.paid)} note={`${formatNumber(stats.paymentsCount || 0)} دفعة بالفترة`} tone="emerald" loading={loading} />
            <StatCard icon={Wallet} label="المتبقي" value={money(totals.outstanding)} note={`متأخرات: ${money(totals.overdue)}`} tone={totals.outstanding > 0 ? 'warning' : 'emerald'} loading={loading} />
            <StatCard icon={PackagePlus} label="متبقي الباقات" value={money(totals.packageOutstanding)} note={`تسويات: ${money(totals.adjusted)}`} tone="primary" loading={loading} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold text-ink"><TrendingUp size={17} /> التحصيل حسب الوسيلة</h3>
              {byMethod.length === 0 ? <p className="py-6 text-center text-[12.5px] text-muted">لا توجد مدفوعات في هذه الفترة.</p> : (
                <div className="grid gap-3">
                  {byMethod.map((row) => {
                    const total = byMethod.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 1;
                    const width = Math.max(4, Math.round((Number(row.amount || 0) / total) * 100));
                    return (
                      <div key={row.method}>
                        <div className="mb-1 flex items-center justify-between text-[12px] font-bold">
                          <span>{methodLabels[row.method] || row.method}</span>
                          <span className="text-muted">{money(row.amount)} · {formatNumber(row.count)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-soft">
                          <div className="h-full rounded-full bg-gradient-to-l from-primary to-emerald" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold text-ink"><ShieldAlert size={17} /> أعلى المتأخرات</h3>
              {debtors.length === 0 ? <p className="py-6 text-center text-[12.5px] text-muted">لا توجد متأخرات — أحسنت.</p> : (
                <div className="grid gap-2">
                  {debtors.map((debtor) => (
                    <button
                      key={debtor.studentId}
                      type="button"
                      onClick={() => openLedger({ id: debtor.studentId, fullName: debtor.studentName, studentCode: debtor.studentCode })}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line/70 px-3 py-2.5 text-start transition hover:border-primary/30 hover:bg-primary-soft/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-bold text-ink">{debtor.studentName || 'طالب'}</span>
                        <span className="block text-[11px] text-muted">{debtor.studentCode || '—'}</span>
                      </span>
                      <span className="shrink-0 text-[12.5px] font-extrabold text-danger">{money(debtor.balance)}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink"><Users size={17} /> أرصدة الطلاب</h3>
              <span className="text-[11.5px] text-muted">{formatNumber(students.length)} طالب مرتبط</span>
            </div>
            {loading ? <Skeleton className="h-24 w-full" /> : students.length === 0 ? (
              <EmptyState icon={Users} title="لا يوجد طلاب مرتبطون" description="اقبل طلبات الطلاب أولاً لتظهر أرصدتهم هنا." />
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {students.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => openLedger(student)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line/70 px-3 py-2.5 text-start transition hover:border-primary/30 hover:bg-surface-soft"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><UserRoundSearch size={15} /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-bold text-ink">{student.fullName}</span>
                        <span className="block text-[11px] text-muted">{student.studentCode || '—'}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      <span className={cn('block text-[12.5px] font-extrabold', Number(student.balance) > 0 ? 'text-danger' : 'text-emerald')}>{money(student.balance)}</span>
                      <span className="block text-[10.5px] text-muted">مدفوع {money(student.paid)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'charges' ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line/70 p-4">
            <h3 className="me-auto font-display text-[15px] font-semibold text-ink">المستحقات</h3>
            <Segmented options={chargeStates} value={chargeState} onChange={setChargeState} ariaLabel="فلتر حالة المستحقات" />
            <Button size="sm" icon={Plus} onClick={() => openModal('charge', { ...emptyCharge })}>مستحق جديد</Button>
          </div>
          {loading ? <div className="p-4"><Skeleton className="h-28 w-full" /></div> : charges.items.length === 0 ? (
            <EmptyState icon={Receipt} title="لا توجد مستحقات" description="أضف مستحقاً يدوياً أو أصدر مستحقات الشهر من الأعلى." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-start text-[12px]">
                <thead className="bg-surface-soft text-[11px] font-extrabold text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start">الطالب</th>
                    <th className="px-4 py-3 text-start">الوصف</th>
                    <th className="px-4 py-3 text-start">المبلغ</th>
                    <th className="px-4 py-3 text-start">المدفوع</th>
                    <th className="px-4 py-3 text-start">الاستحقاق</th>
                    <th className="px-4 py-3 text-start">الحالة</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {charges.items.map((charge) => (
                    <tr key={charge.id} className="hover:bg-surface-soft/50">
                      <td className="px-4 py-3 font-bold text-ink">{charge.studentName || chargeStudentName(charge.studentId)}</td>
                      <td className="px-4 py-3 text-muted">{charge.description || charge.kind}</td>
                      <td className="px-4 py-3 font-extrabold">{money(charge.amount)}</td>
                      <td className="px-4 py-3">{money(charge.paid)}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(charge.dueDateUtc)}</td>
                      <td className="px-4 py-3"><Badge tone={stateTones[charge.state] || 'neutral'}>{stateLabels[charge.state] || charge.state}</Badge></td>
                      <td className="px-4 py-3">
                        {charge.isVoid ? null : (
                          <div className="flex items-center gap-1">
                            {charge.state !== 'Paid' ? (
                              <IconButton label="تسجيل دفعة" onClick={() => openModal('payment', { ...emptyPayment, studentId: charge.studentId, amount: String(Math.max(0, charge.outstanding)), chargeId: charge.id })}><Banknote size={15} /></IconButton>
                            ) : null}
                            <IconButton label="إلغاء المستحق" tone="danger" onClick={() => voidItem('charges', charge.id)}><XCircle size={15} /></IconButton>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {charges.total > charges.pageSize ? (
            <div className="flex items-center justify-between border-t border-line/70 p-3 text-[12px]">
              <Button variant="ghost" size="sm" disabled={charges.page <= 1} onClick={() => loadCharges(charges.page - 1)}>السابق</Button>
              <span className="text-muted">صفحة {formatNumber(charges.page)} — {formatNumber(charges.total)} مستحق</span>
              <Button variant="ghost" size="sm" disabled={charges.page * charges.pageSize >= charges.total} onClick={() => loadCharges(charges.page + 1)}>التالي</Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {tab === 'payments' ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line/70 p-4">
            <h3 className="me-auto font-display text-[15px] font-semibold text-ink">المدفوعات</h3>
            <Button size="sm" icon={Plus} onClick={() => openModal('payment', { ...emptyPayment })}>تسجيل دفعة</Button>
          </div>
          {payments.items.length === 0 ? (
            <EmptyState icon={Banknote} title="لا توجد مدفوعات" description="سجّل أول دفعة لطالب مرتبط بحسابك." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-start text-[12px]">
                <thead className="bg-surface-soft text-[11px] font-extrabold text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start">الإيصال</th>
                    <th className="px-4 py-3 text-start">الطالب</th>
                    <th className="px-4 py-3 text-start">المبلغ</th>
                    <th className="px-4 py-3 text-start">الطريقة</th>
                    <th className="px-4 py-3 text-start">التاريخ</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {payments.items.map((payment) => (
                    <tr key={payment.id} className={cn('hover:bg-surface-soft/50', payment.isVoid && 'opacity-60')}>
                      <td className="px-4 py-3 font-mono text-[11px]">{payment.receiptNumber || '—'}</td>
                      <td className="px-4 py-3 font-bold text-ink">{payment.studentName || chargeStudentName(payment.studentId)}</td>
                      <td className="px-4 py-3 font-extrabold">{money(payment.amount)}</td>
                      <td className="px-4 py-3">{methodLabels[payment.method] || payment.method}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(payment.paidAtUtc)}</td>
                      <td className="px-4 py-3">
                        {payment.isVoid ? <Badge tone="danger">ملغاة</Badge> : (
                          <IconButton label="إلغاء الدفعة" tone="danger" onClick={() => voidItem('payments', payment.id)}><XCircle size={15} /></IconButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {payments.total > payments.pageSize ? (
            <div className="flex items-center justify-between border-t border-line/70 p-3 text-[12px]">
              <Button variant="ghost" size="sm" disabled={payments.page <= 1} onClick={() => loadPayments(payments.page - 1)}>السابق</Button>
              <span className="text-muted">صفحة {formatNumber(payments.page)} — {formatNumber(payments.total)} دفعة</span>
              <Button variant="ghost" size="sm" disabled={payments.page * payments.pageSize >= payments.total} onClick={() => loadPayments(payments.page + 1)}>التالي</Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {tab === 'requests' ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line/70 p-4">
            <h3 className="me-auto font-display text-[15px] font-semibold text-ink">طلبات دفع المجموعات</h3>
            <div className="w-44">
              <Select value={requestFilter} onChange={(e) => setRequestFilter(e.target.value)}>
                <option value="Pending">بانتظار المراجعة</option>
                <option value="Approved">مقبولة</option>
                <option value="Rejected">مرفوضة</option>
                <option value="">الكل</option>
              </Select>
            </div>
            <Button variant="soft" size="sm" icon={RefreshCw} onClick={() => loadPaymentRequests(requestFilter)}>تحديث</Button>
          </div>
          {paymentRequests.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="لا توجد طلبات" description="حين يرسل الطالب إقراراً بدفع مجموعة سيظهر هنا لتأكيده." />
          ) : (
            <div className="grid gap-2 p-4">
              {paymentRequests.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-soft p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[12.5px] font-bold text-ink">{item.studentName || 'طالب'}</p>
                      <Badge tone={item.status === 'Approved' ? 'success' : item.status === 'Rejected' ? 'danger' : 'warning'}>
                        {item.status === 'Approved' ? 'مقبول' : item.status === 'Rejected' ? 'مرفوض' : 'قيد المراجعة'}
                      </Badge>
                      <Badge tone="neutral">{item.groupName || 'مجموعة'}</Badge>
                    </div>
                    <p className="mt-1 text-[11.5px] text-muted">
                      {money(item.amount)} · {item.coverageType === 'Sessions' ? `${formatNumber(item.sessionsCount || 0)} حصة` : `شهر ${item.periodMonth}/${item.periodYear}`} · {methodLabels[item.method] || item.method}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-subtle">
                      {formatDate(item.createdAtUtc)}
                      {item.notes ? ` · ${item.notes}` : ''}
                      {item.reviewNote ? ` · ملاحظة المدرس: ${item.reviewNote}` : ''}
                    </p>
                  </div>
                  {item.status === 'Pending' ? (
                    <div className="flex gap-1.5">
                      <Button size="xs" icon={CheckCircle2} loading={busy === `request-${item.id}`} onClick={() => reviewPaymentRequest(item.id, true)}>تأكيد الدفع</Button>
                      <Button size="xs" variant="ghost" onClick={() => reviewPaymentRequest(item.id, false)}>رفض</Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'adjustments' ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line/70 p-4">
            <h3 className="font-display text-[15px] font-semibold text-ink">التسويات والمنح والاستردادات</h3>
            <Button size="sm" icon={Plus} onClick={() => openModal('adjustment', { ...emptyAdjustment })}>تسوية جديدة</Button>
          </div>
          {adjustments.length === 0 ? (
            <EmptyState icon={BadgePercent} title="لا توجد تسويات" description="أضف خصماً أو منحة أو استرداداً ليظهر في رصيد الطالب." />
          ) : (
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {adjustments.map((item) => (
                <div key={item.id} className="rounded-xl border border-line/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-bold text-ink">{item.studentName || 'طالب'}</p>
                      <p className="mt-0.5 text-[11.5px] text-muted">{adjustmentKinds.find((k) => k.value === item.kind)?.label || item.kind} — {item.reason}</p>
                    </div>
                    <span className="shrink-0 text-[13px] font-extrabold text-emerald">{money(item.amount)}</span>
                  </div>
                  <p className="mt-2 text-[10.5px] text-muted">{formatDate(item.createdAtUtc)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'packages' ? (
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-[15px] font-semibold text-ink">الباقات</h3>
            <Button size="sm" icon={PackagePlus} onClick={() => openModal('package', { ...emptyPackage })}>باقة جديدة</Button>
          </div>
          {packages.length === 0 ? (
            <Card><EmptyState icon={Layers} title="لا توجد باقات" description="أنشئ باقة تجمع كورسات ومجموعات بسعر واحد." /></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {packages.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="truncate font-display text-[14px] font-semibold text-ink">{item.name}</h4>
                      <p className="mt-1 text-[11.5px] text-muted">{packageKinds.find((k) => k.value === item.kind)?.label || item.kind} · {formatNumber(item.durationDays)} يوم</p>
                    </div>
                    <Badge tone={item.isActive ? 'success' : 'neutral'}>{item.isActive ? 'نشطة' : 'متوقفة'}</Badge>
                  </div>
                  <p className="mt-3 text-[17px] font-extrabold text-primary">{money(item.price)}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {formatNumber(item.activeEnrollments)} مشترك نشط · {formatNumber((item.items || []).length)} عنصر
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button size="xs" variant="soft" onClick={() => openEnrollments(item)}>المشتركون</Button>
                    <Button size="xs" variant="soft" icon={Pencil} onClick={() => openModal('package', {
                      ...emptyPackage,
                      ...item,
                      oldPrice: item.oldPrice ?? '',
                      sessionsIncluded: item.sessionsIncluded ?? '',
                      capacity: item.capacity ?? '',
                      items: (item.items || []).map((x) => ({ itemType: x.itemType, itemId: x.itemId })),
                    }, item)}>تعديل</Button>
                    {item.isActive ? <Button size="xs" variant="ghost" onClick={() => deactivatePackage(item)}>إيقاف</Button> : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'coupons' ? (
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-[15px] font-semibold text-ink">كوبونات الخصم</h3>
            <Button size="sm" icon={TicketPercent} onClick={() => openModal('coupon', { ...emptyCoupon })}>كوبون جديد</Button>
          </div>
          {coupons.length === 0 ? (
            <Card><EmptyState icon={TicketPercent} title="لا توجد كوبونات" description="أنشئ كوبوناً بنسبة أو مبلغ ثابت لاستخدامه عند تسجيل الباقات." /></Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-start text-[12px]">
                <thead className="bg-surface-soft text-[11px] font-extrabold text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start">الكود</th>
                    <th className="px-4 py-3 text-start">القيمة</th>
                    <th className="px-4 py-3 text-start">الاستخدام</th>
                    <th className="px-4 py-3 text-start">الصلاحية</th>
                    <th className="px-4 py-3 text-start">الحالة</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {coupons.map((coupon) => (
                    <tr key={coupon.id}>
                      <td className="px-4 py-3 font-mono font-bold text-ink">{coupon.code}</td>
                      <td className="px-4 py-3">{coupon.kind === 'Percent' ? `${formatNumber(coupon.value)}%` : money(coupon.value)}</td>
                      <td className="px-4 py-3">{formatNumber(coupon.usedCount)} / {coupon.maxUses ? formatNumber(coupon.maxUses) : '∞'}</td>
                      <td className="px-4 py-3 text-muted">{coupon.validUntilUtc ? formatDate(coupon.validUntilUtc) : 'دائم'}</td>
                      <td className="px-4 py-3"><Badge tone={coupon.isActive ? 'success' : 'neutral'}>{coupon.isActive ? 'نشط' : 'موقوف'}</Badge></td>
                      <td className="px-4 py-3">
                        <IconButton label="تعديل الكوبون" onClick={() => openModal('coupon', {
                          ...emptyCoupon,
                          ...coupon,
                          maxUses: coupon.maxUses ?? '',
                          startsAt: coupon.validFromUtc ? coupon.validFromUtc.slice(0, 10) : '',
                          endsAt: coupon.validUntilUtc ? coupon.validUntilUtc.slice(0, 10) : '',
                        }, coupon)}><Pencil size={15} /></IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      ) : null}

      {modal === 'charge' ? (
        <Modal open onClose={closeModal} icon={Receipt} title="مستحق جديد" description="سيصل إشعار للطالب فور الحفظ."
          footer={<><Button variant="ghost" onClick={closeModal}>إلغاء</Button><Button loading={busy === 'charge'} onClick={submitCharge}>حفظ</Button></>}>
          <div className="grid gap-4">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <StudentSelect students={students} value={form.studentId} onChange={(e) => setForm((p) => ({ ...p, studentId: e.target.value }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="المبلغ (ج.م)"><Input type="number" min="0" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} /></Field>
              <Field label="تاريخ الاستحقاق"><Input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} /></Field>
              <Field label="النوع">
                <Select value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>
                  <option value="Manual">يدوي</option>
                  <option value="MonthlySubscription">اشتراك شهري</option>
                  <option value="PerSession">حصة</option>
                  <option value="Materials">مواد تعليمية</option>
                  <option value="Other">أخرى</option>
                </Select>
              </Field>
              <Field label="المجموعة (اختياري)">
                <Select value={form.groupId} onChange={(e) => setForm((p) => ({ ...p, groupId: e.target.value }))}>
                  <option value="">بدون</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="الوصف"><Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="مثال: اشتراك شهر نوفمبر" /></Field>
          </div>
        </Modal>
      ) : null}

      {modal === 'payment' ? (
        <Modal open onClose={closeModal} icon={Banknote} title="تسجيل دفعة" description="يتم توليد رقم إيصال فريد تلقائياً."
          footer={<><Button variant="ghost" onClick={closeModal}>إلغاء</Button><Button loading={busy === 'payment'} onClick={submitPayment}>تسجيل</Button></>}>
          <div className="grid gap-4">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <StudentSelect students={students} value={form.studentId} onChange={(e) => setForm((p) => ({ ...p, studentId: e.target.value }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="المبلغ (ج.م)"><Input type="number" min="0" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} /></Field>
              <Field label="طريقة الدفع">
                <Select value={form.method} onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}>
                  {methods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                </Select>
              </Field>
              <Field label="المرجع / رقم العملية"><Input value={form.reference} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} /></Field>
              <Field label="ملاحظات"><Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></Field>
              <Field label="المجموعة (اختياري)">
                <Select value={form.groupId || ''} onChange={(e) => setForm((p) => ({ ...p, groupId: e.target.value }))}>
                  <option value="">بدون مجموعة</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </Select>
              </Field>
              <Field label="نوع التغطية">
                <Select value={form.coverageType || ''} onChange={(e) => setForm((p) => ({ ...p, coverageType: e.target.value }))}>
                  <option value="">دفعة عامة</option>
                  <option value="Sessions">عدد حصص</option>
                  <option value="Month">شهر</option>
                </Select>
              </Field>
              {form.coverageType === 'Sessions' ? (
                <Field label="عدد الحصص المدفوعة"><Input type="number" min="1" max="200" value={form.sessionsCount || ''} onChange={(e) => setForm((p) => ({ ...p, sessionsCount: e.target.value }))} /></Field>
              ) : null}
              {form.coverageType === 'Month' ? (
                <>
                  <Field label="الشهر">
                    <Select value={form.periodMonth} onChange={(e) => setForm((p) => ({ ...p, periodMonth: e.target.value }))}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                        <option key={month} value={month}>{new Date(2024, month - 1, 1).toLocaleDateString('ar-EG', { month: 'long' })}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="السنة">
                    <Select value={form.periodYear} onChange={(e) => setForm((p) => ({ ...p, periodYear: e.target.value }))}>
                      {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i).map((year) => <option key={year} value={year}>{year}</option>)}
                    </Select>
                  </Field>
                </>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}

      {modal === 'adjustment' ? (
        <Modal open onClose={closeModal} icon={BadgePercent} title="تسوية مالية" description="تسوية تقلل المستحق على الطالب؛ تُسجل باسم المنفذ."
          footer={<><Button variant="ghost" onClick={closeModal}>إلغاء</Button><Button loading={busy === 'adjustment'} onClick={submitAdjustment}>حفظ</Button></>}>
          <div className="grid gap-4">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <StudentSelect students={students} value={form.studentId} onChange={(e) => setForm((p) => ({ ...p, studentId: e.target.value }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="المبلغ (ج.م)"><Input type="number" min="0" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} /></Field>
              <Field label="النوع">
                <Select value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>
                  {adjustmentKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="السبب"><Textarea value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} className="min-h-20" /></Field>
          </div>
        </Modal>
      ) : null}

      {modal === 'package' ? (
        <Modal open onClose={closeModal} size="xl" icon={Layers} title={editing?.id ? 'تعديل الباقة' : 'باقة جديدة'} description="اختر الكورسات والمجموعات التي يحصل عليها الطالب عند الاشتراك."
          footer={<><Button variant="ghost" onClick={closeModal}>إلغاء</Button><Button loading={busy === 'package'} onClick={savePackage}>حفظ</Button></>}>
          <div className="grid gap-4">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم الباقة"><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field>
              <Field label="النوع">
                <Select value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>
                  {packageKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                </Select>
              </Field>
              <Field label="السعر (ج.م)"><Input type="number" min="0" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} /></Field>
              <Field label="السعر قبل الخصم (اختياري)"><Input type="number" min="0" value={form.oldPrice} onChange={(e) => setForm((p) => ({ ...p, oldPrice: e.target.value }))} /></Field>
              <Field label="المدة (أيام)"><Input type="number" min="1" value={form.durationDays} onChange={(e) => setForm((p) => ({ ...p, durationDays: e.target.value }))} /></Field>
              <Field label="عدد الحصص (اختياري)"><Input type="number" min="0" value={form.sessionsIncluded} onChange={(e) => setForm((p) => ({ ...p, sessionsIncluded: e.target.value }))} /></Field>
              <Field label="السعة (اختياري)"><Input type="number" min="0" value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))} /></Field>
              <div className="flex items-end gap-4 text-xs font-bold">
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />نشطة</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={form.isRecurring} onChange={(e) => setForm((p) => ({ ...p, isRecurring: e.target.checked }))} />متكررة</label>
              </div>
            </div>
            <Field label="الوصف"><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="min-h-16" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[12px] font-bold text-ink">الكورسات</p>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-line/70 p-2">
                  {courses.length === 0 ? <p className="p-2 text-[11.5px] text-muted">لا توجد كورسات.</p> : courses.map((course) => (
                    <label key={course.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-surface-soft">
                      <input type="checkbox" className="accent-primary" checked={(form.items || []).some((x) => x.itemType === 'Course' && x.itemId === course.id)} onChange={() => togglePackageItem('Course', course.id)} />
                      <span className="truncate">{course.title}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[12px] font-bold text-ink">المجموعات</p>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-line/70 p-2">
                  {groups.length === 0 ? <p className="p-2 text-[11.5px] text-muted">لا توجد مجموعات.</p> : groups.map((group) => (
                    <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-surface-soft">
                      <input type="checkbox" className="accent-primary" checked={(form.items || []).some((x) => x.itemType === 'Group' && x.itemId === group.id)} onChange={() => togglePackageItem('Group', group.id)} />
                      <span className="truncate">{group.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {modal === 'coupon' ? (
        <Modal open onClose={closeModal} icon={TicketPercent} title={editing?.id ? 'تعديل الكوبون' : 'كوبون جديد'}
          footer={<><Button variant="ghost" onClick={closeModal}>إلغاء</Button><Button loading={busy === 'coupon'} onClick={saveCoupon}>حفظ</Button></>}>
          <div className="grid gap-4">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="الكود"><Input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder="RAMADAN20" disabled={Boolean(editing?.id)} /></Field>
              <Field label="النوع">
                <Select value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>
                  <option value="Percent">نسبة %</option>
                  <option value="Fixed">مبلغ ثابت</option>
                </Select>
              </Field>
              <Field label="القيمة"><Input type="number" min="0" value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} /></Field>
              <Field label="حد الاستخدام (اختياري)"><Input type="number" min="0" value={form.maxUses} onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))} /></Field>
              <Field label="يبدأ من"><Input type="date" value={form.startsAt} onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))} /></Field>
              <Field label="ينتهي في"><Input type="date" value={form.endsAt} onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value }))} /></Field>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" className="accent-primary" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />الكوبون نشط</label>
          </div>
        </Modal>
      ) : null}

      {ledger ? (
        <Modal open onClose={() => setLedger(null)} size="xl" icon={UserRoundSearch} title={`حساب ${ledger.student?.fullName || 'الطالب'}`} description="كشف حساب كامل: مستحقات، مدفوعات، تسويات وباقات.">
          {ledgerLoading ? <Skeleton className="h-40 w-full" /> : (
            <div className="grid gap-4">
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-blue-soft p-3"><p className="text-[10.5px] font-bold text-blue">مستحق</p><p className="mt-1 text-[14px] font-extrabold">{money(ledger.data?.summary?.charged)}</p></div>
                <div className="rounded-xl bg-emerald-soft p-3"><p className="text-[10.5px] font-bold text-emerald">مدفوع</p><p className="mt-1 text-[14px] font-extrabold">{money(ledger.data?.summary?.paid)}</p></div>
                <div className="rounded-xl bg-primary-soft p-3"><p className="text-[10.5px] font-bold text-primary">تسويات</p><p className="mt-1 text-[14px] font-extrabold">{money(ledger.data?.summary?.adjusted)}</p></div>
                <div className={cn('rounded-xl p-3', Number(ledger.data?.summary?.balance) > 0 ? 'bg-warning-soft' : 'bg-surface-soft')}><p className="text-[10.5px] font-bold text-warning">الرصيد</p><p className="mt-1 text-[14px] font-extrabold">{money(ledger.data?.summary?.balance)}</p></div>
              </div>
              <div>
                <h4 className="mb-2 text-[12.5px] font-bold text-ink">المستحقات</h4>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-line/70">
                  {(ledger.data?.charges || []).length === 0 ? <p className="p-3 text-[12px] text-muted">لا توجد مستحقات.</p> : ledger.data.charges.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-2 border-b border-line/50 px-3 py-2 text-[11.5px] last:border-0">
                      <span className="min-w-0 truncate">{row.description || row.kind}</span>
                      <span className="shrink-0 font-bold">{money(row.amount)} · مدفوع {money(row.paid)}</span>
                      <Badge tone={row.isVoid ? 'danger' : row.paid >= row.amount ? 'success' : 'warning'}>{row.isVoid ? 'ملغى' : row.paid >= row.amount ? 'مدفوع' : 'متبقي'}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-[12.5px] font-bold text-ink">المدفوعات</h4>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-line/70">
                  {(ledger.data?.payments || []).length === 0 ? <p className="p-3 text-[12px] text-muted">لا توجد مدفوعات.</p> : ledger.data.payments.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-2 border-b border-line/50 px-3 py-2 text-[11.5px] last:border-0">
                      <span className="font-mono text-[10.5px]">{row.receiptNumber}</span>
                      <span className="font-bold">{money(row.amount)} · {methodLabels[row.method] || row.method}</span>
                      <span className="text-muted">{formatDate(row.paidAtUtc)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {(ledger.data?.adjustments || []).length > 0 ? (
                <div>
                  <h4 className="mb-2 text-[12.5px] font-bold text-ink">التسويات</h4>
                  <div className="rounded-xl border border-line/70">
                    {ledger.data.adjustments.map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-2 border-b border-line/50 px-3 py-2 text-[11.5px] last:border-0">
                        <span>{adjustmentKinds.find((k) => k.value === row.kind)?.label || row.kind} — {row.reason}</span>
                        <span className="font-bold text-emerald">{money(row.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Modal>
      ) : null}

      {enrollments ? (
        <Modal open onClose={() => setEnrollments(null)} size="lg" icon={Users} title={`مشتركو ${enrollments.package?.name || ''}`} description="حالة السداد لكل مشترك في الباقة.">
          {enrollments.items === null ? <Skeleton className="h-24 w-full" /> : enrollments.items.length === 0 ? (
            <EmptyState icon={Users} title="لا يوجد مشتركون" description="سجّل طالباً من صفحة المجموعة أو أضف اشتراكاً جديداً." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-start text-[12px]">
                <thead className="bg-surface-soft text-[11px] text-muted">
                  <tr>
                    <th className="px-3 py-2 text-start">الطالب</th>
                    <th className="px-3 py-2 text-start">المستحق</th>
                    <th className="px-3 py-2 text-start">المدفوع</th>
                    <th className="px-3 py-2 text-start">ينتهي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {enrollments.items.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-bold">{row.name}</td>
                      <td className="px-3 py-2">{money(row.amountDue)}</td>
                      <td className="px-3 py-2">{money(row.amountPaid)}</td>
                      <td className="px-3 py-2 text-muted">{formatDate(row.expiresAtUtc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
