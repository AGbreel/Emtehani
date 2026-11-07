import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BookOpen,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  CloudOff,
  Cloud,
  FileText,
  Hash,
  Info,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  Pause,
  Radio,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
  Wifi,
  X,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  ProgressBar,
  StatusChip,
  Textarea,
  cn,
} from '../components/ui';
import SessionCountdown from '../components/SessionCountdown';
import ExamWatermark from '../components/ExamWatermark';
import ObfuscatedText from '../components/ObfuscatedText';
import { request } from '../lib/api';
import { useExamLockdown } from '../lib/useExamLockdown';
import { useProctoring } from '../lib/useProctoring';
import { formatNumber, formatTimer } from '../lib/format';
import { remainingSecondsFromDeadline, serverClockOffset } from '../lib/timer';

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
  // The server sends a per-student order for the right-hand column so the same
  // student always sees the same arrangement while classmates see different ones.
  const order = useMemo(() => {
    const provided = Array.isArray(question.optionOrder) ? question.optionOrder.map(Number) : null;
    if (provided && provided.length === pairs.length && provided.every((item) => item >= 0 && item < pairs.length)) return provided;
    return shuffleIndices(pairs.length, hashCode(question.id));
  }, [question.optionOrder, question.id, pairs.length]);
  const selected = String(value || '').split(',').map((item) => item === '' ? -1 : Number(item));
  const [openRow, setOpenRow] = useState(null);
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
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-[10px] font-bold text-primary">{formatNumber(index + 1)}</span><ObfuscatedText text={pair.left} /></span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenRow(openRow === index ? null : index)}
              aria-haspopup="listbox"
              aria-expanded={openRow === index}
              aria-label={`اختر ما يقابل العنصر ${formatNumber(index + 1)}`}
              className="flex h-10 w-full items-center justify-between gap-2 rounded-[9px] border border-line bg-surface px-2.5 text-start text-[13px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
            >
              {pairs[selected[index]]?.right ? <ObfuscatedText text={pairs[selected[index]].right} /> : <span className="text-subtle">اختر الإجابة...</span>}
              <ChevronDown size={14} className={cn('shrink-0 text-muted transition', openRow === index ? 'rotate-180' : '')} />
            </button>
            {openRow === index ? (
              <div role="listbox" className="absolute z-20 mt-1 grid max-h-56 w-full gap-1 overflow-auto rounded-[10px] border border-line bg-surface p-1.5 shadow-soft">
                {order.map((optionIndex) => (
                  <button
                    key={optionIndex}
                    type="button"
                    role="option"
                    aria-selected={selected[index] === optionIndex}
                    onClick={() => { choose(index, optionIndex); setOpenRow(null); }}
                    className={cn('rounded-[8px] px-2.5 py-2 text-start text-[13px] transition', selected[index] === optionIndex ? 'bg-primary-soft font-bold text-primary' : 'text-ink hover:bg-surface-soft')}
                  >
                    <ObfuscatedText text={pairs[optionIndex]?.right || ''} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
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
        <p className="text-[15px] font-semibold leading-8 text-ink"><ObfuscatedText className="obf-question" text={question.text} /></p>

        {question.type === 'MultipleChoice' ? (
          <div className="mt-4 grid gap-2">
            {(question.options || []).map((option, optionIndex) => {
              const selected = value === option;
              return (
                <label key={`${option}-${optionIndex}`} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-[11px] border px-3.5 py-3 text-[14px] leading-6 transition', selected ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface-soft text-ink hover:border-line-strong')}>
                  <input type="radio" name={id} value={option} checked={selected} onChange={() => onChange(option)} className="sr-only" />
                  <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border text-[10.5px] font-bold', selected ? 'border-primary bg-primary text-white' : 'border-line-strong bg-surface text-muted')}>{selected ? <Check size={12} /> : optionIndex + 1}</span>
                  <span className="flex-1"><ObfuscatedText text={option} /></span>
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

export default function ExamRoomPage({ token, user, paper, onSubmitted }) {
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
  const [remainingFallback] = useState(Number(paper.remainingSeconds) || 0);
  const [deadlineUtc, setDeadlineUtc] = useState(paper.deadlineUtc || null);
  const [clockOffset, setClockOffset] = useState(() => serverClockOffset(paper.serverUtc));
  const [clockTick, setClockTick] = useState(0);
  const [examStatus, setExamStatus] = useState(paper.examStatus);
  const [saveState, setSaveState] = useState('saved');
  const [error, setError] = useState('');
  const [focusWarning, setFocusWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(() => {
    const raw = Number(paper.currentQuestionIndex);
    const max = Math.max(0, (paper.questions || []).length - 1);
    return Number.isFinite(raw) ? Math.min(Math.max(0, raw), max) : 0;
  });
  const [lockedIds, setLockedIds] = useState(() => new Set(Array.isArray(paper.lockedQuestionIds) ? paper.lockedQuestionIds : []));
  const [notice, setNotice] = useState('');
  const [reviewMode, setReviewMode] = useState(false);
  const [timedMode, setTimedMode] = useState(Boolean(paper.timedMode));
  const [questionDeadlineUtc, setQuestionDeadlineUtc] = useState(paper.questionDeadlineUtc || null);
  const frozenRemainingRef = useRef(null);
  const advancingRef = useRef(false);
  const restrictNavigation = paper.allowReviewPrevious === false;

  const answersRef = useRef(answers);
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  const lockedIdsRef = useRef(lockedIds);
  useEffect(() => { lockedIdsRef.current = lockedIds; }, [lockedIds]);
  const answerVersionRef = useRef(0);
  const dirtyRef = useRef(false);
  const focusLossRef = useRef(false);
  const submittedRef = useRef(false);
  const savingRef = useRef(false);
  const finalSaveRef = useRef(false);

  const { shielded } = useExamLockdown({
    token,
    submissionId,
    onViolation: () => setFocusWarning(true),
  });

  const proctoring = useProctoring({
    token,
    submissionId,
    examId: paper.examId,
    cameraConsent: Boolean(paper.proctoringConsent),
    onResumed: () => {
      // The pause time is added back server-side; pull the fresh deadline instead
      // of guessing locally so the countdown stays server-authoritative.
      request(`/api/exams/${paper.examId}/session`, { token })
        .then((result) => {
          if (result.deadlineUtc) setDeadlineUtc(result.deadlineUtc);
          if (result.questionDeadlineUtc !== undefined) setQuestionDeadlineUtc(result.questionDeadlineUtc || null);
          if (result.serverUtc) setClockOffset(serverClockOffset(result.serverUtc));
        })
        .catch(() => { /* next poll will reconcile */ });
    },
    onEndedByTeacher: () => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      onSubmitted({ id: submissionId, alreadySubmitted: true });
    },
  });

  const questions = paper.questions || [];
  const remaining = useMemo(() => {
    if (!deadlineUtc) return remainingFallback;
    return remainingSecondsFromDeadline(deadlineUtc, clockOffset) ?? remainingFallback;
    // clockTick intentionally drives a re-read of the clock every second.
  }, [deadlineUtc, clockOffset, clockTick, remainingFallback]);
  // A teacher-review pause freezes the countdown and autosaves exactly like an
  // exam-level pause; the server rejects saves while paused, so nothing is lost.
  const paused = examStatus === 'Paused' || proctoring.pausedForReview;
  const displayedRemaining = paused ? (frozenRemainingRef.current ?? remaining) : remaining;
  const questionRemaining = useMemo(() => {
    if (!questionDeadlineUtc) return null;
    return remainingSecondsFromDeadline(questionDeadlineUtc, clockOffset);
    // clockTick drives a re-read every second, exactly like the exam countdown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionDeadlineUtc, clockOffset, clockTick]);
  const questionLimit = Number(questions[currentIndex]?.timeLimitSeconds) || 0;
  const questionProgress = timedMode && questionLimit > 0 && questionRemaining !== null
    ? Math.min(100, Math.max(0, (questionRemaining / questionLimit) * 100))
    : 0;
  const questionLow = timedMode && questionRemaining !== null && questionRemaining <= 10;
  useEffect(() => {
    if (paused) {
      if (frozenRemainingRef.current === null) frozenRemainingRef.current = remaining;
    } else {
      frozenRemainingRef.current = null;
    }
    // Only react to pause transitions; `remaining` is frozen at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);
  const answered = useMemo(() => questions.filter((question) => String(answers[question.id] || '').trim()).length, [answers, questions]);
  const progress = questions.length ? (answered / questions.length) * 100 : 0;
  const lowTime = displayedRemaining <= 300;

  function setAnswer(questionId, value) {
    if (lockedIdsRef.current.has(questionId)) {
      setNotice('لا يمكن تعديل هذا السؤال: تم قفله بعد الانتقال منه وفق إعدادات المدرس.');
      return;
    }
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
      const result = await request(`/api/submissions/${submissionId}/answers`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          answers: Object.entries(snapshot).map(([questionId, answerText]) => ({ questionId, answerText: String(answerText) })),
          focusLossDetected: focusLossRef.current,
          currentIndex: currentIndexRef.current,
        }),
      });
      if (Array.isArray(result?.lockedQuestionIds) && result.lockedQuestionIds.length) {
        setLockedIds((previous) => {
          const next = new Set(previous);
          result.lockedQuestionIds.forEach((id) => next.add(id));
          return next;
        });
      }
      if (result?.timedMode !== undefined) setTimedMode(Boolean(result.timedMode));
      if (result?.questionDeadlineUtc !== undefined) setQuestionDeadlineUtc(result.questionDeadlineUtc || null);
      if (Number.isInteger(result?.currentQuestionIndex)) {
        const nextIndex = result.currentQuestionIndex;
        setCurrentIndex((previous) => Math.max(previous, nextIndex));
        if (nextIndex > currentIndexRef.current) currentIndexRef.current = nextIndex;
      }
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
      // Submit carries the latest draft in the same request, so a separate save round-trip
      // cannot consume the remaining seconds and push the submission past the deadline.
      const result = await request(`/api/submissions/${submissionId}/submit`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          answers: Object.entries(answersRef.current).map(([questionId, answerText]) => ({ questionId, answerText: String(answerText) })),
          focusLossDetected: focusLossRef.current,
          currentIndex: currentIndexRef.current,
        }),
      });
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      onSubmitted(result);
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      setError(err.message);
      if (auto) setExamStatus('Active');
    }
  }, [token, submissionId, onSubmitted, storageKey]);

  useEffect(() => {
    const poll = window.setInterval(async () => {
      try {
        const result = await request(`/api/exams/${paper.examId}/session`, { token });
        setExamStatus(result.examStatus);
        if (result.serverUtc) setClockOffset(serverClockOffset(result.serverUtc));
        // The server deadline is authoritative. Never rebuild it by decrementing the
        // previous value, so reconnects cannot reset or fast-forward the countdown.
        if (result.deadlineUtc) setDeadlineUtc(result.deadlineUtc);
        if (result.timedMode !== undefined) setTimedMode(Boolean(result.timedMode));
        if (result.questionDeadlineUtc !== undefined) setQuestionDeadlineUtc(result.questionDeadlineUtc || null);
        if (Number.isInteger(result.currentQuestionIndex) && result.currentQuestionIndex > currentIndexRef.current) {
          currentIndexRef.current = result.currentQuestionIndex;
          setCurrentIndex(result.currentQuestionIndex);
          setReviewMode(false);
        }
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
    // One clock interval for this attempt. The display is derived from the absolute
    // deadline on each tick instead of subtracting one second from a mutable counter.
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (displayedRemaining === 0 && !submittedRef.current && !paused) submit(true);
  }, [displayedRemaining, paused, submit]);

  useEffect(() => {
    // Persist the final draft while there is still time to do so. The submit request also
    // carries the draft, but this guarantees a server-side copy if the network is slow.
    if (!paused && !submittedRef.current && displayedRemaining > 0 && displayedRemaining <= 10 && !finalSaveRef.current) {
      finalSaveRef.current = true;
      save(true).catch(() => {});
    }
  }, [displayedRemaining, paused, save]);

  useEffect(() => {
    if (displayedRemaining !== 0 || paused) return undefined;
    // A failed auto-submit (network/server hiccup) is retried until the server confirms.
    const retry = window.setInterval(() => {
      if (!submittedRef.current) submit(true);
    }, 10000);
    return () => window.clearInterval(retry);
  }, [displayedRemaining, paused, submit]);

  useEffect(() => {
    const autosave = window.setInterval(() => {
      if (!paused && !submittedRef.current) save();
    }, 7000);
    return () => window.clearInterval(autosave);
  }, [save, paused]);

  const advanceTimedQuestion = useCallback(async () => {
    if (advancingRef.current || submittedRef.current) return;
    advancingRef.current = true;
    try {
      const last = Math.max(0, questions.length - 1);
      const next = Math.min(currentIndexRef.current + 1, last);
      if (next === currentIndexRef.current) {
        await submit(true);
        return;
      }
      currentIndexRef.current = next;
      setCurrentIndex(next);
      setReviewMode(false);
      setNotice('انتهى وقت هذا السؤال، وتم قفله والانتقال تلقائياً إلى السؤال التالي.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Persisting the new index is what resets the server-side question window.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (await save(true)) break;
        await new Promise((resolve) => window.setTimeout(resolve, 900));
      }
    } finally {
      advancingRef.current = false;
    }
  }, [questions.length, save, submit]);

  useEffect(() => {
    if (!timedMode || paused) return undefined;
    const timer = window.setInterval(() => {
      if (submittedRef.current || !questionDeadlineUtc) return;
      const left = remainingSecondsFromDeadline(questionDeadlineUtc, clockOffset);
      if (left === 0) advanceTimedQuestion();
    }, 500);
    return () => window.clearInterval(timer);
  }, [timedMode, paused, questionDeadlineUtc, clockOffset, advanceTimedQuestion]);

  useEffect(() => {
    async function record(type) {
      try {
        await request(`/api/submissions/${submissionId}/events`, { token, method: 'POST', body: JSON.stringify({ type }) });
      } catch { /* best-effort telemetry */ }
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        focusLossRef.current = true;
        setFocusWarning(true);
        record('focus-loss');
        if (!paused && !submittedRef.current) save(true);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
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

  function goToQuestion(index) {
    if (!questions.length) return;
    const next = Math.min(Math.max(0, index), questions.length - 1);
    const target = questions[next];
    if (target && lockedIdsRef.current.has(target.id)) {
      setNotice('لا يمكن الرجوع إلى سؤال انتهى وقته أو تم قفله، وفق إعدادات المدرس.');
      return;
    }
    if (timedMode && next < currentIndexRef.current) {
      setNotice('الأسئلة التي انتقلت منها في الوضع الموقوت مقفلة ولا يمكن الرجوع إليها.');
      return;
    }
    if (timedMode && next > currentIndexRef.current + 1) {
      setNotice('الوضع الموقوت ينتقل سؤالاً واحداً في كل مرة.');
      return;
    }
    // When review is disabled, leaving an answered question locks it for good.
    const leaving = questions[currentIndex];
    if (restrictNavigation && next !== currentIndex && leaving && String(answersRef.current[leaving.id] || '').trim()) {
      setLockedIds((previous) => {
        if (previous.has(leaving.id)) return previous;
        const updated = new Set(previous);
        updated.add(leaving.id);
        lockedIdsRef.current = updated;
        return updated;
      });
    }
    setNotice('');
    setCurrentIndex(next);
    currentIndexRef.current = next;
    setReviewMode(false);
    setMobileNavOpen(false);
    if (!paused && !submittedRef.current) save(true).catch(() => {});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openReview() {
    setReviewMode(true);
    setMobileNavOpen(false);
    if (!paused && !submittedRef.current) save(true).catch(() => {});
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  const currentQuestion = questions[currentIndex];
  const isCurrentAnswered = currentQuestion ? Boolean(String(answers[currentQuestion.id] || '').trim()) : false;
  const unansweredIndexes = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => !String(answers[question.id] || '').trim());
  const questionStatus = (question, index) => {
    if (index === currentIndex && !reviewMode) return 'current';
    if (lockedIds.has(question.id)) return 'locked';
    return String(answers[question.id] || '').trim() ? 'answered' : 'unanswered';
  };

  const saveLabel = saveState === 'saving' ? 'جارٍ الحفظ...' : saveState === 'error' ? 'تعذر الحفظ' : saveState === 'dirty' ? 'تغييرات غير محفوظة' : 'تم الحفظ تلقائياً';
  const SaveIcon = saveState === 'saving' ? LoaderCircle : saveState === 'error' ? CloudOff : Cloud;

  return (
    <div className="min-h-dvh bg-canvas pb-10">
      <ExamWatermark name={user?.fullName} code={user?.studentCode || submissionId.slice(0, 8)} />
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-3 py-2.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="emerald" dot>جلسة نشطة</Badge>
              <span className="hidden items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[9.5px] font-bold text-warning sm:inline-flex"><ShieldAlert size={10} />وضع الحماية</span>
              {proctoring.enabled ? <span className="hidden items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[9.5px] font-bold text-primary sm:inline-flex"><ShieldCheck size={10} />مراقَب</span> : null}
              {proctoring.cameraActive ? <span className="hidden items-center gap-1 rounded-full bg-emerald-soft px-2 py-0.5 text-[9.5px] font-bold text-emerald sm:inline-flex"><Camera size={10} />الكاميرا تعمل</span> : null}
              {proctoring.cameraFailed ? <span className="hidden items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[9.5px] font-bold text-danger sm:inline-flex"><CameraOff size={10} />تعذر تشغيل الكاميرا</span> : null}
              <span className="hidden text-[10.5px] text-subtle md:inline">لا تغلق الصفحة</span>
            </div>
            <h1 className="mt-0.5 truncate font-display text-[14px] font-semibold text-ink sm:text-[15px]">{paper.examTitle}</h1>
          </div>
          <div className={cn('flex items-center gap-2 rounded-[12px] border px-3 py-1.5', lowTime ? 'border-danger/30 bg-danger-soft text-danger' : 'border-line bg-surface-soft text-ink')}>
            <Clock3 size={15} />
            <div className="text-center">
              <strong className="ui-number block text-[15px] font-bold leading-none sm:text-[17px]">{formatTimer(displayedRemaining)}</strong>
              <span className="mt-0.5 block text-[10px] font-semibold opacity-75">الوقت المتبقي</span>
            </div>
          </div>
          <div className="hidden md:block"><SessionCountdown compact /></div>
          <div className="hidden sm:block">
            <Button size="sm" icon={Send} onClick={openReview} disabled={submitting || paused}>تسليم الامتحان</Button>
          </div>
          <div className="sm:hidden">
            <button type="button" onClick={openReview} disabled={submitting || paused} className="grid size-10 place-items-center rounded-[10px] bg-primary text-white disabled:opacity-50" aria-label="تسليم الامتحان"><Send size={16} /></button>
          </div>
        </div>
        <div className="h-0.5 bg-surface-soft"><motion.div className="h-full bg-primary" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} /></div>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-2 px-3 py-1.5 text-[10.5px] text-subtle sm:px-5">
          <span>
            {reviewMode ? 'مراجعة الإجابات قبل التسليم' : `السؤال ${formatNumber(questions.length ? currentIndex + 1 : 0)} من ${formatNumber(questions.length)}`}
            <span className="hidden sm:inline"> · {formatNumber(answered)} سؤال تمت الإجابة</span>
          </span>
          <div className="flex items-center gap-2">
            <div className="md:hidden"><SessionCountdown compact /></div>
            <span role="status" aria-live="polite" data-testid="exam-save-status" className={cn('inline-flex items-center gap-1', saveState === 'error' ? 'text-danger' : saveState === 'saved' ? 'text-emerald' : 'text-warning')}><SaveIcon size={12} className={saveState === 'saving' ? 'animate-spin' : ''} />{saveLabel}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1280px] px-3 pt-4 sm:px-5">
        {focusWarning ? (
          <Alert tone="warning" className="mb-4" onClose={() => setFocusWarning(false)}>تم رصد خروجك من صفحة الامتحان أو محاولة نسخ. النسخ واللصق والطباعة وتصوير الشاشة محظورة، وكل محاولة تُسجَّل باسمك في تقرير المحاولة.</Alert>
        ) : null}
        {proctoring.warning ? (
          <Alert tone="warning" className="mb-4">{proctoring.warning.message}</Alert>
        ) : null}
        {proctoring.pausedForReview ? (
          <Alert tone="danger" className="mb-4">محاولتك متوقفة الآن بانتظار مراجعة المدرس. إجاباتك محفوظة والمؤقت متوقف، وستُستأنف المحاولة فور قرار المدرس.</Alert>
        ) : null}
        {proctoring.enabled && proctoring.settings?.requireFullscreen && !proctoring.isFullscreen ? (
          <Alert tone="info" className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>هذا الامتحان يتطلب وضع ملء الشاشة. بقاؤك خارج ملء الشاشة يُسجَّل كمخالفة.</span>
              <Button size="xs" icon={Maximize2} onClick={proctoring.enterFullscreen}>الدخول إلى ملء الشاشة</Button>
            </div>
          </Alert>
        ) : null}
        {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
        {notice ? <Alert tone="info" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}
        {restrictNavigation ? <Alert tone="info" className="mb-4">وفق إعدادات المدرس، لا يمكن الرجوع إلى سؤال أجبت عنه بعد الانتقال منه. يمكنك الرجوع إلى الأسئلة التي لم تجب عنها فقط.</Alert> : null}
        <div className="mb-4 flex items-start gap-2.5 rounded-[14px] border border-line bg-surface/85 px-3.5 py-2.5 text-[11px] leading-5 text-muted backdrop-blur-sm">
          <ShieldAlert size={15} className="mt-0.5 shrink-0 text-emerald" />
          <p><strong className="font-bold text-ink">وضع الحماية مفعّل.</strong> لا يمكن نسخ أو لصق أو طباعة أسئلة الامتحان، وتُسجَّل محاولات تصوير أو تسجيل الشاشة ضد حسابك.</p>
        </div>
        {paper.allowResumeAfterFocusLoss === false ? <Alert tone="info" className="mb-4">مغادرة الصفحة قد تمنع استكمال هذه المحاولة وفق إعدادات المدرس. ابقَ في الصفحة حتى التسليم.</Alert> : null}

        {reviewMode ? (
          <Card className="overflow-hidden" data-testid="exam-review-screen" role="dialog" aria-modal="true" aria-labelledby="exam-review-title">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-soft/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-[10px] bg-primary-soft text-primary"><ClipboardCheck size={17} /></span>
                <div>
                  <h2 id="exam-review-title" className="font-display text-[15px] font-semibold text-ink">تسليم الامتحان؟ راجع إجاباتك</h2>
                  <p className="text-[10.5px] text-muted">راجع كل سؤال ثم عدّل ما تريد قبل التسليم النهائي.</p>
                </div>
              </div>
              <Button variant="secondary" size="xs" onClick={() => setReviewMode(false)}>العودة للأسئلة</Button>
            </div>

            <div className="p-4 sm:p-5">
              <div className="mb-4 grid grid-cols-3 gap-2">
                <div className="rounded-[12px] border border-emerald/20 bg-emerald-soft px-3 py-2 text-center">
                  <p className="ui-number text-[17px] font-bold text-emerald">{formatNumber(answered)}</p>
                  <p className="text-[10.5px] font-bold text-muted">تمت الإجابة</p>
                </div>
                <div className="rounded-[12px] border border-warning/20 bg-warning-soft px-3 py-2 text-center">
                  <p className="ui-number text-[17px] font-bold text-warning">{formatNumber(questions.length - answered)}</p>
                  <p className="text-[10.5px] font-bold text-muted">بدون إجابة</p>
                </div>
                <div className="rounded-[12px] border border-line bg-surface-soft px-3 py-2 text-center">
                  <p className="ui-number text-[17px] font-bold text-ink">{formatNumber(questions.length)}</p>
                  <p className="text-[10.5px] font-bold text-muted">إجمالي الأسئلة</p>
                </div>
              </div>

              <div className="grid gap-2">
                {questions.map((question, index) => {
                  const value = String(answers[question.id] || '').trim();
                  const locked = lockedIds.has(question.id);
                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => goToQuestion(index)}
                      className={cn(
                        'flex items-start gap-3 rounded-[12px] border p-3 text-right transition',
                        locked ? 'border-line bg-surface-soft/60' : 'hover:border-primary/40',
                        !locked && (value ? 'border-emerald/20 bg-emerald-soft/30' : 'border-warning/25 bg-warning-soft/30'),
                      )}
                      data-testid={`review-question-${index}`}
                    >
                      <span className={cn('grid size-8 shrink-0 place-items-center rounded-[8px] text-[11px] font-bold', locked ? 'bg-surface-soft text-muted ring-1 ring-line' : value ? 'bg-emerald text-white' : 'bg-warning text-white')}>{locked ? <LockKeyhole size={12} /> : formatNumber(index + 1)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[12.5px] font-bold text-ink">السؤال {formatNumber(index + 1)}</span>
                          <Badge tone="neutral">{typeLabels[question.type] || question.type}</Badge>
                          <Badge tone={locked ? 'neutral' : value ? 'emerald' : 'warning'}>{locked ? 'مقفل' : value ? 'تمت الإجابة' : 'بدون إجابة'}</Badge>
                        </span>
                        <span className="mt-1 block truncate text-[11.5px] text-muted"><ObfuscatedText text={question.text} /></span>
                        {value ? <span className="mt-1 block truncate text-[10.5px] text-subtle">إجابتك: {value.slice(0, 120)}</span> : null}
                      </span>
                      <span className={cn('shrink-0 self-center text-[10.5px] font-bold', locked ? 'text-subtle' : 'text-primary')}>{locked ? 'مقفل' : 'عرض'}</span>
                    </button>
                  );
                })}
              </div>

              {unansweredIndexes.length > 0 ? (
                <Alert tone="warning" className="mt-4" title={`${formatNumber(unansweredIndexes.length)} سؤال بدون إجابة`}>
                  يمكنك التسليم الآن، لكن هذه الأسئلة ستحصل على صفر. اضغط على أي سؤال للعودة إليه وإكمال إجابته.
                </Alert>
              ) : (
                <Alert tone="success" className="mt-4" title="أجبت على جميع الأسئلة">راجع إجاباتك ثم اضغط «تسليم نهائي». لا يمكن تعديل الإجابات بعد التسليم.</Alert>
              )}

              <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="secondary" size="sm" icon={Save} onClick={() => save(true)}>حفظ الآن</Button>
                <Button size="sm" icon={Send} loading={submitting} disabled={submitting || paused} onClick={() => submit(false)}>تسليم نهائي</Button>
              </div>
            </div>
          </Card>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-2 xl:hidden">
              <p className="text-[11.5px] font-bold text-muted">السؤال {formatNumber(questions.length ? currentIndex + 1 : 0)} من {formatNumber(questions.length)}</p>
              <Button variant="secondary" size="xs" icon={ListChecks} onClick={() => setMobileNavOpen(true)}>خريطة الأسئلة</Button>
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[1fr_280px]">
              <div>
                {timedMode && currentQuestion ? (
                  <div className={cn('mb-3 rounded-[14px] border px-3.5 py-3 transition', questionLow ? 'border-danger/35 bg-danger-soft/40' : 'border-line bg-surface')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[12px] font-bold text-muted"><TimerReset size={14} className={questionLow ? 'text-danger' : 'text-primary'} />وقت هذا السؤال</span>
                      <span className={cn('ui-number text-[19px] font-bold leading-none', questionLow ? 'text-danger' : 'text-ink')}>
                        {questionRemaining === null ? '—' : formatTimer(questionRemaining)}
                      </span>
                    </div>
                    <ProgressBar value={questionProgress} tone={questionLow ? 'danger' : 'warning'} className="mt-2.5" />
                    <p className="mt-2 text-[10.5px] leading-5 text-subtle">عند انتهاء الوقت يُقفل السؤال تلقائياً وتنتقل إلى السؤال التالي. لا تغلق الصفحة حتى لا يضيع وقتك.</p>
                  </div>
                ) : null}
                {currentQuestion ? (
                  <QuestionField
                    key={currentQuestion.id}
                    question={currentQuestion}
                    index={currentIndex}
                    value={answers[currentQuestion.id] || ''}
                    onChange={(value) => setAnswer(currentQuestion.id, value)}
                  />
                ) : (
                  <Card><EmptyState icon={FileText} title="لا توجد أسئلة" description="لم يتم تحميل أسئلة هذا الامتحان." /></Card>
                )}

                <div className="mt-3 flex items-center justify-between gap-2 rounded-[13px] border border-line bg-surface p-2.5">
                  <Button variant="secondary" size="sm" icon={ChevronRight} disabled={currentIndex === 0 || timedMode} onClick={() => goToQuestion(currentIndex - 1)}>السابق</Button>
                  <div className="flex flex-col items-center">
                    <span className="text-[11.5px] font-bold text-ink">السؤال {formatNumber(questions.length ? currentIndex + 1 : 0)} من {formatNumber(questions.length)}</span>
                    <span className={cn('text-[10px] font-bold', isCurrentAnswered ? 'text-emerald' : 'text-warning')}>{isCurrentAnswered ? 'تمت الإجابة' : 'بدون إجابة'}</span>
                  </div>
                  <Button size="sm" icon={ChevronLeft} disabled={currentIndex >= questions.length - 1} onClick={() => goToQuestion(currentIndex + 1)}>التالي</Button>
                </div>

                <div className="mt-3 flex flex-col items-center justify-between gap-2 rounded-[13px] border border-line bg-surface p-3 sm:flex-row">
                  <span className="flex items-center gap-1.5 text-[11.5px] text-muted"><Info size={13} className="text-primary" />يُحفظ تقدمك تلقائياً عند الانتقال بين الأسئلة.</span>
                  <Button size="sm" icon={ClipboardCheck} onClick={openReview} disabled={submitting || paused}>تسليم الامتحان</Button>
                </div>
              </div>

              <aside className="hidden xl:sticky xl:top-[112px] xl:block">
                <Card className="p-4">
                  <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-[14px] font-semibold text-ink">خريطة الأسئلة</h3><Badge tone={answered === questions.length ? 'emerald' : 'neutral'}>{formatNumber(answered)}/{formatNumber(questions.length)}</Badge></div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {questions.map((question, index) => {
                      const status = questionStatus(question, index);
                      return (
                        <button
                          key={question.id}
                          type="button"
                          onClick={() => goToQuestion(index)}
                          aria-current={status === 'current' ? 'step' : undefined}
                          aria-label={`الانتقال إلى السؤال ${index + 1}`}
                          className={cn(
                            'grid size-10 place-items-center rounded-[9px] border text-[12px] font-bold transition',
                            status === 'current' ? 'border-primary bg-primary text-white ring-2 ring-primary/20'
                              : status === 'locked' ? 'border-line bg-surface-soft text-subtle'
                                : status === 'answered' ? 'border-emerald/30 bg-emerald-soft text-emerald hover:border-emerald'
                                  : 'border-line bg-surface-soft text-muted hover:border-primary/40 hover:text-primary',
                          )}
                        >{status === 'locked' ? <LockKeyhole size={12} /> : formatNumber(index + 1)}</button>
                      );
                    })}
                  </div>
                  <div className="mt-3 grid gap-1 text-[10.5px] text-subtle">
                    <span className="flex items-center gap-1"><span className="size-2 rounded bg-primary" />السؤال الحالي</span>
                    <span className="flex items-center gap-1"><span className="size-2 rounded bg-emerald-soft ring-1 ring-emerald/30" />تمت الإجابة</span>
                    <span className="flex items-center gap-1"><span className="size-2 rounded border border-line bg-surface" />بدون إجابة</span>
                    {restrictNavigation ? <span className="flex items-center gap-1"><LockKeyhole size={9} />مقفل نهائياً</span> : null}
                  </div>
                  <div className="my-3 border-t border-line" />
                  <div className="rounded-[11px] bg-surface-soft p-3">
                    <p className="flex items-center gap-1 text-[11px] font-bold text-ink"><ShieldAlert size={12} className="text-warning" />تنبيه</p>
                    <p className="mt-1 text-[10.5px] leading-5 text-muted">الخروج من الصفحة أو محاولة النسخ يُسجل في تقرير المحاولة.</p>
                  </div>
                  <Button size="sm" icon={ClipboardCheck} className="mt-3 w-full" onClick={openReview} disabled={submitting || paused}>تسليم الامتحان</Button>
                  <button type="button" onClick={() => save(true)} className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1 text-[11.5px] font-bold text-muted hover:text-primary"><Save size={12} />حفظ الآن</button>
                </Card>
              </aside>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {mobileNavOpen ? (
          <motion.div className="fixed inset-0 z-[70] flex items-end bg-[rgba(3,7,18,.5)] p-3 backdrop-blur-sm xl:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(event) => { if (event.target === event.currentTarget) setMobileNavOpen(false); }}>
            <motion.div className="ui-scrollbar-thin max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-[20px] border border-line bg-surface p-4" initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}>
              <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-[15px] font-semibold text-ink">خريطة الأسئلة</h3><button type="button" onClick={() => setMobileNavOpen(false)} aria-label="إغلاق" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-soft"><X size={18} /></button></div>
              <div className="grid grid-cols-6 gap-1.5">
                {questions.map((question, index) => {
                  const status = questionStatus(question, index);
                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => goToQuestion(index)}
                      aria-current={status === 'current' ? 'step' : undefined}
                      aria-label={`الانتقال إلى السؤال ${index + 1}`}
                      className={cn(
                        'grid h-10 place-items-center rounded-[8px] border text-[12px] font-bold',
                        status === 'current' ? 'border-primary bg-primary text-white'
                          : status === 'locked' ? 'border-line bg-surface-soft text-subtle'
                            : status === 'answered' ? 'border-emerald/30 bg-emerald-soft text-emerald'
                              : 'border-line bg-surface-soft text-muted',
                      )}
                    >{status === 'locked' ? <LockKeyhole size={12} /> : formatNumber(index + 1)}</button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-[10.5px] text-subtle"><span>{formatNumber(answered)} تمت الإجابة</span><span>{formatNumber(questions.length - answered)} متبقٍ</span></div>
              <Button size="sm" icon={ClipboardCheck} className="mt-3 w-full" onClick={() => { setMobileNavOpen(false); openReview(); }}>تسليم الامتحان</Button>
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
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface-soft px-3 py-1.5 text-[11.5px] font-bold text-muted"><TimerReset size={13} />{formatTimer(displayedRemaining)} محفوظة</div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {shielded ? (
          <motion.div
            className="fixed inset-0 z-[90] grid place-items-center bg-[#030712] p-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            role="alertdialog"
            aria-label="تم إخفاء محتوى الامتحان مؤقتاً"
          >
            <motion.div initial={{ scale: 0.94, y: 8 }} animate={{ scale: 1, y: 0 }} transition={{ duration: 0.22 }}>
              <div className="mx-auto grid size-16 place-items-center rounded-full bg-white/10 text-white"><ShieldAlert size={30} /></div>
              <h2 className="mt-4 font-display text-[1.35rem] font-semibold text-white">تم إخفاء محتوى الامتحان مؤقتاً</h2>
              <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-7 text-white/60">وضع الحماية أوقف عرض الأسئلة أثناء محاولة التصوير أو تصوير الشاشة أو مغادرة النافذة. عد إلى صفحة الامتحان وسيظهر المحتوى من جديد.</p>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10.5px] font-bold text-white/70"><LockKeyhole size={11} />الجلسة ما زالت نشطة والوقت مستمر</div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
