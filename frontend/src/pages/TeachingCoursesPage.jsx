import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive, BookOpen, CheckCircle2, ChevronDown, Eye, FileText, Film, FolderPlus,
  Image as ImageIcon, Layers, Link2, LoaderCircle, Music, Pencil, PlayCircle,
  Plus, RefreshCw, Search, ShieldCheck, Sparkles, Star, Tag, Trash2, UploadCloud, Video,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal,
  PageHeader, Select, Skeleton, StatCard, Textarea, cn,
} from '../components/ui';
import ImageUploader from '../components/ImageUploader';
import MediaUploader from '../components/MediaUploader';
import { assetUrl, request } from '../lib/api';
import { EDUCATION_STAGES, SUBJECT_SUGGESTIONS, gradesForStage } from '../lib/education';
import { formatDate, formatNumber } from '../lib/format';

const statusFilters = [
  { value: '', label: 'الكل' },
  { value: 'published', label: 'منشور' },
  { value: 'draft', label: 'مسودة' },
  { value: 'archived', label: 'مؤرشف' },
];

const deliveryLabels = { Online: 'أونلاين', Offline: 'حضوري', Hybrid: 'مدمج' };
const materialKinds = [
  { value: 'Video', label: 'فيديو', icon: Film },
  { value: 'Pdf', label: 'PDF', icon: FileText },
  { value: 'Image', label: 'صورة', icon: UploadCloud },
  { value: 'Audio', label: 'صوت', icon: Music },
  { value: 'Document', label: 'مستند', icon: FileText },
  { value: 'Link', label: 'رابط', icon: Link2 },
  { value: 'Other', label: 'أخرى', icon: BookOpen },
];

const emptyCourse = {
  title: '', shortDescription: '', description: '', subject: '', stage: '', grade: '',
  coverUrl: '', introVideoUrl: '', deliveryMode: 'Online', isFree: true, price: 0, oldPrice: '',
  capacity: '', accessDays: 365, isPublished: false, isFeatured: false, publishAtUtc: '',
};

function Section({ icon: Icon, title, note, children }) {
  return (
    <section className="rounded-[16px] border border-line bg-surface-soft/40 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-[11px] bg-primary-soft text-primary"><Icon size={17} /></span>
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-ink">{title}</h3>
          {note ? <p className="text-[10.5px] leading-4 text-muted">{note}</p> : null}
        </div>
      </div>
      <div className="grid gap-3.5">{children}</div>
    </section>
  );
}

function courseReadiness(form) {
  const checks = [
    { key: 'title', label: 'عنوان واضح', ok: form.title.trim().length >= 3 },
    { key: 'subject', label: 'المادة', ok: Boolean(form.subject.trim()) },
    { key: 'grade', label: 'المرحلة والصف', ok: Boolean(form.stage) },
    { key: 'desc', label: 'وصف مختصر', ok: Boolean(form.shortDescription.trim()) },
    { key: 'cover', label: 'صورة الغلاف', ok: Boolean(form.coverUrl) },
    { key: 'price', label: 'تسعير صحيح', ok: form.isFree || Number(form.price) > 0 },
  ];
  return { checks, done: checks.filter((item) => item.ok).length, total: checks.length };
}

function discountPercent(price, oldPrice) {
  const now = Number(price) || 0;
  const before = Number(oldPrice) || 0;
  if (!now || before <= now) return 0;
  return Math.round(((before - now) / before) * 100);
}

