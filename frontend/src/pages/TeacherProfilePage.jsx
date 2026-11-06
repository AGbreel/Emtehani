import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  Circle,
  Eye,
  Globe2,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  UserRound,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  ProgressBar,
  Skeleton,
  cn,
} from '../components/ui';
import ImageUploader from '../components/ImageUploader';
import TeacherPortfolioView from '../components/TeacherPortfolioView';
import { request } from '../lib/api';
import { EDUCATION_STAGES, gradesForStage } from '../lib/education';
import { normalizeDisplayName } from '../lib/validation';

const emptyForm = {
  professionalName: '',
  specialty: '',
  bio: '',
  qualifications: '',
  experience: '',
  yearsOfExperience: '',
  teachingStyle: '',
  extraInfo: '',
  avatarUrl: '',
  coverUrl: '',
  contactPhone: '',
  stages: [],
  grades: [],
  socialLinks: [],
  showEmail: false,
  showPhone: false,
  publicSlug: '',
};

function mapProfile(profile) {
  if (!profile) return { ...emptyForm };
  return {
    professionalName: profile.professionalName || '',
    specialty: profile.specialty || '',
    bio: profile.bio || '',
    qualifications: profile.qualifications || '',
    experience: profile.experience || '',
    yearsOfExperience: profile.yearsOfExperience ?? '',
    teachingStyle: profile.teachingStyle || '',
    extraInfo: profile.extraInfo || '',
    avatarUrl: profile.avatarUrl || '',
    coverUrl: profile.coverUrl || '',
    contactPhone: profile.contactPhone || '',
    stages: Array.isArray(profile.stages) ? profile.stages : [],
    grades: Array.isArray(profile.grades) ? profile.grades : [],
    socialLinks: Array.isArray(profile.socialLinks) ? profile.socialLinks : [],
    showEmail: Boolean(profile.showEmail),
    showPhone: Boolean(profile.showPhone),
    publicSlug: profile.publicSlug || '',
  };
}

function isSafeImageUrl(value) {
  if (!value) return true;
  if (value.startsWith('/uploads/')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function SectionCard({ icon: Icon, title, description, children, className = '' }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className={className}>
      <Card className="relative overflow-hidden p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-primary-soft text-primary"><Icon size={17} /></span>
          <div>
            <h2 className="font-display text-[14px] font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-[11px] leading-5 text-muted">{description}</p> : null}
          </div>
        </div>
        {children}
      </Card>
    </motion.div>
  );
}

