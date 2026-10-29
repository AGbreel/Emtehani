import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  BookOpen,
  CheckCircle2,
  Eye,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Unlink,
  UserCheck,
  UserRound,
  Users,
  UserX,
} from 'lucide-react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  cn,
} from '../components/ui';
import { request } from '../lib/api';
import { EDUCATION_STAGES, gradesForStage } from '../lib/education';
import { formatDate, formatNumber } from '../lib/format';

const statusMeta = {
  Active: { label: 'نشط', tone: 'emerald', icon: CheckCircle2 },
  Banned: { label: 'ممنوع من امتحان', tone: 'warning', icon: Ban },
  Suspended: { label: 'موقوف من كل الامتحانات', tone: 'danger', icon: ShieldOff },
};

function statusOf(value) {
  return statusMeta[value] || statusMeta.Active;
}

export default function TeacherStudentsPage({ token }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, banned: 0, suspended: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stage, setStage] = useState('');
  const [grade, setGrade] = useState('');

  const [detailTarget, setDetailTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [banTarget, setBanTarget] = useState(null);
  const [banOptions, setBanOptions] = useState([]);
  const [banPick, setBanPick] = useState('');
  const [banLoading, setBanLoading] = useState(false);
  const [banError, setBanError] = useState('');

  const [confirmAction, setConfirmAction] = useState(null);
  const [modalError, setModalError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyStudent, setBusyStudent] = useState('');
  const [busyExam, setBusyExam] = useState('');

  const requestSeq = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setGrade((current) => (current && gradesForStage(stage).includes(current) ? current : ''));
  }, [stage]);

  const load = useCallback(async (background = false) => {
    const seq = ++requestSeq.current;
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (stage) params.set('stage', stage);
      if (grade) params.set('grade', grade);
      const query = params.toString();
      const result = await request(`/api/teacher/students${query ? `?${query}` : ''}`, { token });
      if (seq !== requestSeq.current) return;
      setRows(Array.isArray(result?.items) ? result.items : []);
      setSummary(result?.summary || { total: 0, active: 0, banned: 0, suspended: 0 });
      setError('');
    } catch (err) {
      if (seq === requestSeq.current) setError(err.message);
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token, debouncedSearch, stage, grade]);

  useEffect(() => { load(); }, [load]);

  async function fetchDetail(studentId) {
    return request(`/api/teacher/students/${studentId}`, { token });
  }

  async function refreshAfter(studentId, { closeDetail = false } = {}) {
    await load(true);
    if (closeDetail) {
      setDetail(null);
      setDetailTarget(null);
      return;
    }
    if (detail && detail.studentId === studentId) {
      try {
        setDetail(await fetchDetail(studentId));
      } catch { /* keep the previous snapshot if the refresh fails */ }
    }
  }

  async function openDetail(row) {
    setDetailTarget(row);
    setDetail(null);
    setDetailError('');
    setModalError('');
    setDetailLoading(true);
    try {
      setDetail(await fetchDetail(row.studentId));
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openBanPicker(row) {
    setBanTarget(row);
    setBanOptions([]);
    setBanPick('');
    setBanError('');
    setModalError('');
    setBanLoading(true);
    try {
      const data = await fetchDetail(row.studentId);
      const options = (data?.exams || []).filter((exam) => !exam.isBanned);
      setBanOptions(options);
      setBanPick(options[0]?.examId || '');
    } catch (err) {
      setBanError(err.message);
    } finally {
      setBanLoading(false);
    }
  }

  function askBan(row, exam) {
    setModalError('');
    setConfirmAction({
      kind: 'ban',
      studentId: row.studentId,
      fullName: row.fullName,
      examId: exam.examId,
      examTitle: exam.examTitle,
    });
  }

  function askSuspend(row) {
    setModalError('');
    setConfirmAction({ kind: 'suspend', studentId: row.studentId, fullName: row.fullName });
  }

  function askUnlink(row) {
    setModalError('');
    setConfirmAction({ kind: 'unlink', studentId: row.studentId, fullName: row.fullName });
  }

  async function reactivate(row) {
    setBusyStudent(row.studentId);
    setError('');
    setNotice('');
    try {
      const result = await request(`/api/teacher/students/${row.studentId}/reactivate`, { token, method: 'POST' });
      setNotice(result?.message || 'تمت إعادة تفعيل الطالب.');
      await refreshAfter(row.studentId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyStudent('');
    }
  }

  async function unban(row, exam) {
    setBusyExam(exam.examId);
    setError('');
    setNotice('');
    try {
      const result = await request(`/api/teacher/students/${row.studentId}/exam-bans/${exam.examId}`, { token, method: 'DELETE' });
      setNotice(result?.message || 'تم رفع المنع عن الامتحان.');
      await refreshAfter(row.studentId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyExam('');
    }
  }

  async function submitBan() {
    if (!banTarget || !banPick) return;
    setBusy(true);
    setBanError('');
    try {
      const result = await request(`/api/teacher/students/${banTarget.studentId}/exam-bans`, {
        token,
        method: 'POST',
        body: JSON.stringify({ examId: banPick }),
      });
      setNotice(result?.message || 'تم منع الطالب من الامتحان المحدد.');
      setBanTarget(null);
      setBanOptions([]);
      setBanPick('');
      await refreshAfter(banTarget.studentId);
    } catch (err) {
      setBanError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runConfirmed() {
    if (!confirmAction) return;
    setBusy(true);
    setModalError('');
    try {
      let result;
      if (confirmAction.kind === 'ban') {
        result = await request(`/api/teacher/students/${confirmAction.studentId}/exam-bans`, {
          token,
          method: 'POST',
          body: JSON.stringify({ examId: confirmAction.examId }),
        });
      } else if (confirmAction.kind === 'suspend') {
        result = await request(`/api/teacher/students/${confirmAction.studentId}/suspend`, { token, method: 'POST' });
      } else {
        result = await request(`/api/teacher/students/${confirmAction.studentId}`, { token, method: 'DELETE' });
      }
      setNotice(result?.message || 'تم تنفيذ الإجراء بنجاح.');
      const studentId = confirmAction.studentId;
      const kind = confirmAction.kind;
      setConfirmAction(null);
      await refreshAfter(studentId, { closeDetail: kind === 'unlink' });
    } catch (err) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function clearFilters() {
    setSearch('');
    setStage('');
    setGrade('');
  }

  const hasFilters = Boolean(search.trim() || stage || grade);
  const selectedStatus = detail ? statusOf(detail.status) : null;

  return (
    <div>
      <PageHeader
        eyebrow="إدارة الطلاب"
        title="إدارة الطلاب"
        description="تابع الطلاب المرتبطين بك، وحدد من يمكنه دخول كل امتحان. فك الارتباط أو الإيقاف لا يحذف أي محاولة أو نتيجة سابقة."
        action={<Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="الطلاب المرتبطون" value={formatNumber(summary.total)} note="ارتباط نشط بك" loading={loading} />
        <StatCard icon={UserCheck} label="نشطون" value={formatNumber(summary.active)} note="يمكنهم دخول امتحاناتك" tone="emerald" loading={loading} />
        <StatCard icon={Ban} label="ممنوعون من امتحان" value={formatNumber(summary.banned)} note="منع جزئي لامتحان محدد" tone="warning" loading={loading} />
        <StatCard icon={ShieldOff} label="موقوفون" value={formatNumber(summary.suspended)} note="موقوفون عن كل امتحاناتك" tone="danger" loading={loading} />
      </div>

      <Card className="mb-4 overflow-hidden">
        <div className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث بالاسم أو البريد الإلكتروني..."
                aria-label="ابحث في الطلاب المرتبطين"
                className="h-11 w-full rounded-[11px] border border-line bg-surface-soft pr-9 pl-3 text-[13px] text-ink outline-none transition placeholder:text-subtle focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary-soft"
              />
            </div>
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <Filter size={13} />
              <span>{formatNumber(rows.length)} طالب</span>
              {hasFilters ? <Badge tone="primary">تصفية نشطة</Badge> : null}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Select value={stage} onChange={(event) => setStage(event.target.value)} aria-label="تصفية حسب المرحلة">
              <option value="">كل المراحل</option>
              {EDUCATION_STAGES.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Select value={grade} onChange={(event) => setGrade(event.target.value)} aria-label="تصفية حسب الصف" disabled={!stage}>
              <option value="">كل الصفوف</option>
              {gradesForStage(stage).map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!hasFilters}>مسح الفلاتر</Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Card key={index} className="p-5"><Skeleton className="h-32 w-full" /></Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={hasFilters ? Search : UserRound}
            title={hasFilters ? 'لا توجد نتائج مطابقة' : 'لا يوجد طلاب مرتبطون بعد'}
            description={hasFilters ? 'جرّب تغيير البحث أو المرحلة أو الصف.' : 'سيظهر هنا الطلاب الذين تقبل طلبات تسجيلهم من صفحة طلبات الطلاب.'}
            action={hasFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}>مسح الفلاتر</Button> : null}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => {
            const status = statusOf(row.status);
            const StatusIcon = status.icon;
            const isSuspended = row.status === 'Suspended';
            return (
              <Card key={row.studentId} hover className="flex flex-col p-4 sm:p-5" data-testid={`student-card-${row.studentId}`}>
                <div className="flex items-start gap-3">
                  <Avatar name={row.fullName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[14px] font-bold text-ink">{row.fullName}</p>
                      <Badge tone={status.tone}><StatusIcon size={11} />{status.label}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-subtle" dir="ltr">{row.email}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {row.stage ? <Badge tone="neutral">{row.stage}</Badge> : null}
                      {row.grade ? <Badge tone="neutral">{row.grade}</Badge> : null}
                      {row.bannedExamCount > 0 ? <Badge tone="warning"><Ban size={11} />{formatNumber(row.bannedExamCount)} امتحان ممنوع</Badge> : null}
                    </div>
                  </div>
                  <span className="hidden shrink-0 text-[10.5px] text-subtle sm:block">مرتبط منذ {formatDate(row.linkedAtUtc)}</span>
                </div>

                {row.bannedExams?.length ? (
                  <div className="mt-3 rounded-[12px] border border-warning/20 bg-warning-soft/50 px-3 py-2">
                    <p className="text-[10.5px] font-bold text-warning">ممنوع من:</p>
                    <ul className="mt-1 grid gap-1 text-[11px] leading-5 text-muted">
                      {row.bannedExams.slice(0, 3).map((exam) => (
                        <li key={exam.examId} className="truncate">• {exam.examTitle || 'امتحان محذوف'}</li>
                      ))}
                      {row.bannedExams.length > 3 ? <li>و{formatNumber(row.bannedExams.length - 3)} امتحان آخر</li> : null}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Button size="xs" variant="secondary" icon={Eye} onClick={() => openDetail(row)}>التفاصيل</Button>
                  <Button size="xs" variant="secondary" icon={Ban} onClick={() => openBanPicker(row)}>منع من امتحان</Button>
                  {isSuspended ? (
                    <Button size="xs" variant="success" icon={ShieldCheck} loading={busyStudent === row.studentId} onClick={() => reactivate(row)}>إعادة التفعيل</Button>
                  ) : (
                    <Button size="xs" variant="warning" icon={ShieldOff} onClick={() => askSuspend(row)}>إيقاف الكل</Button>
                  )}
                  <Button size="xs" variant="ghost" icon={UserX} className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => askUnlink(row)}>فك الارتباط</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(detailTarget)}
        onClose={() => { setDetailTarget(null); setDetail(null); setDetailError(''); }}
        title={detail?.fullName || detailTarget?.fullName || 'بيانات الطالب'}
        description={detail ? `${detail.email} · ${detail.stage || 'مرحلة غير محددة'} · ${detail.grade || 'صف غير محدد'}` : 'جارٍ تحميل بيانات الطالب وامتحاناتك المرتبطة به.'}
        icon={UserRound}
        size="lg"
        footer={detail ? (
          <>
            {detail.suspendedAtUtc ? (
              <Button size="sm" variant="success" icon={ShieldCheck} loading={busyStudent === detail.studentId} onClick={() => reactivate(detail)}>إعادة التفعيل</Button>
            ) : (
              <Button size="sm" variant="warning" icon={ShieldOff} onClick={() => askSuspend(detail)}>إيقاف عن كل الامتحانات</Button>
            )}
            <Button size="sm" variant="danger" icon={UserX} onClick={() => askUnlink(detail)}>فك الارتباط</Button>
          </>
        ) : null}
      >
        {modalError && !confirmAction ? <Alert tone="danger" className="mb-4" onClose={() => setModalError('')}>{modalError}</Alert> : null}
        {detailLoading ? (
          <div className="grid gap-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : detailError ? (
          <Alert tone="danger">{detailError}</Alert>
        ) : detail ? (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-[12px] border border-line bg-surface-soft px-3 py-2">
                <p className="text-[10.5px] font-bold text-muted">الحالة</p>
                <div className="mt-1">{selectedStatus ? <Badge tone={selectedStatus.tone}>{selectedStatus.label}</Badge> : null}</div>
              </div>
              <div className="rounded-[12px] border border-line bg-surface-soft px-3 py-2">
                <p className="text-[10.5px] font-bold text-muted">المحاولات</p>
                <p className="ui-number mt-1 text-[15px] font-bold text-ink">{formatNumber(detail.attemptsCount)}</p>
              </div>
              <div className="rounded-[12px] border border-line bg-surface-soft px-3 py-2">
                <p className="text-[10.5px] font-bold text-muted">متاحة الآن</p>
                <p className="ui-number mt-1 text-[15px] font-bold text-emerald">{formatNumber(detail.availableExamCount)}</p>
              </div>
              <div className="rounded-[12px] border border-line bg-surface-soft px-3 py-2">
                <p className="text-[10.5px] font-bold text-muted">ممنوع منها</p>
                <p className="ui-number mt-1 text-[15px] font-bold text-warning">{formatNumber(detail.bannedExamCount)}</p>
              </div>
            </div>

            {detail.suspendedAtUtc ? (
              <Alert tone="warning" className="mb-4" title="الطالب موقوف عن كل امتحاناتك">لن يستطيع بدء أو استكمال أي محاولة حتى تضغط «إعادة التفعيل». المحاولات والنتائج السابقة محفوظة.</Alert>
            ) : null}

            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-bold text-ink">امتحاناتك وارتباط الطالب بها</h3>
              <span className="text-[10.5px] text-subtle">{formatNumber(detail.exams?.length || 0)} امتحان</span>
            </div>
            {detail.exams?.length ? (
              <div className="ui-scrollbar-hidden max-h-[340px] overflow-y-auto rounded-[14px] border border-line">
                <div className="divide-y divide-line">
                  {detail.exams.map((exam) => (
                    <div key={exam.examId} data-testid={`detail-exam-${exam.examId}`} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-[12.5px] font-bold text-ink">{exam.examTitle}</p>
                          {exam.isBanned ? <Badge tone="warning"><Ban size={10} />ممنوع</Badge> : null}
                          {!exam.educationMatches ? <Badge tone="neutral">مرحلة مختلفة</Badge> : null}
                          {!exam.isPublished ? <Badge tone="neutral">غير منشور</Badge> : null}
                        </div>
                        <p className="mt-0.5 text-[10.5px] text-subtle">
                          {exam.examStatus || 'مسودة'} · {formatNumber(exam.attemptsCount)} محاولة
                          {exam.bannedAtUtc ? ` · مُنع في ${formatDate(exam.bannedAtUtc)}` : ''}
                        </p>
                      </div>
                      {exam.isBanned ? (
                        <Button size="xs" variant="secondary" icon={ShieldCheck} loading={busyExam === exam.examId} onClick={() => unban(detail, exam)}>رفع المنع</Button>
                      ) : (
                        <Button size="xs" variant="secondary" icon={Ban} onClick={() => askBan(detail, exam)}>منع من الامتحان</Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-[14px] border border-line bg-surface-soft p-4 text-center text-[12px] text-muted">لا توجد امتحانات غير منتهية لعرضها.</div>
            )}

            <p className="mt-3 text-[10.5px] leading-5 text-subtle">فك الارتباط يخصك أنت فقط، ولا يحذف حساب الطالب أو محاولاته أو نتائجه، ولا يؤثر على ارتباطه بمدرسين آخرين.</p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(banTarget)}
        onClose={() => { setBanTarget(null); setBanOptions([]); setBanPick(''); setBanError(''); }}
        title="منع الطالب من امتحان"
        description={banTarget ? `اختر الامتحان الذي تريد منع ${banTarget.fullName} من دخوله. بقية امتحاناتك تبقى متاحة له.` : ''}
        icon={Ban}
        tone="warning"
        footer={(
          <>
            <Button variant="secondary" size="sm" onClick={() => { setBanTarget(null); setBanOptions([]); setBanPick(''); setBanError(''); }}>إلغاء</Button>
            <Button variant="warning" size="sm" icon={Ban} loading={busy} disabled={!banPick || banLoading} onClick={submitBan}>تأكيد المنع</Button>
          </>
        )}
      >
        {banError ? <Alert tone="danger" className="mb-4">{banError}</Alert> : null}
        {banLoading ? <Skeleton className="h-20 w-full" /> : banOptions.length === 0 ? (
          <Alert tone="info">كل امتحاناتك غير المنتهية ممنوع منها هذا الطالب بالفعل، أو لا توجد امتحانات متاحة للمنع.</Alert>
        ) : (
          <Field label="الامتحان" hint="يمكن للطالب استكمال أي محاولة سابقة، لكنه لن يبدأ محاولة جديدة أو يدخل الامتحان.">
            <Select value={banPick} onChange={(event) => setBanPick(event.target.value)} aria-label="اختر الامتحان">
              {banOptions.map((exam) => <option key={exam.examId} value={exam.examId}>{exam.examTitle}</option>)}
            </Select>
          </Field>
        )}
      </Modal>

      <Modal
        open={Boolean(confirmAction)}
        onClose={() => { if (!busy) { setConfirmAction(null); setModalError(''); } }}
        title={confirmAction?.kind === 'ban' ? 'تأكيد منع الطالب' : confirmAction?.kind === 'suspend' ? 'تأكيد إيقاف الطالب' : 'تأكيد فك الارتباط'}
        description={confirmAction?.kind === 'ban'
          ? `سيُمنع ${confirmAction.fullName} من دخول «${confirmAction.examTitle}» فقط.`
          : confirmAction?.kind === 'suspend'
            ? `سيتوقف وصول ${confirmAction?.fullName} إلى جميع امتحاناتك حتى تعيد تفعيله.`
            : `سيُفك ارتباط ${confirmAction?.fullName} بك فقط.`}
        icon={confirmAction?.kind === 'ban' ? Ban : confirmAction?.kind === 'suspend' ? ShieldOff : Unlink}
        tone={confirmAction?.kind === 'unlink' ? 'danger' : 'warning'}
        footer={(
          <>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setConfirmAction(null); setModalError(''); }}>إلغاء</Button>
            <Button variant={confirmAction?.kind === 'unlink' ? 'danger' : 'warning'} size="sm" loading={busy} onClick={runConfirmed}>
              {confirmAction?.kind === 'ban' ? 'نعم، امنع من الامتحان' : confirmAction?.kind === 'suspend' ? 'نعم، أوقف الطالب' : 'نعم، افك الارتباط'}
            </Button>
          </>
        )}
      >
        {modalError ? <Alert tone="danger" className="mb-4">{modalError}</Alert> : null}
        <Alert tone={confirmAction?.kind === 'unlink' ? 'danger' : 'warning'} title="لن تُحذف أي بيانات">
          {confirmAction?.kind === 'ban'
            ? 'سيبقى للطالب وصول إلى بقية امتحاناتك، وتبقى محاولاته ونتائجه السابقة محفوظة.'
            : confirmAction?.kind === 'suspend'
              ? 'يمكنك إعادة تفعيله في أي وقت من صفحة إدارة الطلاب. المحاولات والنتائج السابقة محفوظة.'
              : 'لن يُحذف حساب الطالب أو محاولاته أو نتائجه، ولن تتأثر علاقته بمدرسين آخرين. يمكنه إرسال طلب ارتباط جديد لاحقاً.'}
        </Alert>
      </Modal>
    </div>
  );
}
