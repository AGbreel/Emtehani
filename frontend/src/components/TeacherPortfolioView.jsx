import React from 'react';
import { motion } from 'motion/react';
import {
  Award,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarDays,
  ExternalLink,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  Quote,
  Sparkles,
  Star,
  UserRound,
  Users,
} from 'lucide-react';
import { Badge, Card } from './ui';
import { assetUrl } from '../lib/api';

function Section({ icon: Icon, title, children, delay = 0 }) {
  if (!children) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card hover className="ui-card-lift h-full p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[11px] bg-primary-soft text-primary"><Icon size={17} /></span>
          <h2 className="font-display text-[14px] font-semibold text-ink">{title}</h2>
        </div>
        <p className="whitespace-pre-line text-[13px] leading-8 text-muted">{children}</p>
      </Card>
    </motion.div>
  );
}

function StatTile({ icon: Icon, value, label, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary-soft text-primary',
    emerald: 'bg-emerald-soft text-emerald',
    warning: 'bg-warning-soft text-warning',
    blue: 'bg-blue-soft text-blue',
  };
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-[13px] border border-line bg-surface/80 px-3 py-2.5 backdrop-blur">
      <span className={`grid size-8 shrink-0 place-items-center rounded-[9px] ${tones[tone]}`}><Icon size={14} /></span>
      <div className="min-w-0">
        <strong className="ui-number block truncate text-[15px] font-bold leading-none text-ink">{value}</strong>
        <span className="mt-1 block truncate text-[10px] font-semibold text-muted">{label}</span>
      </div>
    </div>
  );
}

