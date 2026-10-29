import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Clock3,
  Download,
  LockKeyhole,
  Play,
  Radio,
  RefreshCw,
  Save,
  Send,
  Square,
  TimerReset,
  Users,
  UserX,
} from 'lucide-react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LiveDot,
  Modal,
  PageHeader,
  Skeleton,
  StatusChip,
  TableSkeleton,
  cn,
} from '../components/ui';
import { request } from '../lib/api';
import { downloadBlob, formatDate, formatDuration, formatNumber, formatTimer, scoreText } from '../lib/format';

const statusOrder = ['Active', 'Waiting', 'Disconnected', 'Invited', 'Submitted', 'Absent'];

export default function TeacherExamDetail({ token, exam: initialExam, onBack, onOpenResults }) {
  const [exam, setExam] = useState(initialExam);
  const [participants, setParticipants] = useState([]);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [publishResultsOpen, setPublishResultsOpen] = useState(false);
  const [syncedAt, setSyncedAt] = useState(Date.now());
  const [tick, setTick] = useState(0);
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');

  function toLocalInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  const load = useCallback(async (background = false) => {
    if (!exam?.id) return;
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const live = await request(`/api/exams/${exam.id}/live`, { token });
      setParticipants(live.items || []);
      setCounts(live.counts || null);
      setSyncedAt(Date.now());
      setTick(0);
      setExam((current) => ({
        ...current,
        status: live.examStatus,
        title: live.examTitle || current.title,
        resultsPublishedAtUtc: live.resultsPublishedAtUtc ?? current.resultsPublishedAtUtc,
      }));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, exam?.id]);

  useEffect(() => {
    if (!initialExam?.id) return;
    let active = true;
    request(`/api/exams/${initialExam.id}`, { token })
      .then((meta) => { if (active) { setExam((current) => ({ ...current, ...meta, status: current.status === 'Active' || current.status === 'Paused' ? current.status : meta.status })); setAvailableFrom(toLocalInput(meta.availableFromUtc)); setAvailableUntil(toLocalInput(meta.availableUntilUtc)); } })
      .catch(() => {});
    return () => { active = false; };
  }, [token, initialExam?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const poll = window.setInterval(() => load(true), 3000);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const secondsSinceSync = Math.floor((Date.now() - syncedAt) / 1000);

  const sorted = useMemo(() => {
    const rank = Object.fromEntries(statusOrder.map((status, index) => [status, index]));
    return [...participants].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.studentName.localeCompare(b.studentName, 'ar'));
  }, [participants]);

  async function runState(action, message) {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      const result = await request(`/api/exams/${exam.id}/state`, { token, method: 'PUT', body: JSON.stringify({ action }) });
      setExam((current) => ({ ...current, status: result.status }));
      setNotice(message);
      setCloseOpen(false);
      await load(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function publish() {
    setBusy('publish');
    setError('');
    setNotice('');
    try {
      const result = await request(`/api/exams/${exam.id}/publish`, { token, method: 'PUT' });
      setExam((current) => ({ ...current, isPublished: result.isPublished, status: result.status }));
      setNotice('تم نشر الامتحان. افتح الجلسة في وقتها وسيظهر للطلاب المؤهلين تلقائياً في قائمتهم.');
      await load(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function publishResults() {
    setBusy('publish-results');
    setError('');
    setNotice('');
    try {
      const result = await request(`/api/exams/${exam.id}/results/publish`, { token, method: 'POST' });
      setExam((current) => ({ ...current, resultsPublishedAtUtc: result.resultsPublishedAtUtc }));
      setPublishResultsOpen(false);
      setNotice(result.alreadyPublished
        ? 'النتائج منشورة بالفعل للطلاب.'
        : 'تم نشر النتائج. أصبحت الدرجات والإجابات الصحيحة وملاحظاتك متاحة للطلاب.');
      await load(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function saveAvailability() {
    setBusy('availability');
    setError('');
    setNotice('');
    try {
      if (availableFrom && availableUntil && new Date(availableUntil) <= new Date(availableFrom)) {
        setError('نهاية فترة الإتاحة يجب أن تكون بعد بدايتها.');
        return;
      }
      const result = await request(`/api/exams/${exam.id}/availability`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          availableFromUtc: availableFrom ? new Date(availableFrom).toISOString() : null,
          availableUntilUtc: availableUntil ? new Date(availableUntil).toISOString() : null,
        }),
      });
      setExam((current) => ({ ...current, availableFromUtc: result.availableFromUtc, availableUntilUtc: result.availableUntilUtc }));
      setNotice('تم تحديث فترة إتاحة الامتحان.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function exportResults() {
    setBusy('export-results');
    setError('');
    try {
      const blob = await request(`/api/exams/${exam.id}/export`, { token });
      downloadBlob(blob, `${exam.title.replace(/[\\/:*?"<>|]/g, '-')}-results.csv`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const total = counts?.total ?? participants.length;
  const openAllowed = ['Draft', 'Scheduled', 'Waiting'].includes(exam.status);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-5 inline-flex min-h-9 items-center gap-1.5 text-[12px] font-bold text-muted transition hover:text-primary"><ArrowLeft size={14} className="rotate-180" />العودة إلى الامتحانات</button>

      <PageHeader
        eyebrow="إدارة الجلسة"
        title={exam.title}
        description={`${formatDuration(exam.durationMinutes)} · ${formatNumber(exam.questionCount)} سؤال · تم الإنشاء ${formatDate(exam.createdAtUtc)}`}
        action={
          <>
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>
            {exam.status === 'Active' ? (
              <>
                <Button variant="warning" size="sm" icon={Clock3} loading={busy === 'pause'} onClick={() => runState('pause', 'تم إيقاف الجلسة مؤقتاً. الوقت متوقف الآن.')}>إيقاف مؤقت</Button>
                <Button variant="danger" size="sm" icon={Square} onClick={() => setCloseOpen(true)}>إنهاء الجلسة</Button>
              </>
            ) : exam.status === 'Paused' ? (
              <>
                <Button variant="success" size="sm" icon={Play} loading={busy === 'resume'} onClick={() => runState('resume', 'تم استئناف الجلسة وإضافة زمن التوقف إلى وقت الطلاب.')}>استئناف</Button>
                <Button variant="danger" size="sm" icon={Square} onClick={() => setCloseOpen(true)}>إنهاء</Button>
              </>
            ) : !exam.isPublished ? (
              <Button size="sm" icon={Radio} loading={busy === 'publish'} onClick={publish}>نشر الامتحان</Button>
            ) : openAllowed ? (
              <Button variant="success" size="sm" icon={Play} loading={busy === 'open'} onClick={() => runState('open', 'تم فتح الجلسة. سيبدأ الطلاب تلقائياً من غرفة الانتظار.')}>فتح الجلسة</Button>
            ) : (
              <Button variant="secondary" size="sm" icon={BarChart3} onClick={() => onOpenResults(exam)}>عرض النتائج</Button>
            )}
          </>
        }
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11.5px] font-bold text-muted">حالة الجلسة</span><StatusChip status={exam.status} /></div>
          <div className="mt-3 flex items-center gap-2">
            {exam.status === 'Active' ? <LiveDot label="مفتوحة الآن" /> : <span className="text-[11px] leading-5 text-subtle">{exam.status === 'Paused' ? 'الوقت متوقف للجميع' : 'لم تبدأ الجلسة بعد'}</span>}
          </div>
        </Card>
        <Card className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-[11.5px] font-bold text-muted">إجمالي الطلاب</span><Users size={16} className="text-blue" /></div>
          <strong className="ui-number mt-2 block font-display text-2xl font-semibold text-ink">{formatNumber(total)}</strong>
          <p className="text-[10.5px] leading-5 text-subtle">{formatNumber(counts?.submitted || 0)} سلّموا · {formatNumber(counts?.active || 0)} يحلّون الآن</p>
        </Card>
        <Card className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-[11.5px] font-bold text-muted">في الانتظار</span><Clock3 size={16} className="text-warning" /></div>
          <strong className="ui-number mt-2 block font-display text-2xl font-semibold text-ink">{formatNumber(counts?.waiting || 0)}</strong>
          <p className="text-[10.5px] leading-5 text-subtle">لم يبدأوا المحاولة بعد</p>
        </Card>
        <Card className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-[11.5px] font-bold text-muted">انقطع الاتصال</span><UserX size={16} className="text-danger" /></div>
          <strong className="ui-number mt-2 block font-display text-2xl font-semibold text-ink">{formatNumber(counts?.disconnected || 0)}</strong>
          <p className="text-[10.5px] leading-5 text-subtle">مرّ أكثر من 45 ثانية بلا نشاط</p>
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <Field label="فترة الإتاحة من" id="detail-available-from" hint="اختياري. لا يمكن بدء محاولة جديدة قبل هذا الوقت.">
              <Input id="detail-available-from" type="datetime-local" value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} />
            </Field>
            <Field label="فترة الإتاحة إلى" id="detail-available-until" hint="تنتهي محاولة الطالب عند هذا الوقت حتى لو بقي من المدة.">
              <Input id="detail-available-until" type="datetime-local" value={availableUntil} onChange={(event) => setAvailableUntil(event.target.value)} />
            </Field>
          </div>
          <Button size="sm" icon={Save} loading={busy === 'availability'} onClick={saveAvailability}>حفظ فترة الإتاحة</Button>
        </div>
      </Card>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <div className="flex items-center gap-2"><h2 className="font-display text-[15px] font-semibold text-ink">الطلاب</h2><Badge tone="primary">{formatNumber(total)}</Badge></div>
              <p className="mt-1 text-[11.5px] leading-5 text-muted">يظهر هنا الطلاب المسجلون لديك والمطابقون لمرحلة الامتحان وصفه تلقائياً عند حضورهم.</p>
            </div>
          </div>

          {loading ? <TableSkeleton rows={6} /> : sorted.length === 0 ? (
            <EmptyState
              icon={Users}
              title="لا يوجد طلاب حاضرون بعد"
              description={exam.isPublished ? 'انشر الامتحان وافتح الجلسة في وقتها، وسيظهر هنا الطلاب المؤهلون تلقائياً عند دخولهم.' : 'انشر الامتحان أولاً، ثم افتح الجلسة في وقتها ليتمكن الطلاب المؤهلون من الحضور.'}
              action={!exam.isPublished ? <Button size="sm" icon={Radio} onClick={publish} loading={busy === 'publish'}>نشر الامتحان</Button> : null}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[820px] text-right">
                  <thead>
                    <tr className="border-b border-line bg-surface-soft/60 text-[11px] font-extrabold text-muted">
                      <th className="px-5 py-3">الطالب</th>
                      <th className="px-3 py-3">الحالة</th>
                      <th className="px-3 py-3">الوقت المتبقي</th>
                      <th className="px-3 py-3">الدرجة</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((participant) => {
                      const remaining = participant.remainingSeconds == null ? null : Math.max(0, participant.remainingSeconds - (participant.status === 'Active' ? secondsSinceSync : 0));
                      return (
                        <tr key={participant.id} className="border-b border-line/70 transition last:border-0 hover:bg-surface-soft/50">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={participant.studentName} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate text-[12.5px] font-bold text-ink">{participant.studentName}</p>
                                <p className="max-w-[190px] truncate text-[10.5px] text-subtle" dir="ltr">{participant.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3"><StatusChip status={participant.status} /></td>
                          <td className="px-3 py-3">
                            {remaining == null ? <span className="text-[11.5px] text-subtle">—</span> : <span className={cn('ui-number text-[12px] font-bold', remaining < 300 ? 'text-danger' : 'text-ink')}>{formatTimer(remaining)}</span>}
                          </td>
                          <td className="px-3 py-3 text-[11.5px] text-muted">{participant.score != null ? scoreText(participant.score, participant.maxScore) : '—'}</td>
                          <td className="px-5 py-3" />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-2.5 p-3 md:hidden">
                {sorted.map((participant) => {
                  const remaining = participant.remainingSeconds == null ? null : Math.max(0, participant.remainingSeconds - (participant.status === 'Active' ? secondsSinceSync : 0));
                  return (
                    <div key={participant.id} className="min-w-0 rounded-[13px] border border-line bg-surface-soft/50 p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar name={participant.studentName} size="sm" />
                          <div className="min-w-0"><p className="truncate text-[12.5px] font-bold text-ink">{participant.studentName}</p><p className="max-w-[120px] truncate text-[10px] text-subtle sm:max-w-[150px]" dir="ltr">{participant.email}</p></div>
                        </div>
                        <StatusChip status={participant.status} />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                        <span className="text-[10.5px] text-subtle">الطلاب المؤهلون يظهرون تلقائياً</span>
                        <div className="flex items-center gap-2">
                          {remaining != null ? <span className={cn('ui-number text-[11px] font-bold', remaining < 300 ? 'text-danger' : 'text-muted')}>{formatTimer(remaining)}</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        <div className="grid content-start gap-3">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-[14px] font-semibold text-ink">إجراءات الجلسة</h3><LockKeyhole size={16} className="text-primary" /></div>
            {exam.status === 'Active' ? (
              <div className="grid gap-2">
                <Button variant="warning" size="sm" icon={Clock3} loading={busy === 'pause'} onClick={() => runState('pause', 'تم إيقاف الجلسة مؤقتاً.')}>إيقاف مؤقت للجميع</Button>
                <Button variant="danger" size="sm" icon={Square} onClick={() => setCloseOpen(true)}>إنهاء الجلسة نهائياً</Button>
              </div>
            ) : exam.status === 'Paused' ? (
              <div className="grid gap-2">
                <Button variant="success" size="sm" icon={Play} loading={busy === 'resume'} onClick={() => runState('resume', 'تم استئناف الجلسة.')}>استئناف الوقت</Button>
                <Button variant="danger" size="sm" icon={Square} onClick={() => setCloseOpen(true)}>إنهاء الجلسة</Button>
              </div>
            ) : exam.status === 'Finished' ? (
              <div className="grid gap-2">
                {exam.resultsPublishedAtUtc ? (
                  <div className="rounded-[11px] border border-emerald/20 bg-emerald-soft px-3 py-2.5 text-[10.5px] font-bold leading-5 text-emerald">
                    تم نشر النتائج للطلاب في {formatDate(exam.resultsPublishedAtUtc)}.
                  </div>
                ) : (
                  <Button variant="success" size="sm" icon={Send} onClick={() => setPublishResultsOpen(true)}>نشر النتائج للطلاب</Button>
                )}
                <Button variant="secondary" size="sm" icon={BarChart3} onClick={() => onOpenResults(exam)}>فتح النتائج</Button>
              </div>
            ) : (
              <div className="grid gap-2">
                {!exam.isPublished ? <Button size="sm" icon={Radio} loading={busy === 'publish'} onClick={publish}>نشر الامتحان</Button> : null}
                {exam.isPublished ? <Button variant="success" size="sm" icon={Play} loading={busy === 'open'} onClick={() => runState('open', 'تم فتح الجلسة.')}>فتح الجلسة الآن</Button> : null}
              </div>
            )}
            <div className="mt-3 rounded-[11px] border border-line bg-surface-soft p-2.5 text-[10.5px] leading-5 text-muted">
              <span className="mb-1 flex items-center gap-1 font-bold text-ink"><TimerReset size={12} className="text-primary" />تذكير</span>
              عند الإيقاف المؤقت يتوقف الوقت، وعند الاستئناف يُضاف زمن التوقف تلقائياً.
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-display text-[14px] font-semibold text-ink">تصدير ومتابعة</h3>
            <div className="mt-3 grid gap-2">
              <Button variant="secondary" size="sm" icon={Download} loading={busy === 'export-results'} onClick={exportResults}>تصدير النتائج CSV</Button>
              <Button variant="secondary" size="sm" icon={BarChart3} onClick={() => onOpenResults(exam)}>عرض تحليلات الامتحان</Button>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="إنهاء الجلسة نهائياً؟"
        description="سيتم تصحيح المحاولات النشطة تلقائياً، وتسجيل الطلاب الذين لم يبدأوا كغائبين. لا يمكن استئناف الجلسة بعد الإنهاء. لن تظهر النتائج للطلاب حتى تنشرها بعد اكتمال التصحيح."
        icon={AlertTriangle}
        tone="danger"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCloseOpen(false)}>إلغاء</Button>
            <Button variant="danger" size="sm" loading={busy === 'close'} onClick={() => runState('close', 'تم إنهاء الجلسة وتحديث حالة الطلاب.')}>نعم، أنهِ الجلسة</Button>
          </>
        }
      />

      <Modal
        open={publishResultsOpen}
        onClose={() => setPublishResultsOpen(false)}
        title="نشر النتائج للطلاب؟"
        description="ستظهر الدرجات والإجابات الصحيحة وملاحظات المدرس لجميع الطلاب المؤهلين. تأكد من اكتمال تصحيح الأسئلة المقالية قبل النشر."
        icon={Send}
        tone="success"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPublishResultsOpen(false)}>إلغاء</Button>
            <Button variant="success" size="sm" loading={busy === 'publish-results'} onClick={publishResults}>نعم، انشر النتائج</Button>
          </>
        }
      />
    </div>
  );
}
