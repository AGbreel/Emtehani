import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Info,
  PenLine,
  Save,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  PageHeader,
  ProgressBar,
  Skeleton,
  StatusChip,
  Textarea,
  cn,
} from '../components/ui';
import { request } from '../lib/api';
import { formatDate, formatNumber, formatTimer, percent, scoreText } from '../lib/format';

export default function EssayReviewPage({ token, submissionId, onBack }) {
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    let active = true;
    request(`/api/submissions/${submissionId}/review`, { token })
      .then((result) => {
        if (!active) return;
        setData(result);
        const next = {};
        (result.answers || []).filter((answer) => answer.type === 'Essay').forEach((answer) => {
          next[answer.id] = { points: answer.awardedPoints ?? '', feedback: answer.teacherFeedback || '' };
        });
        setDrafts(next);
        setError('');
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, submissionId]);

  const essays = useMemo(() => (data?.answers || []).filter((answer) => answer.type === 'Essay'), [data]);
  const pending = essays.filter((answer) => answer.awardedPoints == null).length;

  function updateDraft(answerId, field, value) {
    setDrafts((current) => ({ ...current, [answerId]: { ...current[answerId], [field]: value } }));
  }

  async function save(answer) {
    const draft = drafts[answer.id] || {};
    const points = Number(draft.points);
    if (draft.points === '' || !Number.isFinite(points) || points < 0 || points > Number(answer.points)) {
      setError(`أدخل درجة بين 0 و${formatNumber(answer.points)} للسؤال.`);
      return;
    }
    setSavingId(answer.id);
    setError('');
    setNotice('');
    try {
      const result = await request(`/api/submissions/${submissionId}/answers/${answer.id}/grade`, {
        token,
        method: 'PUT',
        body: JSON.stringify({ awardedPoints: points, feedback: draft.feedback?.trim() || null }),
      });
      setData((current) => ({
        ...current,
        score: result.score,
        maxScore: result.maxScore,
        status: result.status,
        answers: current.answers.map((item) => item.id === answer.id ? { ...item, awardedPoints: points, teacherFeedback: draft.feedback?.trim() || null } : item),
      }));
      setNotice(`تم حفظ درجة السؤال. ${result.status === 'Reviewed' ? 'اكتملت مراجعة هذه المحاولة.' : 'لا تزال هناك مقالات بانتظار التصحيح.'}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId('');
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-36 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <button type="button" onClick={onBack} className="mb-5 inline-flex min-h-10 items-center gap-1.5 text-[12px] font-bold text-muted hover:text-primary"><ArrowLeft size={14} className="rotate-180" />رجوع</button>
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }

  const value = percent(data?.score, data?.maxScore);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-5 inline-flex min-h-10 items-center gap-1.5 text-[12px] font-bold text-muted transition hover:text-primary"><ArrowLeft size={14} className="rotate-180" />العودة إلى المقالات</button>

      <PageHeader
        eyebrow="مراجعة يدوية"
        title="تصحيح الأسئلة المقالية"
        description={`${data?.examTitle || 'المحاولة'} · ${data?.studentName || 'الطالب'} · ${formatDate(data?.submittedAtUtc)}`}
        action={<StatusChip status={data?.status} />}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11.5px] font-bold text-muted">الدرجة الحالية</p>
              <p className="ui-number mt-1 font-display text-2xl font-semibold text-ink">{scoreText(data?.score, data?.maxScore)}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-left"><p className="text-[10.5px] text-muted">النسبة</p><p className="ui-number text-[15px] font-bold text-primary">{formatNumber(value)}%</p></div>
              <div className="w-28"><ProgressBar value={value} tone={value >= 60 ? 'emerald' : value >= 50 ? 'warning' : 'danger'} /></div>
            </div>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className={cn('grid size-10 place-items-center rounded-[12px]', pending ? 'bg-warning-soft text-warning' : 'bg-emerald-soft text-emerald')}>{pending ? <ClipboardCheck size={18} /> : <CheckCircle2 size={18} />}</span>
          <div><p className="text-[12px] font-bold text-ink">{pending ? `${formatNumber(pending)} مقال بانتظار التصحيح` : 'اكتملت المراجعة'}</p><p className="mt-0.5 text-[10.5px] text-muted">{formatNumber(essays.length)} أسئلة مقالية في هذه المحاولة</p></div>
        </Card>
      </div>

      <div className="grid gap-3">
        {essays.map((answer, index) => {
          const draft = drafts[answer.id] || { points: '', feedback: '' };
          const graded = answer.awardedPoints != null;
          const answerPercent = graded ? (Number(answer.awardedPoints) / Number(answer.points)) * 100 : 0;
          return (
            <Card key={answer.id} className={cn('overflow-hidden', graded && 'border-emerald/20')}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-[9px] bg-warning-soft text-warning"><PenLine size={15} /></span>
                  <div><p className="text-[12.5px] font-bold text-ink">السؤال المقالي {formatNumber(index + 1)}</p><p className="mt-0.5 text-[10.5px] text-muted">الدرجة القصوى {formatNumber(answer.points)}</p></div>
                </div>
                {graded ? <Badge tone="emerald">تم التصحيح · {formatNumber(answer.awardedPoints)} / {formatNumber(answer.points)}</Badge> : <Badge tone="warning">بانتظار التصحيح</Badge>}
              </div>

              <div className="grid gap-4 p-4 lg:grid-cols-[1.2fr_.8fr]">
                <div>
                  <p className="text-[12px] font-semibold leading-7 text-ink">{answer.text}</p>
                  <div className="mt-3 rounded-[12px] border border-line bg-surface-soft p-3.5">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-muted"><FileText size={12} />إجابة الطالب</p>
                    <p className="whitespace-pre-wrap text-[11.5px] leading-7 text-ink">{answer.studentAnswer || <span className="text-subtle">لم يجب الطالب.</span>}</p>
                  </div>
                </div>

                <div className="grid content-start gap-3 rounded-[13px] border border-line bg-surface-soft/60 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={`points-${answer.id}`} className="text-[12px] font-bold text-ink">الدرجة الممنوحة</label>
                    <span className="text-[10.5px] text-subtle">من {formatNumber(answer.points)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id={`points-${answer.id}`}
                      type="number"
                      min="0"
                      max={answer.points}
                      step="0.5"
                      value={draft.points}
                      onChange={(event) => updateDraft(answer.id, 'points', event.target.value)}
                      className="h-10 w-24 rounded-[10px] border border-line bg-surface px-3 text-center text-sm font-bold text-ink outline-none focus:border-primary focus:ring-4 focus:ring-primary-soft"
                    />
                    <div className="flex-1">
                      <ProgressBar value={graded ? answerPercent : 0} tone={answerPercent >= 60 ? 'emerald' : 'warning'} />
                      <p className="mt-1 text-[10.5px] text-subtle">نسبة السؤال</p>
                    </div>
                  </div>
                  <Field label="ملاحظة للطالب" id={`feedback-${answer.id}`}>
                    <Textarea id={`feedback-${answer.id}`} value={draft.feedback} onChange={(event) => updateDraft(answer.id, 'feedback', event.target.value)} placeholder="ملاحظة مختصرة تساعد الطالب على التحسن..." className="min-h-24 text-[13px]" maxLength={800} />
                  </Field>
                  <Button size="sm" icon={Save} loading={savingId === answer.id} onClick={() => save(answer)} className="w-full">حفظ درجة السؤال</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-[14px] border border-line bg-surface p-4 sm:flex-row">
        <div className="flex items-center gap-2 text-[12px] text-muted"><Info size={14} className="text-primary" />تُحدّث الدرجة النهائية تلقائياً بعد حفظ كل سؤال.</div>
        <div className="flex items-center gap-2">
          <Badge tone={data?.status === 'Reviewed' ? 'emerald' : 'warning'}>{data?.status === 'Reviewed' ? 'اكتملت المراجعة' : `${formatNumber(pending)} متبقٍ`}</Badge>
          <Button size="sm" variant="secondary" icon={ArrowLeft} onClick={onBack}>إنهاء والعودة</Button>
        </div>
      </div>
    </div>
  );
}
