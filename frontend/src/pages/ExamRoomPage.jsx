import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  CloudOff,
  Cloud,
  FileText,
  Hash,
  Info,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Pause,
  Radio,
  Save,
  Send,
  ShieldAlert,
  TimerReset,
  Wifi,
  X,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Modal,
  ProgressBar,
  StatusChip,
  Textarea,
  cn,
} from '../components/ui';
import { request } from '../lib/api';
import { formatNumber, formatTimer } from '../lib/format';

const typeLabels = {
  MultipleChoice: 'اختيار من متعدد',
  TrueFalse: 'صواب أو خطأ',
  ShortAnswer: 'إجابة قصيرة',
  FillBlank: 'أكمل الفراغ',
  Matching: 'مطابقة',
  Essay: 'مقالي',
};

function hashCode(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function shuffleIndices(length, seed) {
  const values = Array.from({ length }, (_, index) => index);
  let state = seed || 1;
  for (let i = values.length - 1; i > 0; i--) {
    state = (state * 9301 + 49297) % 233280;
    const j = Math.floor((state / 233280) * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function MatchingInput({ question, value, onChange }) {
  const pairs = (question.options || []).map((pair) => {
    const [left, right] = String(pair).split('||');
    return { left: left || '', right: right || '' };
  });
  const [order] = useState(() => shuffleIndices(pairs.length, hashCode(question.id)));
  const selected = String(value || '').split(',').map((item) => item === '' ? -1 : Number(item));
  function choose(pairIndex, optionIndex) {
    const next = pairs.map((_, index) => selected[index] ?? -1);
    next[pairIndex] = Number(optionIndex);
    onChange(next.map((item) => item < 0 ? '' : item).join(','));
  }
  return (
    <div className="grid gap-2">
      <div className="hidden grid-cols-[1fr_1.2fr] gap-2 px-1 text-[11px] font-bold text-subtle sm:grid">
        <span>العنصر</span><span>اختر ما يقابله</span>
      </div>
      {pairs.map((pair, index) => (
        <div key={`${pair.left}-${index}`} className="grid gap-1.5 rounded-[11px] border border-line bg-surface-soft p-2.5 sm:grid-cols-[1fr_1.2fr] sm:items-center sm:gap-2">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-[10px] font-bold text-primary">{formatNumber(index + 1)}</span>{pair.left}</span>
          <select value={selected[index] ?? ''} onChange={(event) => choose(index, event.target.value)} aria-label={`اختر ما يقابل ${pair.left}`} className="h-10 w-full rounded-[9px] border border-line bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft">
            <option value="">اختر الإجابة...</option>
            {order.map((optionIndex) => <option key={optionIndex} value={optionIndex}>{pairs[optionIndex]?.right}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function QuestionField({ question, index, value, onChange }) {
  const id = `question-${question.id}`;
  const inputId = `${id}-input`;
  const common = 'w-full select-text rounded-[11px] border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-subtle focus:border-primary focus:ring-4 focus:ring-primary-soft';

  return (
    <Card id={id} className="scroll-mt-28 select-none overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-soft/50 px-4 py-3">
        <span className="grid size-8 place-items-center rounded-[8px] bg-primary text-[11px] font-bold text-white">{formatNumber(index + 1)}</span>
        <Badge tone="neutral">{typeLabels[question.type] || question.type}</Badge>
        <span className="ms-auto flex items-center gap-1 text-[11.5px] text-muted"><span className="ui-number font-bold text-ink">{formatNumber(question.points)}</span> درجة</span>
      </div>

      <fieldset className="p-4 sm:p-5">
        <legend className="sr-only">السؤال {index + 1}</legend>
        <p className="text-[15px] font-semibold leading-8 text-ink">{question.text}</p>

        {question.type === 'MultipleChoice' ? (
          <div className="mt-4 grid gap-2">
            {(question.options || []).map((option, optionIndex) => {
              const selected = value === option;
              return (
                <label key={`${option}-${optionIndex}`} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-[11px] border px-3.5 py-3 text-[14px] leading-6 transition', selected ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface-soft text-ink hover:border-line-strong')}>
                  <input type="radio" name={id} value={option} checked={selected} onChange={() => onChange(option)} className="sr-only" />
                  <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border text-[10.5px] font-bold', selected ? 'border-primary bg-primary text-white' : 'border-line-strong bg-surface text-muted')}>{selected ? <Check size={12} /> : optionIndex + 1}</span>
                  <span className="flex-1">{option}</span>
                </label>
              );
            })}
          </div>
        ) : null}

        {question.type === 'TrueFalse' ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {['صح', 'خطأ'].map((option) => {
              const selected = value === option;
              return (
                <button key={option} type="button" onClick={() => onChange(option)} aria-pressed={selected} className={cn('flex h-14 items-center justify-center gap-2 rounded-[11px] border text-[14px] font-bold transition', selected ? option === 'صح' ? 'border-emerald bg-emerald-soft text-emerald' : 'border-danger bg-danger-soft text-danger' : 'border-line bg-surface-soft text-muted hover:border-line-strong')}>
                  <span className={cn('grid size-4 place-items-center rounded-full border', selected ? 'border-current bg-current text-white' : 'border-line-strong')}>{selected ? <Check size={9} /> : null}</span>
                  {option}
                </button>
              );
            })}
          </div>
        ) : null}

        {question.type === 'FillBlank' ? (
          <div className="mt-4"><label htmlFor={inputId} className="sr-only">الإجابة</label><input id={inputId} maxLength={10000} value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder="اكتب الإجابة هنا..." className={common} /></div>
        ) : null}

        {question.type === 'ShortAnswer' ? (
          <div className="mt-4"><label htmlFor={inputId} className="sr-only">الإجابة القصيرة</label><textarea id={inputId} maxLength={10000} value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder="اكتب إجابتك القصيرة..." rows={3} className={cn(common, 'min-h-20 resize-y')} /></div>
        ) : null}

        {question.type === 'Essay' ? (
          <div className="mt-4">
            <label htmlFor={inputId} className="sr-only">الإجابة المقالية</label>
            <textarea id={inputId} maxLength={10000} value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder="اكتب إجابتك بالتفصيل..." rows={8} className={cn(common, 'min-h-40 resize-y leading-7')} />
            <p className="mt-1.5 text-[11.5px] text-subtle">تُصحح الإجابات المقالية يدوياً من قبل المدرس.</p>
          </div>
        ) : null}

        {question.type === 'Matching' ? <div className="mt-4"><MatchingInput question={question} value={value} onChange={onChange} /></div> : null}
      </fieldset>
    </Card>
  );
}

export default function ExamRoomPage({ token, paper, onSubmitted }) {
  const submissionId = paper.submission.id;
  const storageKey = `emtehani-draft-${submissionId}`;

  const [answers, setAnswers] = useState(() => {
    const fromServer = Object.fromEntries((paper.answers || []).map((item) => [item.questionId, item.answerText || '']));
    try {
      const local = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return { ...fromServer, ...local };
    } catch {
      return fromServer;
    }
  });
  const [remaining, setRemaining] = useState(Number(paper.remainingSeconds) || 0);
  const [examStatus, setExamStatus] = useState(paper.examStatus);
  const [saveState, setSaveState] = useState('saved');
  const [error, setError] = useState('');
  const [focusWarning, setFocusWarning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const answersRef = useRef(answers);
  const answerVersionRef = useRef(0);
  const dirtyRef = useRef(false);
  const focusLossRef = useRef(false);
  const submittedRef = useRef(false);
  const savingRef = useRef(false);

  const questions = paper.questions || [];
  const answered = useMemo(() => questions.filter((question) => String(answers[question.id] || '').trim()).length, [answers, questions]);
  const progress = questions.length ? (answered / questions.length) * 100 : 0;
  const paused = examStatus === 'Paused';
  const lowTime = remaining <= 300;

  function setAnswer(questionId, value) {
    setAnswers((current) => {
      const next = { ...current, [questionId]: value };
      answersRef.current = next;
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore storage limits */ }
      return next;
    });
    answerVersionRef.current += 1;
    dirtyRef.current = true;
    setSaveState('dirty');
  }

  const save = useCallback(async (force = false) => {
    if (savingRef.current) return false;
    if (submittedRef.current && !force) return true;
    if (!force && !dirtyRef.current) return true;
    savingRef.current = true;
    setSaveState('saving');
    const version = answerVersionRef.current;
    const snapshot = answersRef.current;
    try {
      await request(`/api/submissions/${submissionId}/answers`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          answers: Object.entries(snapshot).map(([questionId, answerText]) => ({ questionId, answerText: String(answerText) })),
          focusLossDetected: focusLossRef.current,
        }),
      });
      if (answerVersionRef.current === version) {
        dirtyRef.current = false;
        setSaveState('saved');
        setError('');
      } else setSaveState('dirty');
      return true;
    } catch (err) {
      setSaveState('error');
      if (err.status !== 409) setError('تعذر حفظ الإجابات مؤقتاً. سنحاول مرة أخرى تلقائياً.');
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [token, submissionId]);

  const submit = useCallback(async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      await save(true);
      const result = await request(`/api/submissions/${submissionId}/submit`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          answers: Object.entries(answersRef.current).map(([questionId, answerText]) => ({ questionId, answerText: String(answerText) })),
          focusLossDetected: focusLossRef.current,
        }),
      });
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      onSubmitted(result);
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      setError(err.message);
      setConfirmOpen(false);
      if (auto) setExamStatus('Active');
    }
  }, [token, submissionId, save, onSubmitted, storageKey]);

  useEffect(() => {
    const poll = window.setInterval(async () => {
      try {
        const result = await request(`/api/exams/${paper.examId}/session`, { token });
        setExamStatus(result.examStatus);
        if (result.examStatus === 'Active' && result.remainingSeconds != null) setRemaining(result.remainingSeconds);
        if (result.participantStatus === 'Submitted' && !submittedRef.current) {
          submittedRef.current = true;
          onSubmitted({ id: submissionId, alreadySubmitted: true });
        }
        if (result.examStatus === 'Finished' && !submittedRef.current) submit(true);
      } catch {
        // The autosave status already communicates connectivity issues.
      }
    }, 6000);
    return () => window.clearInterval(poll);
  }, [token, paper.examId, submissionId, onSubmitted, submit]);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    if (remaining === 0 && !submittedRef.current && !paused) submit(true);
  }, [remaining, paused, submit]);

  useEffect(() => {
    if (remaining !== 0 || paused) return undefined;
    // A failed auto-submit (network/server hiccup) is retried until the server confirms.
    const retry = window.setInterval(() => {
      if (!submittedRef.current) submit(true);
    }, 10000);
    return () => window.clearInterval(retry);
  }, [remaining, paused, submit]);

  useEffect(() => {
    const autosave = window.setInterval(() => {
      if (!paused && !submittedRef.current) save();
    }, 7000);
    return () => window.clearInterval(autosave);
  }, [save, paused]);

  useEffect(() => {
    async function record(type) {
      try {
        await request(`/api/submissions/${submissionId}/events`, { token, method: 'POST', body: JSON.stringify({ type }) });
      } catch { /* best-effort telemetry */ }
    }
    function isEditable(target) {
      const element = target instanceof Element ? target : null;
      return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        focusLossRef.current = true;
        setFocusWarning(true);
        record('focus-loss');
        if (!paused && !submittedRef.current) save(true);
      }
    }
    function onCopy(event) {
      if (isEditable(event.target)) return; // keep answer fields usable
      event.preventDefault();
      record('copy');
      setFocusWarning(true);
    }
    function onCut(event) {
      if (isEditable(event.target)) return;
      event.preventDefault();
      record('copy');
      setFocusWarning(true);
    }
    function onPaste(event) {
      if (isEditable(event.target)) return;
      event.preventDefault();
    }
    function onContextMenu(event) {
      event.preventDefault();
    }
    function onKeyDown(event) {
      if (event.key === 'PrintScreen') record('screenshot');
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === 'p') { event.preventDefault(); return; }
      if ((key === 'c' || key === 'x' || key === 'v') && !isEditable(event.target)) event.preventDefault();
    }
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [token, submissionId, paused, save]);

  useEffect(() => {
    function beforeUnload(event) {
      if (submittedRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  function scrollToQuestion(questionId) {
    document.getElementById(`question-${questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMobileNavOpen(false);
  }

  const saveLabel = saveState === 'saving' ? 'جارٍ الحفظ...' : saveState === 'error' ? 'تعذر الحفظ' : saveState === 'dirty' ? 'تغييرات غير محفوظة' : 'تم الحفظ تلقائياً';
  const SaveIcon = saveState === 'saving' ? LoaderCircle : saveState === 'error' ? CloudOff : Cloud;

  return (
    <div className="min-h-dvh bg-canvas pb-10">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-3 py-2.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><Badge tone="emerald" dot>جلسة نشطة</Badge><span className="hidden text-[10.5px] text-subtle sm:inline">لا تغلق الصفحة</span></div>
            <h1 className="mt-0.5 truncate font-display text-[14px] font-semibold text-ink sm:text-[15px]">{paper.examTitle}</h1>
          </div>
          <div className={cn('flex items-center gap-2 rounded-[12px] border px-3 py-1.5', lowTime ? 'border-danger/30 bg-danger-soft text-danger' : 'border-line bg-surface-soft text-ink')}>
            <Clock3 size={15} />
            <div className="text-center">
              <strong className="ui-number block text-[15px] font-bold leading-none sm:text-[17px]">{formatTimer(remaining)}</strong>
              <span className="mt-0.5 block text-[10px] font-semibold opacity-75">الوقت المتبقي</span>
            </div>
          </div>
          <Button size="sm" icon={Send} onClick={() => setConfirmOpen(true)} disabled={submitting || paused} className="hidden sm:inline-flex">تسليم</Button>
          <button type="button" onClick={() => setConfirmOpen(true)} disabled={submitting || paused} className="grid size-10 place-items-center rounded-[10px] bg-primary text-white disabled:opacity-50 sm:hidden" aria-label="تسليم الامتحان"><Send size={16} /></button>
        </div>
        <div className="h-0.5 bg-surface-soft"><motion.div className="h-full bg-primary" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} /></div>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-2 px-3 py-1.5 text-[10.5px] text-subtle sm:px-5">
          <span>{formatNumber(answered)} من {formatNumber(questions.length)} سؤال تمت الإجابة</span>
          <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-1', saveState === 'error' ? 'text-danger' : saveState === 'saved' ? 'text-emerald' : 'text-warning')}><SaveIcon size={12} className={saveState === 'saving' ? 'animate-spin' : ''} />{saveLabel}</span>
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-3 pt-4 sm:px-5">
        {focusWarning ? (
          <Alert tone="warning" className="mb-4" onClose={() => setFocusWarning(false)}>تم رصد خروجك من صفحة الامتحان أو محاولة نسخ. هذا الإجراء مسجّل ويظهر للمدرس في تقرير المحاولة.</Alert>
        ) : null}
        {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
        {paper.allowResumeAfterFocusLoss === false ? <Alert tone="info" className="mb-4">مغادرة الصفحة قد تمنع استكمال هذه المحاولة وفق إعدادات المدرس. ابقَ في الصفحة حتى التسليم.</Alert> : null}

        <div className="mb-3 flex items-center justify-between gap-2 xl:hidden">
          <p className="text-[11.5px] font-bold text-muted">الأسئلة</p>
          <Button variant="secondary" size="xs" icon={ListChecks} onClick={() => setMobileNavOpen(true)}>خريطة الأسئلة</Button>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[1fr_280px]">
          <div className="grid gap-3">
            {questions.map((question, index) => (
              <QuestionField key={question.id} question={question} index={index} value={answers[question.id] || ''} onChange={(value) => setAnswer(question.id, value)} />
            ))}
          </div>

          <aside className="hidden xl:sticky xl:top-[112px] xl:block">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-[14px] font-semibold text-ink">خريطة الأسئلة</h3><Badge tone={answered === questions.length ? 'emerald' : 'neutral'}>{formatNumber(answered)}/{formatNumber(questions.length)}</Badge></div>
              <div className="grid grid-cols-5 gap-1.5">
                {questions.map((question, index) => {
                  const isAnswered = String(answers[question.id] || '').trim();
                  return (
                    <button key={question.id} type="button" onClick={() => scrollToQuestion(question.id)} aria-label={`الانتقال إلى السؤال ${index + 1}`} className={cn('grid size-10 place-items-center rounded-[9px] border text-[12px] font-bold transition', isAnswered ? 'border-emerald/30 bg-emerald-soft text-emerald' : 'border-line bg-surface-soft text-muted hover:border-primary/40 hover:text-primary')}>{index + 1}</button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-[10.5px] text-subtle"><span className="flex items-center gap-1"><span className="size-2 rounded bg-emerald-soft" />تمت الإجابة</span><span className="flex items-center gap-1"><span className="size-2 rounded border border-line bg-surface" />بدون إجابة</span></div>
              <div className="my-3 border-t border-line" />
              <div className="rounded-[11px] bg-surface-soft p-3">
                <p className="flex items-center gap-1 text-[11px] font-bold text-ink"><ShieldAlert size={12} className="text-warning" />تنبيه</p>
                <p className="mt-1 text-[10.5px] leading-5 text-muted">الخروج من الصفحة أو محاولة النسخ يُسجل في تقرير المحاولة.</p>
              </div>
              <Button size="sm" icon={Send} className="mt-3 w-full" onClick={() => setConfirmOpen(true)} disabled={submitting || paused}>تسليم الامتحان</Button>
              <button type="button" onClick={() => save(true)} className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1 text-[11.5px] font-bold text-muted hover:text-primary"><Save size={12} />حفظ الآن</button>
            </Card>
          </aside>
        </div>

        <div className="mt-4 flex flex-col items-center justify-between gap-2 rounded-[13px] border border-line bg-surface p-3 sm:flex-row">
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted"><Info size={13} className="text-primary" />يُحفظ تقدمك تلقائياً. يمكنك التسليم قبل انتهاء الوقت.</span>
          <Button size="sm" icon={Send} onClick={() => setConfirmOpen(true)} disabled={submitting || paused}>تسليم الامتحان</Button>
        </div>
      </div>

      <AnimatePresence>
        {mobileNavOpen ? (
          <motion.div className="fixed inset-0 z-[70] flex items-end bg-[rgba(3,7,18,.5)] p-3 backdrop-blur-sm xl:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(event) => { if (event.target === event.currentTarget) setMobileNavOpen(false); }}>
            <motion.div className="w-full rounded-[20px] border border-line bg-surface p-4" initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}>
              <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-[15px] font-semibold text-ink">خريطة الأسئلة</h3><button type="button" onClick={() => setMobileNavOpen(false)} aria-label="إغلاق" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-soft"><X size={18} /></button></div>
              <div className="grid grid-cols-6 gap-1.5">
                {questions.map((question, index) => {
                  const isAnswered = String(answers[question.id] || '').trim();
                  return <button key={question.id} type="button" onClick={() => scrollToQuestion(question.id)} className={cn('grid h-10 place-items-center rounded-[8px] border text-[12px] font-bold', isAnswered ? 'border-emerald/30 bg-emerald-soft text-emerald' : 'border-line bg-surface-soft text-muted')}>{index + 1}</button>;
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-[10.5px] text-subtle"><span>{formatNumber(answered)} تمت الإجابة</span><span>{formatNumber(questions.length - answered)} متبقٍ</span></div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {paused ? (
          <motion.div className="fixed inset-0 z-[75] grid place-items-center bg-[rgba(3,7,18,.72)] p-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="w-full max-w-md rounded-[24px] border border-line bg-surface p-6 text-center shadow-2xl" initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}>
              <div className="mx-auto grid size-16 place-items-center rounded-full bg-warning-soft text-warning"><Pause size={28} /></div>
              <Badge tone="warning" className="mt-4">إيقاف مؤقت</Badge>
              <h2 className="mt-3 font-display text-[1.5rem] font-semibold tracking-[-0.04em] text-ink">أوقف المدرس الجلسة</h2>
              <p className="mt-2 text-[13.5px] leading-7 text-muted">الوقت متوقف الآن لجميع الطلاب. لا تغلق الصفحة. ستعود تلقائياً عند استئناف المدرس للجلسة.</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface-soft px-3 py-1.5 text-[11.5px] font-bold text-muted"><TimerReset size={13} />{formatTimer(remaining)} محفوظة</div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="تسليم الامتحان؟"
        description={answered < questions.length ? `لم تجب على ${formatNumber(questions.length - answered)} سؤال. يمكنك العودة وإكمالها قبل التسليم.` : 'أجبت على جميع الأسئلة. بعد التسليم لا يمكن تعديل الإجابات.'}
        icon={answered < questions.length ? AlertTriangle : CheckCircle2}
        tone={answered < questions.length ? 'warning' : 'success'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)}>مراجعة الإجابات</Button>
            <Button size="sm" loading={submitting} onClick={() => submit(false)}>تسليم نهائي</Button>
          </>
        }
      >
        <div className="rounded-[12px] border border-line bg-surface-soft p-3">
          <div className="flex items-center justify-between text-[12px]"><span className="text-muted">الإجابات المكتملة</span><span className="font-bold text-ink">{formatNumber(answered)} / {formatNumber(questions.length)}</span></div>
          <ProgressBar value={progress} className="mt-2" tone={answered === questions.length ? 'emerald' : 'warning'} />
        </div>
        {focusLossRef.current ? <p className="mt-2 flex items-center gap-1.5 text-[11px] text-warning"><ShieldAlert size={12} />سيتم إرفاق ملاحظة فقدان التركيز مع المحاولة.</p> : null}
      </Modal>
    </div>
  );
}
