import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, ExternalLink, GraduationCap, Link2, Mail, RefreshCw, Send, Unlink, XCircle } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import { request } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';

const statusMap = {
  Pending: { label: 'قيد المراجعة', tone: 'warning', icon: Clock3 },
  Accepted: { label: 'مقبول', tone: 'emerald', icon: CheckCircle2 },
  Rejected: { label: 'مرفوض', tone: 'danger', icon: XCircle },
  Unlinked: { label: 'تم فك الارتباط', tone: 'neutral', icon: Unlink },
};

export default function TeachersPage({ token }) {
  const [teachers, setTeachers] = useState([]);
  const [linkRequests, setLinkRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const [rows, requests] = await Promise.all([
        request('/api/teachers', { token }),
        request('/api/student/link-requests', { token }).catch(() => []),
      ]);
      setTeachers(Array.isArray(rows) ? rows : []);
      setLinkRequests(Array.isArray(requests) ? requests : []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const incoming = linkRequests.filter((row) => row.initiatedBy === 'Teacher' && row.status === 'Pending');

  async function requestTeacher(teacher) {
    setBusyId(teacher.id);
    setError('');
    setNotice('');
    try {
      await request(`/api/teachers/${teacher.id}/request`, { token, method: 'POST' });
      setTeachers((rows) => rows.map((row) => row.id === teacher.id ? { ...row, requestStatus: 'Pending' } : row));
      setNotice('تم إرسال طلب التسجيل. انتظر موافقة المدرس.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  async function decide(requestRow, action) {
    setBusyId(requestRow.id);
    setError('');
    setNotice('');
    try {
      const result = await request(`/api/student/link-requests/${requestRow.id}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({ action }),
      });
      setNotice(result?.message || (action === 'accept' ? 'تم قبول طلب المدرس.' : 'تم رفض طلب المدرس.'));
      await load(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="اختيار المدرس"
        title="المدرسون"
        description="اختر المدرس الذي تريد التسجيل معه. بعد قبول الطلب تظهر لك امتحاناته المنشورة فقط."
        action={<Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      {incoming.length > 0 ? (
        <Card className="mb-4 overflow-hidden" data-testid="incoming-link-requests">
          <div className="flex items-center gap-2 border-b border-line bg-warning-soft/40 px-4 py-3">
            <span className="grid size-8 place-items-center rounded-[9px] bg-warning-soft text-warning"><Link2 size={15} /></span>
            <div className="flex-1">
              <h2 className="text-[13px] font-bold text-ink">طلبات ارتباط من مدرسين</h2>
              <p className="text-[10.5px] text-muted">لن يظهر لك المدرس أو يصل إلى بياناتك إلا بعد موافقتك.</p>
            </div>
            <Badge tone="warning">{formatNumber(incoming.length)} معلّق</Badge>
          </div>
          <div className="divide-y divide-line">
            {incoming.map((row) => (
              <div key={row.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`incoming-request-${row.id}`}>
                <div className="flex items-center gap-3">
                  <Avatar name={row.teacherName} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-bold text-ink">{row.teacherName}</p>
                    <p className="truncate text-[10.5px] text-subtle" dir="ltr">{row.teacherEmail}</p>
                    <p className="mt-0.5 text-[10px] text-subtle">أُرسل {formatDate(row.createdAtUtc)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="xs" variant="success" icon={CheckCircle2} loading={busyId === row.id} onClick={() => decide(row, 'accept')}>قبول</Button>
                  <Button size="xs" variant="ghost" icon={XCircle} disabled={busyId === row.id} onClick={() => decide(row, 'reject')}>رفض</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => <Skeleton key={index} className="h-32 w-full rounded-card" />)}
        </div>
      ) : teachers.length === 0 ? (
        <Card><EmptyState icon={GraduationCap} title="لا يوجد مدرسون متاحون" description="سيظهر المدرسون هنا بعد إنشاء حساباتهم وتأكيد بريدهم." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teachers.map((teacher) => {
            const status = teacher.requestStatus ? statusMap[teacher.requestStatus] : null;
            const StatusIcon = status?.icon;
            return (
              <Card key={teacher.id} className="flex min-w-0 flex-col p-4" data-testid={`teacher-card-${teacher.id}`}>
                <div className="flex items-center gap-3">
                  <Avatar name={teacher.fullName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-ink">{teacher.professionalName || teacher.fullName}</p>
                    {teacher.professionalName ? <p className="truncate text-[10.5px] text-subtle">{teacher.fullName}</p> : null}
                    <p className="mt-0.5 text-[11px] text-muted">{teacher.specialty ? `${teacher.specialty} · ` : ''}{formatNumber(teacher.examCount)} امتحان منشور</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {teacher.hasPublicProfile && teacher.profileSlug ? (
                    <a href={`/t/${encodeURIComponent(teacher.profileSlug)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[10.5px] font-bold text-muted transition hover:border-line-strong hover:text-primary">
                      <ExternalLink size={11} /> عرض الملف التعريفي
                    </a>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  {status ? (
                    <Badge tone={status.tone}><StatusIcon size={11} className="me-1" />{status.label}</Badge>
                  ) : <span className="text-[11px] text-subtle">لم تُرسل طلباً بعد</span>}
                  {!status || teacher.requestStatus === 'Unlinked' || teacher.requestStatus === 'Rejected' ? (
                    <Button size="xs" icon={Send} loading={busyId === teacher.id} onClick={() => requestTeacher(teacher)}>
                      {teacher.requestStatus === 'Unlinked' ? 'طلب التسجيل مجدداً' : teacher.requestStatus === 'Rejected' ? 'إعادة إرسال الطلب' : 'طلب التسجيل'}
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
