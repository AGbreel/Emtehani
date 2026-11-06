import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, CalendarRange, ClipboardList, Download, FileSpreadsheet, RefreshCw, Users, Wallet,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select,
  Skeleton, StatCard, cn,
} from '../components/ui';
import { request } from '../lib/api';
import { downloadBlob, formatDate, formatNumber } from '../lib/format';

const money = (value) => `${formatNumber(Number(value) || 0)} ج.م`;

const tabs = [
  { value: 'attendance', label: 'تقارير الحضور' },
  { value: 'finance', label: 'التقارير المالية' },
  { value: 'homework', label: 'تقارير الواجبات' },
];

const methodLabels = {
  Cash: 'نقدي', VodafoneCash: 'فودافون كاش', InstaPay: 'إنستا باي', BankTransfer: 'تحويل بنكي', Online: 'أونلاين',
};

const firstOfMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

export default function TeachingReportsPage({ token }) {
  const [tab, setTab] = useState('attendance');
  const [groups, setGroups] = useState([]);
  const [homework, setHomework] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const [groupFilter, setGroupFilter] = useState('');
  const [attendanceRange, setAttendanceRange] = useState({ from: daysAgo(30), to: today() });
  const [attendanceReport, setAttendanceReport] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const [financeRange, setFinanceRange] = useState({ from: firstOfMonth(), to: today() });
  const [summary, setSummary] = useState(null);

  const [homeworkGroup, setHomeworkGroup] = useState('');

  const flash = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3000);
  }, []);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const groupData = await request('/api/teaching/groups', { token });
      setGroups(groupData?.items || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadBase(); }, [loadBase]);

  const loadAttendance = useCallback(async () => {
    if (!groupFilter) { setAttendanceReport(null); return; }
    setAttendanceLoading(true);
    setError('');
    try {
      const data = await request(`/api/teaching/groups/${groupFilter}/attendance/report?from=${attendanceRange.from}&to=${attendanceRange.to}`, { token });
      setAttendanceReport(data);
    } catch (err) { setError(err.message); } finally { setAttendanceLoading(false); }
  }, [token, groupFilter, attendanceRange.from, attendanceRange.to]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  const loadFinance = useCallback(async () => {
    try {
      const data = await request(`/api/teaching/finance/summary?from=${financeRange.from}&to=${financeRange.to}`, { token });
      setSummary(data);
    } catch (err) { setError(err.message); }
  }, [token, financeRange.from, financeRange.to]);

  useEffect(() => { if (tab === 'finance') loadFinance(); }, [tab, loadFinance]);

  const loadHomework = useCallback(async () => {
    try {
      const data = await request(`/api/teaching/homework${homeworkGroup ? `?groupId=${homeworkGroup}` : ''}`, { token });
      setHomework(data?.items || []);
    } catch (err) { setError(err.message); }
  }, [token, homeworkGroup]);

  useEffect(() => { if (tab === 'homework') loadHomework(); }, [tab, loadHomework]);

  async function exportFile(path, filename) {
    setBusy(path);
    setError('');
    try {
      const blob = await request(path, { token });
      downloadBlob(blob, filename);
      flash('تم تنزيل التقرير.');
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  const attendanceRows = attendanceReport?.items || [];
  const averageAttendance = useMemo(() => {
    if (attendanceRows.length === 0) return 0;
    return Math.round(attendanceRows.reduce((sum, row) => sum + Number(row.attendancePercent || 0), 0) / attendanceRows.length * 10) / 10;
  }, [attendanceRows]);

  const summaryStats = summary?.range || {};
  const debtors = summary?.debtors || [];
  const byMethod = summary?.byMethod || [];

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="التقارير"
        title="تقارير احترافية"
        description="حضور ومالية وواجبات مع فلاتر تاريخ وتصدير CSV جاهز لـ Excel."
        action={<Button variant="soft" size="sm" icon={RefreshCw} onClick={() => { loadBase(); loadAttendance(); if (tab === 'finance') loadFinance(); if (tab === 'homework') loadHomework(); }}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert> : null}

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

      {loading ? <Card className="p-4"><Skeleton className="h-32 w-full" /></Card> : null}

      {!loading && tab === 'attendance' ? (
        <div className="grid gap-4">
          <Card className="flex flex-wrap items-end gap-3 p-4">
            <Field label="المجموعة">
              <Select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="">اختر المجموعة</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </Select>
            </Field>
            <Field label="من"><Input type="date" value={attendanceRange.from} onChange={(e) => setAttendanceRange((p) => ({ ...p, from: e.target.value }))} /></Field>
            <Field label="إلى"><Input type="date" value={attendanceRange.to} onChange={(e) => setAttendanceRange((p) => ({ ...p, to: e.target.value }))} /></Field>
            <Button variant="soft" onClick={loadAttendance} loading={attendanceLoading}>عرض</Button>
            <Button className="ms-auto" variant="soft" icon={Download} disabled={!groupFilter}
              loading={busy === `/api/teaching/groups/${groupFilter}/attendance/report.csv`}
              onClick={() => exportFile(`/api/teaching/groups/${groupFilter}/attendance/report.csv?from=${attendanceRange.from}&to=${attendanceRange.to}`, `attendance-${groupFilter}.csv`)}>
              تصدير CSV
            </Button>
          </Card>

          {!groupFilter ? (
            <Card><EmptyState icon={BarChart3} title="اختر مجموعة" description="اختر مجموعة لعرض تقرير حضور طلابها." /></Card>
          ) : attendanceLoading ? (
            <Card className="p-4"><Skeleton className="h-40 w-full" /></Card>
          ) : !attendanceReport || attendanceRows.length === 0 ? (
            <Card><EmptyState icon={Users} title="لا توجد بيانات" description="لا توجد حصص مكتملة أو طلاب في هذه الفترة." /></Card>
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard icon={CalendarRange} label="حصص محتسبة" value={formatNumber(attendanceReport.totalSessions)} note={`${formatDate(attendanceReport.from)} — ${formatDate(attendanceReport.to)}`} tone="blue" />
                <StatCard icon={Users} label="طلاب" value={formatNumber(attendanceRows.length)} note="أعضاء نشطون" tone="primary" />
                <StatCard icon={BarChart3} label="متوسط الحضور" value={`${formatNumber(averageAttendance)}%`} note="حاضر + متأخر" tone={averageAttendance >= 75 ? 'emerald' : 'warning'} />
              </div>
              <Card className="overflow-x-auto">
                <div className="border-b border-line/70 px-4 py-3">
                  <h3 className="font-display text-[14px] font-semibold text-ink">{attendanceReport.groupName}</h3>
                </div>
                <table className="w-full min-w-[720px] text-start text-[12px]">
                  <thead className="bg-surface-soft text-[11px] font-extrabold text-muted">
                    <tr>
                      <th className="px-4 py-3 text-start">الطالب</th>
                      <th className="px-4 py-3 text-start">الكود</th>
                      <th className="px-4 py-3 text-start">حاضر</th>
                      <th className="px-4 py-3 text-start">متأخر</th>
                      <th className="px-4 py-3 text-start">غائب</th>
                      <th className="px-4 py-3 text-start">بعذر</th>
                      <th className="px-4 py-3 text-start">النسبة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {attendanceRows.map((row) => (
                      <tr key={row.studentId}>
                        <td className="px-4 py-2.5 font-bold text-ink">{row.name}</td>
                        <td className="px-4 py-2.5 font-mono text-[10.5px] text-muted">{row.studentCode || '—'}</td>
                        <td className="px-4 py-2.5 text-emerald">{formatNumber(row.present)}</td>
                        <td className="px-4 py-2.5 text-warning">{formatNumber(row.late)}</td>
                        <td className="px-4 py-2.5 text-danger">{formatNumber(row.absent)}</td>
                        <td className="px-4 py-2.5">{formatNumber(row.excused)}</td>
                        <td className="px-4 py-2.5"><Badge tone={row.attendancePercent >= 75 ? 'success' : row.attendancePercent >= 50 ? 'warning' : 'danger'}>{formatNumber(row.attendancePercent)}%</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'finance' ? (
        <div className="grid gap-4">
          <Card className="flex flex-wrap items-end gap-3 p-4">
            <Field label="من"><Input type="date" value={financeRange.from} onChange={(e) => setFinanceRange((p) => ({ ...p, from: e.target.value }))} /></Field>
            <Field label="إلى"><Input type="date" value={financeRange.to} onChange={(e) => setFinanceRange((p) => ({ ...p, to: e.target.value }))} /></Field>
            <Button variant="soft" onClick={loadFinance}>عرض</Button>
            <div className="flex w-full flex-wrap gap-2 sm:ms-auto sm:w-auto">
              <Button variant="soft" icon={FileSpreadsheet} loading={busy === 'charges.csv'}
                onClick={() => exportFile(`/api/teaching/finance/charges.csv?from=${financeRange.from}&to=${financeRange.to}`, 'charges.csv')}>المستحقات CSV</Button>
              <Button variant="soft" icon={FileSpreadsheet} loading={busy === 'payments.csv'}
                onClick={() => exportFile(`/api/teaching/finance/payments.csv?from=${financeRange.from}&to=${financeRange.to}`, 'payments.csv')}>المدفوعات CSV</Button>
            </div>
          </Card>

          {!summary ? <Card className="p-4"><Skeleton className="h-32 w-full" /></Card> : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={Wallet} label="مستحقات الفترة" value={money(summaryStats.charged)} note={`${formatNumber(summaryStats.chargesCount)} مستحق`} tone="blue" />
                <StatCard icon={Wallet} label="محصل الفترة" value={money(summaryStats.collected)} note={`${formatNumber(summaryStats.paymentsCount)} دفعة`} tone="emerald" />
                <StatCard icon={Wallet} label="إجمالي المتبقي" value={money(summary.outstanding)} note={`متأخر: ${money(summary.overdue)}`} tone="warning" />
                <StatCard icon={Wallet} label="متبقي الباقات" value={money(summary.packageOutstanding)} note={`تسويات: ${money(summary.totalAdjusted)}`} tone="primary" />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <h3 className="mb-3 font-display text-[14px] font-semibold text-ink">التحصيل حسب الوسيلة</h3>
                  {byMethod.length === 0 ? <p className="py-6 text-center text-[12px] text-muted">لا مدفوعات في الفترة.</p> : byMethod.map((row) => {
                    const total = byMethod.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 1;
                    return (
                      <div key={row.method} className="mb-3">
                        <div className="mb-1 flex justify-between text-[12px] font-bold"><span>{methodLabels[row.method] || row.method}</span><span className="text-muted">{money(row.amount)}</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-soft"><div className="h-full rounded-full bg-gradient-to-l from-primary to-emerald" style={{ width: `${Math.max(4, Math.round(Number(row.amount) / total * 100))}%` }} /></div>
                      </div>
                    );
                  })}
                </Card>
                <Card className="p-4">
                  <h3 className="mb-3 font-display text-[14px] font-semibold text-ink">أعلى المدينين</h3>
                  {debtors.length === 0 ? <p className="py-6 text-center text-[12px] text-muted">لا متأخرات.</p> : debtors.map((row) => (
                    <div key={row.studentId} className="flex items-center justify-between border-b border-line/50 py-2 text-[12px] last:border-0">
                      <span className="font-bold text-ink">{row.studentName || 'طالب'} <span className="text-[10.5px] font-normal text-muted">{row.studentCode}</span></span>
                      <span className="font-extrabold text-danger">{money(row.balance)}</span>
                    </div>
                  ))}
                </Card>
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === 'homework' ? (
        <div className="grid gap-4">
          <Card className="flex flex-wrap items-end gap-3 p-4">
            <Field label="المجموعة">
              <Select value={homeworkGroup} onChange={(e) => setHomeworkGroup(e.target.value)}>
                <option value="">كل المجموعات</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </Select>
            </Field>
            <Button variant="soft" onClick={loadHomework} icon={RefreshCw}>تحديث</Button>
          </Card>

          {homework.length === 0 ? <Card><EmptyState icon={ClipboardList} title="لا توجد واجبات" description="أنشئ واجباً من صفحة المجموعات ليظهر تقريره هنا." /></Card> : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-start text-[12px]">
                <thead className="bg-surface-soft text-[11px] font-extrabold text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start">الواجب</th>
                    <th className="px-4 py-3 text-start">الاستحقاق</th>
                    <th className="px-4 py-3 text-start">التسليمات</th>
                    <th className="px-4 py-3 text-start">المصحح</th>
                    <th className="px-4 py-3 text-start">الحالة</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {homework.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5 font-bold text-ink">{item.title}</td>
                      <td className="px-4 py-2.5 text-muted">{formatDate(item.dueAtUtc)}</td>
                      <td className="px-4 py-2.5">{formatNumber(item.submissionCount)}</td>
                      <td className="px-4 py-2.5">{formatNumber(item.reviewedCount)}</td>
                      <td className="px-4 py-2.5"><Badge tone={item.isPublished ? 'success' : 'neutral'}>{item.isPublished ? 'منشور' : 'مسودة'}</Badge></td>
                      <td className="px-4 py-2.5">
                        <Button size="xs" variant="soft" icon={Download} loading={busy === `hw-${item.id}`}
                          onClick={() => exportFile(`/api/teaching/homework/${item.id}/submissions.csv`, `homework-${item.title}.csv`)}>CSV</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
