import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, CalendarDays, CheckCircle2, ChevronDown, Clock3, Compass, FileText, GraduationCap,
  Layers, Lock, MapPin, Play, RefreshCw, Search, Sparkles, Users, Video, Wallet, XCircle,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Skeleton, Textarea, cn,
} from '../components/ui';
import ImageUploader from '../components/ImageUploader';
import PaymentDetails, { methodOptions, usePaymentMethods } from '../components/PaymentDetails';
import { assetUrl, request } from '../lib/api';
import { formatDate, formatDuration, formatNumber } from '../lib/format';

const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const deliveryLabels = { Online: 'أونلاين', Offline: 'حضوري', Hybrid: 'مدمج' };
const paymentLabels = { Monthly: 'اشتراك شهري', PerSession: 'بالحصة' };

function clockText(value) {
  return typeof value === 'string' ? value.slice(0, 5) : '';
}

function scheduleText(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return rows.map((row) => `${dayNames[row.dayOfWeek] || ''} ${clockText(row.startTime)}`).join(' · ');
}

export default function StudentExplorePage({ token, onOpenTeachers }) {
  const [tab, setTab] = useState('groups');
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [linkedTeachers, setLinkedTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState(null);
  const [courseDetail, setCourseDetail] = useState(null);
  const [courseLoading, setCourseLoading] = useState(false);
  const [openUnits, setOpenUnits] = useState({});
  const [payCourse, setPayCourse] = useState(null);
  const [payForm, setPayForm] = useState({ method: 'InstaPay', amount: '', reference: '', notes: '', receiptUrl: '' });
  const [payError, setPayError] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const coursePaymentInfo = usePaymentMethods(token, payCourse?.teacherId || null);
  const courseMethods = methodOptions(coursePaymentInfo.items);

  useEffect(() => {
    if (!payCourse) return;
    const allowed = courseMethods.map((item) => item.value);
    setPayForm((prev) => (allowed.includes(prev.method) ? prev : { ...prev, method: allowed[0] || 'Cash' }));
  }, [payCourse, coursePaymentInfo.loading, coursePaymentInfo.items]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const [groupData, catalogData] = await Promise.all([
        request('/api/teaching/explore/groups', { token }),
        request('/api/teaching/catalog', { token }),
      ]);
      setGroups(Array.isArray(groupData?.items) ? groupData.items : []);
      setLinkedTeachers(Array.isArray(groupData?.linkedTeachers) ? groupData.linkedTeachers : []);
      setCourses(Array.isArray(catalogData?.items) ? catalogData.items : []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const loadCourse = useCallback(async (id) => {
    setCourseLoading(true);
    try {
      const result = await request(`/api/teaching/my/courses/${id}`, { token });
      setCourseDetail(result);
      setOpenUnits(Object.fromEntries((result.units || []).map((unit) => [unit.id, true])));
      setError('');
    } catch (err) { setError(err.message); } finally { setCourseLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!courseId) { setCourseDetail(null); return; }
    loadCourse(courseId);
  }, [courseId, loadCourse]);

  const term = search.trim();
  const shownGroups = useMemo(() => {
    const rows = term
      ? groups.filter((item) => [item.name, item.subject, item.teacherName, item.stage, item.grade]
        .filter(Boolean).some((value) => String(value).includes(term)))
      : groups;
    return [...rows].sort((a, b) => Number(b.matchesProfile) - Number(a.matchesProfile));
  }, [groups, term]);
  const shownCourses = useMemo(() => term
    ? courses.filter((item) => [item.title, item.subject, item.teacherName]
      .filter(Boolean).some((value) => String(value).includes(term)))
    : courses, [courses, term]);

  const hasLinkedTeachers = linkedTeachers.length > 0;
  const detailUnits = courseDetail?.units || [];
  const detailLessons = detailUnits.flatMap((unit) => unit.lessons || []);
  const detailMaterials = detailLessons.reduce((sum, lesson) => sum + (lesson.materials?.length || 0), 0);
  const detailItem = courses.find((course) => course.id === courseId);

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3600);
  }

  async function joinGroup(group) {
    setBusyId(group.id);
    setError('');
    try {
      const result = await request(`/api/teaching/groups/${group.id}/join`, { token, method: 'POST' });
      const pending = Boolean(result?.pendingApproval);
      setGroups((rows) => rows.map((row) => row.id === group.id
        ? {
          ...row,
          myStatus: result?.alreadyMember ? 'Active' : pending ? 'Pending' : row.myStatus,
          canJoin: false,
        }
        : row));
      flash(result?.alreadyMember
        ? 'أنت عضو في هذه المجموعة بالفعل.'
        : pending
          ? `تم إرسال طلب انضمامك إلى «${group.name}». انتظر موافقة المدرس.`
          : `تم انضمامك إلى «${group.name}».`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  async function joinCourse(course) {
    setBusyId(course.id);
    setError('');
    try {
      const result = await request(`/api/teaching/catalog/${course.id}/join`, { token, method: 'POST' });
      setCourses((rows) => rows.map((row) => row.id === course.id ? { ...row, isEnrolled: true } : row));
      flash(result?.alreadyEnrolled ? 'أنت مشترك في هذا الكورس بالفعل.' : `تم تسجيلك في «${course.title}» وستجده في كورساتي.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  function openCoursePayment(course) {
    setPayCourse(course);
    setPayForm({
      method: 'InstaPay',
      amount: course?.price ? String(course.price) : '',
      reference: '', notes: '', receiptUrl: '',
    });
    setPayError('');
  }

  async function submitCoursePayment() {
    setPayError('');
    if (!payCourse) return;
    if (!(Number(payForm.amount) > 0)) return setPayError('اكتب المبلغ الذي دفعته.');
    if (payForm.method !== 'Cash' && !payForm.receiptUrl) return setPayError('أرفق صورة سكرين التحويل أو الإيصال.');
    setPayBusy(true);
    try {
      await request('/api/teaching/my/course-requests', {
        token, method: 'POST',
        body: JSON.stringify({
          courseId: payCourse.id,
          amount: Number(payForm.amount),
          method: payForm.method,
          reference: payForm.reference || null,
          notes: payForm.notes || null,
          receiptUrl: payForm.receiptUrl || null,
        }),
      });
      setCourses((rows) => rows.map((row) => row.id === payCourse.id ? { ...row, hasPendingRequest: true } : row));
      flash('تم إرسال طلب الاشتراك مع صورة التحويل. سيصلك إشعار عند تأكيد المدرس.');
      setPayCourse(null);
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPayBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="استكشف"
        title="الكورسات والمجموعات المتاحة"
        description="كل ما ينشره مدرسوك المتاح لك في مكان واحد — اختر مجموعة أو كورسًا مجانيًا وابدأ مباشرة."
        action={<Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      {!loading && !hasLinkedTeachers ? (
        <Card className="mb-4">
          <EmptyState
            icon={GraduationCap}
            title="لم تربط حسابك بأي مدرس بعد"
            description="اختر مدرسيك من صفحة المدرسين ووافق على طلبات الارتباط، وبعدها تظهر كورساتهم ومجموعاتهم هنا مباشرة."
            action={onOpenTeachers ? <Button size="sm" icon={Compass} onClick={onOpenTeachers}>اختيار المدرسين</Button> : null}
          />
        </Card>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          options={[
            { value: 'groups', label: `المجموعات (${formatNumber(groups.length)})`, icon: Users },
            { value: 'courses', label: `الكورسات (${formatNumber(courses.length)})`, icon: BookOpen },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel="نوع المحتوى"
        />
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث بالاسم أو المادة أو المدرس"
            className="pr-9"
            aria-label="بحث في المتاح"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full rounded-[16px]" />)}
        </div>
      ) : tab === 'groups' ? (
        shownGroups.length === 0 ? (
          <Card>
            <EmptyState
              icon={Users}
              title={hasLinkedTeachers ? 'لا توجد مجموعات متاحة الآن' : 'اربط حسابك بمدرس أولاً'}
              description={hasLinkedTeachers
                ? 'عندما يفتح أحد مدرسيك التسجيل في مجموعة، ستظهر هنا مع المواعيد والأماكن وزر الانضمام.'
                : 'بعد قبول رابط المدرس ستظهر مجموعاته وحصصه هنا للانضمام.'}
              action={!hasLinkedTeachers && onOpenTeachers ? <Button size="sm" onClick={onOpenTeachers}>المدرسون</Button> : null}
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shownGroups.map((group) => {
              const activeMember = group.myStatus === 'Active';
              const pendingMember = group.myStatus === 'Pending';
              const suspended = group.myStatus === 'Suspended';
              const schedule = scheduleText(group.schedules);
              return (
                <Card key={group.id} className="flex flex-col overflow-hidden">
                  <div className="flex-1 p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-[15px] font-semibold text-ink">{group.name}</h3>
                        <p className="mt-0.5 truncate text-[11.5px] text-muted">
                          {group.teacherName} · {group.subject}
                        </p>
                      </div>
                      {activeMember ? (
                        <Badge tone="success"><CheckCircle2 size={11} /> عضو</Badge>
                      ) : pendingMember ? (
                        <Badge tone="warning">بانتظار الموافقة</Badge>
                      ) : suspended ? (
                        <Badge tone="danger">موقوف</Badge>
                      ) : group.matchesProfile ? (
                        <Badge tone="primary">مناسب لك</Badge>
                      ) : null}
                    </div>

                    {group.description ? <p className="mb-3 line-clamp-2 text-[11.5px] leading-5 text-muted">{group.description}</p> : null}

                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {group.stage ? <Badge tone="neutral">{group.stage}</Badge> : null}
                      {group.grade ? <Badge tone="neutral">{group.grade}</Badge> : null}
                      <Badge tone="blue">{deliveryLabels[group.deliveryMode] || group.deliveryMode}</Badge>
                      <Badge tone="neutral"><Users size={11} /> {formatNumber(group.activeMembers)}/{group.capacity > 0 ? formatNumber(group.capacity) : '∞'}</Badge>
                      {Number(group.price) > 0 ? (
                        <Badge tone="warning"><Wallet size={11} /> {formatNumber(group.price)} ج.م · {paymentLabels[group.paymentType] || group.paymentType}</Badge>
                      ) : (
                        <Badge tone="success">مجانية</Badge>
                      )}
                    </div>

                    <ul className="grid gap-1.5 text-[11.5px] text-muted">
                      {schedule ? (
                        <li className="flex items-center gap-1.5"><Clock3 size={13} className="text-primary" /><span>{schedule}</span></li>
                      ) : null}
                      {group.nextSessionAtUtc ? (
                        <li className="flex items-center gap-1.5"><CalendarDays size={13} className="text-primary" /><span>أقرب حصة: {formatDate(group.nextSessionAtUtc)}</span></li>
                      ) : null}
                      {group.deliveryMode !== 'Online' && group.location ? (
                        <li className="flex items-center gap-1.5"><MapPin size={13} className="text-primary" /><span className="truncate">{group.location}</span></li>
                      ) : null}
                      {group.deliveryMode !== 'Offline' && group.onlineLink ? (
                        <li className="flex items-center gap-1.5"><Video size={13} className="text-primary" /><span className="truncate" dir="ltr">{group.onlineLink}</span></li>
                      ) : null}
                      {Array.isArray(group.courses) && group.courses.length > 0 ? (
                        <li className="flex items-start gap-1.5"><BookOpen size={13} className="mt-0.5 text-primary" /><span>كورسات المجموعة: {group.courses.map((c) => c.title).join(' · ')}</span></li>
                      ) : null}
                    </ul>
                  </div>

                  <div className="border-t border-line bg-surface-soft px-4 py-3">
                    {activeMember ? (
                      <p className="text-center text-[11.5px] font-bold text-emerald">أنت عضو — تابع الحصص من «مجموعاتي».</p>
                    ) : pendingMember ? (
                      <p className="text-center text-[11.5px] font-bold text-warning">تم إرسال طلبك — بانتظار موافقة المدرس.</p>
                    ) : suspended ? (
                      <p className="text-center text-[11.5px] font-bold text-danger">العضوية موقوفة — تواصل مع المدرس.</p>
                    ) : group.canJoin ? (
                      <Button size="sm" className="w-full" icon={Users} loading={busyId === group.id} onClick={() => joinGroup(group)}>
                        انضم للمجموعة
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" className="w-full" icon={XCircle} disabled>
                        {group.enrollmentOpen ? 'المجموعة مكتملة العدد' : 'التسجيل مغلق حالياً'}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        shownCourses.length === 0 ? (
          <Card>
            <EmptyState
              icon={BookOpen}
              title={hasLinkedTeachers ? 'لا توجد كورسات منشورة الآن' : 'اربط حسابك بمدرس أولاً'}
              description={hasLinkedTeachers
                ? 'عندما ينشر مدرسك كورسًا جديدًا سيظهر هنا مع الدروس والسعر وزر البدء.'
                : 'بعد قبول رابط المدرس ستظهر كورساته المنشورة هنا.'}
              action={!hasLinkedTeachers && onOpenTeachers ? <Button size="sm" onClick={onOpenTeachers}>المدرسون</Button> : null}
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shownCourses.map((course) => {
              const enrolled = course.isEnrolled;
              return (
                <Card key={course.id} hover className="group flex flex-col overflow-hidden">
                  <button type="button" onClick={() => setCourseId(course.id)} className="relative block h-44 w-full overflow-hidden bg-gradient-to-br from-primary/25 via-primary-soft to-blue-soft text-start">
                    {course.coverUrl ? (
                      <img src={assetUrl(course.coverUrl)} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-primary"><BookOpen size={36} /></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-black/0" />
                    <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {enrolled ? <Badge tone="success"><CheckCircle2 size={11} /> مشترك</Badge> : null}
                        {!enrolled && course.hasPendingRequest ? <Badge tone="warning">بانتظار تأكيد الدفع</Badge> : null}
                        {course.isFree ? <Badge tone="emerald">مجاني</Badge> : null}
                      </div>
                      {!course.isFree ? (
                        <span className="rounded-xl bg-white/95 px-2.5 py-1 text-end shadow-sm">
                          <span className="block text-[13px] font-extrabold text-primary">{formatNumber(course.price)} ج.م</span>
                          {Number(course.oldPrice) > Number(course.price) ? <span className="block text-[9.5px] font-bold text-muted line-through">{formatNumber(course.oldPrice)} ج.م</span> : null}
                        </span>
                      ) : null}
                    </div>
                    <div className="absolute inset-x-3 bottom-3 flex flex-wrap gap-1">
                      {course.stage ? <span className="rounded-lg bg-black/45 px-2 py-1 text-[9.5px] font-bold text-white">{course.stage}</span> : null}
                      {course.grade ? <span className="rounded-lg bg-black/45 px-2 py-1 text-[9.5px] font-bold text-white">{course.grade}</span> : null}
                    </div>
                  </button>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 text-[14px] font-bold leading-6 text-ink">{course.title}</h3>
                        <p className="mt-0.5 truncate text-[11px] text-muted">{course.teacherName} · {course.subject || 'عام'}</p>
                      </div>
                    </div>
                    {course.shortDescription ? (
                      <p className="mb-2 line-clamp-2 text-[11.5px] leading-5 text-muted">{course.shortDescription}</p>
                    ) : null}
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                      <Badge tone="blue"><BookOpen size={11} /> {formatNumber(course.lessons)} درس</Badge>
                      <Badge tone="neutral">{deliveryLabels[course.deliveryMode] || course.deliveryMode}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 border-t border-line bg-surface-soft px-4 py-3">
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => setCourseId(course.id)}>التفاصيل</Button>
                    {enrolled ? (
                      <span className="flex flex-1 items-center justify-center text-[11px] font-bold text-emerald">في «كورساتي»</span>
                    ) : course.isFree ? (
                      <Button size="sm" className="flex-1" icon={CheckCircle2} loading={busyId === course.id} onClick={() => joinCourse(course)}>ابدأ مجانًا</Button>
                    ) : course.hasPendingRequest ? (
                      <span className="flex flex-1 items-center justify-center text-[10.5px] font-bold text-warning">طلبك قيد مراجعة المدرس</span>
                    ) : (
                      <Button size="sm" className="flex-1" icon={Wallet} onClick={() => openCoursePayment(course)}>اشترك وارفع التحويل</Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {courseId ? (
        <Modal open onClose={() => setCourseId(null)} size="xl" icon={BookOpen}
          title={courseDetail?.course?.title || 'تفاصيل الكورس'}
          description={courseDetail?.course?.shortDescription || courseDetail?.course?.teacherName || 'محتوى الكورس الكامل'}
          footer={detailItem?.isEnrolled ? (
            <span className="text-[11.5px] font-bold text-emerald">أنت مشترك في هذا الكورس — افتحه من «كورساتي».</span>
          ) : detailItem?.isFree ? (
            <>
              <Button variant="ghost" onClick={() => setCourseId(null)}>إغلاق</Button>
              <Button icon={CheckCircle2} loading={busyId === courseId} onClick={() => joinCourse(detailItem)}>ابدأ مجانًا</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setCourseId(null)}>إغلاق</Button>
              {detailItem?.hasPendingRequest ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-warning"><Wallet size={13} /> طلب اشتراكك قيد مراجعة المدرس.</span>
              ) : (
                <Button icon={Wallet} onClick={() => { openCoursePayment(detailItem); setCourseId(null); }}>اشترك وارفع التحويل</Button>
              )}
            </>
          )}>
          {courseLoading || !courseDetail ? (
            <div className="grid gap-3 py-2"><Skeleton className="h-40 w-full" /><Skeleton className="h-24 w-full" /></div>
          ) : (
            <div className="grid gap-4 py-1">
              <div className="relative h-44 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/25 via-primary-soft to-blue-soft">
                {courseDetail.course.coverUrl ? <img src={assetUrl(courseDetail.course.coverUrl)} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-primary"><BookOpen size={36} /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
                <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {detailItem?.stage ? <span className="rounded-lg bg-black/45 px-2 py-1 text-[10px] font-bold text-white">{detailItem.stage}</span> : null}
                    {detailItem?.grade ? <span className="rounded-lg bg-black/45 px-2 py-1 text-[10px] font-bold text-white">{detailItem.grade}</span> : null}
                    <span className="rounded-lg bg-black/45 px-2 py-1 text-[10px] font-bold text-white">{deliveryLabels[courseDetail.course.deliveryMode] || courseDetail.course.deliveryMode}</span>
                  </div>
                  {detailItem?.isFree ? <Badge tone="success">مجاني</Badge> : (
                    <span className="rounded-xl bg-white/95 px-3 py-1.5 text-end shadow-sm">
                      <span className="block text-[14px] font-extrabold text-primary">{formatNumber(detailItem?.price || courseDetail.course.price)} ج.م</span>
                      {Number(detailItem?.oldPrice) > Number(detailItem?.price) ? <span className="block text-[10px] font-bold text-muted line-through">{formatNumber(detailItem.oldPrice)} ج.م</span> : null}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-line bg-surface-soft p-3"><p className="text-[10px] font-bold text-muted">الوحدات</p><p className="mt-1 text-[15px] font-extrabold text-ink">{formatNumber(detailUnits.length)}</p></div>
                <div className="rounded-xl border border-line bg-surface-soft p-3"><p className="text-[10px] font-bold text-muted">الدروس</p><p className="mt-1 text-[15px] font-extrabold text-ink">{formatNumber(detailLessons.length)}</p></div>
                <div className="rounded-xl border border-line bg-surface-soft p-3"><p className="text-[10px] font-bold text-muted">المواد والملفات</p><p className="mt-1 text-[15px] font-extrabold text-ink">{formatNumber(detailMaterials)}</p></div>
                <div className="rounded-xl border border-line bg-surface-soft p-3"><p className="text-[10px] font-bold text-muted">المعلم</p><p className="mt-1 truncate text-[12px] font-extrabold text-ink">{courseDetail.course.teacherName || '—'}</p></div>
              </div>

              {courseDetail.course.description ? (
                <div>
                  <h4 className="mb-1.5 font-display text-[14px] font-semibold text-ink">عن الكورس</h4>
                  <p className="whitespace-pre-line text-[12px] leading-6 text-muted">{courseDetail.course.description}</p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-line bg-surface-soft p-4">
                <h4 className="mb-2 flex items-center gap-1.5 font-display text-[14px] font-semibold text-ink"><Sparkles size={15} className="text-gold" /> الكورس يشمل</h4>
                <ul className="grid gap-1.5 text-[11.5px] text-muted sm:grid-cols-2">
                  <li className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald" /> دروس مرتبة داخل وحدات واضحة</li>
                  <li className="flex items-center gap-1.5"><Layers size={13} className="text-primary" /> متابعة تقدمك درساً بدرس</li>
                  {detailMaterials > 0 ? <li className="flex items-center gap-1.5"><FileText size={13} className="text-primary" /> ملخصات وملفات مرتبطة بالدروس</li> : null}
                  {detailLessons.some((lesson) => lesson.isFreePreview) ? <li className="flex items-center gap-1.5"><Play size={13} className="text-emerald" /> معاينة مجانية لبعض الدروس</li> : null}
                </ul>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="font-display text-[14px] font-semibold text-ink">محتوى الكورس</h4>
                  <span className="text-[10.5px] text-muted">{formatNumber(detailUnits.length)} وحدة · {formatNumber(detailLessons.length)} درس</span>
                </div>
                {detailUnits.length === 0 ? (
                  <p className="rounded-xl border border-line bg-surface-soft p-4 text-center text-[11.5px] text-muted">لم تُضف وحدات لهذا الكورس بعد.</p>
                ) : (
                  <div className="grid gap-2">
                    {detailUnits.map((unit) => {
                      const expanded = openUnits[unit.id] !== false;
                      return (
                        <div key={unit.id} className="overflow-hidden rounded-xl border border-line">
                          <button type="button" onClick={() => setOpenUnits((prev) => ({ ...prev, [unit.id]: !expanded }))} className="flex w-full items-center justify-between gap-2 bg-surface-soft px-3.5 py-3 text-right">
                            <span className="min-w-0">
                              <span className="block truncate text-[12.5px] font-bold text-ink">{unit.title}</span>
                              <span className="text-[10px] text-muted">{formatNumber((unit.lessons || []).length)} درس</span>
                            </span>
                            <ChevronDown size={15} className={cn('shrink-0 text-muted transition', expanded && 'rotate-180')} />
                          </button>
                          {expanded ? (
                            <div className="divide-y divide-line/60">
                              {(unit.lessons || []).map((lesson, index) => (
                                <div key={lesson.id} className={cn('flex items-center gap-2 px-3.5 py-2.5', lesson.locked && 'bg-surface-soft/40')}>
                                  <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-extrabold', lesson.locked ? 'bg-surface-soft text-muted' : 'bg-primary-soft text-primary')}>{index + 1}</span>
                                  <span className="min-w-0 flex-1">
                                    <span className={cn('block truncate text-[12px] font-bold', lesson.locked ? 'text-muted' : 'text-ink')}>{lesson.title}</span>
                                    <span className="text-[10px] text-muted">{formatDuration(lesson.durationMinutes)}</span>
                                  </span>
                                  {lesson.isFreePreview ? <Badge tone="emerald">معاينة مجانية</Badge> : lesson.locked ? <Badge tone="neutral"><Lock size={10} /> للمشتركين</Badge> : <Badge tone="blue">متاح</Badge>}
                                </div>
                              ))}
                              {(unit.lessons || []).length === 0 ? <p className="px-3.5 py-3 text-center text-[11px] text-muted">لا توجد دروس في هذه الوحدة بعد.</p> : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      ) : null}

      {payCourse ? (
        <Modal open onClose={() => setPayCourse(null)} icon={Wallet} title={`اشتراك في «${payCourse.title}»`}
          description="حوّل قيمة الكورس على إنستا باي أو فودافون كاش أو البنك، ثم ارفع صورة التحويل وسيؤكدها المدرس."
          footer={<>
            <Button variant="ghost" onClick={() => setPayCourse(null)}>إلغاء</Button>
            <Button icon={Wallet} loading={payBusy} onClick={submitCoursePayment}>إرسال الطلب</Button>
          </>}>
          <div className="grid gap-4">
            {payError ? <Alert tone="danger">{payError}</Alert> : null}
            <div className="rounded-xl border border-line bg-surface-soft p-3">
              <p className="text-[11px] text-muted">قيمة الكورس</p>
              <p className="mt-0.5 text-[17px] font-extrabold text-primary">{formatNumber(payCourse.price)} ج.م</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="المبلغ المحوّل (ج.م)">
                <Input type="number" min="0" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))} />
              </Field>
              <Field label="طريقة الدفع">
                <Select value={payForm.method} onChange={(e) => setPayForm((p) => ({ ...p, method: e.target.value }))}>
                  {courseMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                </Select>
              </Field>
            </div>
            <PaymentDetails token={token} method={payForm.method} teacherId={payCourse.teacherId} teacherName={payCourse.teacherName} />
            <Field label="المرجع / رقم العملية (اختياري)">
              <Input value={payForm.reference} onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))} />
            </Field>
            <ImageUploader token={token} value={payForm.receiptUrl}
              onChange={(url) => setPayForm((p) => ({ ...p, receiptUrl: url }))}
              label={payForm.method === 'Cash' ? 'صورة الإيصال (اختياري)' : 'صورة التحويل (مطلوبة)'}
              hint={payForm.method === 'Cash' ? 'اختياري للدفع النقدي.' : 'ارفع لقطة شاشة التحويل ليتمكن المدرس من مراجعتها.'} />
            <Field label="ملاحظات (اختياري)">
              <Textarea value={payForm.notes} onChange={(e) => setPayForm((p) => ({ ...p, notes: e.target.value }))} className="min-h-16" />
            </Field>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