export default function TeacherProfilePage({ token }) {
  const [form, setForm] = useState({ ...emptyForm });
  const [teacher, setTeacher] = useState(null);
  const [status, setStatus] = useState('Draft');
  const [publicSlug, setPublicSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request('/api/teacher/profile', { token });
      setTeacher(data?.teacher || null);
      setForm(mapProfile(data?.profile));
      setStatus(data?.profile?.status || 'Draft');
      setPublicSlug(data?.profile?.publicSlug || data?.suggestedSlug || '');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function setImage(field) {
    return (value) => setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleStage(stage) {
    setForm((current) => {
      const selected = current.stages.includes(stage);
      const stages = selected ? current.stages.filter((item) => item !== stage) : [...current.stages, stage];
      const allowed = new Set(stages.flatMap((item) => gradesForStage(item)));
      return { ...current, stages, grades: current.grades.filter((grade) => allowed.has(grade)) };
    });
  }

  function toggleGrade(grade) {
    setForm((current) => ({
      ...current,
      grades: current.grades.includes(grade)
        ? current.grades.filter((item) => item !== grade)
        : [...current.grades, grade],
    }));
  }

  function updateLink(index, field, value) {
    setForm((current) => ({
      ...current,
      socialLinks: current.socialLinks.map((link, i) => (i === index ? { ...link, [field]: value } : link)),
    }));
  }

  function addLink() {
    setForm((current) => current.socialLinks.length >= 8 ? current : ({
      ...current,
      socialLinks: [...current.socialLinks, { label: '', url: '' }],
    }));
  }

  function removeLink(index) {
    setForm((current) => ({ ...current, socialLinks: current.socialLinks.filter((_, i) => i !== index) }));
  }

  function validate() {
    if (normalizeDisplayName(form.professionalName).length < 2) return 'أدخل الاسم المهني (حرفان على الأقل).';
    if (form.yearsOfExperience !== '' && (Number(form.yearsOfExperience) < 0 || Number(form.yearsOfExperience) > 70)) return 'سنوات الخبرة يجب أن تكون بين 0 و70.';
    if (!isSafeImageUrl(form.avatarUrl) || !isSafeImageUrl(form.coverUrl)) return 'الصورة يجب أن تكون مرفوعة من الجهاز أو رابط HTTPS آمن.';
    if (form.publicSlug && !/^[a-z0-9](?:[a-z0-9-]{1,62})[a-z0-9]$/.test(form.publicSlug)) return 'الرابط العام يقبل الحروف الإنجليزية الصغيرة والأرقام والشرطة فقط (3-64 حرفاً).';
    for (const link of form.socialLinks) {
      if (!link.label?.trim() || !isHttpsUrl(link.url)) return 'راجع اسم ورابط كل وسيلة تواصل.';
    }
    return '';
  }

  function payload() {
    return {
      professionalName: normalizeDisplayName(form.professionalName),
      specialty: normalizeDisplayName(form.specialty),
      bio: form.bio.trim(),
      qualifications: form.qualifications.trim(),
      experience: form.experience.trim(),
      yearsOfExperience: form.yearsOfExperience === '' ? null : Number(form.yearsOfExperience),
      teachingStyle: form.teachingStyle.trim(),
      extraInfo: form.extraInfo.trim(),
      avatarUrl: form.avatarUrl.trim(),
      coverUrl: form.coverUrl.trim(),
      contactPhone: form.contactPhone.trim(),
      stages: form.stages,
      grades: form.grades,
      socialLinks: form.socialLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
      showEmail: form.showEmail,
      showPhone: form.showPhone,
      publicSlug: form.publicSlug.trim().toLowerCase(),
    };
  }

  async function save(silent = false) {
    const validation = validate();
    if (validation) {
      if (!silent) setError(validation);
      return false;
    }
    setSaving(true);
    setError('');
    if (!silent) setNotice('');
    try {
      const result = await request('/api/teacher/profile', { token, method: 'PUT', body: JSON.stringify(payload()) });
      setPublicSlug(result?.publicSlug || form.publicSlug);
      setForm((current) => ({ ...current, publicSlug: result?.publicSlug || current.publicSlug }));
      if (!silent) setNotice(result?.message || 'تم حفظ الصفحة التعريفية.');
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    const saved = await save(true);
    if (!saved) return;
    setPublishing(true);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/teacher/profile/publish', { token, method: 'POST' });
      setStatus(result?.status || 'Published');
      setNotice(result?.message || 'تم نشر الصفحة التعريفية.');
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  async function unpublish() {
    setPublishing(true);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/teacher/profile/unpublish', { token, method: 'POST' });
      setStatus(result?.status || 'Draft');
      setNotice(result?.message || 'تم إخفاء الصفحة التعريفية.');
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  async function copyLink() {
    const path = publicSlug ? `/t/${publicSlug}` : '';
    if (!path) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setNotice('تم نسخ رابط الصفحة التعريفية.');
    } catch {
      setError('تعذر نسخ الرابط. يمكنك نسخه يدوياً من الحقل.');
    }
  }

  const availableGrades = useMemo(
    () => form.stages.flatMap((stage) => gradesForStage(stage)),
    [form.stages],
  );

  const previewProfile = useMemo(() => ({
    ...form,
    fullName: teacher?.fullName || '',
    email: form.showEmail ? teacher?.email : null,
    phone: form.showPhone ? (form.contactPhone || teacher?.studentPhone) : null,
    yearsOfExperience: form.yearsOfExperience === '' ? null : Number(form.yearsOfExperience),
  }), [form, teacher]);

  const completion = useMemo(() => {
    const checks = [
      { label: 'الاسم المهني', done: normalizeDisplayName(form.professionalName).length >= 2 },
      { label: 'التخصص', done: Boolean(form.specialty.trim()) },
      { label: 'الصورة الشخصية', done: Boolean(form.avatarUrl) },
      { label: 'صورة الغلاف', done: Boolean(form.coverUrl) },
      { label: 'نبذة تعريفية', done: Boolean(form.bio.trim()) },
      { label: 'المؤهلات', done: Boolean(form.qualifications.trim()) },
      { label: 'الخبرات', done: Boolean(form.experience.trim()) },
      { label: 'المراحل الدراسية', done: form.stages.length > 0 },
      { label: 'وسيلة تواصل', done: form.socialLinks.length > 0 || Boolean(form.contactPhone) || form.showEmail || form.showPhone },
    ];
    const done = checks.filter((item) => item.done).length;
    return { checks, done, total: checks.length, percent: Math.round((done / checks.length) * 100) };
  }, [form]);

  return (
    <div className="relative">
      <PageHeader
        eyebrow="الهوية المهنية"
        title="صفحة المدرس العامة"
        description="ابنِ هوية مهنية مقنعة: صور مرفوعة من جهازك، نبذة واضحة، خبرات موثقة، ووسائل تواصل تختار إظهارها. الصفحة تبقى مسودة حتى تنشرها."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={loading} onClick={load}>تحديث</Button>
            <Button variant="secondary" size="sm" icon={Eye} onClick={() => setPreview((value) => !value)}>{preview ? 'إخفاء المعاينة' : 'معاينة الصفحة'}</Button>
            {status === 'Published' ? (
              <Button variant="ghost" size="sm" icon={Undo2} loading={publishing} onClick={unpublish}>إلغاء النشر</Button>
            ) : (
              <Button size="sm" icon={Send} loading={publishing} onClick={publish}>نشر الصفحة</Button>
            )}
            <Button size="sm" icon={Save} loading={saving} onClick={() => save(false)}>حفظ</Button>
          </div>
        )}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={status === 'Published' ? 'emerald' : 'warning'}>{status === 'Published' ? 'منشورة للطلاب' : 'مسودة — تظهر لك فقط'}</Badge>
        {teacher ? <span className="text-[11px] text-muted">{teacher.fullName}</span> : null}
        {publicSlug ? (
          <button type="button" onClick={copyLink} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[10.5px] font-bold text-muted transition hover:text-primary">
            <Link2 size={12} />/t/{publicSlug}
          </button>
        ) : null}
      </div>

      <Card className="relative mb-4 overflow-hidden p-4 sm:p-5">
        <span className="ui-orb ui-orb--primary -left-16 -top-20 size-44 opacity-30" />
        <div className="relative grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex items-center gap-3">
            <div className="relative grid size-16 place-items-center">
              <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden="true">
                <circle cx="22" cy="22" r="19" fill="none" stroke="currentColor" strokeWidth="3" className="text-surface-soft" />
                <motion.circle
                  cx="22" cy="22" r="19" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                  className="text-primary"
                  strokeDasharray={2 * Math.PI * 19}
                  initial={{ strokeDashoffset: 2 * Math.PI * 19 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 19 * (1 - completion.percent / 100) }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </svg>
              <span className="ui-number text-[15px] font-bold text-ink">{completion.percent}%</span>
            </div>
            <div>
              <p className="text-[13px] font-bold text-ink">اكتمال الهوية المهنية</p>
              <p className="text-[10.5px] text-muted">{completion.done} من {completion.total} عناصر مكتملة</p>
            </div>
          </div>
          <div>
            <ProgressBar value={completion.percent} className="h-2" tone={completion.percent === 100 ? 'emerald' : 'primary'} />
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {completion.checks.map((item) => (
                <span key={item.label} className={cn('inline-flex items-center gap-1 text-[10px] font-bold', item.done ? 'text-emerald' : 'text-subtle')}>
                  {item.done ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>
      ) : preview ? (
        <TeacherPortfolioView profile={previewProfile} preview={status !== 'Published'} />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,390px)]">
          <div className="grid gap-4">
            <SectionCard icon={UserRound} title="الهوية والصور" description="ارفع صورك من جهازك مباشرة — تُحفظ على خادم المنصة وتظهر في صفحتك العامة.">
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <ImageUploader token={token} value={form.avatarUrl} onChange={setImage('avatarUrl')} label="الصورة الشخصية" hint="صورة مربعة واضحة، يُفضّل 800×800." aspect="square" />
                <ImageUploader token={token} value={form.coverUrl} onChange={setImage('coverUrl')} label="صورة الغلاف" hint="صورة عريضة تُظهر تخصصك أو مقر دراستك." aspect="cover" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="الاسم المهني" id="tp-professional" hint="الاسم الذي يظهر في صفحتك العامة.">
                  <Input id="tp-professional" maxLength={160} value={form.professionalName} onChange={update('professionalName')} placeholder="مثال: أ. أحمد جبريل" />
                </Field>
                <Field label="التخصص / المادة" id="tp-specialty">
                  <Input id="tp-specialty" maxLength={160} value={form.specialty} onChange={update('specialty')} placeholder="مثال: الرياضيات — الثانوية العامة" />
                </Field>
                <Field label="سنوات الخبرة" id="tp-years">
                  <Input id="tp-years" type="number" min={0} max={70} value={form.yearsOfExperience} onChange={update('yearsOfExperience')} placeholder="مثال: 8" />
                </Field>
                <Field label="رقم التواصل (اختياري)" id="tp-contact-phone" hint="يظهر للطلاب فقط عند تفعيل إظهار الهاتف.">
                  <Input id="tp-contact-phone" dir="ltr" inputMode="tel" maxLength={20} value={form.contactPhone} onChange={update('contactPhone')} placeholder="01xxxxxxxxx" className="text-left" />
                </Field>
                <Field label="الرابط العام للصفحة" id="tp-slug" hint={`يظهر كـ ${window.location.origin}/t/${form.publicSlug || '...'}`} className="sm:col-span-2">
                  <Input id="tp-slug" dir="ltr" maxLength={64} value={form.publicSlug} onChange={(event) => setForm((current) => ({ ...current, publicSlug: event.target.value.toLowerCase() }))} placeholder="ahmed-math" className="text-left" />
                </Field>
              </div>
            </SectionCard>

            <SectionCard icon={Globe2} title="نبذتك وخبراتك" description="اكتب بلغة واضحة وقريبة من الطالب. يمكنك ترك أي حقل فارغاً.">
              <div className="grid gap-3">
                <Field label="نبذة تعريفية" id="tp-bio">
                  <textarea id="tp-bio" value={form.bio} onChange={update('bio')} maxLength={2000} rows={4} className="w-full rounded-[11px] border border-line bg-surface px-3 py-2.5 text-[12.5px] leading-6 text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft" placeholder="من أنت؟ وما الذي يميز تجربتك التعليمية؟" />
                </Field>
                <Field label="المؤهلات العلمية" id="tp-qualifications">
                  <textarea id="tp-qualifications" value={form.qualifications} onChange={update('qualifications')} maxLength={2000} rows={3} className="w-full rounded-[11px] border border-line bg-surface px-3 py-2.5 text-[12.5px] leading-6 text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft" placeholder="مثال: بكالوريوس علوم — جامعة القاهرة، دبلوم تربوي..." />
                </Field>
                <Field label="الخبرات التعليمية" id="tp-experience">
                  <textarea id="tp-experience" value={form.experience} onChange={update('experience')} maxLength={2000} rows={3} className="w-full rounded-[11px] border border-line bg-surface px-3 py-2.5 text-[12.5px] leading-6 text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft" placeholder="أماكن العمل السابقة، عدد السنوات، أو إنجازات طلابك." />
                </Field>
                <Field label="أسلوبك في التدريس" id="tp-style">
                  <textarea id="tp-style" value={form.teachingStyle} onChange={update('teachingStyle')} maxLength={2000} rows={3} className="w-full rounded-[11px] border border-line bg-surface px-3 py-2.5 text-[12.5px] leading-6 text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft" placeholder="كيف تشرح؟ وكيف تتابع تقدم الطالب؟" />
                </Field>
                <Field label="معلومات إضافية" id="tp-extra">
                  <textarea id="tp-extra" value={form.extraInfo} onChange={update('extraInfo')} maxLength={2000} rows={2} className="w-full rounded-[11px] border border-line bg-surface px-3 py-2.5 text-[12.5px] leading-6 text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft" placeholder="أي شيء آخر تريد أن يعرفه الطالب." />
                </Field>
              </div>
            </SectionCard>

            <SectionCard icon={Sparkles} title="المراحل والصفوف التي تدرسها">
              <div className="flex flex-wrap gap-1.5">
                {EDUCATION_STAGES.map((stage) => (
                  <button key={stage} type="button" onClick={() => toggleStage(stage)} aria-pressed={form.stages.includes(stage)} className={cn('min-h-9 rounded-lg border px-3 text-[11.5px] font-bold transition', form.stages.includes(stage) ? 'border-primary bg-primary-soft text-primary shadow-sm' : 'border-line bg-surface text-muted hover:border-line-strong')}>{stage}</button>
                ))}
              </div>
              {availableGrades.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {availableGrades.map((grade) => (
                    <button key={grade} type="button" onClick={() => toggleGrade(grade)} aria-pressed={form.grades.includes(grade)} className={cn('min-h-8 rounded-lg border px-2.5 text-[10.5px] font-bold transition', form.grades.includes(grade) ? 'border-emerald bg-emerald-soft text-emerald' : 'border-line bg-surface text-muted hover:border-line-strong')}>{grade}</button>
                  ))}
                </div>
              ) : null}
            </SectionCard>

            <SectionCard icon={Link2} title="وسائل التواصل" description="أضف ما تريد إظهاره فقط، وستظهر كأزرار أنيقة في صفحتك.">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted">{form.socialLinks.length} من 8 روابط</span>
                <Button size="xs" variant="secondary" icon={Plus} onClick={addLink} disabled={form.socialLinks.length >= 8}>إضافة رابط</Button>
              </div>
              {form.socialLinks.length === 0 ? <p className="rounded-[10px] bg-surface-soft p-3 text-center text-[11.5px] text-muted">لم تضف أي وسيلة تواصل بعد.</p> : (
                <div className="grid gap-2">
                  {form.socialLinks.map((link, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                      <Input aria-label={`اسم الرابط ${index + 1}`} maxLength={40} value={link.label} onChange={(event) => updateLink(index, 'label', event.target.value)} placeholder="مثال: يوتيوب" />
                      <Input aria-label={`رابط التواصل ${index + 1}`} dir="ltr" maxLength={500} value={link.url} onChange={(event) => updateLink(index, 'url', event.target.value)} placeholder="https://..." className="text-left" />
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeLink(index)} aria-label="حذف الرابط" />
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
                <label className="flex min-h-10 items-center gap-2 rounded-lg border border-line bg-surface-soft px-3 text-[11.5px] font-bold text-muted">
                  <input type="checkbox" checked={form.showEmail} onChange={(event) => setForm((current) => ({ ...current, showEmail: event.target.checked }))} />
                  إظهار البريد الإلكتروني
                </label>
                <label className="flex min-h-10 items-center gap-2 rounded-lg border border-line bg-surface-soft px-3 text-[11.5px] font-bold text-muted">
                  <input type="checkbox" checked={form.showPhone} onChange={(event) => setForm((current) => ({ ...current, showPhone: event.target.checked }))} />
                  إظهار رقم الهاتف
                </label>
              </div>
              <p className="mt-2 text-[10.5px] leading-5 text-subtle">البريد والهاتف مخفيان افتراضياً. لا يظهران للطلاب إلا إذا فعّلت الخيار صراحةً.</p>
            </SectionCard>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-line bg-surface-soft p-3">
              <p className="text-[10.5px] leading-5 text-subtle">الحفظ يحفظ المسودة فقط. النشر يظهر الصفحة للطلاب. يمكنك المعاينة قبل النشر.</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" icon={Eye} onClick={() => setPreview(true)}>معاينة</Button>
                <Button size="sm" icon={Save} loading={saving} onClick={() => save(false)}>حفظ</Button>
              </div>
            </div>
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-24 grid gap-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-[11.5px] font-bold text-ink">معاينة مباشرة</p>
                <span className="text-[10px] text-subtle">تتحدث مع الكتابة</span>
              </div>
              <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto ui-scrollbar-thin rounded-[22px]">
                <TeacherPortfolioView profile={previewProfile} preview={status !== 'Published'} />
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
