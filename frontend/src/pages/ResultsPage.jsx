import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  GraduationCap,
  RefreshCw,
  RotateCcw,
  Search,
  Target,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
  StatCard,
  StatusChip,
  TableSkeleton,
  cn,
} from '../components/ui';
import { request } from '../lib/api';
import { downloadBlob, formatDate, formatNumber, formatTimer, percent, scoreText } from '../lib/format';

function ScoreCell({ score, maxScore, status, resultsAvailable = true }) {
  if (!resultsAvailable) {
    return (
      <div className="min-w-[90px]">
        <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-warning-soft px-2 py-1 text-[10.5px] font-bold text-warning"><Clock3 size={11} />بانتظار اعتماد النتائج</span>
      </div>
    );
  }
  const value = percent(score, maxScore);
  return (
    <div className="min-w-[90px]">
      <div className="flex items-center justify-between gap-2">
        <span className="ui-number text-[12px] font-bold text-ink">{scoreText(score, maxScore)}</span>
        <span className={cn('ui-number text-[10.5px]', value >= 60 ? 'text-emerald' : value >= 50 ? 'text-warning' : 'text-danger')}>{formatNumber(value)}%</span>
      </div>
      <ProgressBar value={value} className="mt-1.5 h-1.5" tone={status === 'NeedsReview' ? 'warning' : value >= 60 ? 'emerald' : value >= 50 ? 'warning' : 'danger'} />
    </div>
  );
}

