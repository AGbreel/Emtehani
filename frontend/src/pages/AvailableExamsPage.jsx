import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  ListChecks,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  StatusChip,
  cn,
} from '../components/ui';
import { request } from '../lib/api';
import { formatDate, formatNumber, formatTimer } from '../lib/format';

const tabs = [
  { value: 'all', label: 'الكل' },
  { value: 'live', label: 'جارية الآن' },
  { value: 'waiting', label: 'بانتظار البدء' },
  { value: 'resume', label: 'لدي محاولة' },
];

function matchesTab(exam, tab) {
  if (tab === 'live') return exam.examStatus === 'Active' || exam.examStatus === 'Paused';
  if (tab === 'waiting') return exam.examStatus === 'Waiting' || exam.examStatus === 'Scheduled';
  if (tab === 'resume') return Boolean(exam.hasActiveAttempt);
  return true;
}

function attemptsText(exam) {
  if (exam.hasActiveAttempt) return `محاولة جارية · ${formatTimer(exam.remainingSeconds || 0)} متبقٍ`;
  if (exam.attemptsUsed === 0) return `0 من ${formatNumber(exam.maxAttempts)}`;
  if (exam.attemptsRemaining > 0) return `${formatNumber(exam.attemptsUsed)} من ${formatNumber(exam.maxAttempts)} · متبقٍ ${formatNumber(exam.attemptsRemaining)}`;
  return `${formatNumber(exam.attemptsUsed)} من ${formatNumber(exam.maxAttempts)}`;
}

function Info({ icon: Icon, label, value, className = '' }) {
  return (
    <div className={cn('rounded-[11px] border border-line bg-surface-soft/60 px-3 py-2.5', className)}>
      <p className="flex items-center gap-1 text-[10.5px] font-semibold text-muted"><Icon size={11} />{label}</p>
      <p className="mt-1 truncate text-[12px] font-bold text-ink">{value}</p>
    </div>
  );
}

