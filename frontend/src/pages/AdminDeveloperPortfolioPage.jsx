import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  FileText,
  FolderKanban,
  Layers,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Skeleton, Textarea, cn } from '../components/ui';
import ImageUploader from '../components/ImageUploader';
import { request } from '../lib/api';
import { formatDate } from '../lib/format';
import { clonePortfolio, mergePortfolio } from '../developerPortfolio';

const TABS = [
  { value: 'profile', label: 'الملف والشخصية', icon: UserRound },
  { value: 'texts', label: 'نصوص الصفحة', icon: FileText },
  { value: 'projects', label: 'المشاريع', icon: FolderKanban },
  { value: 'services', label: 'الخدمات والخطوات', icon: Sparkles },
  { value: 'stack', label: 'التقنيات', icon: Layers },
];

const LAYOUTS = [
  { value: 'featured', label: 'مشروع مميز (كبير)' },
  { value: 'standard', label: 'مشروع عادي' },
  { value: 'wide', label: 'عريض بعرض الصفحة' },
];

const ICON_OPTIONS = [
  { value: 'code', label: 'كود / تطوير' },
  { value: 'workflow', label: 'نظام إداري' },
  { value: 'briefcase', label: 'أعمال ومتاجر' },
  { value: 'rocket', label: 'إطلاق وBack-end' },
  { value: 'database', label: 'قواعد بيانات' },
  { value: 'sparkles', label: 'ذكاء اصطناعي / لمسات' },
  { value: 'mobile', label: 'موبايل' },
  { value: 'design', label: 'تصميم' },
  { value: 'globe', label: 'ويب' },
  { value: 'terminal', label: 'تيرمنال' },
  { value: 'cpu', label: 'أنظمة' },
  { value: 'braces', label: 'برمجة' },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function move(list, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
}

function bilingual(value) {
  if (value && typeof value === 'object') return { ar: value.ar || '', en: value.en || '' };
  const text = typeof value === 'string' ? value : '';
  return { ar: text, en: '' };
}

function BiInput({ label, value, onChange, hint, placeholder }) {
  const current = bilingual(value);
  return (
    <Field label={label} hint={hint}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={current.ar} onChange={(event) => onChange({ ...current, ar: event.target.value })} placeholder={placeholder || 'النص العربي'} />
        <Input value={current.en} onChange={(event) => onChange({ ...current, en: event.target.value })} placeholder="English text" dir="ltr" className="text-left" />
      </div>
    </Field>
  );
}

function BiTextarea({ label, value, onChange, hint, rows = 3 }) {
  const current = bilingual(value);
  return (
    <Field label={label} hint={hint}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Textarea rows={rows} value={current.ar} onChange={(event) => onChange({ ...current, ar: event.target.value })} placeholder="النص العربي" />
        <Textarea rows={rows} value={current.en} onChange={(event) => onChange({ ...current, en: event.target.value })} placeholder="English text" dir="ltr" className="text-left" />
      </div>
    </Field>
  );
}

function RowActions({ index, length, onMove, onRemove, removeLabel = 'حذف' }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-muted transition hover:text-primary disabled:opacity-35" aria-label="تحريك لأعلى">
        <ArrowUp size={13} />
      </button>
      <button type="button" onClick={() => onMove(1)} disabled={index === length - 1} className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-muted transition hover:text-primary disabled:opacity-35" aria-label="تحريك لأسفل">
        <ArrowDown size={13} />
      </button>
      <button type="button" onClick={onRemove} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2 text-[10.5px] font-bold text-muted transition hover:border-danger/40 hover:text-danger" aria-label={removeLabel}>
        <Trash2 size={12} />{removeLabel}
      </button>
    </div>
  );
}