function StudentResults({ token, onOpenReview }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await request('/api/results/mine', { token });
      setItems(Array.isArray(result) ? result : []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const graded = items.filter((item) => item.score != null);
  const average = graded.length ? Math.round(graded.reduce((sum, item) => sum + percent(item.score, item.maxScore), 0) / graded.length) : 0;
  const best = graded.length ? Math.max(...graded.map((item) => percent(item.score, item.maxScore))) : 0;

  return (
    <div>
      <PageHeader
        eyebrow="متابعة الأداء"
        title="نتائجي"
        description="كل محاولة مسلّمة تظهر هنا. تُعرض الدرجات والإجابات الصحيحة بعد انتهاء الامتحان واعتماد النتائج."
        action={<Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={FileText} label="المحاولات" value={formatNumber(items.length)} note="محاولات مسلّمة" loading={loading} />
        <StatCard icon={Target} label="متوسط النتائج" value={`${formatNumber(average)}%`} note="من النتائج المعتمدة" tone="blue" loading={loading} />
        <StatCard icon={Award} label="أفضل نتيجة" value={`${formatNumber(best)}%`} note="أعلى نسبة معتمدة" tone="emerald" loading={loading} />
        <StatCard icon={Clock3} label="بانتظار الاعتماد" value={formatNumber(items.filter((item) => item.resultsAvailable === false).length)} note="تظهر بعد انتهاء الامتحان" tone="warning" loading={loading} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-4 sm:px-5">
          <div><h2 className="font-display text-[15px] font-semibold text-ink">سجل النتائج</h2><p className="mt-1 text-[11.5px] text-muted">الأحدث أولاً.</p></div>
          <Badge tone="primary">{formatNumber(items.length)} نتيجة</Badge>
        </div>
        {loading ? <TableSkeleton rows={5} /> : items.length === 0 ? (
          <EmptyState icon={BarChart3} title="لا توجد نتائج بعد" description="بعد تسليم أول امتحان ستظهر نتيجتك هنا، مع إمكانية مراجعة الإجابات." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-right">
                <thead><tr className="border-b border-line bg-surface-soft/60 text-[11px] font-extrabold text-muted"><th className="px-5 py-3">الامتحان</th><th className="px-3 py-3">المدرس</th><th className="px-3 py-3">النتيجة</th><th className="px-3 py-3">الحالة</th><th className="px-3 py-3">التسليم</th><th className="px-5 py-3" /></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-line/70 last:border-0 hover:bg-surface-soft/50">
                      <td className="px-5 py-3.5"><p className="max-w-[250px] truncate text-[13px] font-bold text-ink">{item.examTitle}</p><p className="mt-0.5 text-[10.5px] text-subtle">محاولة {formatNumber(item.attemptNumber)}</p></td>
                      <td className="px-3 py-3.5 text-[11.5px] text-muted">{item.teacherName || '—'}</td>
                      <td className="px-3 py-3.5"><ScoreCell score={item.score} maxScore={item.maxScore} status={item.status} resultsAvailable={item.resultsAvailable !== false} /></td>
                      <td className="px-3 py-3.5"><StatusChip status={item.status} /></td>
                      <td className="px-3 py-3.5 text-[10.5px] text-muted">{formatDate(item.submittedAtUtc)}</td>
                      <td className="px-5 py-3.5 text-left"><Button variant="ghost" size="xs" icon={Eye} onClick={() => onOpenReview(item.id)}>مراجعة</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-3 md:hidden">
              {items.map((item) => (
                <div key={item.id} className="rounded-[14px] border border-line bg-surface-soft/50 p-3.5">
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-[13px] font-bold text-ink">{item.examTitle}</p><p className="mt-1 text-[10.5px] text-subtle">{item.teacherName || '—'} · محاولة {formatNumber(item.attemptNumber)}</p></div><StatusChip status={item.status} /></div>
                  <div className="mt-3"><ScoreCell score={item.score} maxScore={item.maxScore} status={item.status} resultsAvailable={item.resultsAvailable !== false} /></div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5"><span className="text-[10.5px] text-subtle">{formatDate(item.submittedAtUtc)}</span><Button variant="ghost" size="xs" icon={Eye} onClick={() => onOpenReview(item.id)}>مراجعة الإجابات</Button></div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export default function ResultsPage({ token, user, selectedExam, onOpenReview, onOpenExam }) {
  const isStudent = user?.role !== 'Teacher';
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState(selectedExam?.id || '');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingExams, setLoadingExams] = useState(!isStudent);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [grantTarget, setGrantTarget] = useState(null);
  const [grantBusy, setGrantBusy] = useState(false);

  useEffect(() => {
    if (selectedExam?.id) setExamId(selectedExam.id);
  }, [selectedExam?.id]);

  useEffect(() => {
    if (isStudent) return;
    let active = true;
    request('/api/exams?pageSize=100', { token })
      .then((result) => {
        if (!active) return;
        setExams(result.items || []);
        setExamId((current) => current || result.items?.[0]?.id || '');
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoadingExams(false); });
    return () => { active = false; };
  }, [token, isStudent]);

  const selected = useMemo(() => exams.find((exam) => exam.id === examId), [exams, examId]);

  const load = useCallback(async (background = false) => {
    if (isStudent || !examId) return;
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await request(`/api/exams/${examId}/results?page=1&pageSize=100`, { token });
      setItems(result.items || []);
      setTotal(result.total || 0);
      setError('');
    } catch (err) {
      setError(err.message);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, examId, isStudent]);

  useEffect(() => { load(); }, [load]);

  async function exportResults() {
    if (!selected) return;
    setError('');
    try {
      const blob = await request(`/api/exams/${selected.id}/export`, { token });
      downloadBlob(blob, `${selected.title.replace(/[\\/:*?"<>|]/g, '-')}-results.csv`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function grantExtra() {
    if (!grantTarget) return;
    setGrantBusy(true);
    setError('');
    try {
      const result = await request(`/api/submissions/${grantTarget.id}/grant-extra-attempt`, { token, method: 'POST' });
      setNotice(result.message || 'تم منح المحاولة الإضافية.');
      setGrantTarget(null);
      load(true);
    } catch (err) {
      if (err.status === 409) {
        setGrantTarget(null);
        await load(true);
        setError(`${err.message} تم تحديث القائمة لتعكس الحالة الحالية.`);
      } else {
        setError(err.message);
      }
    } finally {
      setGrantBusy(false);
    }
  }

  if (isStudent) return <StudentResults token={token} onOpenReview={onOpenReview} />;

  const filtered = items.filter((item) => !search.trim() || item.student.includes(search.trim()) || item.email?.includes(search.trim()));
  const graded = filtered.filter((item) => item.score != null);
  const average = graded.length ? Math.round(graded.reduce((sum, item) => sum + percent(item.score, item.maxScore), 0) / graded.length) : 0;
  const flagged = filtered.filter((item) => item.focusLossDetected).length;

  return (
    <div>
      <PageHeader
        eyebrow="متابعة الأداء"
        title="النتائج والتحليلات"
        description="راجع نتائج كل امتحان، افتح المحاولات، وصدّر النتائج عند الحاجة."
        action={
          <>
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)} disabled={!examId}>تحديث</Button>
            <Button variant="secondary" size="sm" icon={Download} onClick={exportResults} disabled={!selected}>تصدير CSV</Button>
          </>
        }
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <Card className="mb-4 p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="results-exam" className="mb-1.5 block text-[11.5px] font-bold text-muted">اختر الامتحان</label>
            <Select id="results-exam" value={examId} onChange={(event) => setExamId(event.target.value)} disabled={loadingExams} className="h-11 text-[12.5px]">
              <option value="">{loadingExams ? 'جارٍ تحميل الامتحانات...' : 'اختر الامتحان'}</option>
              {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
            </Select>
          </div>
          {selected ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={selected.status} />
              {onOpenExam ? <Button variant="secondary" size="sm" icon={Eye} onClick={() => onOpenExam(selected)}>إدارة الجلسة</Button> : null}
            </div>
          ) : null}
        </div>
      </Card>

      {!examId && !loadingExams ? (
        <Card><EmptyState icon={BarChart3} title="لا يوجد امتحان لعرض نتائجه" description="أنشئ امتحاناً أولاً، ثم ستظهر نتائجه هنا بعد أول تسليم." /></Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Users} label="المحاولات المسلّمة" value={formatNumber(total)} note={`${formatNumber(items.length)} في هذه القائمة`} loading={loading} />
            <StatCard icon={Target} label="متوسط الدرجات" value={`${formatNumber(average)}%`} note="للمحاولات المصححة" tone="blue" loading={loading} />
            <StatCard icon={GraduationCap} label="أعلى نتيجة" value={`${formatNumber(graded.length ? Math.max(...graded.map((item) => percent(item.score, item.maxScore))) : 0)}%`} note="في القائمة الحالية" tone="emerald" loading={loading} />
            <StatCard icon={AlertTriangle} label="مؤشرات خروج" value={formatNumber(flagged)} note="محاولات رُصد فيها فقدان تركيز" tone="warning" loading={loading} />
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="font-display text-[15px] font-semibold text-ink">نتائج الطلاب</h2><p className="mt-1 text-[11.5px] text-muted">{selected?.title || 'اختر امتحاناً'}</p></div>
              <div className="relative w-full sm:max-w-[240px]">
                <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الطالب..." className="h-10 w-full rounded-[9px] border border-line bg-surface-soft pr-8 pl-3 text-[12.5px] outline-none focus:border-primary focus:bg-surface" />
              </div>
            </div>

            {loading ? <TableSkeleton rows={6} /> : filtered.length === 0 ? (
              <EmptyState icon={BarChart3} title={search ? 'لا يوجد طالب بهذا الاسم' : 'لا توجد نتائج مسلّمة بعد'} description={search ? 'جرّب كلمة بحث أخرى.' : 'عندما يسلّم الطلاب، ستظهر محاولاتهم هنا مباشرة.'} />
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[900px] text-right">
                    <thead><tr className="border-b border-line bg-surface-soft/60 text-[11px] font-extrabold text-muted"><th className="px-5 py-3">الطالب</th><th className="px-3 py-3">النتيجة</th><th className="px-3 py-3">الحالة</th><th className="px-3 py-3">التسليم</th><th className="px-3 py-3">تنبيهات</th><th className="px-5 py-3" /></tr></thead>
                    <tbody>
                      {filtered.map((item) => (
                        <tr key={item.id} className="border-b border-line/70 last:border-0 hover:bg-surface-soft/50">
                          <td className="px-5 py-3.5"><div className="flex items-center gap-2.5"><Avatar name={item.student} size="sm" /><div className="min-w-0"><p className="truncate text-[12.5px] font-bold text-ink">{item.student}</p><p className="max-w-[190px] truncate text-[10.5px] text-subtle" dir="ltr">{item.email}</p></div></div></td>
                          <td className="px-3 py-3.5"><ScoreCell score={item.score} maxScore={item.maxScore} status={item.status} resultsAvailable={item.resultsAvailable !== false} /></td>
                          <td className="px-3 py-3.5"><StatusChip status={item.status} /></td>
                          <td className="px-3 py-3.5 text-[11px] text-muted">{formatDate(item.submittedAtUtc)}</td>
                          <td className="px-3 py-3.5">{item.focusLossDetected ? <Badge tone="warning">خروج مرصود</Badge> : <span className="text-[11px] text-subtle">—</span>}</td>
                          <td className="px-5 py-3.5"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="xs" icon={Eye} onClick={() => onOpenReview(item.id)}>مراجعة</Button>{item.isExceptionAttempt ? <Button variant="ghost" size="xs" icon={CheckCircle2} disabled title="تم منح محاولة إضافية لهذه المحاولة بالفعل">تم منح محاولة</Button> : <Button variant="ghost" size="xs" icon={RotateCcw} onClick={() => setGrantTarget(item)}>محاولة إضافية</Button>}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-2.5 p-3 md:hidden">
                  {filtered.map((item) => (
                    <div key={item.id} className="rounded-[13px] border border-line bg-surface-soft/50 p-3.5">
                      <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><Avatar name={item.student} size="sm" /><div className="min-w-0"><p className="truncate text-[12.5px] font-bold text-ink">{item.student}</p><p className="max-w-[150px] truncate text-[10px] text-subtle" dir="ltr">{item.email}</p></div></div><StatusChip status={item.status} /></div>
                      <div className="mt-3"><ScoreCell score={item.score} maxScore={item.maxScore} status={item.status} resultsAvailable={item.resultsAvailable !== false} /></div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5"><span className="text-[10.5px] text-subtle">{formatDate(item.submittedAtUtc)}</span><div className="flex gap-1"><Button variant="ghost" size="xs" icon={Eye} onClick={() => onOpenReview(item.id)}>مراجعة</Button>{item.isExceptionAttempt ? <Button variant="ghost" size="xs" icon={CheckCircle2} disabled title="تم منح محاولة إضافية لهذه المحاولة بالفعل">تم منح محاولة</Button> : <Button variant="ghost" size="xs" icon={RotateCcw} onClick={() => setGrantTarget(item)}>محاولة</Button>}</div></div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </>
      )}

      <Modal
        open={Boolean(grantTarget)}
        onClose={() => setGrantTarget(null)}
        title="منح محاولة إضافية؟"
        description={`سيتم منح ${grantTarget?.student || 'الطالب'} محاولة استثنائية واحدة. يتم استخدامها مرة واحدة فقط.`}
        icon={RotateCcw}
        tone="warning"
        footer={<><Button variant="secondary" size="sm" onClick={() => setGrantTarget(null)}>إلغاء</Button><Button variant="warning" size="sm" loading={grantBusy} onClick={grantExtra}>منح المحاولة</Button></>}
      />
    </div>
  );
}
