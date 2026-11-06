import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, CalendarDays, CheckCircle2, Clock3, Compass, GraduationCap, MapPin,
  RefreshCw, Search, Users, Video, Wallet, XCircle,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Input, PageHeader, Segmented, Skeleton,
} from '../components/ui';
import { assetUrl, request } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';

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

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3600);
  }

  async function joinGroup(group) {
    setBusyId(group.id);
    setError('');
    try {
      const result = await request(`/api/teaching/groups/${group.id}/join`, { token, method: 'POST' });
      setGroups((rows) => rows.map((row) => row.id === group.id
        ? {
          ...row,
          myStatus: 'Active',
          canJoin: false,
          activeMembers: result?.alreadyMember ? row.activeMembers : (row.activeMembers || 0) + 1,
          seatsLeft: row.seatsLeft == null ? null : Math.max(0, row.seatsLeft - (result?.alreadyMember ? 0 : 1)),
        }
        : row));
      flash(result?.alreadyMember ? 'أنت عضو في هذه المجموعة بالفعل.' : `تم انضمامك إلى «${group.name}» وستظهر في تعلّمي.`);
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
                      <p className="text-center text-[11.5px] font-bold text-emerald">أنت عضو — تابع الحصص من «تعلّمي».</p>
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
                <Card key={course.id} className="flex flex-col overflow-hidden">
                  {course.coverUrl ? (
                    <img src={assetUrl(course.coverUrl)} alt="" className="h-32 w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="grid h-32 w-full place-items-center bg-primary-soft text-primary"><BookOpen size={34} /></div>
                  )}
                  <div className="flex-1 p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-[15px] font-semibold text-ink">{course.title}</h3>
                        <p className="mt-0.5 truncate text-[11.5px] text-muted">
                          {course.teacherName} · {course.subject}
                        </p>
                      </div>
                      {enrolled ? <Badge tone="success">مشترك</Badge> : null}
                    </div>
                    {course.shortDescription ? (
                      <p className="mb-3 line-clamp-2 text-[11.5px] leading-5 text-muted">{course.shortDescription}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="blue">{deliveryLabels[course.deliveryMode] || course.deliveryMode}</Badge>
                      <Badge tone="neutral"><BookOpen size={11} /> {formatNumber(course.lessons)} درس</Badge>
                      {course.isFree ? (
                        <Badge tone="success">مجاني</Badge>
                      ) : (
                        <Badge tone="warning"><Wallet size={11} /> {formatNumber(course.price)} ج.م</Badge>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-line bg-surface-soft px-4 py-3">
                    {enrolled ? (
                      <p className="text-center text-[11.5px] font-bold text-emerald">مشترك — افتحه من «كورساتي».</p>
                    ) : course.isFree ? (
                      <Button size="sm" className="w-full" icon={CheckCircle2} loading={busyId === course.id} onClick={() => joinCourse(course)}>
                        ابدأ مجانًا
                      </Button>
                    ) : (
                      <div className="text-center">
                        <Button size="sm" variant="secondary" className="w-full" icon={Wallet} disabled>كورس مدفوع</Button>
                        <p className="mt-1.5 text-[10.5px] text-subtle">تواصل مع المدرس لإتمام التسجيل بعد السداد.</p>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
