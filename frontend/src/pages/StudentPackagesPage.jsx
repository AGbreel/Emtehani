import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  BookOpen, CalendarDays, CheckCircle2, ChevronLeft, Clock3, Compass, GraduationCap, Layers,
  MessageCircle, Package, RefreshCw, Search, ShieldCheck, Sparkles, Timer, TrendingUp,
  Users, Wallet, XCircle,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Input, Modal, Segmented, Select, Skeleton, cn,
} from '../components/ui';
import { assetUrl, request } from '../lib/api';
import { formatNumber, formatShortDate } from '../lib/format';
import './StudentPackagesPage.css';

const kindLabels = { Course: 'باقة كورسات', Group: 'باقة مجموعات', Bundle: 'باقة شاملة', Sessions: 'باقة حصص' };
const kindIcons = { Course: BookOpen, Group: Users, Bundle: Layers, Sessions: CalendarDays };
const itemTypeLabels = { Course: 'كورس', Group: 'مجموعة' };
const deliveryLabels = { Online: 'أونلاين', Offline: 'حضوري', Hybrid: 'مدمج' };

function discountPercent(pkg) {
  const oldPrice = Number(pkg?.oldPrice);
  const price = Number(pkg?.price);
  if (!oldPrice || oldPrice <= price) return 0;
  return Math.round((1 - price / oldPrice) * 100);
}

function daysLeft(value) {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return diff <= 0 ? 0 : Math.ceil(diff / 86400000);
}

function TeacherAvatar({ name = '', url = '', className = '' }) {
  const letters = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('') || 'م';
  return (
    <span className={cn('relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white/20 text-[11px] font-extrabold text-white ring-2 ring-white/35', className)}>
      {letters}
      {url ? (
        <img
          src={assetUrl(url)}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      ) : null}
    </span>
  );
}

function StatusRibbon({ pkg }) {
  if (pkg.isEnrolled) return <span className="pkg-ribbon pkg-ribbon--active"><CheckCircle2 size={12} /> مشترك</span>;
  if (pkg.myStatus === 'Pending') return <span className="pkg-ribbon pkg-ribbon--pending"><Clock3 size={12} /> قيد المراجعة</span>;
  if (pkg.isExpired) return <span className="pkg-ribbon pkg-ribbon--danger"><XCircle size={12} /> انتهت</span>;
  if (pkg.myStatus === 'Cancelled') return <span className="pkg-ribbon pkg-ribbon--muted">ملغية</span>;
  if (pkg.isFull) return <span className="pkg-ribbon pkg-ribbon--muted">اكتمل العدد</span>;
  return <span className="pkg-ribbon"><Sparkles size={12} /> متاحة</span>;
}

function PackageNote({ pkg }) {
  if (pkg.isEnrolled) {
    const left = daysLeft(pkg.myEnrollment?.expiresAtUtc);
    return (
      <div className="pkg-note pkg-note--success">
        <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
        <span>
          اشتراكك نشط{left === null ? ' بوصول دائم' : left > 0 ? ` — متبقي ${formatNumber(left)} يوم` : ' — ينتهي اليوم'}
          {pkg.myEnrollment?.expiresAtUtc ? ` (حتى ${formatShortDate(pkg.myEnrollment.expiresAtUtc)})` : ''}
        </span>
      </div>
    );
  }
  if (pkg.myStatus === 'Pending') {
    return <div className="pkg-note pkg-note--warning"><Clock3 size={14} className="mt-0.5 shrink-0" /><span>طلب اشتراكك قيد مراجعة المدرس.</span></div>;
  }
  if (pkg.isExpired) {
    return <div className="pkg-note pkg-note--danger"><XCircle size={14} className="mt-0.5 shrink-0" /><span>انتهى وصولك لهذه الباقة — تواصل مع المدرس للتجديد.</span></div>;
  }
  if (pkg.myStatus === 'Cancelled') {
    return <div className="pkg-note"><XCircle size={14} className="mt-0.5 shrink-0" /><span>تم إلغاء هذا الاشتراك. يمكنك التنسيق مع المدرس لإعادة تفعيله.</span></div>;
  }
  if (pkg.isFull) {
    return <div className="pkg-note pkg-note--warning"><Users size={14} className="mt-0.5 shrink-0" /><span>اكتمل العدد المتاح لهذه الباقة. تواصل مع المدرس للانتظار.</span></div>;
  }
  return <div className="pkg-note"><Wallet size={14} className="mt-0.5 shrink-0" /><span>الاشتراك يتم بالتنسيق مع المدرس بعد تأكيد الدفع.</span></div>;
}

