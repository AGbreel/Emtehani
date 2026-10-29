import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  EyeOff,
  FileText,
  GraduationCap,
  LockKeyhole,
  PenLine,
  ScanEye,
  ShieldAlert,
  Target,
  UserRound,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  PageHeader,
  ProgressBar,
  Skeleton,
  StatCard,
  StatusChip,
  cn,
} from '../components/ui';
import { AnswerReviewCard } from '../components/AnswerReview';
import { request } from '../lib/api';
import { formatDate, formatNumber, formatTimer, percent, scoreText } from '../lib/format';

export default function ReviewDetailPage({ token, user, submissionId, onBack, onOpenEssayReview }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isTeacher = user?.role === 'Teacher';

  useEffect(() => {
    let active = true;
    setLoading(true);
    request(`/api/submissions/${submissionId}/review`, { token })
      .then((result) => { if (active) { setData(result); setError(''); } })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, submissionId]);

  if (loading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-40 w-full rounded-card" />
        <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-card" />)}</div>
        <Skeleton className="h-56 w-full rounded-card" />
        <Skeleton className="h-56 w-full rounded-card" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <button type="button" onClick={onBack} className="mb-5 inline-flex min-h-10 items-center gap-1.5 text-[12px] font-bold text-muted hover:text-primary"><ArrowLeft size={14} className="rotate-180" />رجوع</button>
        <Alert tone="danger" title="تعذر تحميل المحاولة">{error || 'لم نعثر على بيانات المحاولة.'}</Alert>
        <Button variant="secondary" size="sm" className="mt-4" onClick={onBack}>العودة</Button>
      </div>
    );
  }

  const answers = data.answers || [];
  const resultsAvailable = isTeacher || Boolean(data.resultsAvailable);
  const canSeeCorrect = resultsAvailable;
  const essayAnswers = answers.filter((answer) => answer.type === 'Essay');
  const pendingEssays = essayAnswers.filter((answer) => answer.awardedPoints == null);
  const value = percent(data.score, data.maxScore);
  const flags = (data.focusLossCount || 0) + (data.copyAttemptCount || 0) + (data.screenshotAttemptCount || 0);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-5 inline-flex min-h-10 items-center gap-1.5 text-[12px] font-bold text-muted transition hover:text-primary"><ArrowLeft size={14} className="rotate-180" />العودة إلى النتائج</button>

      <PageHeader
        eyebrow={isTeacher ? 'مراجعة يدوية' : 'نتيجتك'}
        title={data.examTitle}
        description={`${isTeacher ? `الطالب: ${data.studentName}` : `المدرس: ${data.teacherName || '—'}`} · محاولة ${formatNumber(data.attemptNumber)} · ${formatDate(data.submittedAtUtc)}`}
        action={
          isTeacher && pendingEssays.length ? (
            <Button size="sm" icon={PenLine} onClick={() => onOpenEssayReview(submissionId)}>تصحيح {formatNumber(pendingEssays.length)} مقالي</Button>
          ) : null
        }
      />

      <Card className={cn('mb-4 overflow-hidden p-4 sm:p-5', data.status === 'NeedsReview' && 'border-warning/30')}>
        <div className="grid items-center gap-5 md:grid-cols-[auto_1fr_auto]">
          <div className="flex items-center gap-4">
            {resultsAvailable ? (
              <>
                <div className="relative grid size-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${value >= 60 ? 'var(--app-emerald)' : value >= 50 ? 'var(--app-warning)' : 'var(--app-danger)'} ${value * 3.6}deg, var(--app-surface-soft) 0)` }}>
                  <div className="grid size-[76px] place-items-center rounded-full bg-surface">
                    <div className="text-center">
                      <strong className="ui-number block font-display text-[24px] font-semibold leading-none text-ink">{formatNumber(value)}%</strong>
                      <span className="mt-1 block text-[10.5px] text-muted">النسبة</span>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-[11.5px] font-bold text-muted">الدرجة</p>
                  <p className="ui-number mt-1 font-display text-[28px] font-semibold leading-none tracking-[-0.04em] text-ink">{scoreText(data.score, data.maxScore)}</p>
                  <div className="mt-2"><StatusChip status={data.status} /></div>
                </div>
              </>
            ) : (
              <>
                <div className="grid size-24 shrink-0 place-items-center rounded-full bg-surface-soft text-warning">
                  <LockKeyhole size={26} />
                </div>
                <div>
                  <p className="text-[11.5px] font-bold text-muted">النتيجة</p>
                  <p className="mt-1 font-display text-[18px] font-semibold leading-tight tracking-[-0.03em] text-ink">بانتظار اعتماد النتائج</p>
                  <p className="mt-1.5 max-w-[210px] text-[10.5px] leading-5 text-muted">ستظهر الدرجة بعد انتهاء جلسة الامتحان واعتماد المدرس للنتائج.</p>
                  <div className="mt-2"><StatusChip status={data.status} /></div>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 border-y border-line py-3 md:border-x md:border-y-0 md:px-6 md:py-0">
            {[
              { label: 'الزمن المستغرق', value: formatTimer(data.durationSeconds), icon: Clock3 },
              { label: 'المحاولة', value: formatNumber(data.attemptNumber), icon: Target },
              { label: 'الأسئلة', value: formatNumber(answers.length), icon: FileText },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <item.icon size={14} className="mx-auto mb-1 text-primary" />
                <p className="ui-number text-[12px] font-bold text-ink">{item.value}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-subtle">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-1.5 text-[11.5px]">
            <div className="flex items-center gap-2 text-muted"><UserRound size={13} />{isTeacher ? data.studentName : data.teacherName || 'المدرس'}</div>
            {data.focusLossDetected ? <div className="flex items-center gap-2 text-warning"><ShieldAlert size={13} />رُصد خروج من الصفحة</div> : null}
            {data.copyAttemptCount ? <div className="flex items-center gap-2 text-warning"><ScanEye size={13} />محاولة نسخ ({formatNumber(data.copyAttemptCount)})</div> : null}
            {data.screenshotAttemptCount ? <div className="flex items-center gap-2 text-warning"><EyeOff size={13} />محاولة تصوير ({formatNumber(data.screenshotAttemptCount)})</div> : null}
            {!flags ? <div className="flex items-center gap-2 text-emerald"><GraduationCap size={13} />لا توجد مؤشرات مخالفة</div> : null}
          </div>
        </div>

        {resultsAvailable && data.status === 'NeedsReview' ? (
          <div className="mt-4 flex flex-col gap-2 rounded-[12px] border border-warning/20 bg-warning-soft px-3.5 py-3 text-[12px] leading-5 text-warning sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2"><AlertTriangle size={15} />الدرجة الحالية مؤقتة حتى يتم تصحيح الأسئلة المقالية.</span>
            {isTeacher ? <button type="button" onClick={() => onOpenEssayReview(submissionId)} className="min-h-8 shrink-0 text-[11.5px] font-extrabold underline underline-offset-4">بدء المراجعة</button> : null}
          </div>
        ) : null}
      </Card>

      {resultsAvailable ? (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={CheckCircleIcon} label="إجابات صحيحة" value={formatNumber(answers.filter((answer) => answer.type !== 'Essay' && Number(answer.awardedPoints) >= Number(answer.points)).length)} tone="emerald" />
          <StatCard icon={XCircleIcon} label="إجابات خاطئة" value={formatNumber(answers.filter((answer) => answer.type !== 'Essay' && answer.awardedPoints != null && Number(answer.awardedPoints) < Number(answer.points)).length)} tone="danger" />
          <StatCard icon={PenLine} label="أسئلة مقالية" value={formatNumber(essayAnswers.length)} note={`${formatNumber(pendingEssays.length)} بانتظار التصحيح`} tone="warning" />
          <StatCard icon={ShieldAlert} label="مؤشرات انتباه" value={formatNumber(flags)} note={data.focusLossDetected ? 'توجد ملاحظات' : 'لا توجد ملاحظات'} tone={flags ? 'warning' : 'emerald'} />
        </div>
      ) : (
        <Card className="mb-4 flex items-start gap-3 border-warning/25 bg-warning-soft/30 p-4 sm:items-center">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-warning-soft text-warning"><Clock3 size={17} /></span>
          <div>
            <p className="text-[12.5px] font-bold text-ink">الدرجات والإجابات الصحيحة محجوبة مؤقتاً</p>
            <p className="mt-1 text-[11.5px] leading-6 text-muted">تم تسليم محاولتك بنجاح. ستظهر النتيجة والمراجعة الكاملة بعد انتهاء جلسة الامتحان واعتماد النتائج من المدرس.</p>
          </div>
        </Card>
      )}

      <div className="mb-3 flex items-center justify-between">
        <div><h2 className="font-display text-[16px] font-semibold text-ink">مراجعة الإجابات</h2><p className="mt-1 text-[11.5px] text-muted">{canSeeCorrect ? 'تظهر الإجابة الصحيحة بجانب إجابة الطالب.' : 'ستظهر الإجابة الصحيحة والدرجة بعد انتهاء الامتحان واعتماد النتائج.'}</p></div>
        <Badge tone="primary">{formatNumber(answers.length)} سؤال</Badge>
      </div>

      <div className="grid gap-2.5">
        {answers.map((answer, index) => <AnswerReviewCard key={answer.id} answer={answer} index={index} showCorrect={canSeeCorrect} resultsPending={!resultsAvailable} />)}
      </div>

      <div className="mt-5 flex justify-center">
        <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={onBack}>العودة إلى النتائج</Button>
      </div>
    </div>
  );
}

function CheckCircleIcon(props) {
  return <Target {...props} />;
}

function XCircleIcon(props) {
  return <AlertTriangle {...props} />;
}
