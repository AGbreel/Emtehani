import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, CheckCircle2, ChevronDown, Clock3, ExternalLink, FileText, Lock, Play, Search } from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Input, Modal, PageHeader, ProgressBar,
  Skeleton, StatCard, cn,
} from '../components/ui';
import { assetUrl, request } from '../lib/api';
import { downloadBlob, formatDuration, formatNumber } from '../lib/format';

function lessonIcon(kind) {
  if (kind === 'Video') return Play;
  if (kind === 'Audio') return Clock3;
  return FileText;
}

function Watermark({ text }) {
  if (!text) return null;
  const stamps = Array.from({ length: 18 });
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden opacity-[0.22]">
      <div className="grid h-full w-full -rotate-12 scale-125 grid-cols-2 place-items-center gap-6 sm:grid-cols-3">
        {stamps.map((_, index) => (
          <span key={index} className="whitespace-nowrap text-[10px] font-extrabold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.55)]">{text}</span>
        ))}
      </div>
    </div>
  );
}

export default function MyCoursesPage({ token, onExplore }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openUnits, setOpenUnits] = useState({});
  const [material, setMaterial] = useState(null);
  const [materialBusy, setMaterialBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await request('/api/teaching/my/courses', { token });
      setData(result);
      setError('');
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true);
    try {
      const result = await request(`/api/teaching/my/courses/${id}`, { token });
      setDetail(result);
      setOpenUnits(Object.fromEntries((result.units || []).map((unit) => [unit.id, true])));
      setError('');
    } catch (err) { setError(err.message); } finally { setDetailLoading(false); }
  }, [token]);

  useEffect(() => { if (activeId) loadDetail(activeId); else setDetail(null); }, [activeId, loadDetail]);

  const items = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data?.items || []).filter((course) => !term || course.title?.toLowerCase().includes(term) || course.subject?.toLowerCase().includes(term));
  }, [data, query]);

  async function completeLesson(lesson) {
    try {
      await request(`/api/teaching/lessons/${lesson.id}/complete`, { token, method: 'POST' });
      setNotice(`تم تسجيل إكمال درس: ${lesson.title}`);
      await loadDetail(activeId);
      load(true);
    } catch (err) { setError(err.message); }
  }

  async function openMaterial(item) {
    setMaterialBusy(true);
    setError('');
    try {
      const access = await request(`/api/teaching/materials/${item.id}/access`, { token });
      setMaterial({ ...item, ...access, resolvedUrl: `${(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')}${access.url}` });
    } catch (err) { setError(err.message); } finally { setMaterialBusy(false); }
  }

  if (loading) {
    return <div><PageHeader eyebrow="محتواك" title="كورساتي" description="كل كورساتك المتاحة من المدرسين المرتبطين بك." /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-52 rounded-card" />)}</div></div>;
  }

  if (activeId && detail) {
    const course = detail.course;
    return (
      <div>
        <PageHeader eyebrow="المحتوى" title={course.title} description={course.shortDescription || course.teacherName}
          action={<Button size="sm" variant="secondary" onClick={() => setActiveId(null)}>كل الكورسات</Button>} />
        {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
        {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}
        {!detail.access?.allowed ? (
          <Alert tone="warning" className="mb-4" title="الوصول مقصور على الدروس المجانية">
            هذا الكورس مدفوع. اشترك من صفحة «حصصي ومدفوعاتي» أو تواصل مع المدرس لفتح كامل المحتوى.
          </Alert>
        ) : null}
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[12px] text-muted"><BookOpen size={15} />{course.teacherName} · {course.deliveryMode}</div>
            <Badge tone={detail.access?.allowed ? 'emerald' : 'warning'}>{detail.access?.allowed ? 'وصول كامل' : 'معاينة محدودة'}</Badge>
          </div>
        </Card>
        <div className="grid gap-3">
          {(detail.units || []).map((unit) => {
            const expanded = openUnits[unit.id] !== false;
            return (
              <Card key={unit.id} className="overflow-hidden">
                <button type="button" onClick={() => setOpenUnits((prev) => ({ ...prev, [unit.id]: !expanded }))} className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-right">
                  <div><p className="text-[13.5px] font-bold">{unit.title}</p><p className="text-[10.5px] text-muted">{unit.lessons?.length || 0} درس</p></div>
                  <ChevronDown size={16} className={cn('transition', expanded && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-line">
                      <div className="grid gap-2 p-3">
                        {(unit.lessons || []).map((lesson) => (
                          <div key={lesson.id} className="rounded-[12px] border border-line bg-surface-soft p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                {lesson.locked ? <Lock size={15} className="text-subtle" /> : lesson.completed ? <CheckCircle2 size={18} className="text-emerald" /> : <Play size={17} className="text-primary" />}
                                <div className="min-w-0">
                                  <p className="truncate text-[12.5px] font-bold">{lesson.title}</p>
                                  <p className="text-[10.5px] text-muted">{lesson.locked ? 'يتطلب اشتراكًا' : lesson.completed ? 'مكتمل' : 'متاح'} · {formatDuration(lesson.durationMinutes)}</p>
                                </div>
                              </div>
                              {!lesson.locked && !lesson.completed ? <Button size="xs" variant="soft" onClick={() => completeLesson(lesson)}>تسجيل الإكمال</Button> : null}
                            </div>
                            {lesson.description ? <p className="mt-2 text-[11.5px] leading-6 text-muted">{lesson.description}</p> : null}
                            {!lesson.locked ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {lesson.videoUrl ? <a href={assetUrl(lesson.videoUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[10.5px] font-bold text-primary"><Play size={11} /> الفيديو</a> : null}
                                {lesson.pdfUrl ? <a href={assetUrl(lesson.pdfUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[10.5px] font-bold text-primary"><FileText size={11} /> PDF</a> : null}
                                {(lesson.materials || []).filter((item) => !item.locked).map((item) => {
                                  const Icon = lessonIcon(item.kind);
                                  return <button key={item.id} type="button" disabled={materialBusy} onClick={() => openMaterial(item)} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[10.5px] font-bold text-ink"><Icon size={11} /> {item.title}</button>;
                                })}
                              </div>
                            ) : null}
                          </div>
                        ))}
                        {(unit.lessons || []).length === 0 ? <p className="py-4 text-center text-[11.5px] text-muted">لا توجد دروس في هذه الوحدة بعد.</p> : null}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>

        <Modal open={Boolean(material)} onClose={() => setMaterial(null)} title={material?.title || 'المادة'} icon={FileText} size="lg">
          {material ? (
            <div className="grid gap-3 pb-2">
              <p className="text-[11.5px] text-muted">يفتح المحتوى عبر رابط موقّع قصير الأجل ومرتبط بحسابك: {material.watermark || ''}</p>
              {material.kind === 'Image' ? (
                <div className="relative overflow-hidden rounded-xl bg-surface-soft">
                  <img src={material.resolvedUrl} alt={material.title} className="max-h-[60vh] w-full object-contain" />
                  <Watermark text={material.watermark} />
                </div>
              ) : null}
              {material.kind === 'Video' || material.kind === 'Audio' ? (
                <div className="relative overflow-hidden rounded-xl bg-black">
                  <video src={material.resolvedUrl} controls controlsList="nodownload" onContextMenu={(event) => event.preventDefault()} className="max-h-[55vh] w-full" />
                  <Watermark text={material.watermark} />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <a href={material.resolvedUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[12px] font-bold text-white">فتح في نافذة جديدة <ExternalLink size={13} /></a>
                {material.downloadable ? <Button size="sm" variant="secondary" onClick={async () => { try { const blob = await request(material.resolvedUrl, { token }); if (blob instanceof Blob) downloadBlob(blob, material.title || 'material'); else window.open(material.resolvedUrl, '_blank'); } catch { window.open(material.resolvedUrl, '_blank'); } }}>تنزيل</Button> : null}
              </div>
            </div>
          ) : null}
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="محتواك" title="كورساتي" description="تابع الكورسات المتاحة من المدرسين المرتبطين بك واستكمل دروسك."
        action={<div className="relative w-56"><Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث..." className="h-9 pr-9" /></div>} />
      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      <div className="ui-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={BookOpen} label="الكورسات" value={formatNumber(items.length)} />
        <StatCard icon={CheckCircle2} label="دروس مكتملة" value={formatNumber(items.reduce((sum, x) => sum + (x.completedLessons || 0), 0))} tone="emerald" />
        <StatCard icon={Clock3} label="إجمالي الدروس" value={formatNumber(items.reduce((sum, x) => sum + (x.totalLessons || 0), 0))} tone="blue" />
        <StatCard icon={Lock} label="اشتراكات نشطة" value={formatNumber(items.filter((x) => !x.accessViaGroup).length)} tone="warning" />
      </div>
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="لا توجد كورسات بعد"
            description="اذهب إلى «استكشف» لترى كورسات مدرسيك، وابدأ أي كورس مجاني بضغطة واحدة."
            action={onExplore ? <Button size="sm" onClick={onExplore}>استكشاف الكورسات</Button> : null}
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((course) => (
            <Card key={course.id} hover className="flex flex-col overflow-hidden">
              <div className="relative h-32 bg-gradient-to-br from-primary/20 via-primary-soft to-blue-soft">
                {course.coverUrl ? <img src={assetUrl(course.coverUrl)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center text-primary"><BookOpen size={28} /></div>}
                {course.isFree ? <Badge tone="emerald" className="absolute right-2 top-2">مجاني</Badge> : <Badge tone="warning" className="absolute right-2 top-2">{formatNumber(course.price)} ج.م</Badge>}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="truncate text-[14px] font-bold">{course.title}</h3>
                <p className="mt-0.5 text-[10.5px] text-muted">{course.teacherName} · {course.subject || 'عام'}</p>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[10.5px] text-muted"><span>التقدم</span><span>{course.progressPercent || 0}%</span></div>
                  <ProgressBar value={course.progressPercent || 0} tone={course.progressPercent >= 100 ? 'emerald' : 'primary'} />
                </div>
                <Button size="sm" className="mt-3" onClick={() => setActiveId(course.id)}>فتح الكورس</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {detailLoading ? <div className="fixed inset-0 z-40 grid place-items-center bg-[rgba(3,7,18,.3)]"><Skeleton className="size-14 rounded-full" /></div> : null}
    </div>
  );
}
