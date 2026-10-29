import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Award,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  GraduationCap,
  Hourglass,
  Radio,
  RefreshCw,
  Save,
  ShieldCheck,
  Target,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
  StatCard,
  StatusChip,
} from '../components/ui';
import { request } from '../lib/api';
import { EDUCATION_STAGES, gradesForStage, isValidEducation } from '../lib/education';
import { formatDate, formatNumber, percent, scoreText } from '../lib/format';

export default function StudentDashboard({ token, user, onBrowse, onEnter, onViewResults, onOpenReview, onProfileUpdated }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [available, setAvailable] = useState([]);
  const [availableLoading, setAvailableLoading] = useState(true);
  const [availableError, setAvailableError] = useState('');
  const [availableRefreshing, setAvailableRefreshing] = useState(false);
  const [enteringId, setEnteringId] = useState('');
  const [stage, setStage] = useState(user?.stage || '');
  const [grade, setGrade] = useState(user?.grade || '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');

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

  const loadAvailable = useCallback(async (background = false) => {
    if (background) setAvailableRefreshing(true); else setAvailableLoading(true);
    try {
      const result = await request('/api/exams/available', { token });
      setAvailable(Array.isArray(result?.items) ? result.items : []);
      setAvailableError('');
    } catch (err) {
      setAvailableError(err.message);
    } finally {
      setAvailableLoading(false);
      setAvailableRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); loadAvailable(); }, [load, loadAvailable]);
  useEffect(() => {
    const id = window.setInterval(() => loadAvailable(true), 30000);
    return () => window.clearInterval(id);
  }, [loadAvailable]);
  useEffect(() => {
    setStage(user?.stage || '');
    setGrade(user?.grade || '');
  }, [user?.stage, user?.grade]);

  const graded = items.filter((item) => item.score != null);
  const average = graded.length ? Math.round(graded.reduce((sum, item) => sum + percent(item.score, item.maxScore), 0) / graded.length) : 0;
  const best = graded.length ? Math.max(...graded.map((item) => percent(item.score, item.maxScore))) : 0;
  const recent = items.slice(0, 4);
  const needsProfile = !user?.stage || !user?.grade;

  async function refreshAll() {
    await Promise.all([load(true), loadAvailable(true)]);
  }

  async function enter(exam) {
    if (enteringId) return;
    setEnteringId(exam.examId);
    setAvailableError('');
    try {
      const result = await request(`/api/exams/${exam.examId}/enter`, { token, method: 'POST' });
      onEnter(result);
    } catch (err) {
      setAvailableError(err.message);
      if (err.status === 404 || err.status === 409 || err.status === 403) loadAvailable(true);
    } finally {
      setEnteringId('');
    }
  }

  async function saveEducation(event) {
    event.preventDefault();
    setProfileError('');
    setProfileNotice('');
    if (!isValidEducation(stage, grade)) {
      setProfileError('اختر المرحلة التعليمية والصف الدراسي المناسب له.');
      return;
    }
    setProfileBusy(true);
    try {
      const result = await request('/api/auth/profile/education', {
        token,
        method: 'PUT',
        body: JSON.stringify({ stage, grade }),
      });
      setProfileNotice('تم حفظ مرحلتك وصفك. ستظهر الآن الامتحانات المطابقة لك.');
      onProfileUpdated?.({ stage: result.stage, grade: result.grade });
      loadAvailable(true);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="مساحة الطالب"
        title={`أهلاً، ${user?.fullName?.split(' ')[0] || 'طالبنا'}.`}
        description="اختر امتحاناً من قائمة مدرسيك ليبدأ أو يُستكمل مباشرة داخل حسابك — دون الحاجة إلى إدخال كود."
        action={
          <>
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={availableRefreshing || refreshing} onClick={refreshAll}>تحديث</Button>
            <Button size="sm" icon={BookOpenCheck} onClick={onBrowse}>كل الامتحانات المتاحة</Button>
          </>
        }
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}

      {needsProfile ? (
        <Card className="mb-4 overflow-hidden border-warning/25">
          <div className="border-b border-line bg-warning-soft/50 px-4 py-3 sm:px-5">
            <div className="flex items-start gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-warning-soft text-warning"><GraduationCap size={17} /></span>
              <div>
                <p className="font-display text-[14px] font-semibold text-ink">أكمل مرحلتك الدراسية</p>
                <p className="mt-1 text-[11.5px] leading-5 text-muted">حسابك موجود بالفعل، لكننا نحتاج مرحلتك وصفك لعرض الامتحانات المطابقة لك من مدرسيك.</p>
              </div>
            </div>
          </div>
          <form onSubmit={saveEducation} className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-5">
            <Field label="المرحلة التعليمية" id="profile-stage">
              <Select id="profile-stage" value={stage} onChange={(event) => { setStage(event.target.value); setGrade(''); }}>
                <option value="">اختر المرحلة</option>
                {EDUCATION_STAGES.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label="الصف الدراسي" id="profile-grade">
              <Select id="profile-grade" value={grade} onChange={(event) => setGrade(event.target.value)} disabled={!stage}>
                <option value="">{stage ? 'اختر الصف' : 'اختر المرحلة أولاً'}</option>
                {gradesForStage(stage).map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Button type="submit" loading={profileBusy} icon={Save} className="w-full sm:w-auto">حفظ</Button>
          </form>
          {profileError ? <div className="px-4 pb-4 sm:px-5"><Alert tone="danger" onClose={() => setProfileError('')}>{profileError}</Alert></div> : null}
          {profileNotice ? <div className="px-4 pb-4 sm:px-5"><Alert tone="success" onClose={() => setProfileNotice('')}>{profileNotice}</Alert></div> : null}
        </Card>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[13px] border border-line bg-surface px-3.5 py-2.5 text-[11.5px] text-muted">
          <GraduationCap size={14} className="text-primary" />
          <span>مرحلتك: <strong className="text-ink">{user.stage}</strong></span>
          <span className="text-line-strong">·</span>
          <span>صفك: <strong className="text-ink">{user.grade}</strong></span>
        </div>
      )}

      <Card className="mb-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink">امتحاناتك المتاحة</h2>
            <p className="mt-1 text-[11.5px] text-muted">امتحانات منشورة من مدرسيك وتطابق مرحلتك وصفك. اختر امتحاناً للدخول مباشرة.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="primary">{formatNumber(available.length)} امتحان</Badge>
            <Button variant="ghost" size="sm" iconEnd={ArrowLeft} onClick={onBrowse}>عرض الكل</Button>
          </div>
        </div>

        {availableError ? <div className="p-4 sm:p-5"><Alert tone="danger" onClose={() => setAvailableError('')}>{availableError}</Alert></div> : null}

        {availableLoading ? (
          <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">{[0, 1].map((i) => <Skeleton key={i} className="h-36 w-full rounded-[13px]" />)}</div>
        ) : available.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="لا توجد امتحانات متاحة الآن"
            description="ستظهر هنا امتحانات مدرسيك المنشورة عندما تطابق مرحلتك وصفك. تأكد من تسجيلك لدى المدرس ومن اكتمال بياناتك الدراسية."
            action={<Button variant="secondary" size="sm" icon={BookOpenCheck} onClick={onBrowse}>استعراض الصفحة الكاملة</Button>}
          />
        ) : (
          <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-4">
            {available.slice(0, 4).map((exam) => (
              <div key={exam.examId} className="flex flex-col rounded-[13px] border border-line bg-surface-soft/50 p-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary"><BookOpenCheck size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusChip status={exam.examStatus} className="px-2 py-1 text-[10px]" />
                      {exam.hasActiveAttempt ? <Badge tone="blue" dot>محاولة قيد الحل</Badge> : null}
                    </div>
                    <p className="mt-1.5 truncate text-[13px] font-bold text-ink">{exam.examTitle}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-muted"><UserRound size={11} />{exam.teacherName || 'مدرس'}</p>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[10.5px] text-muted">
                  <span className="flex items-center gap-1"><Clock3 size={11} />{formatNumber(exam.durationMinutes)} دقيقة</span>
                  <span className="flex items-center gap-1"><FileText size={11} />{formatNumber(exam.questionCount)} سؤال</span>
                  {exam.scheduledAtUtc ? <span className="col-span-2 flex items-center gap-1"><CalendarDays size={11} />الموعد: {formatDate(exam.scheduledAtUtc)}</span> : null}
                  {exam.availableUntilUtc ? <span className="col-span-2 flex items-center gap-1"><Hourglass size={11} />متاح حتى: {formatDate(exam.availableUntilUtc)}</span> : null}
                </div>
                <p className="mt-2 line-clamp-2 text-[10.5px] leading-5 text-subtle">{exam.examDescription || 'تعليمات: تأكد من استقرار اتصالك، ولا تغادر الصفحة أثناء المحاولة.'}</p>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
                  <span className="flex items-center gap-1 text-[10px] text-muted"><ShieldCheck size={11} className="text-emerald" />دخول آمن بحسابك</span>
                  <Button
                    size="xs"
                    iconEnd={ArrowLeft}
                    loading={enteringId === exam.examId}
                    disabled={Boolean(enteringId) && enteringId !== exam.examId}
                    onClick={() => enter(exam)}
                  >
                    {exam.hasActiveAttempt ? 'استكمال' : 'دخول'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={FileText} label="المحاولات" value={formatNumber(items.length)} note="محاولات مسلّمة" loading={loading} />
        <StatCard icon={Target} label="متوسط النتائج" value={`${formatNumber(average)}%`} note="من النتائج المعتمدة" tone="blue" loading={loading} />
        <StatCard icon={Award} label="أفضل نتيجة" value={`${formatNumber(best)}%`} note="أعلى نسبة معتمدة" tone="emerald" loading={loading} />
        <StatCard icon={TrendingUp} label="قيد المراجعة" value={formatNumber(items.filter((item) => item.status === 'NeedsReview').length)} note="بانتظار المدرس" tone="warning" loading={loading} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-4 sm:px-5">
            <div><h2 className="font-display text-[15px] font-semibold text-ink">أحدث النتائج</h2><p className="mt-1 text-[11.5px] text-muted">تظهر الدرجات والإجابات الصحيحة بعد انتهاء الامتحان واعتماد النتائج.</p></div>
            <Button variant="ghost" size="sm" iconEnd={ArrowLeft} onClick={onViewResults}>عرض الكل</Button>
          </div>
          {loading ? (
            <div className="grid gap-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : recent.length === 0 ? (
            <EmptyState icon={BookOpen} title="لم تسلّم أي امتحان بعد" description="عندما تدخل امتحاناً وتسلّمه، سيظهر هنا مع حالة اعتماد النتيجة." action={<Button size="sm" icon={BookOpenCheck} onClick={onBrowse}>اختر امتحاناً</Button>} />
          ) : (
            <div className="grid gap-2 p-3 sm:p-4">
              {recent.map((item) => {
                const value = percent(item.score, item.maxScore);
                const pendingResults = item.resultsAvailable === false;
                return (
                  <button key={item.id} type="button" onClick={() => onOpenReview(item.id)} className="group flex items-center gap-3 rounded-[13px] border border-line bg-surface-soft/50 p-3 text-right transition hover:border-primary/30 hover:bg-primary-soft/30">
                    <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary"><FileText size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="truncate text-[13px] font-bold text-ink">{item.examTitle}</p><StatusChip status={item.status} className="px-2 py-1 text-[10px]" /></div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {pendingResults ? (
                          <span className="flex items-center gap-1 text-[10.5px] font-bold text-warning"><Clock3 size={12} />بانتظار اعتماد النتائج</span>
                        ) : (
                          <>
                            <ProgressBar value={value} className="h-1.5 max-w-[110px]" tone={value >= 60 ? 'emerald' : value >= 50 ? 'warning' : 'danger'} />
                            <span className="text-[10.5px] text-muted">{formatDate(item.submittedAtUtc)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-left"><strong className="ui-number block text-[13px] text-ink">{pendingResults ? '—' : scoreText(item.score, item.maxScore)}</strong><span className="ui-number text-[10.5px] text-muted">{pendingResults ? 'مؤجلة' : `${formatNumber(value)}%`}</span></div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <Card className="p-5">
            <span className="grid size-10 place-items-center rounded-[12px] bg-emerald-soft text-emerald"><Radio size={18} /></span>
            <h3 className="mt-3 font-display text-[14px] font-semibold text-ink">كيف تبدأ امتحانك؟</h3>
            <div className="mt-3 grid gap-2.5">
              {[
                { icon: BookOpenCheck, text: 'اختر امتحاناً من قائمة مدرسيك المطابقة لمرحلتك وصفك.' },
                { icon: Clock3, text: 'انتظر داخل غرفة الانتظار حتى يفتح المدرس الجلسة.' },
                { icon: CheckCircle2, text: 'سيبدأ الوقت تلقائياً. أجب ثم سلّم قبل انتهاء المدة.' },
              ].map((step, index) => (
                <div key={step.text} className="flex gap-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-[10.5px] font-bold text-primary">{index + 1}</span>
                  <p className="text-[11.5px] leading-5 text-muted">{step.text}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between"><h3 className="font-display text-[14px] font-semibold text-ink">خصوصية النتائج</h3><Badge tone="warning">بعد الاعتماد</Badge></div>
            <p className="mt-2 text-[12px] leading-6 text-muted">لا تظهر الدرجات أو الإجابات الصحيحة أو ملاحظات المدرس قبل انتهاء جلسة الامتحان واعتماد النتائج. الدخول والبدء مرتبطان بحسابك فقط.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
