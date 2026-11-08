import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Filter,
  GraduationCap,
  Link2,
  MessageCircle,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  UserRound,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, StatCard } from '../components/ui';
import PaymentMethodsEditor from '../components/PaymentMethodsEditor';
import { request } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';

const planStatusOptions = [
  { value: '', label: 'كل الحالات' },
  { value: 'Free', label: 'باقة Free' },
  { value: 'Pending', label: 'اشتراك بانتظار التأكيد' },
  { value: 'Confirmed', label: 'اشتراك مؤكد' },
  { value: 'None', label: 'بدون اشتراك' },
];

const sortOptions = [
  { value: 'newest', label: 'الأحدث تسجيلاً' },
  { value: 'oldest', label: 'الأقدم تسجيلاً' },
  { value: 'name', label: 'الاسم أبجدياً' },
  { value: 'students', label: 'الأكثر طلاباً' },
];

const subscriptionMeta = {
  Confirmed: { label: 'مؤكد', tone: 'emerald', icon: CheckCircle2 },
  Pending: { label: 'بانتظار التأكيد', tone: 'warning', icon: BadgeCheck },
  Cancelled: { label: 'ملغي', tone: 'danger', icon: XCircle },
  Expired: { label: 'منتهي', tone: 'neutral', icon: XCircle },
};

function subscriptionOf(row) {
  const subscription = row?.subscription;
  if (!subscription) return { label: 'بدون اشتراك', tone: 'neutral', plan: '—', icon: CreditCard };
  const meta = subscriptionMeta[subscription.status] || { label: subscription.status, tone: 'neutral', icon: CreditCard };
  return { ...meta, plan: subscription.planName || subscription.planCode || 'Free' };
}

