import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download,
  ExternalLink, FileText, Layers, Lock, Play, Search,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Input, PageHeader, ProgressBar,
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
  const stamps = Array.from({ length: 20 });
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden opacity-[0.18]">
      <div className="grid h-full w-full -rotate-12 scale-125 grid-cols-2 place-items-center gap-6 sm:grid-cols-3">
        {stamps.map((_, index) => (
          <span key={index} className="whitespace-nowrap text-[10px] font-extrabold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.55)]">{text}</span>
        ))}
      </div>
    </div>
  );
}

function PlayerSurface({ selected, material, introUrl, watermark }) {
  if (!selected) {
    if (introUrl) {
      return (
        <div className="relative h-full w-full">
          <video src={assetUrl(introUrl)} controls controlsList="nodownload" onContextMenu={(event) => event.preventDefault()} className="h-full w-full object-contain" />
          <Watermark text={watermark} />
        </div>
      );
    }
    return (
      <div className="grid h-full place-items-center gap-2 bg-[radial-gradient(circle_at_30%_20%,rgba(21,128,61,.4),transparent_60%)] p-8 text-center text-white">
        <span className="grid size-16 place-items-center rounded-full border border-white/20 bg-white/10 text-gold"><Play size={26} /></span>
        <p className="text-[13px] font-bold">اختر درساً من قائمة المحتوى لتبدأ</p>
        <p className="max-w-xs text-[11.5px] text-white/60">كل درس يحتوي على فيديو الشرح والمواد المرتبطة به.</p>
      </div>
    );
  }

  if (selected.locked) {
    return (
      <div className="grid h-full place-items-center gap-2 bg-[radial-gradient(circle_at_70%_20%,rgba(202,138,4,.35),transparent_60%)] p-8 text-center text-white">
        <span className="grid size-16 place-items-center rounded-full border border-white/20 bg-white/10"><Lock size={26} /></span>
        <p className="text-[13px] font-bold">هذا الدرس متاح للمشتركين</p>
        <p className="max-w-xs text-[11.5px] text-white/60">اشترك في الكورس أو تواصل مع معلمك لفتح باقي الدروس.</p>
      </div>
    );
  }

  if (material) {
    if (material.kind === 'Video' || material.kind === 'Audio') {
      return (
        <div className="relative h-full w-full">
          <video src={material.resolvedUrl} controls controlsList="nodownload" onContextMenu={(event) => event.preventDefault()} className="h-full w-full object-contain" />
          <Watermark text={watermark} />
        </div>
      );
    }
    if (material.kind === 'Image') {
      return (
        <div className="relative h-full w-full overflow-hidden">
          <img src={material.resolvedUrl} alt={material.title} className="h-full w-full object-contain" />
          <Watermark text={watermark} />
        </div>
      );
    }
    return (
      <div className="grid h-full place-items-center gap-2 bg-[#06140f] p-8 text-center text-white">
        <FileText size={30} className="text-gold" />
        <p className="text-[13px] font-bold">{material.title}</p>
        <p className="text-[11.5px] text-white/60">هذا الملف يُفتح في نافذة جديدة عبر رابط موقّع قصير الأجل.</p>
        <a href={material.resolvedUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex h-9 items-center gap-2 rounded-xl bg-white/15 px-4 text-[11.5px] font-bold text-white">فتح الملف <ExternalLink size={13} /></a>
        <Watermark text={watermark} />
      </div>
    );
  }

  if (selected.videoUrl) {
    return (
      <div className="relative h-full w-full">
        <video src={assetUrl(selected.videoUrl)} controls controlsList="nodownload" onContextMenu={(event) => event.preventDefault()} className="h-full w-full object-contain" />
        <Watermark text={watermark} />
      </div>
    );
  }

  return (
    <div className="grid h-full place-items-center gap-2 bg-[#06140f] p-8 text-center text-white">
      <FileText size={30} className="text-gold" />
      <p className="text-[13px] font-bold">اختر مادة من مواد الدرس</p>
      <p className="max-w-xs text-[11.5px] text-white/60">هذا الدرس يعتمد على الملفات المرفقة بالأسفل.</p>
    </div>
  );
}

export default function MyCoursesPage({ token, user, onExplore }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openUnits, setOpenUnits] = useState({});
  const [selectedLessonId, setSelectedLessonId] = useState(null);
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

  const loadDetail = useCallback(async (id, resetSelection = false) => {
    setDetailLoading(true);
    try {
      const result = await request(`/api/teaching/my/courses/${id}`, { token });
      setDetail(result);
      setOpenUnits(Object.fromEntries((result.units || []).map((unit) => [unit.id, true])));
      if (resetSelection) {
        const first = (result.units || []).flatMap((unit) => unit.lessons || []).find((lesson) => !lesson.locked);
        setSelectedLessonId(first?.id || null);
        setMaterial(null);
      }
      setError('');
    } catch (err) { setError(err.message); } finally { setDetailLoading(false); }
  }, [token]);

  useEffect(() => {
    if (activeId) loadDetail(activeId, true);
    else { setDetail(null); setSelectedLessonId(null); setMaterial(null); }
  }, [activeId, loadDetail]);

  const items = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data?.items || []).filter((course) => !term || course.title?.toLowerCase().includes(term) || course.subject?.toLowerCase().includes(term));
  }, [data, query]);

  const lessons = useMemo(() => (detail?.units || []).flatMap((unit) => (unit.lessons || []).map((lesson) => ({ ...lesson, unitTitle: unit.title }))), [detail]);
  const selectedIndex = lessons.findIndex((lesson) => lesson.id === selectedLessonId);
  const selected = selectedIndex >= 0 ? lessons[selectedIndex] : null;
  const completedCount = lessons.filter((lesson) => lesson.completed).length;
  const progressPercent = lessons.length ? Math.round((completedCount * 100) / lessons.length) : 0;
  const watermark = user?.fullName ? `${user.fullName}${user.studentCode ? ` · ${user.studentCode}` : ''}` : '';

  function selectLesson(lesson) {
    setSelectedLessonId(lesson.id);
    setMaterial(null);
    setError('');
    setNotice('');
  }

  function goRelative(step) {
    const next = lessons[selectedIndex + step];
    if (next) selectLesson(next);
  }

  async function completeLesson() {
    if (!selected) return;
    try {
      await request(`/api/teaching/lessons/${selected.id}/complete`, { token, method: 'POST' });
      setNotice(`تم تسجيل إكمال درس: ${selected.title}`);
      await loadDetail(activeId, false);
      load();
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
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="secondary" icon={ChevronRight} onClick={() => setActiveId(null)}>كل الكورسات</Button>
          <div className="flex items-center gap-2 text-[11.5px] font-bold text-muted">
            <span>{course.teacherName}</span>
            {detail.access?.allowed ? <Badge tone="emerald">وصول كامل</Badge> : <Badge tone="warning">معاينة محدودة</Badge>}
          </div>
        </div>

        {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
        {notice ? <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert> : null}
        {!detail.access?.allowed ? (
          <Alert tone="warning" title="الوصول مقصور على الدروس المجانية">
            هذا الكورس مدفوع. اشترك من خلال معلمك أو صفحة «مدفوعاتي» لفتح كامل المحتوى.
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4">
            <Card className="overflow-hidden">
              <div className="relative aspect-video w-full bg-[#06140f]">
                {detailLoading && !selected ? <div className="grid h-full place-items-center"><Skeleton className="size-12 rounded-full" /></div> : (
                  <PlayerSurface selected={selected} material={material} introUrl={material ? null : course.introVideoUrl} watermark={watermark} />
                )}
              </div>
              <div className="grid gap-3 p-4 sm:p-5">
                {selected ? (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10.5px] font-bold text-primary">{selected.unitTitle}</span>
                      {selected.isFreePreview ? <Badge tone="blue">معاينة مجانية</Badge> : null}
                      {selected.completed ? <Badge tone="success"><CheckCircle2 size={11} /> تم إنجاز الدرس</Badge> : null}
                      {selected.locked ? <Badge tone="neutral"><Lock size={11} /> للمشتركين</Badge> : null}
                    </div>
                    <h2 className="font-display text-[19px] font-semibold leading-8 text-ink">{selected.title}</h2>
                    {selected.description ? <p className="text-[12px] leading-6 text-muted">{selected.description}</p> : null}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                      <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-muted">
                        <span className="inline-flex items-center gap-1"><Clock3 size={12} />{formatDuration(selected.durationMinutes)}</span>
                        <span>درس {selectedIndex + 1} من {lessons.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" icon={ChevronRight} disabled={selectedIndex <= 0} onClick={() => goRelative(-1)}>السابق</Button>
                        {!selected.locked && !selected.completed ? <Button size="sm" icon={CheckCircle2} onClick={completeLesson}>تسجيل الإكمال</Button> : null}
                        <Button size="sm" icon={ChevronLeft} disabled={selectedIndex < 0 || selectedIndex >= lessons.length - 1} onClick={() => goRelative(1)}>الدرس التالي</Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid gap-1.5">
                    <h2 className="font-display text-[19px] font-semibold text-ink">{course.title}</h2>
                    <p className="text-[12px] leading-6 text-muted">{course.shortDescription || course.description || 'اختر درساً من محتوى الكورس لتبدأ.'}</p>
                  </div>
                )}
              </div>
            </Card>

            {selected && !selected.locked && (selected.materials || []).length > 0 ? (
              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-display text-[14px] font-semibold text-ink">مواد الدرس</h3>
                  <span className="text-[10.5px] text-muted">{selected.materials.length} مادة</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selected.materials.map((item) => {
                    const Icon = lessonIcon(item.kind);
                    return (
                      <button key={item.id} type="button" disabled={materialBusy} onClick={() => openMaterial(item)}
                        className="flex items-center gap-2 rounded-xl border border-line bg-surface-soft px-3 py-2.5 text-right transition hover:border-primary/40 hover:bg-primary-soft/40">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-primary"><Icon size={15} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-bold text-ink">{item.title}</span>
                          <span className="text-[10.5px] text-muted">{item.kind === 'Pdf' ? 'ملف PDF' : item.kind === 'Video' ? 'فيديو' : item.kind === 'Audio' ? 'صوت' : item.kind === 'Image' ? 'صورة' : 'ملف'}</span>
                        </span>
                        {item.locked ? <Lock size={13} className="text-subtle" /> : <Play size={13} className="text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </Card>
            ) : null}
          </div>

          <Card className="h-fit overflow-hidden lg:sticky lg:top-4">
            <div className="grid gap-2 border-b border-line bg-surface-soft p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-[14px] font-semibold text-ink">محتوى الكورس</h3>
                <span className="text-[10.5px] font-bold text-muted">{formatNumber(lessons.length)} درس</span>
              </div>
              <div className="flex items-center justify-between text-[10.5px] font-bold text-muted"><span>تقدمك</span><span>{progressPercent}%</span></div>
              <ProgressBar value={progressPercent} tone={progressPercent >= 100 ? 'emerald' : 'primary'} />
            </div>
            <div className="max-h-[65vh] overflow-y-auto p-2">
              {(detail.units || []).map((unit) => {
                const expanded = openUnits[unit.id] !== false;
                return (
                  <div key={unit.id} className="mb-1.5">
                    <button type="button" onClick={() => setOpenUnits((prev) => ({ ...prev, [unit.id]: !expanded }))}
                      className="flex w-full items-center justify-between gap-2 rounded-xl bg-surface-soft px-3 py-2.5 text-right">
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-bold text-ink">{unit.title}</span>
                        <span className="text-[10px] text-muted">{formatNumber((unit.lessons || []).length)} درس</span>
                      </span>
                      <ChevronDown size={15} className={cn('shrink-0 text-muted transition', expanded && 'rotate-180')} />
                    </button>
                    <AnimatePresence initial={false}>
                      {expanded ? (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="grid gap-1 py-1.5">
                            {(unit.lessons || []).map((lesson, index) => {
                              const active = lesson.id === selectedLessonId;
                              return (
                                <button key={lesson.id} type="button" onClick={() => selectLesson(lesson)}
                                  className={cn('flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-right transition',
                                    active ? 'border-primary/30 bg-primary-soft' : 'border-transparent hover:bg-surface-soft')}>
                                  <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-extrabold',
                                    active ? 'bg-primary text-white' : lesson.completed ? 'bg-emerald-soft text-emerald' : 'bg-surface-soft text-muted')}>
                                    {lesson.completed ? <CheckCircle2 size={13} /> : lesson.locked ? <Lock size={11} /> : index + 1}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className={cn('block truncate text-[11.5px] font-bold', active ? 'text-primary' : 'text-ink')}>{lesson.title}</span>
                                    <span className="text-[10px] text-muted">{formatDuration(lesson.durationMinutes)}{lesson.isFreePreview ? ' · معاينة مجانية' : ''}</span>
                                  </span>
                                  {!lesson.locked && !lesson.completed ? <Play size={12} className="shrink-0 text-primary" /> : null}
                                </button>
                              );
                            })}
                            {(unit.lessons || []).length === 0 ? <p className="py-3 text-center text-[11px] text-muted">لا توجد دروس في هذه الوحدة بعد.</p> : null}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {material ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[11.5px]">
            <span className="font-bold text-ink">{material.title}</span>
            <div className="flex gap-2">
              {material.downloadable ? (
                <Button size="xs" variant="secondary" icon={Download} onClick={async () => {
                  try {
                    const blob = await request(material.resolvedUrl, { token });
                    if (blob instanceof Blob) downloadBlob(blob, material.title || 'material');
                    else window.open(material.resolvedUrl, '_blank');
                  } catch { window.open(material.resolvedUrl, '_blank'); }
                }}>تنزيل</Button>
              ) : null}
              <a href={material.resolvedUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[11px] font-bold text-primary">فتح خارجي <ExternalLink size={12} /></a>
            </div>
          </div>
        ) : null}
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
        <StatCard icon={Layers} label="اشتراكات نشطة" value={formatNumber(items.filter((x) => !x.accessViaGroup).length)} tone="warning" />
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
            <Card key={course.id} hover className="group flex flex-col overflow-hidden">
              <div className="relative h-40 bg-gradient-to-br from-primary/20 via-primary-soft to-blue-soft">
                {course.coverUrl ? <img src={assetUrl(course.coverUrl)} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" /> : <div className="grid h-full place-items-center text-primary"><BookOpen size={30} /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
                <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {course.accessViaGroup ? <Badge tone="blue">ضمن مجموعتك</Badge> : null}
                    {course.isFree ? <Badge tone="emerald">مجاني</Badge> : null}
                  </div>
                  {course.expiresAtUtc ? <span className="rounded-lg bg-black/45 px-2 py-1 text-[9.5px] font-bold text-white">ينتهي {new Date(course.expiresAtUtc).toLocaleDateString('ar-EG')}</span> : null}
                </div>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="line-clamp-2 text-[14px] font-bold leading-6 text-ink">{course.title}</h3>
                <p className="mt-0.5 text-[10.5px] text-muted">{course.teacherName} · {course.subject || 'عام'}</p>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[10.5px] text-muted"><span>{formatNumber(course.completedLessons || 0)} / {formatNumber(course.totalLessons || 0)} درس</span><span>{course.progressPercent || 0}%</span></div>
                  <ProgressBar value={course.progressPercent || 0} tone={course.progressPercent >= 100 ? 'emerald' : 'primary'} />
                </div>
                <Button size="sm" className="mt-3" icon={Play} onClick={() => setActiveId(course.id)}>{course.progressPercent > 0 ? 'متابعة التعلم' : 'ابدأ التعلم'}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {detailLoading && activeId ? <div className="fixed inset-0 z-40 grid place-items-center bg-[rgba(3,7,18,.3)]"><Skeleton className="size-14 rounded-full" /></div> : null}
    </div>
  );
}