export default function TeacherPortfolioView({ profile, preview = false }) {
  if (!profile) return null;
  const stages = Array.isArray(profile.stages) ? profile.stages : [];
  const grades = Array.isArray(profile.grades) ? profile.grades : [];
  const links = Array.isArray(profile.socialLinks) ? profile.socialLinks : [];
  const cover = assetUrl(profile.coverUrl || '');
  const avatar = assetUrl(profile.avatarUrl || '');
  const displayName = profile.professionalName || profile.fullName || 'مدرس';
  const hasSections = [profile.bio, profile.qualifications, profile.experience, profile.teachingStyle, profile.extraInfo].some(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-[26px] border border-line bg-surface shadow-card"
    >
      <div className="relative h-44 overflow-hidden bg-[#0d2f2a] sm:h-56">
        {cover ? (
          <motion.img
            src={cover}
            alt=""
            className="absolute inset-0 size-full object-cover"
            initial={{ scale: 1.06 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(216,178,74,.35),transparent_45%),radial-gradient(circle_at_80%_30%,rgba(52,211,153,.22),transparent_50%),linear-gradient(135deg,#0d2f2a,#081a17)]" />
            <div className="absolute inset-0 ui-grid-bg opacity-20" />
            <span className="ui-orb ui-orb--gold -right-16 -top-20 size-56 opacity-40" />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#04110f] via-[#04110f]/35 to-transparent" />

        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[10px] font-bold text-white/85 backdrop-blur">
            <Sparkles size={11} className="text-[#e2bc5c]" />
            الهوية المهنية
          </span>
          {preview ? (
            <Badge tone="warning" className="border-0 bg-[#e2bc5c] text-[#20160a]">معاينة — غير منشورة</Badge>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[10px] font-bold text-white/85 backdrop-blur">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald" />
              صفحة منشورة
            </span>
          )}
        </div>
      </div>

      <div className="relative px-4 pb-6 sm:px-7 sm:pb-8">
        <div className="-mt-12 flex flex-wrap items-end gap-4 sm:-mt-14">
          <motion.div
            initial={{ opacity: 0, scale: .9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: .1, duration: .45 }}
            className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-[24px] border-4 border-surface bg-[#0d2f2a] text-white shadow-xl sm:size-28"
          >
            {avatar ? <img src={avatar} alt={displayName} className="size-full object-cover" /> : <UserRound size={38} className="text-[#e2bc5c]" />}
            <span className="absolute bottom-1.5 left-1.5 grid size-5 place-items-center rounded-full bg-emerald text-white ring-2 ring-surface"><Star size={10} fill="currentColor" /></span>
          </motion.div>

          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[1.35rem] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[1.7rem]">{displayName}</h1>
              {profile.yearsOfExperience ? <Badge tone="emerald">{profile.yearsOfExperience} سنة خبرة</Badge> : null}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
              <span className="font-bold text-primary">{profile.specialty || 'مدرس'}</span>
              {profile.fullName ? <><span className="text-line-strong">·</span><span>{profile.fullName}</span></> : null}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {stages.map((stage) => <Badge key={stage} tone="neutral">{stage}</Badge>)}
              {grades.slice(0, 3).map((grade) => <Badge key={grade} tone="primary">{grade}</Badge>)}
              {grades.length > 3 ? <Badge tone="neutral">+{grades.length - 3}</Badge> : null}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile icon={CalendarDays} value={profile.yearsOfExperience ? `${profile.yearsOfExperience}+` : '—'} label="سنوات الخبرة" tone="warning" />
          <StatTile icon={GraduationCap} value={stages.length || '—'} label="مرحلة تعليمية" tone="primary" />
          <StatTile icon={BookOpenCheck} value={grades.length || '—'} label="صف دراسي" tone="emerald" />
          <StatTile icon={Users} value={links.length + (profile.email ? 1 : 0) + (profile.phone ? 1 : 0) || '—'} label="وسيلة تواصل" tone="blue" />
        </div>

        {hasSections || grades.length || links.length || profile.email || profile.phone ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="grid gap-3">
              <Section icon={Sparkles} title="نبذة تعريفية" delay={.02}>{profile.bio}</Section>
              <Section icon={GraduationCap} title="المؤهلات العلمية" delay={.05}>{profile.qualifications}</Section>
              <Section icon={BriefcaseBusiness} title="الخبرات التعليمية" delay={.08}>{profile.experience}</Section>
              <Section icon={BookOpenCheck} title="أسلوب التدريس" delay={.11}>{profile.teachingStyle}</Section>
              <Section icon={Award} title="معلومات إضافية" delay={.14}>{profile.extraInfo}</Section>
            </div>

            <div className="grid content-start gap-3">
              {grades.length ? (
                <Card className="p-5">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="grid size-9 place-items-center rounded-[11px] bg-emerald-soft text-emerald"><GraduationCap size={17} /></span>
                    <h2 className="font-display text-[14px] font-semibold text-ink">المراحل والصفوف</h2>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {grades.map((grade) => <span key={grade} className="rounded-[8px] border border-line bg-surface-soft px-2.5 py-1.5 text-[10.5px] font-bold text-muted">{grade}</span>)}
                  </div>
                </Card>
              ) : null}

              {stages.length ? (
                <Card className="p-5">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="grid size-9 place-items-center rounded-[11px] bg-primary-soft text-primary"><MapPin size={17} /></span>
                    <h2 className="font-display text-[14px] font-semibold text-ink">المراحل التعليمية</h2>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {stages.map((stage) => <Badge key={stage} tone="primary">{stage}</Badge>)}
                  </div>
                </Card>
              ) : null}

              {(links.length > 0 || profile.email || profile.phone) ? (
                <Card className="p-5">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="grid size-9 place-items-center rounded-[11px] bg-warning-soft text-warning"><Mail size={17} /></span>
                    <h2 className="font-display text-[14px] font-semibold text-ink">تواصل مع المدرس</h2>
                  </div>
                  <div className="grid gap-2">
                    {profile.email ? (
                      <a href={`mailto:${profile.email}`} className="flex min-h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[11.5px] font-bold text-muted transition hover:border-primary/40 hover:text-primary"><Mail size={13} className="shrink-0" /><span className="truncate" dir="ltr">{profile.email}</span></a>
                    ) : null}
                    {profile.phone ? (
                      <a href={`tel:${profile.phone}`} className="flex min-h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[11.5px] font-bold text-muted transition hover:border-primary/40 hover:text-primary" dir="ltr"><Phone size={13} className="shrink-0" /><span className="truncate">{profile.phone}</span></a>
                    ) : null}
                    {links.map((link, index) => (
                      <a key={`${link.url}-${index}`} href={link.url} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[11.5px] font-bold text-muted transition hover:border-primary/40 hover:text-primary">
                        <ExternalLink size={13} className="shrink-0" />
                        <span className="truncate">{link.label || 'رابط'}</span>
                      </a>
                    ))}
                  </div>
                </Card>
              ) : null}

              <div className="relative overflow-hidden rounded-[20px] border border-[#d8b24a]/30 bg-[#0d2f2a] p-5 text-white">
                <span className="pointer-events-none absolute -left-8 -top-10 size-28 rounded-full bg-[#d8b24a]/25 blur-3xl" />
                <Quote size={22} className="text-[#e2bc5c]" />
                <p className="mt-2 text-[13px] leading-7 text-white/85">التعليم الجيد يبدأ من مدرس واضح في هدفه، قريب من طلابه.</p>
                <p className="mt-3 text-[10.5px] font-bold text-[#e2bc5c]">منصة امتحاني · EMTEHANI</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-[18px] border border-dashed border-line-strong bg-surface-soft/60 p-6 text-center">
            <Sparkles size={22} className="mx-auto text-primary" />
            <p className="mt-2 text-[13px] font-bold text-ink">الهوية المهنية قيد الإعداد</p>
            <p className="mt-1 text-[11.5px] leading-6 text-muted">سيظهر هنا وصف المدرس وخبراته ووسائل التواصل بعد اكتمال البيانات.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