function CoursePreview({ open, onClose, course }) {
  const c = course || emptyCourse;
  const price = Number(c.price) || 0;
  const oldPrice = Number(c.oldPrice) || 0;
  const off = discountPercent(price, oldPrice);
  const chips = [c.subject, c.grade, c.stage].filter(Boolean);
  return (
    <Modal open={open} onClose={onClose} size="xl" icon={Eye} title="معاينة الكورس كما يراها الطالب" description="هذه المعاينة تستخدم البيانات الحالية قبل الحفظ — تأكد من الشكل ثم احفظ الكورس."
      footer={<Button variant="secondary" onClick={onClose}>رجوع للتعديل</Button>}>
      <div className="py-2">
        <article className="overflow-hidden rounded-[20px] border border-line bg-surface shadow-card">
          <div className="relative h-44 bg-gradient-to-br from-primary/25 via-primary-soft to-emerald/15 sm:h-56">
            {c.coverUrl ? <img src={assetUrl(c.coverUrl)} alt="" className="size-full object-cover" /> : (
              <div className="grid size-full place-items-center">
                <div className="text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-[18px] bg-surface/80 text-primary shadow-soft backdrop-blur"><BookOpen size={26} /></span>
                  <p className="mt-2 text-[11.5px] font-bold text-ink/70">أضف صورة غلاف ليظهر الكورس بشكل أقوى</p>
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(3,7,18,.65)] via-transparent to-transparent" />
            <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={c.isFree ? 'emerald' : 'primary'} className="backdrop-blur">{c.isFree ? 'مجاني' : `${formatNumber(price)} ج.م`}</Badge>
                {c.isFeatured ? <Badge tone="warning" className="backdrop-blur"><Star size={11} />مميز</Badge> : null}
              </div>
              <Badge tone={c.isPublished ? 'emerald' : 'neutral'} className="backdrop-blur">{c.isPublished ? 'منشور' : 'مسودة'}</Badge>
            </div>
            <div className="absolute inset-x-4 bottom-4">
              <h3 className="line-clamp-2 font-display text-lg font-semibold leading-7 text-white drop-shadow sm:text-xl">{c.title.trim() || 'عنوان الكورس'}</h3>
              <p className="mt-1 text-[11.5px] font-bold text-white/80">{deliveryLabels[c.deliveryMode] || 'أونلاين'}{chips.length ? ` · ${chips.join(' · ')}` : ''}</p>
            </div>
          </div>
          <div className="grid gap-4 p-4 sm:p-5">
            <p className="text-[12.5px] leading-6 text-muted">{c.shortDescription?.trim() || c.description?.trim() || 'أضف وصفاً مختصراً يوضح للطالب ماذا سيتعلم داخل الكورس.'}</p>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => <span key={chip} className="rounded-full border border-line bg-surface-soft px-2.5 py-1 text-[10.5px] font-bold text-muted">{chip}</span>)}
              <span className="rounded-full border border-line bg-surface-soft px-2.5 py-1 text-[10.5px] font-bold text-muted">{formatNumber(c.accessDays)} يوم وصول</span>
              {c.capacity ? <span className="rounded-full border border-line bg-surface-soft px-2.5 py-1 text-[10.5px] font-bold text-muted">حتى {formatNumber(c.capacity)} طالب</span> : null}
            </div>
            <div className="flex items-end justify-between gap-3 rounded-[14px] border border-line bg-surface-soft px-4 py-3">
              <div>
                <p className="text-[10.5px] text-muted">سعر الاشتراك</p>
                <p className="mt-0.5 flex items-end gap-2">
                  <span className="font-display text-xl font-semibold text-ink">{c.isFree ? 'مجاني' : `${formatNumber(price)} ج.م`}</span>
                  {!c.isFree && off > 0 ? <span className="pb-1 text-[11px] text-subtle line-through">{formatNumber(oldPrice)} ج.م</span> : null}
                </p>
              </div>
              {!c.isFree && off > 0 ? <Badge tone="danger">خصم {off}%</Badge> : null}
              {c.introVideoUrl ? <Badge tone="blue"><PlayCircle size={11} />فيديو تعريفي</Badge> : null}
            </div>
          </div>
        </article>
        <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-subtle"><ShieldCheck size={12} />الطلاب يرون هذه البطاقة في كتالوج الكورسات، والمحتوى يُفتح بعد تأكيد الاشتراك.</p>
      </div>
    </Modal>
  );
}

