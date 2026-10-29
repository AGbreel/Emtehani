import React from 'react';
import { Check, CheckCircle2, Clock3, Info, X, XCircle } from 'lucide-react';
import { Badge, Card, cn } from './ui';
import { formatNumber } from '../lib/format';

const typeLabels = {
  MultipleChoice: 'اختيار من متعدد',
  TrueFalse: 'صواب أو خطأ',
  ShortAnswer: 'إجابة قصيرة',
  FillBlank: 'أكمل الفراغ',
  Matching: 'مطابقة',
  Essay: 'مقالي',
};

export function AnswerReviewCard({ answer, index, showCorrect = true, resultsPending = false, compact = false }) {
  const isEssay = answer.type === 'Essay';
  const pending = resultsPending || (isEssay && answer.awardedPoints == null);
  const correct = !pending && !isEssay && Number(answer.awardedPoints) >= Number(answer.points);
  const wrong = !pending && !isEssay && !correct;
  const awaitingResults = resultsPending && !showCorrect;
  const options = Array.isArray(answer.options) ? answer.options : [];
  const matchingOptions = answer.type === 'Matching' ? options.map((pair) => {
    const [left, right] = String(pair).split('||');
    return { left: left || '', right: right || '' };
  }) : [];
  const studentMatching = answer.type === 'Matching'
    ? String(answer.studentAnswer || '').split(',').map((value) => Number(value)).filter((value) => Number.isInteger(value))
    : [];
  const correctMatching = answer.type === 'Matching'
    ? String(answer.correctAnswer || '').split(',').map((value) => Number(value)).filter((value) => Number.isInteger(value))
    : [];

  return (
    <Card className={cn('overflow-hidden', compact ? 'p-3.5' : 'p-4 sm:p-5')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-[10px] text-[10px] font-extrabold', pending ? 'bg-warning-soft text-warning' : correct ? 'bg-emerald-soft text-emerald' : wrong ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary')}>
          {pending ? <Clock3 size={15} /> : correct ? <Check size={15} /> : wrong ? <X size={15} /> : <Info size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-extrabold text-primary">السؤال {formatNumber(index + 1)}</span>
            <Badge tone="neutral">{typeLabels[answer.type] || answer.type}</Badge>
            <span className="text-[10.5px] text-subtle">{formatNumber(answer.points)} درجة</span>
            {!pending ? <span className={cn('ui-number ms-auto text-[11.5px] font-bold', correct ? 'text-emerald' : isEssay ? 'text-warning' : 'text-danger')}>{formatNumber(answer.awardedPoints ?? 0)} / {formatNumber(answer.points)}</span> : <span className="ms-auto text-[10.5px] font-bold text-warning">{awaitingResults ? 'بانتظار اعتماد النتائج' : 'بانتظار التصحيح'}</span>}
          </div>
          <p className="mt-2 text-[14.5px] font-semibold leading-7 text-ink">{answer.text}</p>

          {answer.type === 'MultipleChoice' || answer.type === 'TrueFalse' ? (
            <div className="mt-3 grid gap-1.5">
              {(answer.type === 'TrueFalse' ? ['صح', 'خطأ'] : options).map((option) => {
                const selected = answer.studentAnswer === option;
                const isCorrectOption = answer.correctAnswer === option;
                return (
                  <div key={option} className={cn('flex min-h-10 items-center gap-2 rounded-[9px] border px-3 py-2 text-[13px]', selected && isCorrectOption ? 'border-emerald/30 bg-emerald-soft/50 text-emerald' : selected ? 'border-danger/30 bg-danger-soft/50 text-danger' : isCorrectOption && showCorrect ? 'border-emerald/20 bg-emerald-soft/25 text-emerald' : 'border-line bg-surface-soft text-muted')}>
                    <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border text-[9px]', selected ? 'border-current' : 'border-line-strong')}>{selected ? <span className="size-1.5 rounded-full bg-current" /> : null}</span>
                    <span className="flex-1">{option}</span>
                    {selected ? <span className="text-[10px] font-bold">إجابتك</span> : null}
                    {isCorrectOption && showCorrect ? <CheckCircle2 size={14} /> : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {answer.type === 'ShortAnswer' || answer.type === 'FillBlank' ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className={cn('rounded-[10px] border px-3 py-2.5', awaitingResults ? 'border-line bg-surface-soft' : correct ? 'border-emerald/25 bg-emerald-soft/30' : 'border-danger/25 bg-danger-soft/25')}>
                <p className="mb-1 text-[10.5px] font-bold text-muted">إجابة الطالب</p>
                <p className="text-[13px] font-semibold text-ink">{answer.studentAnswer || <span className="text-subtle">لم يجب</span>}</p>
              </div>
              {showCorrect ? <div className="rounded-[10px] border border-line bg-surface-soft px-3 py-2.5"><p className="mb-1 text-[10.5px] font-bold text-muted">الإجابة الصحيحة</p><p className="text-[13px] font-semibold text-emerald">{String(answer.correctAnswer || '').split('|')[0] || '—'}</p></div> : null}
            </div>
          ) : null}

          {answer.type === 'Matching' ? (
            <div className="mt-3 overflow-hidden rounded-[10px] border border-line">
              <div className={cn('grid gap-2 bg-surface-soft px-2.5 py-2 text-[10.5px] font-bold text-muted', showCorrect ? 'grid-cols-[1fr_1fr_1fr]' : 'grid-cols-[1fr_1fr]')}><span>العنصر</span><span>إجابة الطالب</span>{showCorrect ? <span>الصحيح</span> : null}</div>
              {matchingOptions.map((pair, pairIndex) => {
                const picked = matchingOptions[studentMatching[pairIndex]]?.right;
                const right = matchingOptions[correctMatching[pairIndex]]?.right || pair.right;
                const pairCorrect = picked === right;
                return (
                  <div key={`${pair.left}-${pairIndex}`} className={cn('grid gap-2 border-t border-line px-2.5 py-2.5 text-[11.5px]', showCorrect ? 'grid-cols-[1fr_1fr_1fr]' : 'grid-cols-[1fr_1fr]')}>
                    <span className="font-semibold text-ink">{pair.left}</span>
                    <span className={cn('font-semibold', !showCorrect ? 'text-muted' : pairCorrect ? 'text-emerald' : 'text-danger')}>{picked || '—'}</span>
                    {showCorrect ? <span className="text-muted">{right || '—'}</span> : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {isEssay ? (
            <div className="mt-3 rounded-[10px] border border-line bg-surface-soft p-3">
              <div className="mb-1 flex items-center justify-between gap-2"><p className="text-[10.5px] font-bold text-muted">إجابة الطالب</p>{!pending && answer.awardedPoints != null ? <Badge tone="emerald">{formatNumber(answer.awardedPoints)} درجة</Badge> : <Badge tone="warning">{awaitingResults ? 'بانتظار اعتماد النتائج' : 'قيد المراجعة'}</Badge>}</div>
              <p className="whitespace-pre-wrap text-[13.5px] leading-7 text-ink">{answer.studentAnswer || <span className="text-subtle">لم يجب الطالب على هذا السؤال.</span>}</p>
              {answer.teacherFeedback ? <div className="mt-2 border-t border-line pt-2"><p className="mb-0.5 text-[10.5px] font-bold text-primary">ملاحظة المدرس</p><p className="text-[12px] leading-6 text-muted">{answer.teacherFeedback}</p></div> : null}
            </div>
          ) : null}

          {wrong && !showCorrect ? <p className="mt-2 text-[11.5px] font-semibold text-danger">الإجابة غير صحيحة.</p> : null}
        </div>
      </div>
    </Card>
  );
}

export default AnswerReviewCard;
