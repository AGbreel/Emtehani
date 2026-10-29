import React, { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, Inbox, RefreshCw, UserCheck, X } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import { request } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';

const statusLabels = {
  Pending: { label: 'قيد المراجعة', tone: 'warning', icon: Clock3 },
  Accepted: { label: 'مقبول', tone: 'emerald', icon: UserCheck },
  Rejected: { label: 'مرفوض', tone: 'danger', icon: X },
};

export default function TeacherRequestsPage({ token }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await request('/api/teacher/requests', { token });
      setRows(Array.isArray(result) ? result : []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function decide(row, action) {
    setBusyId(row.id);
    setError('');
    setNotice('');
    try {
      const result = await request(`/api/teacher/requests/${row.id}`, { token, method: 'PUT', body: JSON.stringify({ action }) });
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: result.status, decidedAtUtc: new Date().toISOString() } : item));
      setNotice(action === 'accept' ? 'تم قبول الطالب وأصبح مرتبطاً بامتحاناتك.' : 'تم رفض طلب الطالب.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  const pending = rows.filter((row) => row.status === 'Pending').length;

  return (
    <div>
      <PageHeader
        eyebrow="إدارة التسجيل"
        title="طلبات الطلاب"
        description="اقبل طلبات الطلاب لربطهم بامتحاناتك المنشورة. الطالب المرفوض لا يستطيع دخول امتحاناتك."
        action={<Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <Card className="p-4"><p className="text-[11.5px] font-bold text-muted">بانتظار القرار</p><strong className="ui-number mt-1 block font-display text-2xl font-semibold text-warning">{formatNumber(pending)}</strong></Card>
        <Card className="p-4"><p className="text-[11.5px] font-bold text-muted">إجمالي الطلبات</p><strong className="ui-number mt-1 block font-display text-2xl font-semibold text-ink">{formatNumber(rows.length)}</strong></Card>
      </div>

      <Card className="overflow-hidden">
        {loading ? <div className="grid gap-2 p-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : rows.length === 0 ? (
          <EmptyState icon={Inbox} title="لا توجد طلبات تسجيل" description="ستظهر هنا طلبات الطلاب الذين يختارونك من صفحة المدرسين." />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((row) => {
              const status = statusLabels[row.status] || statusLabels.Pending;
              const StatusIcon = status.icon;
              return (
                <div key={row.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={row.studentName} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-bold text-ink">{row.studentName}</p>
                      <p className="truncate text-[10.5px] text-subtle" dir="ltr">{row.studentEmail}</p>
                      <p className="mt-0.5 text-[10.5px] text-subtle">أُرسل {formatDate(row.createdAtUtc)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={status.tone}><StatusIcon size={11} />{status.label}</Badge>
                    {row.status === 'Pending' ? (
                      <>
                        <Button size="xs" icon={Check} loading={busyId === row.id} onClick={() => decide(row, 'accept')}>قبول</Button>
                        <Button size="xs" variant="secondary" icon={X} loading={busyId === row.id} onClick={() => decide(row, 'reject')}>رفض</Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
