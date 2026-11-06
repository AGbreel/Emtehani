import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  BookOpen,
  CheckCircle2,
  Eye,
  Filter,
  History,
  Link2,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShieldOff,
  Ticket,
  Unlink,
  UserCheck,
  UserPlus,
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
  CopyChip,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  cn,
} from '../components/ui';
import { request } from '../lib/api';
import { EDUCATION_STAGES, gradesForStage, isValidEducation } from '../lib/education';
import { formatDate, formatNumber } from '../lib/format';
import { isValidPhone, normalizeDisplayName, parentNameError, phoneDigits, studentFullNameError } from '../lib/validation';

const statusMeta = {
  Active: { label: 'نشط', tone: 'emerald', icon: CheckCircle2 },
  Banned: { label: 'ممنوع من امتحان', tone: 'warning', icon: Ban },
  Suspended: { label: 'موقوف من كل الامتحانات', tone: 'danger', icon: ShieldOff },
};

const linkRequestMeta = {
  Pending: { label: 'طلب معلّق', tone: 'warning' },
  Accepted: { label: 'مرتبط بك', tone: 'emerald' },
  Rejected: { label: 'مرفوض', tone: 'danger' },
  Unlinked: { label: 'تم فك الارتباط', tone: 'neutral' },
};

const invitationMeta = {
  Pending: { label: 'بانتظار الاستخدام', tone: 'warning' },
  Accepted: { label: 'مستخدمة', tone: 'emerald' },
  Expired: { label: 'منتهية', tone: 'neutral' },
  Cancelled: { label: 'ملغاة', tone: 'danger' },
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

  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState('lookup');
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [requestBusy, setRequestBusy] = useState('');
  const [inviteForm, setInviteForm] = useState({ fullName: '', studentPhone: '', parentPhone: '', parentName: '', stage: '', grade: '' });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteResult, setInviteResult] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ fullName: '', studentPhone: '', parentPhone: '', parentName: '', stage: '', grade: '' });
  const [editHistory, setEditHistory] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');

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

  async function loadInvitations() {
    setInvitationsLoading(true);
    try {
      const rows = await request('/api/teacher/students/invitations', { token });
      setInvitations(Array.isArray(rows) ? rows : []);
    } catch {
      setInvitations([]);
    } finally {
      setInvitationsLoading(false);
    }
  }

  function openAddStudent(mode = 'lookup') {
    setAddOpen(true);
    setAddMode(mode);
    setLookupPhone('');
    setLookupResult(null);
    setLookupError('');
    setInviteError('');
    setInviteResult(null);
    setInviteForm({ fullName: '', studentPhone: '', parentPhone: '', parentName: '', stage: '', grade: '' });
    loadInvitations();
  }

  async function runLookup(event) {
    event?.preventDefault();
    const phone = lookupPhone.replace(/[\s-]/g, '');
    if (!/^\+?\d{7,15}$/.test(phone)) return setLookupError('أدخل رقم هاتف صحيحاً للبحث (7 إلى 15 رقماً).');
    setLookupBusy(true);
    setLookupError('');
    setLookupResult(null);
    try {
      const result = await request(`/api/teacher/students/lookup?phone=${encodeURIComponent(phone)}`, { token });
      setLookupResult(result);
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setLookupBusy(false);
    }
  }

  async function sendLinkRequest(item) {
    setRequestBusy(item.studentId);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/teacher/students/request', {
        token,
        method: 'POST',
        body: JSON.stringify({ studentId: item.studentId }),
      });
      setNotice(result?.message || 'تم إرسال طلب الارتباط.');
      await runLookup();
    } catch (err) {
      setError(err.message);
    } finally {
      setRequestBusy('');
    }
  }

  function switchToInvite(phone = '') {
    setAddMode('invite');
    setInviteError('');
    setInviteForm((current) => ({
      ...current,
      studentPhone: phone || lookupPhone.replace(/[\s-]/g, ''),
      stage: current.stage || lookupResult?.items?.[0]?.stage || '',
      grade: current.grade || lookupResult?.items?.[0]?.grade || '',
    }));
  }

  function updateInvite(field) {
    return (event) => setInviteForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function updateInviteStage(event) {
    const stage = event.target.value;
    setInviteForm((current) => ({ ...current, stage, grade: '' }));
  }

  async function submitInvite(event) {
    event.preventDefault();
    setInviteError('');
    setInviteResult(null);
    const inviteNameError = studentFullNameError(inviteForm.fullName);
    if (inviteNameError) return setInviteError(inviteNameError);
    if (!isValidPhone(inviteForm.studentPhone)) return setInviteError('أدخل رقم هاتف طالب صحيحاً.');
    if (!isValidPhone(inviteForm.parentPhone)) return setInviteError('أدخل رقم هاتف ولي أمر صحيحاً.');
    if (phoneDigits(inviteForm.studentPhone) === phoneDigits(inviteForm.parentPhone)) return setInviteError('رقم هاتف الطالب يجب أن يختلف عن رقم ولي الأمر.');
    const inviteParentError = parentNameError(inviteForm.parentName);
    if (inviteParentError) return setInviteError(inviteParentError);
    if (!isValidEducation(inviteForm.stage, inviteForm.grade)) return setInviteError('اختر المرحلة والصف الدراسي المناسبين.');
    setInviteBusy(true);
    try {
      const result = await request('/api/teacher/students/invite', {
        token,
        method: 'POST',
        body: JSON.stringify({
          fullName: normalizeDisplayName(inviteForm.fullName),
          studentPhone: phoneDigits(inviteForm.studentPhone),
          parentPhone: phoneDigits(inviteForm.parentPhone),
          parentName: normalizeDisplayName(inviteForm.parentName),
          stage: inviteForm.stage,
          grade: inviteForm.grade,
        }),
      });
      setInviteResult(result);
      await loadInvitations();
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviteBusy(false);
    }
  }

  async function openEdit(row) {
    setEditTarget(row);
    setEditOpen(true);
    setEditLoading(true);
    setEditError('');
    setEditHistory(null);
    const fallback = {
      fullName: row.fullName || '',
      studentPhone: '',
      parentPhone: '',
      parentName: '',
      stage: row.stage || '',
      grade: row.grade || '',
    };
    setEditForm(fallback);
    try {
      const data = await request(`/api/teacher/students/${row.studentId}/academic-history`, { token });
      setEditHistory(data);
      setEditForm({
        fullName: data?.student?.fullName || fallback.fullName,
        studentPhone: data?.student?.studentPhone || '',
        parentPhone: data?.student?.parentPhone || '',
        parentName: data?.student?.parentName || '',
        stage: data?.student?.stage || fallback.stage,
        grade: data?.student?.grade || fallback.grade,
      });
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  }

  function updateEdit(field) {
    return (event) => setEditForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function updateEditStage(event) {
    const stage = event.target.value;
    setEditForm((current) => ({ ...current, stage, grade: '' }));
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editTarget) return;
    setEditError('');
    const currentName = normalizeDisplayName(editHistory?.student?.fullName || editTarget?.fullName || '');
    const editNameUnchanged = normalizeDisplayName(editForm.fullName) === currentName;
    if (!editNameUnchanged) {
      const editNameError = studentFullNameError(editForm.fullName);
      if (editNameError) return setEditError(editNameError);
    }
    if (!isValidPhone(editForm.studentPhone)) return setEditError('أدخل رقم هاتف طالب صحيحاً.');
    if (!isValidPhone(editForm.parentPhone)) return setEditError('أدخل رقم هاتف ولي أمر صحيحاً.');
    if (phoneDigits(editForm.studentPhone) === phoneDigits(editForm.parentPhone)) return setEditError('رقم هاتف الطالب يجب أن يختلف عن رقم ولي الأمر.');
    const editParentError = parentNameError(editForm.parentName);
    if (editParentError) return setEditError(editParentError);
    if (!isValidEducation(editForm.stage, editForm.grade)) return setEditError('اختر المرحلة والصف الدراسي المناسبين.');
    setEditBusy(true);
    try {
      const result = await request(`/api/teacher/students/${editTarget.studentId}/profile`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          fullName: normalizeDisplayName(editForm.fullName),
          studentPhone: phoneDigits(editForm.studentPhone),
          parentPhone: phoneDigits(editForm.parentPhone),
          parentName: normalizeDisplayName(editForm.parentName),
          stage: editForm.stage,
          grade: editForm.grade,
        }),
      });
      setNotice(result?.message || 'تم تحديث بيانات الطالب.');
      setEditOpen(false);
      setEditTarget(null);
      await refreshAfter(editTarget.studentId);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditBusy(false);
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
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>
            <Button size="sm" icon={UserPlus} onClick={() => openAddStudent('lookup')}>إضافة طالب</Button>
          </div>
        )}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <div className="ui-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            <Button size="sm" variant="secondary" icon={Pencil} onClick={() => { setDetailTarget(null); setDetail(null); openEdit(detail); }}>تعديل البيانات</Button>
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
            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-[13px] border border-line bg-surface-soft p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11.5px] font-bold text-ink">بيانات الطالب</p>
                  {selectedStatus ? <Badge tone={selectedStatus.tone}>{selectedStatus.label}</Badge> : null}
                </div>
                <dl className="grid gap-1.5 text-[11px]">
                  <div className="flex items-start justify-between gap-2"><dt className="text-muted">الاسم الرباعي</dt><dd className="text-left font-bold text-ink">{detail.fullName || '—'}</dd></div>
                  <div className="flex items-start justify-between gap-2"><dt className="text-muted">هاتف الطالب</dt><dd className="text-left font-bold text-ink" dir="ltr">{detail.studentPhone || 'غير مسجل'}</dd></div>
                  <div className="flex items-start justify-between gap-2"><dt className="text-muted">هاتف ولي الأمر</dt><dd className="text-left font-bold text-ink" dir="ltr">{detail.parentPhone || 'غير مسجل'}</dd></div>
                  <div className="flex items-start justify-between gap-2"><dt className="text-muted">اسم ولي الأمر</dt><dd className="text-left font-bold text-ink">{detail.parentName || 'غير مسجل'}</dd></div>
                  <div className="flex items-start justify-between gap-2"><dt className="text-muted">المرحلة / الصف</dt><dd className="text-left font-bold text-ink">{detail.stage || '—'} · {detail.grade || '—'}</dd></div>
                </dl>
              </div>
              <div className="rounded-[13px] border border-line bg-surface-soft p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11.5px] font-bold text-ink">المحاولات</p>
                  <span className="text-[10px] text-subtle">تُحتسب عند بدء المحاولة فعلياً</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[10px] border border-line bg-surface px-2.5 py-2">
                    <p className="text-[10px] text-muted">المسموح</p>
                    <p className="ui-number mt-0.5 text-[17px] font-bold text-ink">{formatNumber(detail.attempts?.allowed ?? 0)}</p>
                  </div>
                  <div className="rounded-[10px] border border-line bg-surface px-2.5 py-2">
                    <p className="text-[10px] text-muted">المستخدم</p>
                    <p className="ui-number mt-0.5 text-[17px] font-bold text-primary">{formatNumber(detail.attempts?.used ?? 0)}</p>
                  </div>
                  <div className="rounded-[10px] border border-line bg-surface px-2.5 py-2">
                    <p className="text-[10px] text-muted">المكتمل</p>
                    <p className="ui-number mt-0.5 text-[17px] font-bold text-emerald">{formatNumber(detail.attempts?.completed ?? 0)}</p>
                  </div>
                  <div className="rounded-[10px] border border-line bg-surface px-2.5 py-2">
                    <p className="text-[10px] text-muted">المتبقي</p>
                    <p className="ui-number mt-0.5 text-[17px] font-bold text-warning">{formatNumber(detail.attempts?.remaining ?? 0)}</p>
                  </div>
                </div>
                {(detail.attempts?.abandoned > 0 || detail.attempts?.exceptionUsed > 0) ? (
                  <p className="mt-2 text-[10px] leading-5 text-subtle">
                    {detail.attempts.abandoned > 0 ? `محاولات متروكة: ${formatNumber(detail.attempts.abandoned)} · ` : ''}
                    {detail.attempts.exceptionUsed > 0 ? `محاولات استثنائية إضافية: ${formatNumber(detail.attempts.exceptionUsed)}` : ''}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone="emerald">{formatNumber(detail.availableExamCount)} متاحة الآن</Badge>
                  <Badge tone="warning">{formatNumber(detail.bannedExamCount)} ممنوع منها</Badge>
                </div>
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
                          {exam.examStatus || 'مسودة'} · محاولات: {formatNumber(exam.attempts?.used ?? exam.attemptsCount)} / {formatNumber(exam.attempts?.allowed ?? exam.maxAttempts ?? 0)}
                          {' '}· مكتملة: {formatNumber(exam.attempts?.completed ?? 0)} · متبقية: {formatNumber(exam.attempts?.remaining ?? 0)}
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

      <Modal
        open={addOpen}
        onClose={() => { if (!inviteBusy && !lookupBusy) setAddOpen(false); }}
        title="إضافة طالب"
        description="ابحث عن حساب موجود برقم الهاتف وأرسل طلب ارتباط، أو أنشئ دعوة لطالب جديد يستكمل تسجيله بنفسه."
        icon={UserPlus}
        size="lg"
      >
        <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-[12px] border border-line bg-surface-soft p-1">
          <button type="button" onClick={() => setAddMode('lookup')} className={cn('flex min-h-10 items-center justify-center gap-1.5 rounded-[9px] text-[11.5px] font-bold transition', addMode === 'lookup' ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-ink')}>
            <Search size={13} />بحث برقم الهاتف
          </button>
          <button type="button" onClick={() => setAddMode('invite')} className={cn('flex min-h-10 items-center justify-center gap-1.5 rounded-[9px] text-[11.5px] font-bold transition', addMode === 'invite' ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-ink')}>
            <Ticket size={13} />دعوة طالب جديد
          </button>
        </div>

        {addMode === 'lookup' ? (
          <div>
            <form onSubmit={runLookup} className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Phone size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
                <Input dir="ltr" inputMode="tel" value={lookupPhone} onChange={(event) => setLookupPhone(event.target.value)} placeholder="01xxxxxxxxx" className="pl-3 pr-9 text-left" aria-label="رقم هاتف الطالب" />
              </div>
              <Button type="submit" size="sm" icon={Search} loading={lookupBusy}>بحث</Button>
            </form>
            {lookupError ? <Alert tone="danger" className="mt-3">{lookupError}</Alert> : null}

            {lookupResult ? (
              lookupResult.found ? (
                <div className="mt-3 grid gap-2">
                  {lookupResult.items.map((item) => {
                    const meta = item.requestStatus ? linkRequestMeta[item.requestStatus] : null;
                    return (
                      <div key={item.studentId} className="flex flex-col gap-2 rounded-[12px] border border-line bg-surface-soft p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-[12.5px] font-bold text-ink">{item.fullName}</p>
                            {item.masked ? <Badge tone="neutral">بيانات مخفية</Badge> : null}
                            {meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
                          </div>
                          <p className="mt-0.5 text-[10.5px] text-muted">
                            {item.masked
                              ? 'تظهر البيانات الدراسية بعد موافقة الطالب على طلب الارتباط.'
                              : `${item.stage || 'مرحلة غير محددة'} · ${item.grade || 'صف غير محدد'}`}
                          </p>
                        </div>
                        {item.requestStatus === 'Accepted' ? (
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald"><CheckCircle2 size={12} />مرتبط بك</span>
                        ) : item.requestStatus === 'Pending' ? (
                          <span className="text-[10.5px] font-bold text-warning">بانتظار موافقة الطالب</span>
                        ) : (
                          <Button size="xs" icon={Send} loading={requestBusy === item.studentId} onClick={() => sendLinkRequest(item)}>
                            {item.requestStatus === 'Rejected' || item.requestStatus === 'Unlinked' ? 'إعادة إرسال الطلب' : 'إرسال طلب ارتباط'}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-[10px] leading-5 text-subtle">لن يظهر الطالب في قائمتك ولن تصل إلى بياناته التفصيلية إلا بعد موافقته على طلب الارتباط.</p>
                </div>
              ) : (
                <div className="mt-3">
                  <Alert tone="info" title="لا يوجد حساب بهذا الرقم">{lookupResult.message}</Alert>
                  <Button size="sm" variant="secondary" icon={Ticket} className="mt-2" onClick={() => switchToInvite(lookupPhone)}>إنشاء دعوة لطالب جديد</Button>
                </div>
              )
            ) : null}
          </div>
        ) : (
          <div>
            <form onSubmit={submitInvite} className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="اسم الطالب" id="invite-name">
                  <Input id="invite-name" maxLength={120} value={inviteForm.fullName} onChange={updateInvite('fullName')} placeholder="مثال: سارة أحمد" />
                </Field>
                <Field label="رقم هاتف الطالب" id="invite-student-phone" hint="لا يمكن أن يوجد حساب آخر به.">
                  <Input id="invite-student-phone" dir="ltr" inputMode="tel" maxLength={20} value={inviteForm.studentPhone} onChange={updateInvite('studentPhone')} className="text-left" placeholder="01xxxxxxxxx" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="رقم هاتف ولي الأمر" id="invite-parent-phone" hint="قد يتشاركه الإخوة.">
                  <Input id="invite-parent-phone" dir="ltr" inputMode="tel" maxLength={20} value={inviteForm.parentPhone} onChange={updateInvite('parentPhone')} className="text-left" placeholder="01xxxxxxxxx" />
                </Field>
                <Field label="اسم ولي الأمر" id="invite-parent-name">
                  <Input id="invite-parent-name" maxLength={200} value={inviteForm.parentName} onChange={updateInvite('parentName')} placeholder="مثال: أحمد محمد علي" />
                </Field>
                <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                  <Field label="المرحلة" id="invite-stage">
                    <Select id="invite-stage" value={inviteForm.stage} onChange={updateInviteStage}>
                      <option value="">اختر</option>
                      {EDUCATION_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                    </Select>
                  </Field>
                  <Field label="الصف" id="invite-grade">
                    <Select id="invite-grade" value={inviteForm.grade} onChange={updateInvite('grade')} disabled={!inviteForm.stage}>
                      <option value="">{inviteForm.stage ? 'اختر' : 'المرحلة أولاً'}</option>
                      {gradesForStage(inviteForm.stage).map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                    </Select>
                  </Field>
                </div>
              </div>
              {inviteError ? <Alert tone="danger">{inviteError}</Alert> : null}
              {inviteResult ? (
                <div className="rounded-[12px] border border-emerald/25 bg-emerald-soft p-3">
                  <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-emerald"><Link2 size={13} />تم إنشاء رابط الدعوة</p>
                  <p className="mt-1 text-[10.5px] leading-5 text-muted">{inviteResult.message}</p>
                  <div className="mt-2"><CopyChip value={inviteResult.inviteUrl} label="نسخ رابط الدعوة" /></div>
                </div>
              ) : null}
              <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[10px] leading-5 text-subtle">لا توجد خدمة رسائل تلقائية: أرسل الرابط للطالب عبر قناة تتوفر لك. الدعوة صالحة 14 يوماً ولا تنشئ حساباً مكرراً.</p>
                <Button type="submit" size="sm" icon={Ticket} loading={inviteBusy}>إنشاء رابط الدعوة</Button>
              </div>
            </form>

            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12px] font-bold text-ink">الدعوات الأخيرة</h3>
                <Button variant="ghost" size="xs" icon={RefreshCw} loading={invitationsLoading} onClick={loadInvitations}>تحديث</Button>
              </div>
              {invitations.length === 0 ? (
                <p className="rounded-[10px] bg-surface-soft p-3 text-center text-[11px] text-muted">لم ترسل دعوات بعد.</p>
              ) : (
                <div className="grid max-h-52 gap-2 overflow-y-auto">
                  {invitations.slice(0, 8).map((invitation) => {
                    const meta = invitationMeta[invitation.effectiveStatus] || { label: invitation.effectiveStatus, tone: 'neutral' };
                    return (
                      <div key={invitation.invitationId} className="rounded-[10px] border border-line bg-surface-soft p-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <p className="truncate text-[11.5px] font-bold text-ink">{invitation.studentName}</p>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </div>
                        <p className="mt-0.5 text-[10px] text-subtle" dir="ltr">{invitation.studentPhone}</p>
                        {invitation.effectiveStatus === 'Pending' ? <div className="mt-1.5"><CopyChip value={invitation.inviteUrl} label="نسخ الرابط" /></div> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => { if (!editBusy) { setEditOpen(false); setEditTarget(null); setEditError(''); } }}
        title={editTarget ? `تعديل بيانات ${editTarget.fullName}` : 'تعديل بيانات الطالب'}
        description="متاح فقط للطلاب المرتبطين بك ارتباطاً مقبولاً. تغيير المرحلة يحفظ السجل السابق ولا يعدّل المحاولات القديمة."
        icon={Pencil}
        size="lg"
        footer={(
          <>
            <Button variant="secondary" size="sm" disabled={editBusy} onClick={() => { setEditOpen(false); setEditTarget(null); setEditError(''); }}>إلغاء</Button>
            <Button size="sm" icon={ShieldCheck} loading={editBusy} disabled={editLoading} onClick={saveEdit}>حفظ بيانات الطالب</Button>
          </>
        )}
      >
        {editError ? <Alert tone="danger" className="mb-3">{editError}</Alert> : null}
        {editLoading ? <Skeleton className="h-52 w-full" /> : (
          <form onSubmit={saveEdit} className="grid gap-3" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الاسم الكامل" id="edit-name">
                <Input id="edit-name" maxLength={120} value={editForm.fullName} onChange={updateEdit('fullName')} />
              </Field>
              <Field label="رقم هاتف الطالب" id="edit-student-phone">
                <Input id="edit-student-phone" dir="ltr" inputMode="tel" maxLength={20} value={editForm.studentPhone} onChange={updateEdit('studentPhone')} className="text-left" />
              </Field>
            </div>
            <Field label="اسم ولي الأمر" id="edit-parent-name" hint="يظهر في بيانات الطالب للمدرس المرتبط فقط.">
              <Input id="edit-parent-name" maxLength={200} value={editForm.parentName} onChange={updateEdit('parentName')} placeholder="مثال: أحمد محمد علي" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="رقم هاتف ولي الأمر" id="edit-parent-phone">
                <Input id="edit-parent-phone" dir="ltr" inputMode="tel" maxLength={20} value={editForm.parentPhone} onChange={updateEdit('parentPhone')} className="text-left" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="المرحلة" id="edit-stage">
                  <Select id="edit-stage" value={editForm.stage} onChange={updateEditStage}>
                    <option value="">اختر</option>
                    {EDUCATION_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                  </Select>
                </Field>
                <Field label="الصف" id="edit-grade">
                  <Select id="edit-grade" value={editForm.grade} onChange={updateEdit('grade')} disabled={!editForm.stage}>
                    <option value="">{editForm.stage ? 'اختر' : 'المرحلة أولاً'}</option>
                    {gradesForStage(editForm.stage).map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                  </Select>
                </Field>
              </div>
            </div>

            <Alert tone="warning" title="السجل الأكاديمي السابق محفوظ">
              ستبقى محاولات الطالب السابقة ونتائجها كما هي بلقطات المرحلة والصف والسنة الدراسية وقت كل محاولة، ولن تتأثر بتعديل بياناته الآن.
            </Alert>

            <div className="rounded-[12px] border border-line bg-surface-soft p-3">
              <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-ink"><History size={13} className="text-primary" />السجل الأكاديمي السابق</div>
              {editHistory?.history?.length ? (
                <div className="mt-2 grid gap-2">
                  {editHistory.history.map((group) => (
                    <div key={`${group.academicYear}-${group.stage}-${group.grade}`} className="rounded-[9px] border border-line bg-surface p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <p className="text-[11px] font-bold text-ink">{group.stage || 'مرحلة غير محددة'} · {group.grade || 'صف غير محدد'}</p>
                        <Badge tone="primary">{group.academicYear || 'سنة غير محددة'}</Badge>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted">{formatNumber(group.attemptsCount)} محاولة سابقة</p>
                      <div className="mt-1 grid gap-0.5">
                        {(group.items || []).slice(0, 2).map((item) => (
                          <p key={item.id} className="flex items-center justify-between gap-2 text-[10px] text-muted"><span className="truncate">{item.examTitle}</span><span className="ui-number shrink-0">{item.resultsAvailable ? `${formatNumber(item.score)} / ${formatNumber(item.maxScore)}` : 'غير متاحة'}</span></p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-1 text-[10.5px] text-muted">لا توجد محاولات سابقة مسجلة.</p>}
              {editHistory?.changes?.length ? (
                <div className="mt-2 border-t border-line pt-2">
                  <p className="text-[10.5px] font-bold text-muted">تغييرات المرحلة والصف</p>
                  <div className="mt-1 grid gap-1">
                    {editHistory.changes.slice(0, 4).map((change) => (
                      <p key={change.id} className="text-[10px] leading-5 text-subtle">
                        {formatDate(change.changedAtUtc)}: {change.previousStage || '—'} / {change.previousGrade || '—'} ← {change.newStage || '—'} / {change.newGrade || '—'}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