function AvailabilityLine({ pkg }) {
  if (pkg.availableUntilUtc) return <span>متاحة حتى {formatShortDate(pkg.availableUntilUtc)}</span>;
  if (pkg.availableFromUtc && new Date(pkg.availableFromUtc).getTime() > Date.now()) return <span>تبدأ في {formatShortDate(pkg.availableFromUtc)}</span>;
  return <span>متاحة الآن</span>;
}

export default function StudentPackagesPage({ token, onNavigate, onOpenTeachers }) {
  const reduce = useReducedMotion();
  const [packages, setPackages] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [teacherId, setTeacherId] = useState('');
  const [selectedId, setSelectedId] = useState('');

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const data = await request('/api/teaching/explore/packages', { token });
      setPackages(Array.isArray(data?.items) ? data.items : []);
      setTeachers(Array.isArray(data?.teachers) ? data.teachers : []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => ({
    total: packages.length,
    enrolled: packages.filter((item) => item.isEnrolled).length,
    available: packages.filter((item) => !item.isEnrolled && !item.isFull && item.myStatus !== 'Pending').length,
  }), [packages]);

  const shown = useMemo(() => {
    const term = search.trim();
    return packages
      .filter((pkg) => {
        if (filter === 'enrolled' && !pkg.isEnrolled) return false;
        if (filter === 'available' && (pkg.isEnrolled || pkg.isFull || pkg.myStatus === 'Pending')) return false;
        if (teacherId && pkg.teacherId !== teacherId) return false;
        if (!term) return true;
        return [pkg.name, pkg.description, pkg.teacherName, pkg.teacherSpecialty, ...(pkg.items || []).map((item) => item.title)]
          .filter(Boolean)
          .some((value) => String(value).includes(term));
      })
      .sort((a, b) => Number(b.isEnrolled) - Number(a.isEnrolled));
  }, [packages, filter, teacherId, search]);

  const selected = selectedId ? packages.find((item) => item.id === selectedId) : null;

  function contactTeacher(pkg) {
    try { sessionStorage.setItem('emtehani-chat-target', pkg.teacherId); } catch { /* ignore */ }
    onNavigate?.('chat');
  }

  function openEnrolledContent(pkg) {
    const hasGroup = (pkg.items || []).some((item) => item.type === 'Group');
    const hasCourse = (pkg.items || []).some((item) => item.type === 'Course');
    onNavigate?.(hasGroup && !hasCourse ? 'learning' : 'courses');
  }

  function primaryAction(pkg, block = false) {
    const width = block ? 'w-full' : 'flex-1';
    if (pkg.isEnrolled) {
      return <Button size="sm" className={width} icon={ChevronLeft} onClick={() => openEnrolledContent(pkg)}>ادخل إلى محتواك</Button>;
    }
    if (pkg.myStatus === 'Pending') {
      return <Button size="sm" variant="secondary" className={width} icon={Clock3} disabled>بانتظار موافقة المدرس</Button>;
    }
    if (pkg.isFull) {
      return <Button size="sm" variant="secondary" className={width} icon={Users} disabled>اكتمل العدد</Button>;
    }
    return (
      <Button size="sm" className={width} icon={MessageCircle} onClick={() => contactTeacher(pkg)}>
        {pkg.isExpired ? 'جدد الاشتراك مع المدرس' : 'تواصل للاشتراك'}
      </Button>
    );
  }

  const heroStats = [
    { label: 'باقات متاحة', value: formatNumber(summary.total), icon: Package },
    { label: 'مشترك فيها', value: formatNumber(summary.enrolled), icon: ShieldCheck },
    { label: 'جاهزة للاشتراك', value: formatNumber(summary.available), icon: TrendingUp },
    { label: 'مدرسون', value: formatNumber(teachers.length), icon: GraduationCap },
  ];

  return (
    <div className="pkg-page">
      <motion.section
        className="pkg-hero"
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <span aria-hidden="true" className="pkg-hero-aurora" />
        <span aria-hidden="true" className="pkg-hero-grid" />
        <span aria-hidden="true" className="pkg-orb pkg-orb--1" />
        <span aria-hidden="true" className="pkg-orb pkg-orb--2" />
        <span aria-hidden="true" className="pkg-orb pkg-orb--3" />

        <div className="pkg-hero-inner">
          <div className="pkg-hero-copy">
            <motion.span
              className="pkg-eyebrow"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.4 }}
            >
              <Sparkles size={13} /> باقات مدرسيك
            </motion.span>
            <motion.h1
              className="pkg-hero-title"
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14, duration: 0.5 }}
            >
              كل باقاتك التعليمية <em>في مكان واحد</em>
            </motion.h1>
            <motion.p
              className="pkg-hero-sub"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              باقات يجمعها لك مدرسوك من الكورسات والمجموعات، مع السعر والمدة والمحتوى واضحًا قبل الاشتراك.
              اختر باقتك وتواصل مع المدرس لتفعيلها في دقائق.
            </motion.p>
            <motion.div
              className="pkg-hero-tags"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26, duration: 0.45 }}
            >
              <span><CheckCircle2 size={12} /> محتوى منظم</span>
              <span><Wallet size={12} /> أسعار واضحة</span>
              <span><ShieldCheck size={12} /> متابعة مستمرة</span>
            </motion.div>
          </div>

          <motion.div
            className="pkg-hero-stats"
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.22, duration: 0.5 }}
          >
            {heroStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="pkg-hero-stat">
                  <span className="pkg-hero-stat-icon"><Icon size={15} /></span>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              );
            })}
          </motion.div>
        </div>
      </motion.section>

      {error ? <Alert tone="danger" className="mt-4" onClose={() => setError('')}>{error}</Alert> : null}

      {!loading && packages.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={Compass}
            title="لا توجد باقات متاحة الآن"
            description="عندما ينشر أحد مدرسيك باقة جديدة ستظهر هنا تلقائيًا مع السعر والمحتوى. تأكد أولًا من ربط حسابك بمدرسيك."
            action={(
              <div className="flex flex-wrap items-center justify-center gap-2">
                {onOpenTeachers ? <Button size="sm" icon={GraduationCap} onClick={onOpenTeachers}>المدرسون</Button> : null}
                <Button size="sm" variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>
              </div>
            )}
          />
        </Card>
      ) : (
        <>
          <div className="pkg-toolbar">
            <Segmented
              options={[
                { value: 'all', label: `الكل (${formatNumber(summary.total)})` },
                { value: 'enrolled', label: `مشترك (${formatNumber(summary.enrolled)})`, icon: CheckCircle2 },
                { value: 'available', label: `متاحة (${formatNumber(summary.available)})`, icon: Sparkles },
              ]}
              value={filter}
              onChange={setFilter}
              ariaLabel="تصفية الباقات"
            />
            <div className="pkg-toolbar-fields">
              <div className="relative w-full sm:w-64">
                <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ابحث في الباقات"
                  className="pr-9"
                  aria-label="بحث في الباقات"
                />
              </div>
              <Select value={teacherId} onChange={(event) => setTeacherId(event.target.value)} className="w-full sm:w-48" aria-label="تصفية حسب المدرس">
                <option value="">كل المدرسين</option>
                {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name || 'مدرس'}</option>)}
              </Select>
              <Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)} aria-label="تحديث الباقات">تحديث</Button>
            </div>
          </div>

          {loading ? (
            <div className="pkg-grid">
              {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-[430px] w-full rounded-[22px]" />)}
            </div>
          ) : shown.length === 0 ? (
            <Card className="mt-4">
              <EmptyState
                icon={Search}
                title="لا توجد باقات مطابقة"
                description="جرّب تغيير كلمة البحث أو اختيار مدرس آخر لعرض باقات أكثر."
                action={<Button size="sm" variant="secondary" onClick={() => { setSearch(''); setTeacherId(''); setFilter('all'); }}>إعادة ضبط الفلاتر</Button>}
              />
            </Card>
          ) : (
            <motion.div layout className="pkg-grid">
              <AnimatePresence mode="popLayout">
                {shown.map((pkg, index) => {
                  const Icon = kindIcons[pkg.kind] || Package;
                  const discount = discountPercent(pkg);
                  const kindClass = String(pkg.kind || '').toLowerCase();
                  const visibleItems = (pkg.items || []).slice(0, 2);
                  const extraItems = Math.max(0, (pkg.items || []).length - visibleItems.length);
                  return (
                    <motion.article
                      key={pkg.id}
                      layout
                      initial={reduce ? false : { opacity: 0, y: 26, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduce ? false : { opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.45, delay: reduce ? 0 : Math.min(index * 0.05, 0.3), ease: [0.16, 1, 0.3, 1] }}
                      className="pkg-card-shell"
                    >
                      <Card hover className="pkg-card flex h-full flex-col overflow-hidden">
                        <button type="button" onClick={() => setSelectedId(pkg.id)} className={cn('pkg-cover', `pkg-cover--${kindClass}`)} aria-label={`تفاصيل ${pkg.name}`}>
                          <span aria-hidden="true" className="pkg-cover-mesh" />
                          <span aria-hidden="true" className="pkg-orbit pkg-orbit--a" />
                          <span aria-hidden="true" className="pkg-orbit pkg-orbit--b" />
                          <span aria-hidden="true" className="pkg-glyph"><Icon size={92} strokeWidth={1.05} /></span>
                          <span className="pkg-kind"><Icon size={12} /> {kindLabels[pkg.kind] || 'باقة'}</span>
                          <span className="pkg-price-bubble">
                            <span aria-hidden="true" className="pkg-price-shine" />
                            {discount ? <span className="pkg-discount">خصم {formatNumber(discount)}%</span> : null}
                            <span className="pkg-price">{formatNumber(pkg.price)} <small>ج.م</small></span>
                            {discount ? <span className="pkg-old-price">{formatNumber(pkg.oldPrice)} ج.م</span> : null}
                          </span>
                          <span className="pkg-cover-status"><StatusRibbon pkg={pkg} /></span>
                          <span className="pkg-teacher">
                            <TeacherAvatar name={pkg.teacherName} url={pkg.teacherAvatarUrl} />
                            <span className="min-w-0">
                              <span className="block truncate text-[11.5px] font-extrabold text-white">{pkg.teacherName || 'مدرس'}</span>
                              <span className="block truncate text-[10px] font-medium text-white/80">{pkg.teacherSpecialty || 'باقة تعليمية'}</span>
                            </span>
                          </span>
                        </button>

                        <div className="flex flex-1 flex-col p-4">
                          <button type="button" onClick={() => setSelectedId(pkg.id)} className="text-start">
                            <h3 className="pkg-card-title">{pkg.name}</h3>
                          </button>
                          <p className="pkg-card-desc">{pkg.description || 'باقة تجمع لك أفضل ما يقدمه المدرس في مسار واحد منظم.'}</p>

                          <div className="pkg-chips">
                            <Badge tone="blue"><Timer size={11} /> {formatNumber(pkg.durationDays)} يوم</Badge>
                            {pkg.sessionsIncluded ? <Badge tone="neutral"><CalendarDays size={11} /> {formatNumber(pkg.sessionsIncluded)} حصة</Badge> : null}
                            {pkg.capacity ? <Badge tone={pkg.isFull ? 'danger' : 'success'}><Users size={11} /> {pkg.isFull ? 'مكتملة' : `${formatNumber(pkg.seatsLeft)} مقعد`}</Badge> : null}
                            {pkg.isRecurring ? <Badge tone="emerald"><RefreshCw size={11} /> متجددة</Badge> : null}
                          </div>

                          {visibleItems.length > 0 ? (
                            <ul className="pkg-items">
                              {visibleItems.map((item) => {
                                const ItemIcon = item.type === 'Group' ? Users : BookOpen;
                                return (
                                  <li key={`${item.type}-${item.id}`}>
                                    <span className="pkg-item-icon"><ItemIcon size={12} /></span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[11.5px] font-bold text-ink">{item.title || 'محتوى الباقة'}</span>
                                      <span className="block truncate text-[9.5px] text-muted">
                                        {itemTypeLabels[item.type]} · {deliveryLabels[item.deliveryMode] || item.deliveryMode || 'أونلاين'}
                                        {item.subject ? ` · ${item.subject}` : ''}
                                      </span>
                                    </span>
                                    {item.isFree ? <span className="pkg-item-free">مجاني</span> : null}
                                  </li>
                                );
                              })}
                              {extraItems > 0 ? <li className="pkg-items-more">+{formatNumber(extraItems)} عنصر إضافي داخل الباقة</li> : null}
                            </ul>
                          ) : (
                            <p className="pkg-items-empty">سيتم إضافة محتوى الباقة قريبًا.</p>
                          )}

                          <div className="mt-auto pt-3">
                            <PackageNote pkg={pkg} />
                          </div>
                        </div>

                        <div className="pkg-card-footer">
                          <Button size="sm" variant="secondary" onClick={() => setSelectedId(pkg.id)}>التفاصيل</Button>
                          {primaryAction(pkg)}
                        </div>
                      </Card>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelectedId('')}
        size="lg"
        icon={Package}
        title={selected?.name || 'تفاصيل الباقة'}
        description={selected ? `${selected.teacherName || 'مدرس'} · ${kindLabels[selected.kind] || 'باقة تعليمية'}` : ''}
        footer={selected ? (
          <>
            <Button variant="ghost" onClick={() => setSelectedId('')}>إغلاق</Button>
            {primaryAction(selected, true)}
          </>
        ) : null}
      >
        {selected ? (
          <div className="pkg-modal">
            <div className={cn('pkg-modal-banner', `pkg-cover--${String(selected.kind || '').toLowerCase()}`)}>
              <span aria-hidden="true" className="pkg-cover-mesh" />
              <span aria-hidden="true" className="pkg-orbit pkg-orbit--a" />
              <span aria-hidden="true" className="pkg-glyph">{React.createElement(kindIcons[selected.kind] || Package, { size: 104, strokeWidth: 1 })}</span>
              <div className="pkg-modal-price">
                {discountPercent(selected) ? <span className="pkg-discount">خصم {formatNumber(discountPercent(selected))}%</span> : null}
                <strong>{formatNumber(selected.price)} <small>ج.م</small></strong>
                {discountPercent(selected) ? <span className="pkg-old-price">{formatNumber(selected.oldPrice)} ج.م</span> : null}
              </div>
              <div className="pkg-modal-teacher">
                <TeacherAvatar name={selected.teacherName} url={selected.teacherAvatarUrl} className="size-11" />
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-extrabold text-white">{selected.teacherName || 'مدرس'}</p>
                  <p className="truncate text-[10.5px] text-white/80">{selected.teacherSpecialty || 'باقة تعليمية'}</p>
                </div>
              </div>
            </div>

            <div className="pkg-modal-meta">
              <div><Timer size={15} /><span>المدة</span><strong>{formatNumber(selected.durationDays)} يوم</strong></div>
              <div><CalendarDays size={15} /><span>الحصص</span><strong>{selected.sessionsIncluded ? formatNumber(selected.sessionsIncluded) : '—'}</strong></div>
              <div><Users size={15} /><span>المقاعد</span><strong>{selected.capacity ? `${formatNumber(selected.seatsLeft)} / ${formatNumber(selected.capacity)}` : 'مفتوحة'}</strong></div>
              <div><Clock3 size={15} /><span>التوفر</span><strong><AvailabilityLine pkg={selected} /></strong></div>
            </div>

            {selected.description ? (
              <div>
                <h4 className="pkg-modal-heading">عن الباقة</h4>
                <p className="whitespace-pre-line text-[12.5px] leading-7 text-muted">{selected.description}</p>
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="pkg-modal-heading mb-0">محتوى الباقة</h4>
                <span className="text-[10.5px] font-bold text-muted">{formatNumber((selected.items || []).length)} عنصر</span>
              </div>
              {(selected.items || []).length === 0 ? (
                <p className="rounded-xl border border-line bg-surface-soft p-4 text-center text-[11.5px] text-muted">لم يُضف المدرس محتوى لهذه الباقة بعد.</p>
              ) : (
                <ul className="pkg-modal-items">
                  {(selected.items || []).map((item) => {
                    const ItemIcon = item.type === 'Group' ? Users : BookOpen;
                    return (
                      <li key={`${item.type}-${item.id}`}>
                        <span className="pkg-modal-item-art">
                          {item.coverUrl ? <img src={assetUrl(item.coverUrl)} alt="" loading="lazy" /> : <ItemIcon size={18} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-bold text-ink">{item.title || 'محتوى الباقة'}</span>
                          <span className="block truncate text-[10px] text-muted">
                            {itemTypeLabels[item.type]} · {deliveryLabels[item.deliveryMode] || item.deliveryMode || 'أونلاين'}
                            {item.subject ? ` · ${item.subject}` : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {item.isFree ? <Badge tone="success">مجاني</Badge> : item.price ? <Badge tone="neutral">{formatNumber(item.price)} ج.م</Badge> : null}
                          {item.type === 'Course' && !item.isPublished ? <Badge tone="warning">قريبًا</Badge> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {selected.myEnrollment ? (
              <div className="pkg-modal-enrollment">
                <h4 className="pkg-modal-heading mb-1">حالة اشتراكك</h4>
                <p className="text-[11.5px] leading-6 text-muted">
                  {selected.myEnrollment.expiresAtUtc
                    ? `ينتهي الوصول في ${formatShortDate(selected.myEnrollment.expiresAtUtc)}`
                    : 'وصول دائم بدون تاريخ انتهاء'}
                  {Number(selected.myEnrollment.amountDue) > 0
                    ? ` · المسدد ${formatNumber(selected.myEnrollment.amountPaid)} من ${formatNumber(selected.myEnrollment.amountDue)} ج.م`
                    : ''}
                  {selected.myEnrollment.couponCode ? ` · كود الخصم ${selected.myEnrollment.couponCode}` : ''}
                </p>
              </div>
            ) : null}

            <PackageNote pkg={selected} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