function CourseForm({ open, onClose, token, course, onSaved }) {
  const [form, setForm] = useState(emptyCourse);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploads, setUploads] = useState({ cover: { busy: false, progress: 0 }, intro: { busy: false, progress: 0 } });

  useEffect(() => {
    if (!open) return;
    setError('');
    setPreviewOpen(false);
    setUploads({ cover: { busy: false, progress: 0 }, intro: { busy: false, progress: 0 } });
    setForm(course ? {
      title: course.title || '',
      shortDescription: course.shortDescription || '',
      description: course.description || '',
      subject: course.subject || '',
      stage: course.stage || '',
      grade: course.grade || '',
      coverUrl: course.coverUrl || '',
      introVideoUrl: course.introVideoUrl || '',
      deliveryMode: course.deliveryMode || 'Online',
      isFree: Boolean(course.isFree),
      price: Number(course.price) || 0,
      oldPrice: course.oldPrice ?? '',
      capacity: course.capacity ?? '',
      accessDays: course.accessDays ?? 365,
      isPublished: Boolean(course.isPublished),
      isFeatured: Boolean(course.isFeatured),
      publishAtUtc: course.publishAtUtc ? course.publishAtUtc.slice(0, 16) : '',
    } : emptyCourse);
  }, [open, course]);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const readiness = courseReadiness(form);
  const percentReady = Math.round((readiness.done / readiness.total) * 100);
  const activeUploads = Object.values(uploads).filter((state) => state.busy);
  const uploading = activeUploads.length > 0;
  const uploadProgress = uploading
    ? Math.round(activeUploads.reduce((sum, state) => sum + state.progress, 0) / activeUploads.length)
    : 100;
  const uploadLabel = [
    uploads.cover.busy ? 'صورة الغلاف' : '',
    uploads.intro.busy ? 'الفيديو التعريفي' : '',
  ].filter(Boolean).join(' + ');
  const trackUpload = (key) => (state) => setUploads((prev) => ({ ...prev, [key]: state }));
  const discount = discountPercent(form.price, form.oldPrice);

  async function save() {
    if (uploading) { setError('انتظر حتى يكتمل رفع الملفات قبل الحفظ.'); return; }
    setError('');
    if (form.title.trim().length < 3) { setError('اكتب عنوانًا للكورس (3 أحرف على الأقل).'); return; }
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        shortDescription: form.shortDescription || null,
        description: form.description || null,
        subject: form.subject || null,
        stage: form.stage || null,
        grade: form.grade || null,
        coverUrl: form.coverUrl || null,
        introVideoUrl: form.introVideoUrl || null,
        deliveryMode: form.deliveryMode,
        isFree: form.isFree,
        price: form.isFree ? 0 : Number(form.price) || 0,
        oldPrice: form.oldPrice === '' ? null : Number(form.oldPrice) || 0,
        capacity: form.capacity === '' ? null : Math.max(1, Number(form.capacity) || 0),
        accessDays: Math.max(0, Number(form.accessDays) || 0),
        isPublished: form.isPublished,
        isFeatured: form.isFeatured,
        publishAtUtc: form.publishAtUtc ? new Date(form.publishAtUtc).toISOString() : null,
      };
      const result = course
        ? await request(`/api/teaching/courses/${course.id}`, { token, method: 'PUT', body: JSON.stringify(payload) })
        : await request('/api/teaching/courses', { token, method: 'POST', body: JSON.stringify(payload) });
      onSaved?.(course ? course.id : result?.id);
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} size="xl" icon={BookOpen} title={course ? 'تعديل الكورس' : 'كورس جديد'}
        description="ابنِ كورساً احترافياً: الهوية والوسائط والتسعير ثم معاينة الشكل كما يراه الطالب."
        footer={<>
          <Button variant="ghost" onClick={onClose} disabled={busy}>إلغاء</Button>
          <Button variant="secondary" icon={Eye} onClick={() => setPreviewOpen(true)} disabled={busy}>معاينة كطالب</Button>
          <Button loading={busy} disabled={uploading} onClick={save}>
            {uploading ? `جارٍ الرفع ${uploadProgress}%` : course ? 'حفظ التعديلات' : 'إنشاء الكورس'}
          </Button>
        </>}>
        <div className="grid gap-4 py-2">
          {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}

          <div className="relative overflow-hidden rounded-[18px] border border-line bg-gradient-to-l from-primary/10 via-surface to-emerald/10 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[16px] border border-line bg-surface shadow-soft">
                {form.coverUrl ? <img src={assetUrl(form.coverUrl)} alt="" className="size-full object-cover" /> : <ImageIcon size={22} className="text-subtle" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={form.isPublished ? 'emerald' : 'warning'} dot>{form.isPublished ? 'سيُنشر بعد الحفظ' : 'مسودة'}</Badge>
                  <Badge tone="neutral">{deliveryLabels[form.deliveryMode]}</Badge>
                  {form.isFree ? <Badge tone="emerald">مجاني</Badge> : <Badge tone="primary">{formatNumber(form.price)} ج.م</Badge>}
                </div>
                <p className="mt-1.5 truncate text-[14px] font-bold text-ink">{form.title.trim() || 'كورس بدون عنوان بعد'}</p>
                <p className="truncate text-[10.5px] text-muted">{[form.subject, form.grade, form.stage].filter(Boolean).join(' · ') || 'حدد المادة والمرحلة ليظهر الكورس بشكل كامل'}</p>
              </div>
              <Button size="sm" variant="soft" icon={Eye} onClick={() => setPreviewOpen(true)} disabled={busy} className="hidden sm:inline-flex">معاينة</Button>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10.5px] font-bold">
                <span className="text-muted">جاهزية الكورس</span>
                <span className="text-primary">{readiness.done}/{readiness.total} · {percentReady}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                <motion.span className="block h-full rounded-full bg-gradient-to-l from-primary to-emerald" initial={false} animate={{ width: `${percentReady}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {readiness.checks.map((item) => (
                  <span key={item.key} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold', item.ok ? 'border-emerald/30 bg-emerald-soft text-emerald' : 'border-line bg-surface text-subtle')}>
                    {item.ok ? <CheckCircle2 size={10} /> : <span className="size-1.5 rounded-full bg-current" />}{item.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {uploading ? (
            <div className="rounded-[14px] border border-primary/25 bg-primary-soft/60 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2 text-[11.5px] font-bold text-primary">
                <span className="inline-flex items-center gap-1.5"><LoaderCircle size={13} className="animate-spin" />جارٍ رفع {uploadLabel}…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
                <motion.span className="relative block h-full overflow-hidden rounded-full bg-gradient-to-l from-primary via-emerald to-primary" initial={false} animate={{ width: `${uploadProgress}%` }} transition={{ ease: 'easeOut', duration: 0.35 }}>
                  <motion.span className="absolute inset-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,.6)_50%,transparent_75%)]" animate={{ x: ['-100%', '100%'] }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }} />
                </motion.span>
              </div>
              <p className="mt-1.5 text-[10px] text-muted">زر الحفظ مقفول تلقائياً حتى يكتمل الرفع — بياناتك في النموذج لن تضيع.</p>
            </div>
          ) : null}

          <Section icon={Sparkles} title="الهوية الأساسية" note="العنوان والتصنيف هما أول ما يراه الطالب في الكتالوج.">
            <Field label="عنوان الكورس"><Input value={form.title} onChange={set('title')} placeholder="مثال: مراجعة الرياضيات — الصف الثالث الثانوي" /></Field>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="المادة">
                <Input list="course-subject-suggestions" value={form.subject} onChange={set('subject')} placeholder="اختر أو اكتب المادة" />
                <datalist id="course-subject-suggestions">
                  {SUBJECT_SUGGESTIONS.map((subject) => <option key={subject} value={subject} />)}
                </datalist>
              </Field>
              <Field label="نمط الكورس">
                <Select value={form.deliveryMode} onChange={set('deliveryMode')}>
                  <option value="Online">أونلاين</option>
                  <option value="Offline">حضوري</option>
                  <option value="Hybrid">مدمج</option>
                </Select>
              </Field>
              <Field label="المرحلة">
                <Select value={form.stage} onChange={(event) => setForm((prev) => ({ ...prev, stage: event.target.value, grade: '' }))}>
                  <option value="">كل المراحل</option>
                  {EDUCATION_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                </Select>
              </Field>
              <Field label="الصف">
                <Select value={form.grade} onChange={set('grade')} disabled={!form.stage}>
                  <option value="">كل الصفوف</option>
                  {gradesForStage(form.stage).map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="وصف مختصر" hint="سطر أو سطران يظهران تحت العنوان في بطاقة الكورس.">
              <Input value={form.shortDescription} onChange={set('shortDescription')} maxLength={500} />
            </Field>
            <Field label="الوصف الكامل"><Textarea value={form.description} onChange={set('description')} className="min-h-24" /></Field>
          </Section>

          <Section icon={ImageIcon} title="الوسائط والعرض" note="غلاف احترافي وفيديو تعريفي يرفعان نسبة الاشتراك.">
            <ImageUploader token={token} value={form.coverUrl} onChange={(url) => setForm((prev) => ({ ...prev, coverUrl: url }))} label="صورة الغلاف" aspect="cover" onStateChange={trackUpload('cover')} />
            <MediaUploader token={token} kind="Video" value={form.introVideoUrl} onChange={(url) => setForm((prev) => ({ ...prev, introVideoUrl: url }))} label="الفيديو التعريفي (اختياري)" hint="ارفع فيديو من جهازك أو الصق رابطاً خارجياً." onStateChange={trackUpload('intro')} />
          </Section>

          <Section icon={Tag} title="التسعير والوصول" note="حدد السعر ومدة الوصول وعدد الطلاب.">
            <div className="grid gap-3.5 sm:grid-cols-3">
              <Field label="نوع الاشتراك">
                <Select value={form.isFree ? 'yes' : 'no'} onChange={(event) => setForm((prev) => ({ ...prev, isFree: event.target.value === 'yes' }))}>
                  <option value="yes">مجاني للجميع</option>
                  <option value="no">مدفوع</option>
                </Select>
              </Field>
              <Field label="السعر (ج.م)"><Input type="number" min="0" value={form.price} onChange={set('price')} disabled={form.isFree} /></Field>
              <Field label="السعر قبل الخصم"><Input type="number" min="0" value={form.oldPrice} onChange={set('oldPrice')} /></Field>
              <Field label="الحد الأقصى للطلاب"><Input type="number" min="1" value={form.capacity} onChange={set('capacity')} placeholder="بلا حد" /></Field>
              <Field label="مدة الوصول (أيام)"><Input type="number" min="0" value={form.accessDays} onChange={set('accessDays')} /></Field>
              <Field label="جدولة النشر"><Input type="datetime-local" value={form.publishAtUtc} onChange={set('publishAtUtc')} /></Field>
            </div>
            {!form.isFree && discount > 0 ? (
              <p className="flex items-center gap-1.5 rounded-[10px] border border-danger/20 bg-danger-soft px-3 py-2 text-[10.5px] font-bold text-danger"><Sparkles size={12} />سيظهر للطالب خصم {discount}% على السعر قبل الخصم.</p>
            ) : null}
          </Section>

          <Section icon={ShieldCheck} title="النشر والظهور" note="يمكنك الحفظ كمسودة وإكمال المحتوى لاحقاً.">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={cn('flex cursor-pointer items-start gap-2.5 rounded-[12px] border px-3 py-2.5 text-[11.5px] font-bold transition', form.isPublished ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-muted')}>
                <input type="checkbox" className="mt-0.5 accent-primary" checked={form.isPublished} onChange={(event) => setForm((prev) => ({ ...prev, isPublished: event.target.checked }))} />
                <span><span className="block">نشر الكورس الآن</span><span className="block text-[10px] font-normal text-muted">يظهر مباشرة في كتالوج الطلاب</span></span>
              </label>
              <label className={cn('flex cursor-pointer items-start gap-2.5 rounded-[12px] border px-3 py-2.5 text-[11.5px] font-bold transition', form.isFeatured ? 'border-warning/40 bg-warning-soft text-warning' : 'border-line bg-surface text-muted')}>
                <input type="checkbox" className="mt-0.5 accent-primary" checked={form.isFeatured} onChange={(event) => setForm((prev) => ({ ...prev, isFeatured: event.target.checked }))} />
                <span><span className="block">إبراز في الكتالوج</span><span className="block text-[10px] font-normal text-muted">بطاقة مميزة أعلى القائمة</span></span>
              </label>
            </div>
          </Section>
        </div>
      </Modal>
      <CoursePreview open={previewOpen} onClose={() => setPreviewOpen(false)} course={form} />
    </>
  );
}

function SmallForm({ open, onClose, title, icon, children, onSave, busy, error, size = 'sm' }) {
  return (
    <Modal open={open} onClose={onClose} title={title} icon={icon} size={size}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>إلغاء</Button><Button size="sm" loading={busy} onClick={onSave}>حفظ</Button></>}>
      <div className="grid gap-3 py-2">
        {error ? <Alert tone="danger" onClose={() => {}}>{error}</Alert> : null}
        {children}
      </div>
    </Modal>
  );
}

export default function TeachingCoursesPage({ token }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [previewCourse, setPreviewCourse] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [unitOpen, setUnitOpen] = useState(false);
  const [unitForm, setUnitForm] = useState({ title: '', description: '', sortOrder: 0 });
  const [lessonTarget, setLessonTarget] = useState(null);
  const [lessonForm, setLessonForm] = useState({ title: '', description: '', videoUrl: '', pdfUrl: '', durationMinutes: 0, isFreePreview: false, isPublished: true });
  const [materialTarget, setMaterialTarget] = useState(null);
  const [materialForm, setMaterialForm] = useState({ title: '', kind: 'Video', url: '', isFreePreview: false, isDownloadable: true, isPublished: true });
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const [openUnits, setOpenUnits] = useState({});

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('search', query.trim());
      if (status) params.set('status', status);
      params.set('pageSize', '60');
      const result = await request(`/api/teaching/courses?${params}`, { token });
      setItems(result?.items ?? []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, query, status]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id, quiet = false) => {
    if (!quiet) setDetailLoading(true);
    try {
      const result = await request(`/api/teaching/courses/${id}`, { token });
      setDetail(result);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  const totals = useMemo(() => ({
    courses: items.length,
    published: items.filter((x) => x.isPublished).length,
    students: items.reduce((sum, x) => sum + (x.students || 0), 0),
    lessons: items.reduce((sum, x) => sum + (x.lessons || 0), 0),
  }), [items]);

  async function togglePublish(course, publish) {
    setBusy(course.id);
    try {
      await request(`/api/teaching/courses/${course.id}/publish`, { token, method: 'POST', body: JSON.stringify({ publish }) });
      setNotice(publish ? 'تم نشر الكورس.' : 'تم إخفاء الكورس عن الطلاب.');
      await load(true);
      if (selectedId === course.id) await loadDetail(selectedId, true);
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  async function archive(course) {
    if (!window.confirm('أرشفة الكورس؟ سيُخفى عن الطلاب مع الحفاظ على بيانات الاشتراكات والنتائج.')) return;
    setBusy(course.id);
    try {
      await request(`/api/teaching/courses/${course.id}`, { token, method: 'DELETE' });
      setNotice('تم أرشفة الكورس.');
      if (selectedId === course.id) setSelectedId(null);
      await load(true);
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  async function addUnit() {
    setModalBusy(true); setModalError('');
    try {
      await request(`/api/teaching/courses/${selectedId}/units`, {
        token, method: 'POST',
        body: JSON.stringify({ title: unitForm.title, description: unitForm.description || null, sortOrder: Number(unitForm.sortOrder) || 0 }),
      });
      setUnitOpen(false);
      setUnitForm({ title: '', description: '', sortOrder: 0 });
      await loadDetail(selectedId, true);
    } catch (err) { setModalError(err.message); } finally { setModalBusy(false); }
  }

  async function addLesson() {
    if (!lessonTarget) return;
    setModalBusy(true); setModalError('');
    try {
      await request(`/api/teaching/units/${lessonTarget}/lessons`, {
        token, method: 'POST',
        body: JSON.stringify({
          title: lessonForm.title, description: lessonForm.description || null,
          videoUrl: lessonForm.videoUrl || null, pdfUrl: lessonForm.pdfUrl || null,
          durationMinutes: Number(lessonForm.durationMinutes) || 0,
          isFreePreview: lessonForm.isFreePreview, isPublished: lessonForm.isPublished, sortOrder: 0,
        }),
      });
      setLessonTarget(null);
      setLessonForm({ title: '', description: '', videoUrl: '', pdfUrl: '', durationMinutes: 0, isFreePreview: false, isPublished: true });
      await loadDetail(selectedId, true);
    } catch (err) { setModalError(err.message); } finally { setModalBusy(false); }
  }

  async function addMaterial() {
    if (!materialTarget) return;
    setModalBusy(true); setModalError('');
    try {
      await request(`/api/teaching/lessons/${materialTarget}/materials`, {
        token, method: 'POST',
        body: JSON.stringify({
          title: materialForm.title, kind: materialForm.kind, url: materialForm.url,
          isFreePreview: materialForm.isFreePreview, isDownloadable: materialForm.isDownloadable,
          isPublished: materialForm.isPublished, sortOrder: 0,
        }),
      });
      setMaterialTarget(null);
      setMaterialForm({ title: '', kind: 'Video', url: '', isFreePreview: false, isDownloadable: true, isPublished: true });
      await loadDetail(selectedId, true);
    } catch (err) { setModalError(err.message); } finally { setModalBusy(false); }
  }

  async function deleteItem(kind, id) {
    if (!window.confirm('حذف العنصر نهائيًا؟')) return;
    const url = kind === 'unit' ? `/api/teaching/units/${id}` : kind === 'lesson' ? `/api/teaching/lessons/${id}` : `/api/teaching/materials/${id}`;
    try {
      await request(url, { token, method: 'DELETE' });
      await loadDetail(selectedId, true);
    } catch (err) { setError(err.message); }
  }

  async function toggleLesson(lesson) {
    try {
      await request(`/api/teaching/lessons/${lesson.id}`, {
        token, method: 'PUT',
        body: JSON.stringify({
          title: lesson.title, description: lesson.description, videoUrl: lesson.videoUrl, pdfUrl: lesson.pdfUrl,
          durationMinutes: lesson.durationMinutes, isFreePreview: lesson.isFreePreview,
          isPublished: !lesson.isPublished, publishAtUtc: lesson.publishAtUtc, sortOrder: lesson.sortOrder,
        }),
      });
      await loadDetail(selectedId, true);
    } catch (err) { setError(err.message); }
  }

  async function toggleMaterial(material) {
    try {
      await request(`/api/teaching/materials/${material.id}`, {
        token, method: 'PUT',
        body: JSON.stringify({
          title: material.title, kind: material.kind, url: material.url, sizeBytes: material.sizeBytes,
          isFreePreview: material.isFreePreview, isDownloadable: material.isDownloadable,
          isPublished: !material.isPublished, publishAtUtc: material.publishAtUtc, sortOrder: material.sortOrder,
        }),
      });
      await loadDetail(selectedId, true);
    } catch (err) { setError(err.message); }
  }

  if (selectedId && detail) {
    const course = detail.course;
    return (
      <div>
        <Card className="mb-4 overflow-hidden">
          <div className="relative h-40 bg-gradient-to-br from-primary/30 via-primary-soft to-emerald/20 sm:h-52">
            {course.coverUrl ? <img src={assetUrl(course.coverUrl)} alt="" className="size-full object-cover" /> : null}
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(3,7,18,.74)] via-[rgba(3,7,18,.2)] to-transparent" />
            <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2 sm:inset-x-4 sm:top-4">
              <Button variant="secondary" size="sm" onClick={() => setSelectedId(null)}>كل الكورسات</Button>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="secondary" size="sm" icon={Eye} onClick={() => setPreviewCourse(course)}>معاينة كطالب</Button>
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => { setEditing(course); setFormOpen(true); }}>تعديل</Button>
                <Button size="sm" variant={course.isPublished ? 'secondary' : 'primary'} loading={busy === course.id} onClick={() => togglePublish(course, !course.isPublished)}>
                  {course.isPublished ? 'إخفاء عن الطلاب' : 'نشر الكورس'}
                </Button>
              </div>
            </div>
            <div className="absolute inset-x-4 bottom-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={course.isPublished ? 'emerald' : 'warning'} dot>{course.isArchived ? 'مؤرشف' : course.isPublished ? 'منشور' : 'مسودة'}</Badge>
                {course.isFeatured ? <Badge tone="warning"><Star size={11} />مميز</Badge> : null}
                <Badge tone="neutral" className="backdrop-blur">{deliveryLabels[course.deliveryMode] || course.deliveryMode}</Badge>
                {course.isFree ? <Badge tone="emerald">مجاني</Badge> : <Badge tone="primary">{formatNumber(course.price)} ج.م</Badge>}
              </div>
              <h1 className="mt-1.5 line-clamp-2 font-display text-xl font-semibold leading-8 text-white drop-shadow sm:text-2xl">{course.title}</h1>
              <p className="mt-0.5 text-[11.5px] font-bold text-white/80">{[course.subject, course.grade, course.stage].filter(Boolean).join(' · ') || course.shortDescription || 'وحدات ودروس ومواد الكورس.'}</p>
            </div>
          </div>
        </Card>
        {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
        {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

        <div className="ui-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={BookOpen} label="الوحدات" value={formatNumber(detail.units?.length || 0)} />
          <StatCard icon={Video} label="الدروس" value={formatNumber((detail.units || []).reduce((s, u) => s + (u.lessons?.length || 0), 0))} tone="blue" />
          <StatCard icon={UploadCloud} label="المواد" value={formatNumber((detail.units || []).reduce((s, u) => s + (u.lessons || []).reduce((n, l) => n + (l.materials?.length || 0), 0), 0))} tone="emerald" />
          <StatCard icon={Archive} label="الحالة" value={course.isArchived ? 'مؤرشف' : course.isPublished ? 'منشور' : 'مسودة'} tone={course.isPublished ? 'emerald' : 'warning'} />
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4"><p className="text-[11px] text-muted">النمط</p><p className="mt-1 text-sm font-bold">{deliveryLabels[course.deliveryMode] || course.deliveryMode}</p></Card>
          <Card className="p-4"><p className="text-[11px] text-muted">السعر</p><p className="mt-1 text-sm font-bold">{course.isFree ? 'مجاني' : `${formatNumber(course.price)} ج.م`}</p></Card>
          <Card className="p-4"><p className="text-[11px] text-muted">مدة الوصول</p><p className="mt-1 text-sm font-bold">{formatNumber(course.accessDays)} يوم</p></Card>
          <Card className="p-4"><p className="text-[11px] text-muted">آخر تحديث</p><p className="mt-1 text-sm font-bold">{formatDate(course.updatedAtUtc)}</p></Card>
        </div>

        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[14px] font-bold">الوحدات والدروس</h2>
            <Button size="sm" icon={FolderPlus} onClick={() => { setModalError(''); setUnitOpen(true); }}>وحدة جديدة</Button>
          </div>
          {detail.units?.length === 0 ? (
            <EmptyState icon={FolderPlus} title="لا توجد وحدات بعد" description="أضف أول وحدة ثم الدروس والمواد داخلها." />
          ) : (
            <div className="mt-4 grid gap-3">
              {detail.units.map((unit) => {
                const expanded = openUnits[unit.id] !== false;
                return (
                  <div key={unit.id} className="rounded-[14px] border border-line bg-surface">
                    <button type="button" onClick={() => setOpenUnits((prev) => ({ ...prev, [unit.id]: !expanded }))} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-right">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold">{unit.title}</span>
                        <span className="text-[10.5px] text-muted">{unit.lessons?.length || 0} درس</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <IconButton label="حذف الوحدة" onClick={(event) => { event.stopPropagation(); deleteItem('unit', unit.id); }}><Trash2 size={14} /></IconButton>
                        <ChevronDown size={16} className={cn('transition', expanded && 'rotate-180')} />
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {expanded ? (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="border-t border-line p-3">
                            {unit.description ? <p className="mb-2 text-[11.5px] text-muted">{unit.description}</p> : null}
                            <div className="grid gap-2">
                              {unit.lessons?.map((lesson) => (
                                <div key={lesson.id} className="rounded-[10px] border border-line bg-surface-soft p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-[12.5px] font-bold">{lesson.title}</p>
                                      <p className="text-[10.5px] text-muted">{lesson.durationMinutes || 0} دقيقة · {lesson.materials?.length || 0} مادة</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <Badge tone={lesson.isPublished ? 'emerald' : 'neutral'}>{lesson.isPublished ? 'منشور' : 'مخفي'}</Badge>
                                      {lesson.isFreePreview ? <Badge tone="blue">معاينة</Badge> : null}
                                      <IconButton label="إضافة مادة" onClick={() => { setModalError(''); setMaterialTarget(lesson.id); }}><Plus size={14} /></IconButton>
                                      <Button size="xs" variant="ghost" onClick={() => toggleLesson(lesson)}>{lesson.isPublished ? 'إخفاء' : 'نشر'}</Button>
                                      <IconButton label="حذف الدرس" onClick={() => deleteItem('lesson', lesson.id)}><Trash2 size={14} /></IconButton>
                                    </div>
                                  </div>
                                  {(lesson.materials || []).length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {lesson.materials.map((material) => (
                                        <span key={material.id} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[10.5px]">
                                          {material.title}
                                          <button type="button" onClick={() => toggleMaterial(material)} className="text-primary">{material.isPublished ? 'إخفاء' : 'نشر'}</button>
                                          <button type="button" onClick={() => deleteItem('material', material.id)} className="text-danger"><Trash2 size={11} /></button>
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                            <Button size="xs" variant="soft" icon={Plus} className="mt-2" onClick={() => { setModalError(''); setLessonTarget(unit.id); }}>درس جديد</Button>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <CourseForm open={formOpen} onClose={() => setFormOpen(false)} token={token} course={editing} onSaved={() => loadDetail(selectedId, true)} />
        <CoursePreview open={Boolean(previewCourse)} onClose={() => setPreviewCourse(null)} course={previewCourse} />
        <SmallForm open={unitOpen} onClose={() => setUnitOpen(false)} title="وحدة جديدة" icon={FolderPlus} busy={modalBusy} error={modalError} onSave={addUnit}>
          <Field label="عنوان الوحدة"><Input value={unitForm.title} onChange={(e) => setUnitForm((p) => ({ ...p, title: e.target.value }))} /></Field>
          <Field label="وصف مختصر"><Textarea value={unitForm.description} onChange={(e) => setUnitForm((p) => ({ ...p, description: e.target.value }))} className="min-h-20" /></Field>
        </SmallForm>
        <SmallForm open={Boolean(lessonTarget)} onClose={() => setLessonTarget(null)} title="درس جديد" icon={Video} busy={modalBusy} error={modalError} onSave={addLesson} size="lg">
          <Field label="عنوان الدرس"><Input value={lessonForm.title} onChange={(e) => setLessonForm((p) => ({ ...p, title: e.target.value }))} /></Field>
          <Field label="الوصف"><Textarea value={lessonForm.description} onChange={(e) => setLessonForm((p) => ({ ...p, description: e.target.value }))} className="min-h-20" /></Field>
          <MediaUploader token={token} kind="Video" value={lessonForm.videoUrl} onChange={(url) => setLessonForm((p) => ({ ...p, videoUrl: url }))} label="فيديو الدرس" hint="ارفع الفيديو من جهازك مباشرة أو استخدم رابطاً جاهزاً." />
          <MediaUploader token={token} kind="Pdf" value={lessonForm.pdfUrl} onChange={(url) => setLessonForm((p) => ({ ...p, pdfUrl: url }))} label="ملف PDF للدرس (اختياري)" />
          <Field label="المدة (دقائق)"><Input type="number" min="0" value={lessonForm.durationMinutes} onChange={(e) => setLessonForm((p) => ({ ...p, durationMinutes: e.target.value }))} /></Field>
          <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" className="accent-primary" checked={lessonForm.isFreePreview} onChange={(e) => setLessonForm((p) => ({ ...p, isFreePreview: e.target.checked }))} />معاينة مجانية</label>
        </SmallForm>
        <SmallForm open={Boolean(materialTarget)} onClose={() => setMaterialTarget(null)} title="مادة جديدة" icon={UploadCloud} busy={modalBusy} error={modalError} onSave={addMaterial} size="lg">
          <Field label="عنوان المادة"><Input value={materialForm.title} onChange={(e) => setMaterialForm((p) => ({ ...p, title: e.target.value }))} /></Field>
          <Field label="النوع">
            <Select value={materialForm.kind} onChange={(e) => setMaterialForm((p) => ({ ...p, kind: e.target.value, url: '' }))}>
              {materialKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
            </Select>
          </Field>
          {['Video', 'Audio', 'Pdf', 'Document'].includes(materialForm.kind) ? (
            <MediaUploader token={token} kind={materialForm.kind} value={materialForm.url} onChange={(url) => setMaterialForm((p) => ({ ...p, url }))} label="ملف المادة" />
          ) : materialForm.kind === 'Image' ? (
            <ImageUploader token={token} value={materialForm.url} onChange={(url) => setMaterialForm((p) => ({ ...p, url }))} label="صورة المادة" aspect="cover" />
          ) : (
            <Field label="الرابط"><Input value={materialForm.url} onChange={(e) => setMaterialForm((p) => ({ ...p, url: e.target.value }))} placeholder="https://..." /></Field>
          )}
          <div className="flex flex-wrap gap-3 text-xs font-bold">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={materialForm.isFreePreview} onChange={(e) => setMaterialForm((p) => ({ ...p, isFreePreview: e.target.checked }))} />معاينة</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={materialForm.isDownloadable} onChange={(e) => setMaterialForm((p) => ({ ...p, isDownloadable: e.target.checked }))} />قابل للتنزيل</label>
          </div>
        </SmallForm>
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="المحتوى التعليمي" title="الكورسات" description="أنشئ كورسات ووحدات ودروسًا ومواد محمية بصلاحيات الوصول."
        action={<Button icon={Plus} size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>كورس جديد</Button>} />
      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <div className="ui-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={BookOpen} label="الكورسات" value={formatNumber(totals.courses)} loading={loading} />
        <StatCard icon={Video} label="المنشور" value={formatNumber(totals.published)} tone="emerald" loading={loading} />
        <StatCard icon={UploadCloud} label="الدروس" value={formatNumber(totals.lessons)} tone="blue" loading={loading} />
        <StatCard icon={BookOpen} label="الطلاب المشتركون" value={formatNumber(totals.students)} tone="warning" loading={loading} />
      </div>

      <Card className="mb-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالعنوان أو المادة..." className="pr-9" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {statusFilters.map((filter) => (
              <button key={filter.value} type="button" onClick={() => setStatus(filter.value)}
                className={cn('rounded-lg border px-3 py-2 text-[11.5px] font-bold transition', status === filter.value ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-muted hover:text-ink')}>
                {filter.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => load(true)}>تحديث</Button>
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-card" />)}</div>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={BookOpen} title="لا توجد كورسات بعد" description="ابدأ بإنشاء كورس ثم أضف الوحدات والدروس والمواد." action={<Button icon={Plus} onClick={() => { setEditing(null); setFormOpen(true); }}>كورس جديد</Button>} /></Card>
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((course) => {
            const discount = discountPercent(course.price, course.oldPrice);
            return (
              <Card key={course.id} hover className="group flex flex-col overflow-hidden">
                <button type="button" onClick={() => setSelectedId(course.id)} className="relative block h-40 w-full overflow-hidden bg-gradient-to-br from-primary/20 via-primary-soft to-emerald/15 text-right">
                  {course.coverUrl ? (
                    <img src={assetUrl(course.coverUrl)} alt="" className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" loading="lazy" />
                  ) : (
                    <span className="grid size-full place-items-center"><span className="grid size-12 place-items-center rounded-[16px] bg-surface/80 text-primary shadow-soft backdrop-blur"><BookOpen size={22} /></span></span>
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-[rgba(3,7,18,.6)] via-transparent to-transparent" />
                  <span className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                    <Badge tone={course.isArchived ? 'danger' : course.isPublished ? 'emerald' : 'warning'} dot className="backdrop-blur">
                      {course.isArchived ? 'مؤرشف' : course.isPublished ? 'منشور' : 'مسودة'}
                    </Badge>
                    <span className="flex flex-wrap justify-end gap-1">
                      {course.isFeatured ? <Badge tone="warning" className="backdrop-blur"><Star size={10} />مميز</Badge> : null}
                      <Badge tone={course.isFree ? 'emerald' : 'primary'} className="backdrop-blur">{course.isFree ? 'مجاني' : `${formatNumber(course.price)} ج.م`}</Badge>
                    </span>
                  </span>
                  {discount > 0 ? <span className="absolute bottom-3 left-3 rounded-full bg-danger px-2 py-1 text-[10px] font-bold text-white shadow">خصم {discount}%</span> : null}
                  <span className="absolute inset-x-3 bottom-3 text-[10.5px] font-bold text-white/85">{deliveryLabels[course.deliveryMode] || course.deliveryMode}{course.grade ? ` · ${course.grade}` : ''}</span>
                </button>
                <div className="flex flex-1 flex-col p-4">
                  <button type="button" onClick={() => setSelectedId(course.id)} className="min-w-0 text-right">
                    <h3 className="truncate text-[14px] font-bold text-ink">{course.title}</h3>
                    <p className="mt-0.5 truncate text-[10.5px] text-muted">{course.subject || 'بدون مادة'}{course.stage ? ` · ${course.stage}` : ''}</p>
                  </button>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-[10px] border border-line bg-surface-soft py-2"><p className="text-[13px] font-bold">{formatNumber(course.lessons)}</p><p className="text-[10px] text-muted">درس</p></div>
                    <div className="rounded-[10px] border border-line bg-surface-soft py-2"><p className="text-[13px] font-bold">{formatNumber(course.students)}</p><p className="text-[10px] text-muted">طالب</p></div>
                    <div className="rounded-[10px] border border-line bg-surface-soft py-2"><p className="text-[13px] font-bold">{formatNumber(course.accessDays)}</p><p className="text-[10px] text-muted">يوم وصول</p></div>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3.5">
                    <Button size="xs" icon={Layers} onClick={() => setSelectedId(course.id)}>إدارة المحتوى</Button>
                    <Button size="xs" variant="secondary" icon={Eye} onClick={() => setPreviewCourse(course)}>معاينة</Button>
                    <Button size="xs" variant="secondary" icon={Pencil} onClick={() => { setEditing(course); setFormOpen(true); }}>تعديل</Button>
                    <Button size="xs" variant={course.isPublished ? 'ghost' : 'soft'} loading={busy === course.id} onClick={() => togglePublish(course, !course.isPublished)}>{course.isPublished ? 'إخفاء' : 'نشر'}</Button>
                    <Button size="xs" variant="ghost" icon={Archive} onClick={() => archive(course)}>أرشفة</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CourseForm open={formOpen} onClose={() => setFormOpen(false)} token={token} course={editing} onSaved={(id) => { load(true); if (!editing && id) setSelectedId(id); }} />
      <CoursePreview open={Boolean(previewCourse)} onClose={() => setPreviewCourse(null)} course={previewCourse} />
      {detailLoading ? <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(3,7,18,.4)]"><Skeleton className="h-16 w-16 rounded-full" /></div> : null}
    </div>
  );
}
