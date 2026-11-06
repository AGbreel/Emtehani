import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3, BookOpen, Crown, Download, FileSpreadsheet, GraduationCap, Printer,
  RefreshCw, Search, TrendingUp, Users, Wallet,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select,
  Skeleton, StatCard, cn,
} from '../components/ui';
import { request } from '../lib/api';
import { downloadBlob, formatDate, formatNumber } from '../lib/format';

const money = (value) => `${formatNumber(Number(value) || 0)} ج.م`;
const firstOfMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

const statusLabels = {
  Confirmed: 'مؤكد', Pending: 'بانتظار', Expired: 'منتهي', Suspended: 'موقوف',
  Cancelled: 'ملغى', Rejected: 'مرفوض', Grace: 'سماح',
};
const statusTones = {
  Confirmed: 'success', Pending: 'warning', Expired: 'neutral', Suspended: 'danger',
  Cancelled: 'danger', Rejected: 'danger', Grace: 'info',
};

export default function AdminReportsPage({ token }) {
  const [range, setRange] = useState({ from: firstOfMonth(), to: today() });
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const [teachers, setTeachers] = useState({ items: [], total: 0, page: 1, pageSize: 15 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [teachersLoading, setTeachersLoading] = useState(false);

  const flash = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3000);
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await request(`/api/admin/reports/overview?from=${range.from}&to=${range.to}`, { token });
      setOverview(data);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [token, range.from, range.to]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const loadTeachers = useCallback(async (page = 1) => {
    setTeachersLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '15' });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      const data = await request(`/api/admin/reports/teachers?${params}`, { token });
      setTeachers({ items: data?.items || [], total: data?.total || 0, page: data?.page || 1, pageSize: data?.pageSize || 15 });
    } catch (err) { setError(err.message); } finally { setTeachersLoading(false); }
  }, [token, search, statusFilter]);

  useEffect(() => { loadTeachers(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function exportCsv(kind) {
    setBusy(kind);
    try {
      const blob = await request(`/api/admin/reports/${kind}.csv?from=${range.from}&to=${range.to}`, { token });
      downloadBlob(blob, `${kind}-${range.from}-${range.to}.csv`);
      flash('تم تنزيل التقرير.');
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  const totals = overview?.totals || {};
  const byPlan = overview?.byPlan || [];
  const topTeachers = overview?.topTeachers || [];
  const revenueTrend = overview?.revenueTrend || [];
  const trendMax = Math.max(1, ...revenueTrend.flatMap((row) => [Number(row.platform) || 0, Number(row.students) || 0]));

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="الإدارة"
        title="تقارير المنصة"
        description="نظرة شاملة على المدرسين والطلاب والاشتراكات والتحصيل — مع تصدير CSV وطباعة PDF."
        action={<div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="soft" size="sm" icon={Printer} onClick={() => window.print()}>طباعة / PDF</Button>
          <Button variant="soft" size="sm" icon={RefreshCw} onClick={loadOverview} loading={loading}>تحديث</Button>
        </div>}
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <Card className="flex flex-wrap items-end gap-3 p-4 print:hidden">
        <Field label="من"><Input type="date" value={range.from} onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))} /></Field>
        <Field label="إلى"><Input type="date" value={range.to} onChange={(e) => setRange((p) => ({ ...p, to: e.target.value }))} /></Field>
        <Button variant="soft" onClick={loadOverview} loading={loading}>تطبيق</Button>
        <div className="flex w-full flex-wrap gap-2 sm:ms-auto sm:w-auto">
          <Button variant="soft" icon={FileSpreadsheet} loading={busy === 'subscriptions'} onClick={() => exportCsv('subscriptions')}>اشتراكات CSV</Button>
          <Button variant="soft" icon={Download} loading={busy === 'platform-payments'} onClick={() => exportCsv('platform-payments')}>مدفوعات CSV</Button>
        </div>
      </Card>

      {loading ? <Card className="p-4"><Skeleton className="h-40 w-full" /></Card> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Users} label="المدرسون" value={formatNumber(totals.teachers)} note={`+${formatNumber(totals.newTeachers)} جديد بالفترة`} tone="primary" />
            <StatCard icon={GraduationCap} label="الطلاب" value={formatNumber(totals.students)} note={`+${formatNumber(totals.newStudents)} جديد بالفترة`} tone="blue" />
            <StatCard icon={Crown} label="اشتراكات نشطة" value={formatNumber(totals.activeSubscriptions)} note={`${formatNumber(totals.pendingPlatformPayments)} دفعة بانتظار المراجعة`} tone="emerald" />
            <StatCard icon={Wallet} label="تحصيل المنصة" value={money(totals.platformRevenue)} note={`تحصيل المدرسين من الطلاب: ${money(totals.studentPayments)}`} tone="warning" />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard icon={BookOpen} label="كورسات نشطة" value={formatNumber(totals.courses)} note="غير مؤرشفة" tone="primary" />
            <StatCard icon={Users} label="مجموعات نشطة" value={formatNumber(totals.groups)} note="على مستوى المنصة" tone="blue" />
            <StatCard icon={TrendingUp} label="مدفوعات الطلاب بالفترة" value={money(totals.studentPayments)} note={`${formatDate(overview?.from)} — ${formatDate(overview?.to)}`} tone="emerald" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold text-ink"><BarChart3 size={17} /> تحصيل آخر 6 أشهر</h3>
              <div className="flex h-40 items-end justify-between gap-2">
                {revenueTrend.map((row) => (
                  <div key={row.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-32 w-full items-end justify-center gap-1">
                      <div title={`المنصة: ${money(row.platform)}`} className="w-2.5 rounded-t bg-primary transition-all" style={{ height: `${Math.max(3, Math.round(Number(row.platform) / trendMax * 100))}%` }} />
                      <div title={`الطلاب: ${money(row.students)}`} className="w-2.5 rounded-t bg-emerald transition-all" style={{ height: `${Math.max(3, Math.round(Number(row.students) / trendMax * 100))}%` }} />
                    </div>
                    <span className="text-[9px] text-muted">{row.month.slice(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-center gap-4 text-[10.5px] font-bold text-muted">
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-primary" />اشتراكات المنصة</span>
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-emerald" />مدفوعات الطلاب</span>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold text-ink"><Crown size={17} /> توزيع الخطط</h3>
              {byPlan.length === 0 ? <p className="py-8 text-center text-[12px] text-muted">لا توجد خطط.</p> : (
                <div className="grid gap-2">
                  {byPlan.map((plan) => (
                    <div key={plan.planId} className="flex items-center justify-between gap-2 rounded-xl border border-line/70 px-3 py-2 text-[12px]">
                      <span className="font-bold text-ink">{plan.name} <span className="font-mono text-[10px] text-muted">{plan.code}</span></span>
                      <span className="text-muted">{formatNumber(plan.activeCount)} مشترك</span>
                      <span className="font-extrabold text-primary">{money(plan.monthlyValue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden p-4">
            <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold text-ink"><TrendingUp size={17} /> أنشط المدرسين (بتحصيل الفترة)</h3>
            {topTeachers.length === 0 ? <p className="py-6 text-center text-[12px] text-muted">لا توجد بيانات.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-start text-[12px]">
                  <thead className="bg-surface-soft text-[11px] font-extrabold text-muted">
                    <tr>
                      <th className="px-3 py-2 text-start">المدرس</th>
                      <th className="px-3 py-2 text-start">الطلاب</th>
                      <th className="px-3 py-2 text-start">المجموعات</th>
                      <th className="px-3 py-2 text-start">الكورسات</th>
                      <th className="px-3 py-2 text-start">التحصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {topTeachers.map((row) => (
                      <tr key={row.teacherId}>
                        <td className="px-3 py-2"><p className="font-bold text-ink">{row.teacherName}</p><p className="text-[10px] text-muted">{row.email}</p></td>
                        <td className="px-3 py-2">{formatNumber(row.students)}</td>
                        <td className="px-3 py-2">{formatNumber(row.groups)}</td>
                        <td className="px-3 py-2">{formatNumber(row.courses)}</td>
                        <td className="px-3 py-2 font-extrabold text-emerald">{money(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line/70 p-4 print:hidden">
          <h3 className="me-auto font-display text-[15px] font-semibold text-ink">تقرير المدرسين التفصيلي</h3>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="w-44" onKeyDown={(e) => { if (e.key === 'Enter') loadTeachers(1); }} />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-36">
            <option value="">كل الحالات</option>
            {['Confirmed', 'Pending', 'Expired', 'Suspended', 'Cancelled'].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </Select>
          <Button size="sm" icon={Search} onClick={() => loadTeachers(1)} loading={teachersLoading}>بحث</Button>
        </div>
        {teachersLoading ? <div className="p-4"><Skeleton className="h-32 w-full" /></div> : teachers.items.length === 0 ? (
          <EmptyState icon={Users} title="لا يوجد مدرسون مطابقون" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-start text-[12px]">
                <thead className="bg-surface-soft text-[11px] font-extrabold text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start">المدرس</th>
                    <th className="px-4 py-3 text-start">الخطة</th>
                    <th className="px-4 py-3 text-start">الحالة</th>
                    <th className="px-4 py-3 text-start">الطلاب</th>
                    <th className="px-4 py-3 text-start">مجموعات</th>
                    <th className="px-4 py-3 text-start">كورسات</th>
                    <th className="px-4 py-3 text-start">التحصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {teachers.items.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-2.5"><p className="font-bold text-ink">{row.fullName}</p><p className="text-[10px] text-muted">{row.email}</p></td>
                      <td className="px-4 py-2.5">{row.planName || '—'}</td>
                      <td className="px-4 py-2.5"><Badge tone={statusTones[row.subscriptionStatus] || 'neutral'}>{statusLabels[row.subscriptionStatus] || row.subscriptionStatus || '—'}</Badge></td>
                      <td className="px-4 py-2.5">{formatNumber(row.students)}</td>
                      <td className="px-4 py-2.5">{formatNumber(row.groups)}</td>
                      <td className="px-4 py-2.5">{formatNumber(row.courses)}</td>
                      <td className="px-4 py-2.5 font-extrabold">{money(row.collected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-line/70 p-3 text-[12px] print:hidden">
              <Button variant="ghost" size="sm" disabled={teachers.page <= 1} onClick={() => loadTeachers(teachers.page - 1)}>السابق</Button>
              <span className="text-muted">صفحة {formatNumber(teachers.page)} — {formatNumber(teachers.total)} مدرس</span>
              <Button variant="ghost" size="sm" disabled={teachers.page * teachers.pageSize >= teachers.total} onClick={() => loadTeachers(teachers.page + 1)}>التالي</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
