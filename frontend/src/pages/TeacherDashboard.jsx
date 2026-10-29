import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  FilePlus2,
  FileText,
  GraduationCap,
  Plus,
  Radio,
  RefreshCw,
  Users,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LiveDot,
  PageHeader,
  Skeleton,
  StatCard,
  StatusChip,
  cn,
} from '../components/ui';
import { request } from '../lib/api';
import { formatDate, formatDuration, formatNumber, greeting } from '../lib/format';

export default function TeacherDashboard({ token, user, onNavigate, onCreate, onOpenExam }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await request('/api/teacher/overview', { token });
      setData(result);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = window.setInterval(() => load(true), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  const live = data?.live || [];
  const recent = data?.recent || [];

  return (
    <div>
      <PageHeader
        eyebrow="مساحة العمل"
        title={`${greeting()}، ${user?.fullName?.split(' ')[0] || 'أستاذنا'}.`}
        description="هذه صورة سريعة عن امتحاناتك اليوم. الجلسات النشطة أولاً، ثم ما يحتاج انتباهك."
        action={
          <>
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>
            <Button size="sm" icon={Plus} onClick={onCreate}>امتحان جديد</Button>
          </>
        }
      />

      {error ? <Alert tone="danger" className="mb-5" onClose={() => setError('')}>{error}</Alert> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={FileText} label="إجمالي الامتحانات" value={formatNumber(data?.totalExams)} note={`${formatNumber(data?.publishedExams)} منشور`} loading={loading} />
        <StatCard icon={Radio} label="جلسات نشطة" value={formatNumber(data?.activeExams)} note="مفتوحة أو متوقفة الآن" tone="emerald" loading={loading} />
        <StatCard icon={GraduationCap} label="طلاب تمت متابعتهم" value={formatNumber(data?.studentsReached)} note={`${formatNumber(data?.participantCount)} مشاركة`} tone="blue" loading={loading} />
        <StatCard icon={ClipboardCheck} label="بحاجة لمراجعة" value={formatNumber(data?.pendingReview)} note={`${formatNumber(data?.submitted)} محاولة مسلّمة`} tone="warning" loading={loading} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[15px] font-semibold text-ink">الجلسات المباشرة</h2>
                {live.length ? <LiveDot label={`${formatNumber(live.length)} نشطة`} /> : null}
              </div>
              <p className="mt-1 text-[11.5px] leading-5 text-muted">افتح المتابعة لمعرفة حالة كل طالب لحظة بلحظة.</p>
            </div>
            <button type="button" onClick={() => onNavigate('exams')} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11.5px] font-bold text-primary hover:underline">كل الامتحانات <ArrowLeft size={12} /></button>
          </div>

          {loading ? (
            <div className="grid gap-3 p-4">
              {[0, 1].map((i) => <Skeleton key={i} className="h-[92px] w-full rounded-[14px]" />)}
            </div>
          ) : live.length === 0 ? (
            <EmptyState
              icon={Radio}
              title="لا توجد جلسة مفتوحة الآن"
              description="عندما تفتح امتحاناً منشوراً، ستظهر هنا حالة الطلاب وأزرار التحكم بالوقت."
              action={<Button size="sm" variant="secondary" icon={FileText} onClick={() => onNavigate('exams')}>الانتقال للامتحانات</Button>}
            />
          ) : (
            <div className="grid gap-2 p-3 sm:p-4">
              {live.map((exam) => (
                <motion.button
                  key={exam.id}
                  type="button"
                  onClick={() => onOpenExam(exam)}
                  whileHover={{ y: -1 }}
                  className="group flex w-full min-w-0 items-center gap-3 rounded-[14px] border border-line bg-surface-soft/60 p-3.5 text-right transition hover:border-primary/30 hover:bg-primary-soft/40"
                >
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-[12px]', exam.status === 'Paused' ? 'bg-warning-soft text-warning' : 'bg-emerald-soft text-emerald')}>
                    {exam.status === 'Paused' ? <Clock3 size={18} /> : <Radio size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-bold text-ink">{exam.title}</p>
                      <StatusChip status={exam.status} className="hidden px-2 py-1 text-[10px] sm:inline-flex" />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1"><Users size={12} />{formatNumber(exam.participantCount)} طالب</span>
                      {exam.scheduledAtUtc ? <span className="inline-flex items-center gap-1"><CalendarClock size={12} />{formatDate(exam.scheduledAtUtc)}</span> : null}
                    </div>
                  </div>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted transition group-hover:border-primary/30 group-hover:text-primary"><ArrowLeft size={14} /></span>
                </motion.button>
              ))}
            </div>
          )}
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <Card className="relative overflow-hidden p-5">
            <div className="pointer-events-none absolute -left-6 -top-8 size-28 rounded-full bg-primary-soft blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-[13px] bg-primary-soft text-primary"><FilePlus2 size={19} /></span>
                <Badge tone="primary">خطوة أولى</Badge>
              </div>
              <h3 className="mt-4 font-display text-[15px] font-semibold text-ink">ابنِ امتحانك القادم</h3>
              <p className="mt-1 text-[12.5px] leading-6 text-muted">أضف الأسئلة، حدّد المرحلة والصف والمدة، ثم انشره وافتح الجلسة — الطلاب المؤهلون يدخلون مباشرة.</p>
              <Button size="sm" className="mt-4 w-full" icon={Plus} onClick={onCreate}>إنشاء امتحان</Button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-display text-[14px] font-semibold text-ink">ملخص سريع</h3>
                <p className="text-[11.5px] text-muted">مؤشرات تحتاج انتباهك</p>
              </div>
              <BookOpenCheck size={18} className="text-primary" />
            </div>
            <div className="grid gap-2">
              {[
                { label: 'جلسات يمكن فتحها', value: Math.max(0, (data?.publishedExams || 0) - (data?.activeExams || 0)), icon: Radio, tone: 'text-emerald bg-emerald-soft' },
                { label: 'مقالات بانتظار التصحيح', value: data?.pendingReview || 0, icon: ClipboardCheck, tone: 'text-warning bg-warning-soft' },
                { label: 'إجمالي المشاركات', value: data?.participantCount || 0, icon: Users, tone: 'text-blue bg-blue-soft' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2.5 rounded-[11px] border border-line bg-surface-soft px-2.5 py-2">
                  <span className={cn('grid size-7 place-items-center rounded-[8px]', item.tone)}><item.icon size={13} /></span>
                  <span className="flex-1 text-[11.5px] font-semibold text-muted">{item.label}</span>
                  <strong className="ui-number text-[13px] text-ink">{formatNumber(item.value)}</strong>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => onNavigate('results')} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[10px] border border-line py-2 text-[11.5px] font-bold text-muted transition hover:border-primary/30 hover:text-primary">
              <BarChart3 size={13} /> عرض التحليلات
            </button>
          </Card>
        </div>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink">أحدث الامتحانات</h2>
            <p className="mt-1 text-[11.5px] text-muted">آخر ما أنشأته، مع حالة النشر وعدد المشاركين.</p>
          </div>
          <Button variant="ghost" size="sm" iconEnd={ArrowLeft} onClick={() => onNavigate('exams')}>عرض الكل</Button>
        </div>

        {loading ? (
          <div className="grid gap-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : recent.length === 0 ? (
          <EmptyState icon={FileText} title="لم تنشئ أي امتحان بعد" description="ابدأ بامتحان قصير وحدّد مرحلته وصفه لتجربة غرفة الانتظار والدخول المباشر للطلاب المؤهلين." action={<Button size="sm" icon={Plus} onClick={onCreate}>إنشاء أول امتحان</Button>} />
        ) : (
          <>
            <div className="grid gap-2.5 p-3 md:hidden">
              {recent.map((exam) => (
                <div key={exam.id} className="rounded-[13px] border border-line bg-surface-soft/50 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-ink">{exam.title}</p>
                      <p className="mt-1 text-[11px] text-subtle">{formatDate(exam.createdAtUtc)}</p>
                    </div>
                    <StatusChip status={exam.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[11px] text-muted">
                    <span>{formatDuration(exam.durationMinutes)}</span>
                    <span>{formatNumber(exam.questionCount)} سؤالاً</span>
                    <span>{formatNumber(exam.participantCount)} طالب</span>
                  </div>
                  <Button variant="secondary" size="xs" className="mt-3 w-full" iconEnd={ArrowLeft} onClick={() => onOpenExam(exam)}>إدارة الامتحان</Button>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[680px] text-right">
                <thead>
                  <tr className="border-b border-line bg-surface-soft/60 text-[11px] font-extrabold text-muted">
                    <th className="px-5 py-2.5">الامتحان</th>
                    <th className="px-3 py-2.5">المدة</th>
                    <th className="px-3 py-2.5">الأسئلة</th>
                    <th className="px-3 py-2.5">الطلاب</th>
                    <th className="px-3 py-2.5">الحالة</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {recent.map((exam) => (
                    <tr key={exam.id} className="border-b border-line/70 text-[12px] transition last:border-0 hover:bg-surface-soft/50">
                      <td className="px-5 py-3">
                        <p className="max-w-[260px] truncate font-bold text-ink">{exam.title}</p>
                        <p className="mt-0.5 text-[10.5px] text-subtle">{formatDate(exam.createdAtUtc)}</p>
                      </td>
                      <td className="px-3 py-3 text-muted">{formatDuration(exam.durationMinutes)}</td>
                      <td className="px-3 py-3 text-muted">{formatNumber(exam.questionCount)}</td>
                      <td className="px-3 py-3 text-muted">{formatNumber(exam.participantCount)}</td>
                      <td className="px-3 py-3"><StatusChip status={exam.status} /></td>
                      <td className="px-5 py-3 text-left">
                        <Button variant="ghost" size="xs" iconEnd={ArrowLeft} onClick={() => onOpenExam(exam)}>إدارة</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
