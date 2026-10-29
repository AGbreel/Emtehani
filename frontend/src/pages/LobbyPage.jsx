import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Hourglass,
  LockKeyhole,
  Pause,
  Radio,
  ShieldCheck,
  UserRound,
  Users,
  Wifi,
} from 'lucide-react';
import { Alert, Badge, Button, Card, LiveDot, Skeleton, cn } from '../components/ui';
import { request } from '../lib/api';
import { formatNumber, formatTimer } from '../lib/format';

export default function LobbyPage({ token, joined, onStarted, onResults, onExit }) {
  const [session, setSession] = useState(joined);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [phase, setPhase] = useState('waiting');
  const startRef = useRef(false);
  const blockedRef = useRef(false);

  const finish = useCallback(() => {
    if (blockedRef.current) return;
    if (session.participantStatus === 'Submitted') setPhase('submitted');
    else if (session.examStatus === 'Finished') setPhase('finished');
    else if (session.examStatus === 'Paused') setPhase('paused');
    else if (session.examStatus === 'Active') setPhase('active');
    else setPhase('waiting');
  }, [session]);

  useEffect(() => { finish(); }, [finish]);

  const begin = useCallback(async () => {
    if (startRef.current) return;
    startRef.current = true;
    setStarting(true);
    setError('');
    try {
      await request(`/api/exams/${session.examId}/start`, { token, method: 'POST' });
      const paper = await request(`/api/exams/${session.examId}/paper`, { token });
      onStarted(paper);
    } catch (err) {
      startRef.current = false;
      setError(err.message);
      setStarting(false);
      if (err.code === 'paused') setPhase('paused');
      else if (err.code === 'finished') setPhase('finished');
      else if (err.code === 'not_open' || err.code === 'starting') setPhase('waiting');
      else if (err.status === 401 || err.status === 409 || err.status === 403 || err.status === 404) {
        blockedRef.current = true;
        setPhase('blocked');
      } else setPhase('waiting');
    }
  }, [token, session.examId, onStarted]);

  useEffect(() => {
    if (phase === 'submitted' || phase === 'finished' || phase === 'blocked') return undefined;
    const poll = window.setInterval(async () => {
      try {
        const result = await request(`/api/exams/${session.examId}/session`, { token });
        setSession((current) => ({ ...current, ...result }));
        setError('');
        if (result.participantStatus === 'Submitted') setPhase('submitted');
        else if (result.examStatus === 'Finished') setPhase('finished');
        else if (result.examStatus === 'Paused') setPhase('paused');
        else if (result.examStatus === 'Active' && !startRef.current && !blockedRef.current) begin();
      } catch (err) {
        if (err.status === 401 || err.status === 403) setError(err.message);
      }
    }, 3000);
    return () => window.clearInterval(poll);
  }, [phase, session.examId, token, begin]);

  useEffect(() => {
    if (phase === 'active' && !startRef.current) begin();
  }, [phase, begin]);

  if (phase === 'submitted') {
    return (
      <CenterCard icon={CheckCircle2} tone="success" title="تم تسليم محاولتك" description="وصلت إجاباتك بنجاح. يمكنك الآن العودة إلى نتائجك أو انتظار تصحيح المدرس.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="sm" icon={ArrowLeft} onClick={() => onResults(session.submissionId)}>فتح النتيجة</Button>
          <Button variant="secondary" size="sm" onClick={onExit}>العودة للرئيسية</Button>
        </div>
      </CenterCard>
    );
  }

  if (phase === 'finished') {
    return (
      <CenterCard icon={LockKeyhole} tone="neutral" title="انتهت جلسة الامتحان" description="أغلق المدرس الجلسة. إذا سلّمت محاولتك، يمكنك مراجعة النتيجة من صفحة نتائجي.">
        <div className="flex flex-col gap-2 sm:flex-row">
          {session.submissionId ? <Button size="sm" icon={ArrowLeft} onClick={() => onResults(session.submissionId)}>فتح النتيجة</Button> : null}
          <Button variant="secondary" size="sm" onClick={onExit}>العودة للرئيسية</Button>
        </div>
      </CenterCard>
    );
  }

  if (phase === 'blocked') {
    return (
      <CenterCard icon={LockKeyhole} tone="neutral" title="تعذر بدء المحاولة" description={error || 'تحقق من حالة الامتحان مع المدرس ثم أعد المحاولة من صفحة الامتحانات.'}>
        <div className="flex flex-col gap-2 sm:flex-row">
          {session.submissionId ? <Button size="sm" icon={ArrowLeft} onClick={() => onResults(session.submissionId)}>فتح النتيجة</Button> : null}
          <Button variant="secondary" size="sm" onClick={onExit}>العودة للرئيسية</Button>
        </div>
      </CenterCard>
    );
  }

  if (phase === 'paused') {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="relative overflow-hidden p-6 text-center sm:p-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-warning" />
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-warning-soft text-warning">
            <Pause size={28} />
          </div>
          <Badge tone="warning" className="mt-4">الجلسة متوقفة مؤقتاً</Badge>
          <h1 className="mt-3 font-display text-[clamp(1.4rem,3vw,1.9rem)] font-semibold tracking-[-0.04em] text-ink">الوقت متوقف الآن</h1>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-7 text-muted">أوقف المدرس الجلسة مؤقتاً لجميع الطلاب. ابقَ في هذه الصفحة، وسيُستأنف الوقت تلقائياً عند سماحه.</p>
          <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-warning/20 bg-warning-soft px-3 py-1.5 text-[10px] font-bold text-warning"><Hourglass size={13} />{formatTimer(session.remainingSeconds || 0)} متبقٍ عند الاستئناف</div>
          {error ? <Alert tone="warning" className="mt-4 text-right" onClose={() => setError('')}>{error}</Alert> : null}
          <div className="mt-5 flex justify-center"><Button variant="secondary" size="sm" icon={DoorOpen} onClick={onExit}>الخروج من الصفحة</Button></div>
        </Card>
      </div>
    );
  }

  if (starting || phase === 'active') {
    return <CenterCard icon={Radio} tone="success" title="تم فتح الجلسة" description="جارٍ تجهيز الأسئلة وبدء العد التنازلي. لا تغلق الصفحة.">
      <div className="flex items-center justify-center gap-2 text-[12px] text-muted"><span className="size-2 animate-pulse rounded-full bg-emerald" />جارٍ الانتقال إلى الامتحان...</div>
      {error ? <Alert tone="danger" className="mt-4">{error}</Alert> : null}
    </CenterCard>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}

      <Card className="relative overflow-hidden">
        <div className="relative overflow-hidden bg-[#10172e] px-6 pb-9 pt-8 text-center text-white dark:bg-[#0a1120] dark:ring-1 dark:ring-line sm:px-8">
          <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-primary/25 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-emerald/15 blur-[80px]" />
          <div className="relative">
            <div className="mx-auto grid size-16 place-items-center rounded-full border border-white/10 bg-white/[0.07]">
              <div className="relative grid size-11 place-items-center rounded-full bg-white/10 text-emerald">
                <span className="absolute inset-0 animate-ping rounded-full border border-emerald/30" />
                <Hourglass size={22} />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2">
              <LiveDot label="متصل بغرفة الانتظار" />
            </div>
            <h1 className="mt-2 font-display text-[clamp(1.5rem,3.4vw,2.2rem)] font-semibold leading-tight tracking-[-0.045em]">يرجى انتظار بدء الامتحان من قبل المعلم.</h1>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-white/75">ستبدأ الأسئلة تلقائياً عندما يفتح المدرس الجلسة. لا تحدّث الصفحة ولا تغلقها.</p>

            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-white/70">
              <Wifi size={12} className="text-emerald" />آخر تحديث قبل لحظات · يتم التحقق كل 3 ثوانٍ
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[14px] border border-line bg-surface-soft p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted"><BookOpen size={12} className="text-primary" />الامتحان</p>
              <p className="mt-1.5 text-[13px] font-bold text-ink">{session.examTitle}</p>
              {session.examDescription ? <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">{session.examDescription}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[13px] border border-line bg-surface-soft p-3">
                <p className="flex items-center gap-1 text-[10.5px] text-muted"><Clock3 size={11} />المدة</p>
                <strong className="mt-1 block text-[12.5px] text-ink">{formatNumber(session.durationMinutes)} دقيقة</strong>
              </div>
              <div className="rounded-[13px] border border-line bg-surface-soft p-3">
                <p className="flex items-center gap-1 text-[10.5px] text-muted"><BookOpen size={11} />الأسئلة</p>
                <strong className="mt-1 block text-[12.5px] text-ink">{formatNumber(session.questionCount)} سؤال</strong>
              </div>
              <div className="rounded-[13px] border border-line bg-surface-soft p-3">
                <p className="flex items-center gap-1 text-[10.5px] text-muted"><UserRound size={11} />المدرس</p>
                <strong className="mt-1 block truncate text-[11.5px] text-ink">{session.teacherName || '—'}</strong>
              </div>
              <div className="rounded-[13px] border border-line bg-surface-soft p-3">
                <p className="flex items-center gap-1 text-[10.5px] text-muted"><Users size={11} />حالتك</p>
                <strong className="mt-1 block text-[11.5px] text-emerald">في الانتظار</strong>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-[13px] border border-line bg-surface-soft px-3.5 py-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-[11.5px] text-muted"><ShieldCheck size={14} className="text-emerald" />هويتك مؤكدة والدخول مرتبط بحسابك فقط.</div>
            <Button variant="ghost" size="xs" icon={DoorOpen} onClick={onExit}>الخروج</Button>
          </div>
        </div>
      </Card>

      <p className="mt-4 text-center text-[11px] text-subtle">سيتم تحديث الصفحة تلقائياً عند فتح الجلسة. إذا ظهر خطأ في الاتصال، أعد تحميل الصفحة.</p>
    </div>
  );
}

function CenterCard({ icon: Icon, tone = 'primary', title, description, children }) {
  const tones = { primary: 'bg-primary-soft text-primary', success: 'bg-emerald-soft text-emerald', neutral: 'bg-surface-soft text-muted' };
  return (
    <div className="mx-auto max-w-lg">
      <Card className="relative overflow-hidden p-6 text-center sm:p-8">
        <div className="pointer-events-none absolute -left-10 -top-10 size-40 rounded-full bg-primary-soft blur-3xl" />
        <div className={cn('relative mx-auto grid size-16 place-items-center rounded-full', tones[tone])}><Icon size={28} /></div>
        <h1 className="relative mt-4 font-display text-[clamp(1.4rem,3vw,1.9rem)] font-semibold tracking-[-0.04em] text-ink">{title}</h1>
        <p className="relative mx-auto mt-2 max-w-sm text-[13px] leading-7 text-muted">{description}</p>
        <div className="relative mt-5 flex justify-center">{children}</div>
      </Card>
    </div>
  );
}
