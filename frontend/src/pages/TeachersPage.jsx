import React, { useCallback, useEffect, useState } from 'react';
import { Clock3, GraduationCap, RefreshCw, Send, CheckCircle2, XCircle, Unlink } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import { request } from '../lib/api';
import { formatNumber } from '../lib/format';

const statusMap = {
  Pending: { label: 'قيد المراجعة', tone: 'warning', icon: Clock3 },
  Accepted: { label: 'مقبول', tone: 'emerald', icon: CheckCircle2 },
  Rejected: { label: 'مرفوض', tone: 'danger', icon: XCircle },
  Unlinked: { label: 'تم فك الارتباط', tone: 'neutral', icon: Unlink },
};

export default function TeachersPage({ token }) {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const rows = await request('/api/teachers', { token });
      setTeachers(Array.isArray(rows) ? rows : []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

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

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => <Skeleton key={index} className="h-32 w-full rounded-card" />)}
        </div>
      ) : teachers.length === 0 ? (
        <Card><EmptyState icon={GraduationCap} title="لا يوجد مدرسون متاحون" description="سيظهر المدرسون هنا بعد إنشاء حساباتهم وتأكيد بريدهم." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teachers.map((teacher) => {
            const status = teacher.requestStatus ? statusMap[teacher.requestStatus] : null;
            const StatusIcon = status?.icon;
            return (
              <Card key={teacher.id} className="flex flex-col p-4" data-testid={`teacher-card-${teacher.id}`}>
                <div className="flex items-center gap-3">
                  <Avatar name={teacher.fullName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-ink">{teacher.fullName}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{formatNumber(teacher.examCount)} امتحان منشور</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                  {status ? (
                    <Badge tone={status.tone}><StatusIcon size={11} className="me-1" />{status.label}</Badge>
                  ) : <span className="text-[11px] text-subtle">لم تُرسل طلباً بعد</span>}
                  {!status || teacher.requestStatus === 'Unlinked' ? (
                    <Button size="xs" icon={Send} loading={busyId === teacher.id} onClick={() => requestTeacher(teacher)}>
                      {teacher.requestStatus === 'Unlinked' ? 'طلب التسجيل مجدداً' : 'طلب التسجيل'}
                    </Button>
                  ) : teacher.requestStatus === 'Rejected' ? (
                    <span className="text-[10.5px] text-subtle">تواصل مع المدرس</span>
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