export default function AvailableExamsPage({ token, onEnter }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [enteringId, setEnteringId] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const seq = useRef(0);

  const load = useCallback(async (background = false) => {
    const current = ++seq.current;
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await request('/api/exams/available', { token });
      if (current !== seq.current) return;
      setItems(Array.isArray(result?.items) ? result.items : []);
      setError('');
    } catch (err) {
      if (current === seq.current) setError(err.message);
    } finally {
      if (current === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token]);

  useEffect(() => { load(); return () => { seq.current += 1; }; }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => load(true), 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((exam) => {
      if (!matchesTab(exam, tab)) return false;
      if (!term) return true;
      return [exam.examTitle, exam.teacherName, exam.examDescription]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [items, query, tab]);

  const live = items.filter((exam) => exam.examStatus === 'Active' || exam.examStatus === 'Paused').length;
  const resumable = items.filter((exam) => exam.hasActiveAttempt).length;
  const hasFilters = Boolean(query.trim()) || tab !== 'all';

  async function enter(exam) {
    if (enteringId) return;
    setEnteringId(exam.examId);
    setError('');
    try {
      const result = await request(`/api/exams/${exam.examId}/enter`, { token, method: 'POST' });
      onEnter(result);
    } catch (err) {
      setError(err.message);
      if (err.status === 404 || err.status === 409) load(true);
    } finally {
      setEnteringId('');
    }
  }

  function clearFilters() {
    setQuery('');
    setTab('all');
  }

  return (
    <div>
      <PageHeader
        eyebrow="بوابة الطالب"
        title="الامتحانات المتاحة"
        description="كل الامتحانات المنشورة من المدرسين في مكان واحد. اختر امتحاناً وسننقلك إلى غرفة الانتظار أو نستكمل محاولتك الجارية."
        action={
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>
        }
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard icon={BookOpenCheck} label="متاحة لك الآن" value={formatNumber(items.length)} note="امتحانات منشورة ولم تُستنفد محاولاتها" loading={loading} />
        <StatCard icon={Radio} label="جلسات جارية" value={formatNumber(live)} note="نشطة أو متوقفة مؤقتاً" tone="emerald" loading={loading} />
        <StatCard icon={RotateCcw} label="محاولات قيد الحل" value={formatNumber(resumable)} note="ستُستكمل عند الدخول مجدداً" tone="blue" loading={loading} className="col-span-2 lg:col-span-1" />
      </div>

      <Card className="mb-4 overflow-hidden">
        <div className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث باسم الامتحان أو المدرس..."
                aria-label="ابحث في الامتحانات المتاحة"
                className="h-11 w-full rounded-[11px] border border-line bg-surface-soft pr-9 pl-3 text-[13px] text-ink outline-none transition placeholder:text-subtle focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary-soft"
              />
            </div>
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <Filter size={13} />
              <span>{formatNumber(filtered.length)} من {formatNumber(items.length)} امتحان</span>
              {hasFilters ? <Badge tone="primary">تصفية نشطة</Badge> : null}
            </div>
          </div>

          <div className="ui-scrollbar-hidden mt-3 flex gap-1 overflow-x-auto pb-0.5">
            {tabs.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setTab(item.value)}
                className={cn('min-h-9 shrink-0 rounded-[9px] px-3 py-1.5 text-[11.5px] font-bold transition', tab === item.value ? 'bg-primary text-white' : 'bg-surface-soft text-muted hover:text-ink')}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Card key={index} className="p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-[13px]" />
                <div className="flex-1"><Skeleton className="h-4 w-2/3" /><Skeleton className="mt-2 h-3 w-1/3" /></div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">{[0, 1, 2, 3].map((cell) => <Skeleton key={cell} className="h-14 w-full" />)}</div>
              <Skeleton className="mt-4 h-9 w-full" />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="لا توجد امتحانات متاحة الآن"
            description="عندما ينشر أحد مدرسيك امتحاناً مطابقاً لمرحلتك وصفك سيظهر هنا تلقائياً. تأكد من قبول طلب التسجيل لدى المدرس ومن اكتمال بياناتك الدراسية."
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Search}
            title="لا توجد امتحانات مطابقة"
            description="جرّب تغيير كلمة البحث أو اختيار تصنيف آخر لعرض الامتحانات المتاحة."
            action={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={clearFilters}>مسح التصفية</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((exam) => (
            <Card key={exam.examId} hover className="flex flex-col overflow-hidden">
              <div className="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-primary-soft text-primary">
                  <BookOpenCheck size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusChip status={exam.examStatus} className="px-2 py-1 text-[10px]" />
                    {exam.hasActiveAttempt ? <Badge tone="blue" dot>محاولة قيد الحل</Badge> : null}
                  </div>
                  <h2 className="mt-1.5 font-display text-[16px] font-semibold leading-7 tracking-[-0.02em] text-ink">{exam.examTitle}</h2>
                  <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted"><UserRound size={12} />{exam.teacherName || 'مدرس'}</p>
                </div>
              </div>

              {exam.examDescription ? <p className="mt-2 line-clamp-2 px-4 text-[11.5px] leading-5 text-muted sm:px-5">{exam.examDescription}</p> : null}

              <div className="mt-3 grid grid-cols-2 gap-2 px-4 sm:px-5">
                <Info icon={Clock3} label="المدة" value={`${formatNumber(exam.durationMinutes)} دقيقة`} />
                <Info icon={ListChecks} label="عدد الأسئلة" value={`${formatNumber(exam.questionCount)} سؤال`} />
                <Info icon={RotateCcw} label="محاولاتك" value={attemptsText(exam)} className="col-span-2" />
                {exam.scheduledAtUtc ? <Info icon={CalendarDays} label="الموعد المجدول" value={formatDate(exam.scheduledAtUtc)} className="col-span-2" /> : null}
              </div>

              {exam.hasActiveAttempt ? (
                <div className="mx-4 mt-3 flex items-start gap-2 rounded-[11px] border border-blue/20 bg-blue-soft px-3 py-2.5 text-[11px] leading-5 text-blue sm:mx-5">
                  <RotateCcw size={13} className="mt-0.5 shrink-0" />
                  لديك محاولة قيد الحل لهذا الامتحان. الدخول سيعيدك إلى محاولتك الحالية دون إنشاء محاولة جديدة.
                </div>
              ) : null}

              <div className="mt-auto flex flex-col gap-2.5 border-t border-line bg-surface-soft/40 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <span className="flex items-center gap-1.5 text-[10.5px] text-muted"><ShieldCheck size={13} className="text-emerald" />دخول آمن مرتبط بحسابك</span>
                <Button
                  size="sm"
                  iconEnd={ArrowLeft}
                  loading={enteringId === exam.examId}
                  disabled={Boolean(enteringId) && enteringId !== exam.examId}
                  onClick={() => enter(exam)}
                  className="w-full sm:w-auto"
                >
                  {exam.hasActiveAttempt ? 'استكمال المحاولة' : 'دخول الامتحان'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-subtle">
        <CheckCircle2 size={12} className="text-emerald" />
        تُحدّث القائمة تلقائياً. الامتحانات المنتهية أو التي استنفدت محاولاتها لا تظهر هنا.
      </p>
    </div>
  );
}
