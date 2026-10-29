import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ClipboardCheck, FileText, PenLine, RefreshCw, Search } from 'lucide-react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  StatusChip,
  TableSkeleton,
} from '../components/ui';
import { request } from '../lib/api';
import { formatDate, formatNumber, formatTimer, percent, scoreText } from '../lib/format';

export default function EssaysPage({ token, onOpenEssayReview, onOpenResults }) {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [rows, setRows] = useState([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    request('/api/exams?pageSize=100', { token })
      .then((result) => {
        if (!active) return;
        setExams(result.items || []);
        if (result.items?.length) setExamId(result.items[0].id);
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoadingExams(false); });
    return () => { active = false; };
  }, [token]);

  const load = useCallback(async (background = false) => {
    if (!examId) return;
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await request(`/api/exams/${examId}/review`, { token });
      setRows(Array.isArray(result) ? result : []);
      setError('');
    } catch (err) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, examId]);

  useEffect(() => { load(); }, [load]);

  const selected = exams.find((exam) => exam.id === examId);
  const prepared = rows.map((row) => {
    const essays = (row.answers || []).filter((answer) => answer.type === 'Essay');
    return { ...row, essays, pending: essays.filter((answer) => answer.awardedPoints == null).length };
  }).filter((row) => row.essays.length && (!search.trim() || row.student.includes(search.trim())));
  const pendingTotal = prepared.reduce((sum, row) => sum + row.pending, 0);

  return (
    <div>
      <PageHeader
        eyebrow="تصحيح يدوي"
        title="مراجعة المقالات"
        description="الأسئلة المقالية لا تُصحح تلقائياً. افتح محاولة الطالب، اقرأ الإجابة، ثم امنح الدرجة والملاحظات."
        action={<Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)} disabled={!examId}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}

      <Card className="mb-4 p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="essays-exam" className="mb-1.5 block text-[11.5px] font-bold text-muted">اختر الامتحان</label>
            <Select id="essays-exam" value={examId} onChange={(event) => setExamId(event.target.value)} disabled={loadingExams} className="h-11 text-[12.5px]">
              <option value="">{loadingExams ? 'جارٍ تحميل الامتحانات...' : 'اختر الامتحان'}</option>
              {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
            </Select>
          </div>
          {selected ? <div className="flex flex-wrap items-center gap-2"><StatusChip status={selected.status} /><Button variant="secondary" size="sm" icon={ClipboardCheck} onClick={() => onOpenResults(selected)}>كل النتائج</Button></div> : null}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard icon={PenLine} label="محاولات بحاجة لمراجعة" value={formatNumber(prepared.length)} note="تحتوي أسئلة مقالية" tone="warning" loading={loading} />
        <StatCard icon={FileText} label="مقالات بانتظار التصحيح" value={formatNumber(pendingTotal)} note="عبر جميع الطلاب" tone="primary" loading={loading} />
        <StatCard icon={ClipboardCheck} label="امتحان المادة" value={selected ? formatNumber(selected.questionCount) : '—'} note={selected?.title || 'لم يتم اختيار امتحان'} tone="blue" loading={loading} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-display text-[15px] font-semibold text-ink">الطلاب</h2><p className="mt-1 text-[11.5px] text-muted">مرتبة حسب الأحدث في قائمة المراجعة.</p></div>
          <div className="relative w-full sm:max-w-[230px]">
            <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الطالب..." className="h-10 w-full rounded-[9px] border border-line bg-surface-soft pr-8 pl-3 text-[12.5px] outline-none focus:border-primary focus:bg-surface" />
          </div>
        </div>

        {loading ? <TableSkeleton rows={5} /> : !examId && !loadingExams ? (
          <EmptyState icon={PenLine} title="لا يوجد امتحان للمراجعة" description="أنشئ امتحاناً يحتوي على سؤال مقالي ثم انشره." />
        ) : prepared.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="لا توجد مقالات بانتظار المراجعة" description={search ? 'لا يوجد طالب بهذا الاسم في قائمة المراجعة.' : 'كل المحاولات التي تحتوي مقالات تم تصحيحها، أو لم يسلّم الطلاب بعد.'} action={<Button variant="secondary" size="sm" onClick={() => setSearch('')}>مسح البحث</Button>} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-right">
                <thead><tr className="border-b border-line bg-surface-soft/60 text-[11px] font-extrabold text-muted"><th className="px-5 py-3">الطالب</th><th className="px-3 py-3">النتيجة الحالية</th><th className="px-3 py-3">المقالات</th><th className="px-3 py-3">الحالة</th><th className="px-5 py-3" /></tr></thead>
                <tbody>
                  {prepared.map((row) => (
                    <tr key={row.id} className="border-b border-line/70 last:border-0 hover:bg-surface-soft/50">
                      <td className="px-5 py-3.5"><div className="flex items-center gap-2.5"><Avatar name={row.student} size="sm" /><div><p className="text-[12.5px] font-bold text-ink">{row.student}</p><p className="text-[10.5px] text-subtle">{formatNumber(row.essays.length)} سؤال مقالي</p></div></div></td>
                      <td className="px-3 py-3.5"><span className="ui-number text-[12px] font-bold text-ink">{scoreText(row.score, row.maxScore)}</span><span className="ms-2 ui-number text-[10.5px] text-muted">{formatNumber(percent(row.score, row.maxScore))}%</span></td>
                      <td className="px-3 py-3.5"><Badge tone={row.pending ? 'warning' : 'emerald'}>{formatNumber(row.pending)} بانتظار / {formatNumber(row.essays.length)}</Badge></td>
                      <td className="px-3 py-3.5"><StatusChip status="NeedsReview" /></td>
                      <td className="px-5 py-3.5 text-left"><Button size="xs" icon={PenLine} onClick={() => onOpenEssayReview(row.id)}>تصحيح</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2.5 p-3 md:hidden">
              {prepared.map((row) => (
                <div key={row.id} className="rounded-[13px] border border-line bg-surface-soft/50 p-3.5">
                  <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><Avatar name={row.student} size="sm" /><div className="min-w-0"><p className="truncate text-[12.5px] font-bold text-ink">{row.student}</p><p className="text-[10.5px] text-muted">{scoreText(row.score, row.maxScore)}</p></div></div><Badge tone={row.pending ? 'warning' : 'emerald'}>{formatNumber(row.pending)} مقال</Badge></div>
                  <Button size="xs" className="mt-3 w-full" icon={PenLine} onClick={() => onOpenEssayReview(row.id)}>بدء تصحيح المقالات</Button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