export default function AdminDashboard({ token, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [planStatus, setPlanStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [featuresText, setFeaturesText] = useState('');
  const [collectionTeacher, setCollectionTeacher] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '25', sort });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (planStatus) params.set('planStatus', planStatus);
      const result = await request(`/api/admin/overview?${params.toString()}`, { token });
      setData(result);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, page, sort, debouncedSearch, planStatus]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const result = await request('/api/admin/subscription-settings', { token });
      setSettings(result);
      setFeaturesText((result?.editableFeatures || []).join(', '));
    } catch (err) {
      setError(err.message);
    } finally {
      setSettingsLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSettings(); }, [loadSettings]);

  const summary = data?.summary || {};
  const items = data?.items || [];
  const total = Number(data?.total || 0);
  const pageSize = Number(data?.pageSize || 25);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const featureChips = useMemo(
    () => featuresText.split(',').map((item) => item.trim()).filter(Boolean),
    [featuresText],
  );

  async function saveSettings(event) {
    event.preventDefault();
    const features = featureChips;
    if (features.length === 0) return setError('أضف ميزة واحدة على الأقل.');
    setSettingsBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/admin/subscription-settings', {
        token,
        method: 'PUT',
        body: JSON.stringify({ features }),
      });
      setNotice(result?.message || 'تم تحديث ميزات الخطة المجانية.');
      await loadSettings();
    } catch (err) {
      setError(err.message);
    } finally {
      setSettingsBusy(false);
    }
  }

  function clearFilters() {
    setSearch('');
    setPlanStatus('');
    setSort('newest');
    setPage(1);
  }

  const hasFilters = Boolean(search.trim() || planStatus || sort !== 'newest');

  function openTeacherChat(teacherId) {
    try { sessionStorage.setItem('emtehani-chat-target', teacherId); } catch { /* ignore */ }
    onNavigate?.('chat');
  }

  return (
    <div>
      <PageHeader
        eyebrow="إشراف المنصة"
        title="لوحة الإدارة"
        description="نظرة على المدرسين والاشتراكات وطلبات الربط. الوصول محمي بصلاحية Admin على الخادم."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" icon={MessageCircle} onClick={() => onNavigate?.('chat')}>محادثات الإدارة</Button>
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>
          </div>
        )}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <div className="ui-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="إجمالي المدرسين" value={formatNumber(summary.totalTeachers)} note="كل حسابات المدرسين" loading={loading} />
        <StatCard icon={CreditCard} label="على باقة Free" value={formatNumber(summary.freePlanTeachers)} note="بغض النظر عن حالة التأكيد" tone="emerald" loading={loading} />
        <StatCard icon={Link2} label="طلاب مرتبطون" value={formatNumber(summary.acceptedLinkedStudents)} note="ارتباط مقبول ونشط" tone="primary" loading={loading} />
        <StatCard icon={BadgeCheck} label="طلبات معلقة" value={formatNumber(summary.pendingRequests)} note="بانتظار قرار المدرس أو الطالب" tone="warning" loading={loading} />
      </div>

      <div className="ui-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CheckCircle2} label="اشتراكات مؤكدة" value={formatNumber(summary.confirmedSubscriptions)} note="اختار مدرس الباقة" tone="emerald" loading={loading} />
        <StatCard icon={CalendarDays} label="بانتظار التأكيد" value={formatNumber(summary.pendingSubscriptions)} note="لم يؤكد الباقة بعد" tone="warning" loading={loading} />
        <StatCard icon={UserRound} label="إجمالي الطلاب" value={formatNumber(summary.totalStudents)} note="كل حسابات الطلاب" tone="neutral" loading={loading} />
        <StatCard icon={GraduationCap} label="دعوات معلقة" value={formatNumber(summary.pendingInvitations)} note="روابط دعوة لم تُستخدم" tone="primary" loading={loading} />
      </div>

      <Card className="mb-4 overflow-hidden">
        <div className="p-3 sm:p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative w-full lg:max-w-sm">
              <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث باسم المدرس أو بريده..."
                aria-label="ابحث في المدرسين"
                className="h-11 w-full rounded-[11px] border border-line bg-surface-soft pr-9 pl-3 text-[13px] text-ink outline-none transition placeholder:text-subtle focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary-soft"
              />
            </div>
            <div className="grid flex-1 gap-2 sm:grid-cols-3">
              <Select value={planStatus} onChange={(event) => { setPlanStatus(event.target.value); setPage(1); }} aria-label="تصفية حسب الاشتراك">
                {planStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
              <Select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="ترتيب المدرسين">
                {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
              <Button variant="ghost" size="sm" icon={XCircle} onClick={clearFilters} disabled={!hasFilters}>مسح الفلاتر</Button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
            <Filter size={12} />
            <span>{formatNumber(total)} مدرس مطابق</span>
            {hasFilters ? <Badge tone="primary">تصفية نشطة</Badge> : null}
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-4"><div className="grid gap-2">{[0, 1, 2, 3, 4].map((index) => <Skeleton key={index} className="h-14 w-full" />)}</div></Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="لا يوجد مدرسون مطابقون" description="جرّب تغيير البحث أو تصفية الاشتراك." action={hasFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}>مسح الفلاتر</Button> : null} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="ui-scrollbar-hidden overflow-x-auto">
            <table className="w-full min-w-[1060px] border-collapse text-right">
              <thead>
                <tr className="border-b border-line bg-surface-soft/60 text-[10.5px] font-bold text-muted">
                  <th className="px-3 py-2.5 font-bold">المدرس</th>
                  <th className="px-3 py-2.5 font-bold">الباقة</th>
                  <th className="px-3 py-2.5 font-bold">حالة الاشتراك</th>
                  <th className="px-3 py-2.5 font-bold">طلاب مرتبطون</th>
                  <th className="px-3 py-2.5 font-bold">طلبات معلقة</th>
                  <th className="px-3 py-2.5 font-bold">التسجيل</th>
                  <th className="px-3 py-2.5 font-bold">الاشتراك</th>
                  <th className="px-3 py-2.5 font-bold">تواصل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((row) => {
                  const subscription = subscriptionOf(row);
                  const StatusIcon = subscription.icon;
                  return (
                    <tr key={row.teacherId} className="transition hover:bg-surface-soft/40" data-testid={`admin-teacher-${row.teacherId}`}>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={row.fullName} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-bold text-ink">{row.fullName}</p>
                            <p className="truncate text-[10.5px] text-subtle" dir="ltr">{row.email}</p>
                            {row.registrationSource === 'TeacherInvitation' ? <Badge tone="primary" className="mt-1">دعوة مدرس</Badge> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><Badge tone={row.subscription?.planCode === 'free' ? 'primary' : 'neutral'}>{subscription.plan}</Badge></td>
                      <td className="px-3 py-3">
                        <Badge tone={subscription.tone}><StatusIcon size={10} />{subscription.label}</Badge>
                        {row.subscription?.endsAtUtc ? <p className="mt-1 text-[9.5px] text-subtle">ينتهي {formatDate(row.subscription.endsAtUtc)}</p> : null}
                      </td>
                      <td className="px-3 py-3"><span className="ui-number text-[13px] font-bold text-ink">{formatNumber(row.acceptedStudentCount)}</span></td>
                      <td className="px-3 py-3">
                        <span className={`ui-number text-[13px] font-bold ${row.pendingRequestCount > 0 ? 'text-warning' : 'text-muted'}`}>{formatNumber(row.pendingRequestCount)}</span>
                      </td>
                      <td className="px-3 py-3 text-[10.5px] text-muted">{formatDate(row.createdAtUtc)}</td>
                      <td className="px-3 py-3 text-[10.5px] text-muted">
                        {row.subscription?.startedAtUtc ? formatDate(row.subscription.startedAtUtc) : '—'}
                        {row.subscription?.confirmedAtUtc ? <span className="mt-0.5 block text-[9.5px] text-emerald">مؤكد {formatDate(row.subscription.confirmedAtUtc)}</span> : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openTeacherChat(row.teacherId)}
                            className="inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-[10.5px] font-bold text-muted transition hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
                            aria-label={`محادثة ${row.fullName}`}
                          >
                            <MessageCircle size={13} />
                            محادثة
                          </button>
                          <button
                            type="button"
                            onClick={() => setCollectionTeacher({ id: row.teacherId, name: row.fullName })}
                            className="inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-[10.5px] font-bold text-muted transition hover:border-emerald/40 hover:bg-emerald-soft hover:text-emerald"
                            aria-label={`بيانات تحصيل ${row.fullName}`}
                          >
                            <Wallet size={13} />
                            التحصيل
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2.5 text-[10.5px] text-muted">
            <span>صفحة {formatNumber(page)} من {formatNumber(totalPages)} · {formatNumber(total)} مدرس</span>
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" size="xs" icon={ChevronRight} disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>السابق</Button>
              <Button variant="secondary" size="xs" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>التالي<ChevronLeft size={13} /></Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="mt-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-[10px] bg-primary-soft text-primary"><Settings2 size={17} /></span>
            <div>
              <h2 className="text-[14px] font-bold text-ink">إعدادات ميزات باقة Free</h2>
              <p className="text-[11px] text-muted">تُحفظ في إعدادات النظام وتظهر للمدرس داخل صفحة الاشتراك.</p>
            </div>
          </div>
          <Badge tone="neutral">مفتاح الإعداد: {settings?.settingKey || '—'}</Badge>
        </div>

        {settingsLoading ? (
          <Skeleton className="mt-4 h-24 w-full" />
        ) : (
          <form onSubmit={saveSettings} className="mt-4 grid gap-3">
            <Field label="مفاتيح الميزات" hint="افصل بين المفاتيح بفاصلة. استخدم حروفاً إنجليزية وأرقاماً و _ - : فقط.">
              <Input value={featuresText} onChange={(event) => setFeaturesText(event.target.value)} dir="ltr" className="text-left" placeholder="exams, students, results" />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {featureChips.map((feature) => <Badge key={feature} tone="primary">{feature}</Badge>)}
            </div>
            <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-1.5 text-[10.5px] text-subtle"><ShieldCheck size={12} />لا توجد حدود رقمية افتراضية للطلاب أو الامتحانات.</p>
              <Button type="submit" size="sm" icon={ArrowDownUp} loading={settingsBusy}>حفظ إعدادات الميزات</Button>
            </div>
          </form>
        )}
        {settings?.note ? <p className="mt-3 rounded-[10px] bg-surface-soft p-2.5 text-[10.5px] leading-5 text-muted">{settings.note}</p> : null}
      </Card>

      {collectionTeacher ? (
        <Modal
          open
          onClose={() => setCollectionTeacher(null)}
          size="xl"
          icon={Wallet}
          title={`بيانات تحصيل ${collectionTeacher.name}`}
          description="هذه الأرقام تظهر لطلاب هذا المدرس فقط عند شراء كورس أو دفع مجموعة، ولا علاقة لها بأرقام اشتراك المنصة."
          footer={<Button variant="secondary" onClick={() => setCollectionTeacher(null)}>إغلاق</Button>}
        >
          <PaymentMethodsEditor
            key={collectionTeacher.id}
            token={token}
            endpoint={`/api/admin/teachers/${collectionTeacher.id}/payment-settings`}
            title="أرقام تحصيل الطلاب"
            description="يمكنك تعديل أرقام المدرس نيابة عنه. التغييرات تُطبق فوراً على شاشات الدفع الخاصة بطلابه."
            saveLabel="حفظ بيانات المدرس"
            onSaved={() => { setCollectionTeacher(null); setNotice('تم حفظ بيانات تحصيل المدرس.'); window.setTimeout(() => setNotice(''), 3200); }}
          />
        </Modal>
      ) : null}
    </div>
  );
}