function CardHead({ title, description, action }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-[13px] font-bold text-ink">{title}</h3>
        {description ? <p className="mt-0.5 text-[10.5px] leading-5 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export default function AdminDeveloperPortfolioPage({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('profile');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await request('/api/admin/developer/portfolio', { token });
      setData(result?.data ? mergePortfolio(result.data) : clonePortfolio());
      setUpdatedAt(result?.updatedAtUtc || null);
      setDirty(false);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const update = useCallback((mutator) => {
    setData((previous) => {
      const next = clone(previous);
      mutator(next);
      return next;
    });
    setDirty(true);
  }, []);

  const projects = data?.projects || [];
  const services = data?.services || [];
  const steps = data?.steps || [];
  const stack = data?.stack || [];
  const facts = data?.about?.facts || [];

  const counts = useMemo(() => ({
    projects: projects.length,
    services: services.length,
    stack: stack.length,
  }), [projects.length, services.length, stack.length]);

  async function save() {
    if (!data) return;
    const missingTitle = projects.find((project) => !project.title?.trim());
    if (missingTitle) {
      setError('كل مشروع يحتاج عنواناً قبل الحفظ.');
      setTab('projects');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/admin/developer/portfolio', {
        token,
        method: 'PUT',
        body: JSON.stringify({ data }),
      });
      setNotice(result?.message || 'تم حفظ البورتفوليو.');
      setUpdatedAt(result?.updatedAtUtc || new Date().toISOString());
      setDirty(false);
      window.setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function resetToDefaults() {
    setData(clonePortfolio());
    setDirty(true);
    setNotice('استعدت النسخة الافتراضية محلياً. اضغط «حفظ البورتفوليو» لتثبيتها على الموقع.');
    window.setTimeout(() => setNotice(''), 5000);
  }

  function openPreview() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('portfolio', '1');
      url.hash = '';
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div>
        <PageHeader eyebrow="إدارة المحتوى" title="بورتفوليو المطور" description="جارٍ تحميل بيانات البورتفوليو..." />
        <div className="grid gap-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-28 w-full" />)}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <PageHeader eyebrow="إدارة المحتوى" title="بورتفوليو المطور" />
        <Alert tone="danger" onClose={() => setError('')}>{error || 'تعذر تحميل بيانات البورتفوليو.'}</Alert>
        <Button className="mt-3" icon={RefreshCw} onClick={load}>إعادة المحاولة</Button>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="إدارة المحتوى"
        title="بورتفوليو المطور"
        description="تحكم كامل في صفحة المطور العامة: الصورة، النبذة، المشاريع، الخدمات، خطوات العمل، والتقنيات. كل ما تحفظه يظهر فوراً."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" icon={Eye} onClick={openPreview}>معاينة الصفحة</Button>
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={load} disabled={busy}>إعادة التحميل</Button>
            <Button variant="secondary" size="sm" icon={RotateCcw} onClick={resetToDefaults} disabled={busy}>النسخة الافتراضية</Button>
            <Button variant="primary" size="sm" icon={Save} loading={busy} onClick={save}>{dirty ? 'حفظ التغييرات' : 'حفظ البورتفوليو'}</Button>
          </div>
        )}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[11.5px] font-bold transition',
                tab === value
                  ? 'border-primary bg-primary text-white shadow-[0_10px_24px_-18px_var(--app-primary)]'
                  : 'border-line bg-surface text-muted hover:border-primary/40 hover:text-primary',
              )}
            >
              <Icon size={13} />{label}
              {value === 'projects' ? <span className="rounded-full bg-black/10 px-1.5 text-[9.5px] dark:bg-white/10">{counts.projects}</span> : null}
              {value === 'services' ? <span className="rounded-full bg-black/10 px-1.5 text-[9.5px] dark:bg-white/10">{counts.services}</span> : null}
              {value === 'stack' ? <span className="rounded-full bg-black/10 px-1.5 text-[9.5px] dark:bg-white/10">{counts.stack}</span> : null}
            </button>
          ))}
          <div className="ms-auto flex items-center gap-2">
            {dirty ? <Badge tone="warning">تغييرات غير محفوظة</Badge> : <Badge tone="emerald">محفوظ</Badge>}
            {updatedAt ? <span className="text-[10px] text-subtle">آخر حفظ: {formatDate(updatedAt)}</span> : null}
          </div>
        </div>
      </Card>

      {tab === 'profile' ? (
        <div className="grid gap-3">
          <Card className="p-4">
            <CardHead title="الهوية والصور" description="الاسم والصورة التي تظهر في أعلى الصفحة. الصورة المرفوعة تُحفظ على الخادم أو Cloudinary." />
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <ImageUploader
                token={token}
                value={data.profile?.avatarUrl || ''}
                label="صورة المطور"
                aspect="square"
                onChange={(value) => update((next) => { next.profile.avatarUrl = value; })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="الاسم بالعربية"><Input value={data.profile?.name || ''} onChange={(event) => update((next) => { next.profile.name = event.target.value; })} /></Field>
                <Field label="الاسم بالإنجليزية"><Input value={data.profile?.nameEn || ''} onChange={(event) => update((next) => { next.profile.nameEn = event.target.value; })} dir="ltr" className="text-left" /></Field>
                <Field label="سنوات الخبرة (تظهر في الإحصائية)"><Input value={data.profile?.experienceYears || ''} onChange={(event) => update((next) => { next.profile.experienceYears = event.target.value; })} placeholder="2+" /></Field>
                <Field label="سنة التخرج"><Input value={data.profile?.graduation || ''} onChange={(event) => update((next) => { next.profile.graduation = event.target.value; })} placeholder="2025" /></Field>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              <BiInput label="المسمى المهني" value={data.profile?.role} onChange={(value) => update((next) => { next.profile.role = value; })} />
              <BiInput label="المؤهل الدراسي" value={data.profile?.degree} onChange={(value) => update((next) => { next.profile.degree = value; })} />
              <BiInput label="الموقع" value={data.profile?.location} onChange={(value) => update((next) => { next.profile.location = value; })} />
              <BiInput label="حالة التوفر (الشريط أعلى العنوان)" value={data.profile?.availability} onChange={(value) => update((next) => { next.profile.availability = value; })} />
            </div>
          </Card>

          <Card className="p-4">
            <CardHead title="بيانات التواصل" description="تظهر في قسم «تواصل» وفي شريط الهاتف بالقائمة. اترك أي حقل فارغاً لإخفاء الرابط." />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="البريد الإلكتروني"><Input value={data.profile?.email || ''} onChange={(event) => update((next) => { next.profile.email = event.target.value; })} dir="ltr" className="text-left" /></Field>
              <Field label="رقم الهاتف"><Input value={data.profile?.phone || ''} onChange={(event) => update((next) => { next.profile.phone = event.target.value; })} dir="ltr" className="text-left" /></Field>
              <Field label="واتساب (أرقام فقط مع كود الدولة)" hint="مثال: 201159862510"><Input value={data.profile?.whatsapp || ''} onChange={(event) => update((next) => { next.profile.whatsapp = event.target.value; })} dir="ltr" className="text-left" /></Field>
              <Field label="GitHub"><Input value={data.profile?.github || ''} onChange={(event) => update((next) => { next.profile.github = event.target.value; })} dir="ltr" className="text-left" /></Field>
              <Field label="LinkedIn"><Input value={data.profile?.linkedin || ''} onChange={(event) => update((next) => { next.profile.linkedin = event.target.value; })} dir="ltr" className="text-left" /></Field>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'texts' ? (
        <div className="grid gap-3">
          <Card className="p-4">
            <CardHead title="الواجهة الأولى (Hero)" description="العنوان الرئيسي، الوصف، والتعليق أسفل الصورة." />
            <div className="grid gap-3">
              <BiInput label="السطر الأول من العنوان" value={data.hero?.headlineA} onChange={(value) => update((next) => { next.hero.headlineA = value; })} />
              <BiInput label="السطر الملون من العنوان" value={data.hero?.headlineB} onChange={(value) => update((next) => { next.hero.headlineB = value; })} />
              <BiTextarea label="الوصف التعريفي" value={data.hero?.intro} onChange={(value) => update((next) => { next.hero.intro = value; })} />
              <BiInput label="تعليق أسفل الصورة" value={data.hero?.caption} onChange={(value) => update((next) => { next.hero.caption = value; })} />
            </div>
          </Card>

          <Card className="p-4">
            <CardHead title="قسم النبذة" description="النص والمزايا القصيرة التي تظهر بجانب صورة المكتب." />
            <div className="grid gap-3">
              <BiInput label="عنوان القسم" value={data.about?.title} onChange={(value) => update((next) => { next.about.title = value; })} />
              <BiTextarea label="نص النبذة" value={data.about?.text} onChange={(value) => update((next) => { next.about.text = value; })} rows={4} />
              <BiInput label="تعليق صورة القسم" value={data.about?.caption} onChange={(value) => update((next) => { next.about.caption = value; })} />
              <ImageUploader
                token={token}
                value={data.about?.imageUrl || ''}
                label="صورة قسم النبذة"
                aspect="cover"
                onChange={(value) => update((next) => { next.about.imageUrl = value; })}
              />
            </div>
            <div className="mt-4">
              <CardHead
                title="المزايا والبيانات السريعة"
                action={<Button size="xs" variant="secondary" icon={Plus} onClick={() => update((next) => { next.about.facts = [...(next.about.facts || []), { label: { ar: '', en: '' }, value: { ar: '', en: '' } }]; })}>إضافة ميزة</Button>}
              />
              <div className="grid gap-2">
                {facts.map((fact, index) => (
                  <div key={index} className="rounded-[12px] border border-line bg-surface-soft/60 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10.5px] font-bold text-muted">ميزة {index + 1}</span>
                      <RowActions
                        index={index}
                        length={facts.length}
                        onMove={(direction) => update((next) => move(next.about.facts, index, direction))}
                        onRemove={() => update((next) => { next.about.facts.splice(index, 1); })}
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <BiInput label="العنوان" value={fact.label} onChange={(value) => update((next) => { next.about.facts[index].label = value; })} />
                      <BiInput label="القيمة" value={fact.value} onChange={(value) => update((next) => { next.about.facts[index].value = value; })} />
                    </div>
                  </div>
                ))}
                {facts.length === 0 ? <p className="rounded-[10px] border border-dashed border-line p-3 text-[11px] text-muted">لا توجد مزايا. أضف واحدة ليظهر صف البيانات أسفل النبذة.</p> : null}
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <CardHead title="عناوين الأقسام" description="عناوين قسم المشاريع وقسم الخدمات وقسم التواصل." />
            <div className="grid gap-3">
              <BiInput label="عنوان قسم المشاريع" value={data.work?.title} onChange={(value) => update((next) => { next.work.title = value; })} />
              <BiTextarea label="وصف قسم المشاريع" value={data.work?.text} onChange={(value) => update((next) => { next.work.text = value; })} rows={2} />
              <BiInput label="عنوان قسم الخدمات" value={data.how?.title} onChange={(value) => update((next) => { next.how.title = value; })} />
              <BiTextarea label="وصف قسم الخدمات" value={data.how?.text} onChange={(value) => update((next) => { next.how.text = value; })} rows={2} />
              <BiInput label="عنوان قسم التواصل" value={data.contact?.title} onChange={(value) => update((next) => { next.contact.title = value; })} />
              <BiTextarea label="نص قسم التواصل" value={data.contact?.text} onChange={(value) => update((next) => { next.contact.text = value; })} rows={2} />
              <BiTextarea label="ملاحظة أسفل نموذج التواصل" value={data.contact?.formNote} onChange={(value) => update((next) => { next.contact.formNote = value; })} rows={2} />
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'projects' ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11.5px] leading-6 text-muted">أضف أو احذف أو أعد ترتيب المشاريع. «مميز» يأخذ مساحة أكبر، و«عريض» يمتد بعرض الصفحة.</p>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => update((next) => { next.projects = [...(next.projects || []), {
              id: `project-${Date.now()}`,
              title: 'مشروع جديد',
              layout: 'standard',
              cover: 'NEW',
              imageUrl: '',
              category: { ar: 'فئة المشروع', en: 'Project category' },
              description: { ar: 'وصف مختصر للمشروع.', en: 'A short project description.' },
              alt: { ar: '', en: '' },
              tags: [],
              link: '',
              repo: '',
              year: String(new Date().getFullYear()),
            }]; })}>إضافة مشروع</Button>
          </div>

          {projects.length === 0 ? <Card className="p-6 text-center text-[12px] text-muted">لا توجد مشاريع. اضغط «إضافة مشروع» لبناء أول بطاقة.</Card> : null}

          {projects.map((project, index) => (
            <Card key={project.id || index} className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-[11px] font-bold text-primary">{index + 1}</span>
                  <div>
                    <p className="text-[12.5px] font-bold text-ink">{project.title || 'بدون عنوان'}</p>
                    <p className="text-[10px] text-subtle">{project.id || '—'}</p>
                  </div>
                </div>
                <RowActions
                  index={index}
                  length={projects.length}
                  onMove={(direction) => update((next) => move(next.projects, index, direction))}
                  onRemove={() => update((next) => { next.projects.splice(index, 1); })}
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-[230px_minmax(0,1fr)]">
                <ImageUploader
                  token={token}
                  value={project.imageUrl || ''}
                  label="صورة المشروع (اختياري)"
                  aspect="cover"
                  onChange={(value) => update((next) => { next.projects[index].imageUrl = value; })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="عنوان المشروع"><Input value={project.title || ''} onChange={(event) => update((next) => { next.projects[index].title = event.target.value; })} /></Field>
                  <Field label="ترتيب البطاقة">
                    <Select value={project.layout || 'standard'} onChange={(event) => update((next) => { next.projects[index].layout = event.target.value; })}>
                      {LAYOUTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="كلمة الغلاف عند عدم وجود صورة" hint="تظهر بخط كبير داخل بطاقة ملونة"><Input value={project.cover || ''} onChange={(event) => update((next) => { next.projects[index].cover = event.target.value; })} dir="ltr" className="text-left" /></Field>
                  <Field label="السنة"><Input value={project.year || ''} onChange={(event) => update((next) => { next.projects[index].year = event.target.value; })} dir="ltr" className="text-left" /></Field>
                  <Field label="رابط المشروع"><Input value={project.link || ''} onChange={(event) => update((next) => { next.projects[index].link = event.target.value; })} dir="ltr" className="text-left" placeholder="https://..." /></Field>
                  <Field label="رابط الكود"><Input value={project.repo || ''} onChange={(event) => update((next) => { next.projects[index].repo = event.target.value; })} dir="ltr" className="text-left" placeholder="https://github.com/..." /></Field>
                  <Field label="الوسوم" hint="افصل بينها بفاصلة" className="sm:col-span-2">
                    <Input
                      value={(project.tags || []).join(', ')}
                      onChange={(event) => update((next) => {
                        next.projects[index].tags = event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean);
                      })}
                      dir="ltr"
                      className="text-left"
                      placeholder="React, ASP.NET Core, SQL Server"
                    />
                  </Field>
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                <BiInput label="فئة المشروع" value={project.category} onChange={(value) => update((next) => { next.projects[index].category = value; })} />
                <BiTextarea label="وصف المشروع" value={project.description} onChange={(value) => update((next) => { next.projects[index].description = value; })} rows={3} />
                <BiInput label="وصف الصورة لقارئ الشاشة" value={project.alt} onChange={(value) => update((next) => { next.projects[index].alt = value; })} hint="يظهر فقط لقارئات الشاشة ومحركات البحث" />
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === 'services' ? (
        <div className="grid gap-3">
          <Card className="p-4">
            <CardHead
              title="الخدمات"
              description="البطاقات التي تشرح ما تقدمه. اختر أيقونة مناسبة لكل خدمة."
              action={<Button size="xs" variant="secondary" icon={Plus} onClick={() => update((next) => { next.services = [...(next.services || []), { icon: 'code', title: { ar: '', en: '' }, description: { ar: '', en: '' } }]; })}>إضافة خدمة</Button>}
            />
            <div className="grid gap-2">
              {services.map((service, index) => (
                <div key={index} className="rounded-[14px] border border-line bg-surface-soft/50 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10.5px] font-bold text-muted">خدمة {index + 1}</span>
                    <RowActions
                      index={index}
                      length={services.length}
                      onMove={(direction) => update((next) => move(next.services, index, direction))}
                      onRemove={() => update((next) => { next.services.splice(index, 1); })}
                    />
                  </div>
                  <div className="grid gap-3">
                    <Field label="الأيقونة">
                      <Select value={service.icon || 'code'} onChange={(event) => update((next) => { next.services[index].icon = event.target.value; })}>
                        {ICON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Select>
                    </Field>
                    <BiInput label="عنوان الخدمة" value={service.title} onChange={(value) => update((next) => { next.services[index].title = value; })} />
                    <BiTextarea label="وصف الخدمة" value={service.description} onChange={(value) => update((next) => { next.services[index].description = value; })} rows={2} />
                  </div>
                </div>
              ))}
              {services.length === 0 ? <p className="rounded-[10px] border border-dashed border-line p-3 text-[11px] text-muted">لا توجد خدمات. أضف خدمة أو اترك القسم مخفياً.</p> : null}
            </div>
          </Card>

          <Card className="p-4">
            <CardHead
              title="خطوات العمل"
              description="الخطوات التي تظهر في البطاقة الجانبية داخل قسم الخدمات."
              action={<Button size="xs" variant="secondary" icon={Plus} onClick={() => update((next) => { next.steps = [...(next.steps || []), { title: { ar: '', en: '' }, description: { ar: '', en: '' } }]; })}>إضافة خطوة</Button>}
            />
            <div className="grid gap-2">
              {steps.map((step, index) => (
                <div key={index} className="rounded-[14px] border border-line bg-surface-soft/50 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10.5px] font-bold text-muted">خطوة {index + 1}</span>
                    <RowActions
                      index={index}
                      length={steps.length}
                      onMove={(direction) => update((next) => move(next.steps, index, direction))}
                      onRemove={() => update((next) => { next.steps.splice(index, 1); })}
                    />
                  </div>
                  <div className="grid gap-3">
                    <BiInput label="عنوان الخطوة" value={step.title} onChange={(value) => update((next) => { next.steps[index].title = value; })} />
                    <BiTextarea label="وصف الخطوة" value={step.description} onChange={(value) => update((next) => { next.steps[index].description = value; })} rows={2} />
                  </div>
                </div>
              ))}
              {steps.length === 0 ? <p className="rounded-[10px] border border-dashed border-line p-3 text-[11px] text-muted">لا توجد خطوات. أضف خطوة أو اترك البطاقة مخفية.</p> : null}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'stack' ? (
        <Card className="p-4">
          <CardHead
            title="أدوات العمل"
            description="الشريط المتحرك أعلى قسم النبذة. الاسم يظهر بجانب الأيقونة، وslug هو اسم الأيقونة على Simple Icons."
            action={<Button size="xs" variant="secondary" icon={Plus} onClick={() => update((next) => { next.stack = [...(next.stack || []), { name: 'New tool', slug: 'code' }]; })}>إضافة تقنية</Button>}
          />
          <div className="grid gap-2">
            {stack.map((item, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-surface-soft/50 p-2.5">
                {item.slug ? (
                  <img
                    src={`https://cdn.simpleicons.org/${encodeURIComponent(item.slug)}/64748b`}
                    alt=""
                    width="20"
                    height="20"
                    className="size-5 shrink-0 object-contain"
                    onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
                  />
                ) : (
                  <span className="grid size-5 shrink-0 place-items-center rounded bg-primary-soft text-[8px] font-bold text-primary">{(item.name || '?').slice(0, 2)}</span>
                )}
                <Input value={item.name || ''} onChange={(event) => update((next) => { next.stack[index].name = event.target.value; })} placeholder="اسم التقنية" className="h-9 max-w-[220px] flex-1 text-[12px]" />
                <Input value={item.slug || ''} onChange={(event) => update((next) => { next.stack[index].slug = event.target.value; })} placeholder="simpleicons slug" dir="ltr" className="h-9 max-w-[200px] flex-1 text-left text-[12px]" />
                <div className="ms-auto">
                  <RowActions
                    index={index}
                    length={stack.length}
                    onMove={(direction) => update((next) => move(next.stack, index, direction))}
                    onRemove={() => update((next) => { next.stack.splice(index, 1); })}
                  />
                </div>
              </div>
            ))}
            {stack.length === 0 ? <p className="rounded-[10px] border border-dashed border-line p-3 text-[11px] text-muted">لا توجد تقنيات. أضف تقنية ليظهر شريط الأدوات.</p> : null}
          </div>
        </Card>
      ) : null}

      <div className="sticky bottom-3 z-20 mt-4">
        <Card className="flex flex-wrap items-center justify-between gap-2 p-3 shadow-lg">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            {dirty ? <Badge tone="warning">لديك تغييرات غير محفوظة</Badge> : <Badge tone="emerald">كل التغييرات محفوظة</Badge>}
            <span>اضغط «معاينة الصفحة» لرؤية النتيجة قبل النشر.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={Eye} onClick={openPreview}>معاينة</Button>
            <Button variant="primary" size="sm" icon={Save} loading={busy} onClick={save}>حفظ البورتفوليو</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
