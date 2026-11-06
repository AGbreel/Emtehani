import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen, CalendarPlus, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, FileText,
  GraduationCap, MessageCircle, Pencil, Plus, QrCode, RefreshCw, Search, Settings2,
  Trash2, UserPlus, Users, Video, XCircle,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal,
  PageHeader, Select, Skeleton, StatCard, Textarea, cn,
} from '../components/ui';
import { request } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';

const weekDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const statusLabels = { Scheduled: 'مجدولة', Waiting: 'بانتظار البدء', InProgress: 'جارية', Live: 'مباشر', Completed: 'منتهية', Cancelled: 'ملغاة' };
const attendanceLabels = { Present: 'حاضر', Absent: 'غائب', Late: 'متأخر', Excused: 'بعذر' };

const emptyGroup = {
  name: '', description: '', subject: '', stage: '', grade: '', academicYear: '',
  deliveryMode: 'Online', capacity: 20, location: '', onlineLink: '', price: 0,
  paymentType: 'Monthly', monthlyDueDay: 1, sessionBillingPolicy: 'PerAttendedSession',
  startDate: '', endDate: '', enrollmentOpen: true, isActive: true,
  lateGraceMinutes: 10, qrValidityMinutes: 5, chatMode: 'Everyone',
};

function GroupForm({ open, onClose, token, group, onSaved }) {
  const [form, setForm] = useState(emptyGroup);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(group ? {
      name: group.name || '', description: group.description || '', subject: group.subject || '',
      stage: group.stage || '', grade: group.grade || '', academicYear: group.academicYear || '',
      deliveryMode: group.deliveryMode || 'Online', capacity: group.capacity ?? 20,
      location: group.location || '', onlineLink: group.onlineLink || '', price: group.price ?? 0,
      paymentType: group.paymentType || 'Monthly', monthlyDueDay: group.monthlyDueDay ?? 1,
      sessionBillingPolicy: group.sessionBillingPolicy || 'PerAttendedSession',
      startDate: group.startDateUtc ? group.startDateUtc.slice(0, 10) : '',
      endDate: group.endDateUtc ? group.endDateUtc.slice(0, 10) : '',
      enrollmentOpen: group.enrollmentOpen ?? true, isActive: group.isActive ?? true,
      lateGraceMinutes: group.lateGraceMinutes ?? 10, qrValidityMinutes: group.qrValidityMinutes ?? 5,
      chatMode: group.chatMode || 'Everyone',
    } : emptyGroup);
  }, [open, group]);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function save() {
    setError('');
    if (!form.name.trim() || !form.subject.trim()) { setError('اسم المجموعة والمادة مطلوبان.'); return; }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(), description: form.description || null, subject: form.subject.trim(),
        stage: form.stage || null, grade: form.grade || null, academicYear: form.academicYear || null,
        deliveryMode: form.deliveryMode, capacity: Math.max(1, Number(form.capacity) || 20),
        location: form.location || null, onlineLink: form.onlineLink || null,
        price: Math.max(0, Number(form.price) || 0), paymentType: form.paymentType,
        monthlyDueDay: Math.min(28, Math.max(1, Number(form.monthlyDueDay) || 1)),
        sessionBillingPolicy: form.sessionBillingPolicy,
        startDate: form.startDate ? `${form.startDate}T00:00:00Z` : null,
        endDate: form.endDate ? `${form.endDate}T00:00:00Z` : null,
        enrollmentOpen: form.enrollmentOpen, isActive: form.isActive,
        lateGraceMinutes: Number(form.lateGraceMinutes) || 0, qrValidityMinutes: Number(form.qrValidityMinutes) || 5,
        chatMode: form.chatMode,
      };
      const result = group
        ? await request(`/api/teaching/groups/${group.id}`, { token, method: 'PUT', body: JSON.stringify(payload) })
        : await request('/api/teaching/groups', { token, method: 'POST', body: JSON.stringify(payload) });
      onSaved?.(group ? group.id : result?.id);
      onClose?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" icon={Users} title={group ? 'تعديل المجموعة' : 'مجموعة جديدة'} description="المجموعة تجمع الطلاب مع جدول حصص ورسوم وحضور."
      footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} onClick={save}>{group ? 'حفظ' : 'إنشاء'}</Button></>}>
      <div className="grid gap-4 py-2">
        {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المجموعة"><Input value={form.name} onChange={set('name')} /></Field>
          <Field label="المادة"><Input value={form.subject} onChange={set('subject')} /></Field>
          <Field label="المرحلة"><Input value={form.stage} onChange={set('stage')} placeholder="ثانوي" /></Field>
          <Field label="الصف"><Input value={form.grade} onChange={set('grade')} placeholder="الثالث الثانوي" /></Field>
          <Field label="العام الدراسي"><Input value={form.academicYear} onChange={set('academicYear')} placeholder="2026/2027" /></Field>
          <Field label="النمط">
            <Select value={form.deliveryMode} onChange={set('deliveryMode')}><option value="Online">أونلاين</option><option value="Offline">حضوري</option><option value="Hybrid">مدمج</option></Select>
          </Field>
          <Field label="السعة"><Input type="number" min="1" value={form.capacity} onChange={set('capacity')} /></Field>
          <Field label="السعر (ج.م)"><Input type="number" min="0" value={form.price} onChange={set('price')} /></Field>
          <Field label="نوع الدفع">
            <Select value={form.paymentType} onChange={set('paymentType')}><option value="Monthly">شهري</option><option value="PerSession">بالحصة</option></Select>
          </Field>
          <Field label="يوم الاستحقاق الشهري"><Input type="number" min="1" max="28" value={form.monthlyDueDay} onChange={set('monthlyDueDay')} /></Field>
          <Field label="سياسة احتساب الحصص">
            <Select value={form.sessionBillingPolicy} onChange={set('sessionBillingPolicy')}><option value="PerAttendedSession">عند الحضور</option><option value="PerScheduledSession">عند الجدولة</option></Select>
          </Field>
          <Field label="نافذة QR (دقائق)"><Input type="number" min="1" max="30" value={form.qrValidityMinutes} onChange={set('qrValidityMinutes')} /></Field>
          <Field label="سماح التأخير (دقائق)"><Input type="number" min="0" max="120" value={form.lateGraceMinutes} onChange={set('lateGraceMinutes')} /></Field>
          <Field label="تاريخ البداية"><Input type="date" value={form.startDate} onChange={set('startDate')} /></Field>
          <Field label="تاريخ النهاية"><Input type="date" value={form.endDate} onChange={set('endDate')} /></Field>
          <Field label="وضع المحادثة">
            <Select value={form.chatMode} onChange={set('chatMode')}>
              <option value="Everyone">الجميع يرسل</option>
              <option value="TeacherOnly">المعلم فقط</option>
              <option value="Moderated">رسائل الطلاب بموافقة</option>
            </Select>
          </Field>
        </div>
        <Field label="الوصف"><Textarea value={form.description} onChange={set('description')} className="min-h-20" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="المكان (للحضوري)"><Input value={form.location} onChange={set('location')} /></Field>
          <Field label="رابط الحصة (للأونلاين)"><Input value={form.onlineLink} onChange={set('onlineLink')} placeholder="https://..." /></Field>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-bold">
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={form.enrollmentOpen} onChange={(e) => setForm((p) => ({ ...p, enrollmentOpen: e.target.checked }))} />التسجيل مفتوح</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />المجموعة نشطة</label>
        </div>
      </div>
    </Modal>
  );
}

export default function TeachingGroupsPage({ token, onOpenChat }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState('members');
  const [students, setStudents] = useState([]);
  const [busy, setBusy] = useState('');
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionForm, setSessionForm] = useState({ date: '', startTime: '18:00', endTime: '19:30', title: '', deliveryMode: '', location: '', onlineLink: '', notes: '' });
  const [attendanceSession, setAttendanceSession] = useState(null);
  const [attendanceItems, setAttendanceItems] = useState([]);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ dayOfWeek: 6, startTime: '18:00', endTime: '19:30', location: '' });
  const [homework, setHomework] = useState([]);
  const [homeworkOpen, setHomeworkOpen] = useState(false);
  const [homeworkForm, setHomeworkForm] = useState({ title: '', prompt: '', dueAtUtc: '', allowLateSubmission: true, maxPoints: 10, isPublished: true });
  const [homeworkDetail, setHomeworkDetail] = useState(null);
  const [gradeTarget, setGradeTarget] = useState(null);
  const [gradeForm, setGradeForm] = useState({ grade: 0, feedback: '' });
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      const result = await request(`/api/teaching/groups?${params}`, { token });
      setGroups(result?.items ?? []);
      setError('');
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [token, query]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id, quiet = false) => {
    if (!quiet) setDetailLoading(true);
    try {
      const result = await request(`/api/teaching/groups/${id}`, { token });
      setDetail(result);
      setError('');
    } catch (err) { setError(err.message); } finally { setDetailLoading(false); }
  }, [token]);

  useEffect(() => { if (activeId) loadDetail(activeId); else setDetail(null); }, [activeId, loadDetail]);

  const loadStudents = useCallback(async () => {
    try {
      const result = await request('/api/teacher/students', { token });
      setStudents(result?.items ?? []);
    } catch { /* non-critical */ }
  }, [token]);

  useEffect(() => { if (activeId) { loadStudents(); loadHomework(); } }, [activeId, loadStudents]);

  const loadHomework = useCallback(async () => {
    if (!activeId) return;
    try {
      const result = await request(`/api/teaching/homework?groupId=${activeId}`, { token });
      setHomework(result?.items ?? []);
    } catch (err) { setError(err.message); }
  }, [token, activeId]);

  const activeCount = useMemo(() => (detail?.Members || []).filter((m) => m.status === 'Active').length, [detail]);

  async function addMember(studentId) {
    setBusy('member');
    try {
      await request(`/api/teaching/groups/${activeId}/members`, { token, method: 'POST', body: JSON.stringify({ studentId, note: null }) });
      setNotice('تمت إضافة الطالب للمجموعة.');
      await loadDetail(activeId, true);
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  async function removeMember(studentId) {
    if (!window.confirm('إزالة الطالب من المجموعة؟')) return;
    try {
      await request(`/api/teaching/groups/${activeId}/members/${studentId}`, { token, method: 'DELETE' });
      await loadDetail(activeId, true);
    } catch (err) { setError(err.message); }
  }

  async function addSchedule() {
    setModalBusy(true); setModalError('');
    try {
      await request(`/api/teaching/groups/${activeId}/schedules`, {
        token, method: 'POST',
        body: JSON.stringify({ dayOfWeek: Number(scheduleForm.dayOfWeek), startTime: scheduleForm.startTime, endTime: scheduleForm.endTime, location: scheduleForm.location || null, isActive: true }),
      });
      setScheduleOpen(false);
      await loadDetail(activeId, true);
    } catch (err) { setModalError(err.message); } finally { setModalBusy(false); }
  }

  async function deleteSchedule(id) {
    try {
      await request(`/api/teaching/schedules/${id}`, { token, method: 'DELETE' });
      await loadDetail(activeId, true);
    } catch (err) { setError(err.message); }
  }

  async function createSession() {
    setModalBusy(true); setModalError('');
    try {
      await request(`/api/teaching/groups/${activeId}/sessions`, {
        token, method: 'POST',
        body: JSON.stringify({
          date: sessionForm.date ? `${sessionForm.date}T00:00:00Z` : null,
          startTime: sessionForm.startTime, endTime: sessionForm.endTime,
          title: sessionForm.title || null, deliveryMode: sessionForm.deliveryMode || null,
          location: sessionForm.location || null, onlineLink: sessionForm.onlineLink || null,
          notes: sessionForm.notes || null,
        }),
      });
      setSessionOpen(false);
      setSessionForm((prev) => ({ ...prev, title: '', notes: '' }));
      await loadDetail(activeId, true);
    } catch (err) { setModalError(err.message); } finally { setModalBusy(false); }
  }

  async function generateSessions() {
    setBusy('generate');
    try {
      const from = new Date();
      const to = new Date(Date.now() + 30 * 86400000);
      const result = await request(`/api/teaching/groups/${activeId}/sessions/generate`, {
        token, method: 'POST',
        body: JSON.stringify({ fromDate: from.toISOString(), toDate: to.toISOString() }),
      });
      setNotice(`تم توليد ${result?.created ?? 0} حصة من الجدول.`);
      await loadDetail(activeId, true);
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  async function sessionAction(session, action) {
    setBusy(session.id);
    try {
      const path = `/api/teaching/sessions/${session.id}/${action}`;
      const body = action === 'cancel' ? JSON.stringify({ reason: 'إلغاء من إدارة المجموعة' }) : undefined;
      await request(path, { token, method: 'POST', ...(body ? { body } : {}) });
      await loadDetail(activeId, true);
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  async function openAttendance(session) {
    setError('');
    try {
      const result = await request(`/api/teaching/sessions/${session.id}/attendance`, { token });
      setAttendanceSession({ ...session, ...result.session, group: result.Group });
      setAttendanceItems(result.items ?? []);
    } catch (err) { setError(err.message); }
  }

  async function saveAttendance() {
    setAttendanceBusy(true);
    try {
      await request(`/api/teaching/sessions/${attendanceSession.id}/attendance`, {
        token, method: 'POST',
        body: JSON.stringify({ entries: attendanceItems.map((x) => ({ studentId: x.studentId, status: x.status, note: x.note || null, reason: null })) }),
      });
      setNotice('تم حفظ الحضور.');
      setAttendanceSession(null);
      await loadDetail(activeId, true);
    } catch (err) { setError(err.message); } finally { setAttendanceBusy(false); }
  }

  async function createHomework() {
    setModalBusy(true); setModalError('');
    try {
      await request('/api/teaching/homework', {
        token, method: 'POST',
        body: JSON.stringify({
          title: homeworkForm.title, prompt: homeworkForm.prompt || null,
          groupId: activeId, courseId: null, lessonId: null,
          dueAtUtc: homeworkForm.dueAtUtc ? new Date(homeworkForm.dueAtUtc).toISOString() : null,
          allowLateSubmission: homeworkForm.allowLateSubmission,
          maxPoints: Number(homeworkForm.maxPoints) || 10, isPublished: homeworkForm.isPublished,
        }),
      });
      setHomeworkOpen(false);
      setHomeworkForm({ title: '', prompt: '', dueAtUtc: '', allowLateSubmission: true, maxPoints: 10, isPublished: true });
      await loadHomework();
    } catch (err) { setModalError(err.message); } finally { setModalBusy(false); }
  }

  async function openHomeworkDetail(id) {
    try {
      const result = await request(`/api/teaching/homework/${id}`, { token });
      setHomeworkDetail(result);
    } catch (err) { setError(err.message); }
  }

  async function saveGrade() {
    setModalBusy(true); setModalError('');
    try {
      await request(`/api/teaching/homework/submissions/${gradeTarget.id}/grade`, {
        token, method: 'POST',
        body: JSON.stringify({ grade: Number(gradeForm.grade) || 0, feedback: gradeForm.feedback || null }),
      });
      setGradeTarget(null);
      if (homeworkDetail) await openHomeworkDetail(homeworkDetail.id);
    } catch (err) { setModalError(err.message); } finally { setModalBusy(false); }
  }

  if (activeId && detail) {
    const group = detail;
    const tabs = [
      { key: 'members', label: 'الأعضاء', icon: Users },
      { key: 'sessions', label: 'الحصص', icon: CalendarDays },
      { key: 'schedule', label: 'الجدول', icon: Clock3 },
      { key: 'homework', label: 'الواجبات', icon: FileText },
    ];
    return (
      <div>
        <PageHeader eyebrow="إدارة المجموعات" title={group.name} description={`${group.subject} · ${group.stage || 'كل المراحل'} · ${group.deliveryMode}`}
          action={<>
            <Button variant="secondary" size="sm" onClick={() => setActiveId(null)}>كل المجموعات</Button>
            {group.chatConversationId ? <Button variant="secondary" size="sm" icon={MessageCircle} onClick={() => onOpenChat?.()}>المحادثة</Button> : null}
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => { setEditing(group); setFormOpen(true); }}>تعديل</Button>
            <Button size="sm" icon={CalendarPlus} onClick={() => { setModalError(''); setSessionOpen(true); }}>حصة جديدة</Button>
          </>} />
        {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
        {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

        <div className="ui-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Users} label="الأعضاء" value={`${formatNumber(activeCount)} / ${formatNumber(group.capacity)}`} />
          <StatCard icon={CalendarDays} label="حصص قادمة" value={formatNumber((group.sessions || []).filter((s) => new Date(s.startsAtUtc) > new Date() && s.status !== 'Cancelled').length)} tone="blue" />
          <StatCard icon={ClipboardCheck} label="الرسوم" value={group.price ? `${formatNumber(group.price)} ج.م` : 'مجانية'} note={group.paymentType === 'Monthly' ? 'شهري' : 'بالحصة'} tone="warning" />
          <StatCard icon={MessageCircle} label="وضع المحادثة" value={group.chatMode === 'TeacherOnly' ? 'المعلم فقط' : group.chatMode === 'Moderated' ? 'مراجعة' : 'الجميع'} tone="emerald" />
        </div>

        <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
          {tabs.map((item) => (
            <button key={item.key} type="button" onClick={() => setTab(item.key)}
              className={cn('inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12px] font-bold transition', tab === item.key ? 'bg-primary text-white' : 'text-muted hover:text-ink')}>
              <item.icon size={14} /> {item.label}
            </button>
          ))}
        </div>

        {tab === 'members' ? (
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13.5px] font-bold">أعضاء المجموعة</h2>
              <Select className="h-9 w-56" defaultValue="" onChange={(e) => { if (e.target.value) addMember(e.target.value); e.target.value = ''; }}>
                <option value="">إضافة طالب...</option>
                {students.filter((s) => !(group.members || []).some((m) => m.studentId === (s.studentId || s.id) && m.status !== 'Left')).map((s) => (
                  <option key={s.studentId || s.id} value={s.studentId || s.id}>{s.fullName || s.name}</option>
                ))}
              </Select>
            </div>
            {(group.members || []).length === 0 ? <EmptyState icon={UserPlus} title="لا يوجد أعضاء بعد" description="أضف طلابًا مرتبطين بحسابك من القائمة أعلى." /> : (
              <div className="grid gap-2">
                {group.members.map((member) => (
                  <div key={member.studentId} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-surface-soft p-3">
                    <div>
                      <p className="text-[12.5px] font-bold">{member.name}</p>
                      <p className="text-[10.5px] text-muted">{member.studentCode || '—'} · {member.studentPhone || 'بدون هاتف'}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={member.status === 'Active' ? 'emerald' : member.status === 'Suspended' ? 'warning' : 'neutral'}>{member.status === 'Active' ? 'نشط' : member.status === 'Suspended' ? 'موقوف' : 'غادر'}</Badge>
                      <Button size="xs" variant="ghost" onClick={async () => {
                        try {
                          await request(`/api/teaching/groups/${activeId}/members/${member.studentId}`, {
                            token, method: 'PUT',
                            body: JSON.stringify({ status: member.status === 'Active' ? 'Suspended' : 'Active', note: member.note || null }),
                          });
                          await loadDetail(activeId, true);
                        } catch (err) { setError(err.message); }
                      }}>{member.status === 'Active' ? 'إيقاف' : 'تفعيل'}</Button>
                      <IconButton label="إزالة" onClick={() => removeMember(member.studentId)}><Trash2 size={14} /></IconButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : null}

        {tab === 'sessions' ? (
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13.5px] font-bold">الحصص</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={RefreshCw} loading={busy === 'generate'} onClick={generateSessions}>توليد من الجدول</Button>
                <Button size="sm" icon={CalendarPlus} onClick={() => { setModalError(''); setSessionOpen(true); }}>حصة</Button>
              </div>
            </div>
            {(group.sessions || []).length === 0 ? <EmptyState icon={CalendarDays} title="لا توجد حصص" description="أضف جدولًا أسبوعيًا ثم ولّد الحصص تلقائيًا." /> : (
              <div className="grid gap-2">
                {group.sessions.map((session) => {
                  const past = new Date(session.endsAtUtc) < new Date();
                  return (
                    <div key={session.id} className="rounded-[12px] border border-line bg-surface-soft p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[12.5px] font-bold">{session.title || 'حصة'} <span className="text-[10.5px] font-normal text-muted">· {session.deliveryMode}</span></p>
                          <p className="text-[10.5px] text-muted">{formatDate(session.startsAtUtc)} — {formatDate(session.endsAtUtc)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={session.status === 'Cancelled' ? 'danger' : session.status === 'Completed' ? 'neutral' : session.status === 'InProgress' ? 'emerald' : 'blue'}>{statusLabels[session.displayStatus] || statusLabels[session.status] || session.status}</Badge>
                          {!past && session.status !== 'Cancelled' ? (
                            <>
                              {session.status !== 'InProgress' ? <Button size="xs" variant="soft" onClick={() => sessionAction(session, 'start')} loading={busy === session.id}>بدء</Button> : <Button size="xs" variant="secondary" onClick={() => sessionAction(session, 'end')}>إنهاء</Button>}
                              <Button size="xs" variant="secondary" icon={ClipboardCheck} onClick={() => openAttendance(session)}>الحضور</Button>
                              <Button size="xs" variant="ghost" icon={XCircle} onClick={async () => {
                                const date = window.prompt('تاريخ جديد (YYYY-MM-DD)');
                                if (!date) return;
                                const start = window.prompt('وقت البداية HH:mm', '18:00');
                                const end = window.prompt('وقت النهاية HH:mm', '19:30');
                                if (!start || !end) return;
                                try {
                                  await request(`/api/teaching/sessions/${session.id}/reschedule`, { token, method: 'POST', body: JSON.stringify({ date: `${date}T00:00:00Z`, startTime: start, endTime: end, reason: 'تأجيل' }) });
                                  await loadDetail(activeId, true);
                                } catch (err) { setError(err.message); }
                              }}>تأجيل</Button>
                              <Button size="xs" variant="ghost" onClick={() => sessionAction(session, 'cancel')}>إلغاء</Button>
                            </>
                          ) : <Button size="xs" variant="secondary" icon={ClipboardCheck} onClick={() => openAttendance(session)}>الحضور</Button>}
                        </div>
                      </div>
                      {session.onlineLink ? <a href={session.onlineLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-bold text-primary"><Video size={11} /> رابط الحصة</a> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ) : null}

        {tab === 'schedule' ? (
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13.5px] font-bold">الجدول الأسبوعي</h2>
              <Button size="sm" icon={Plus} onClick={() => { setModalError(''); setScheduleOpen(true); }}>موعد جديد</Button>
            </div>
            {(group.schedules || []).length === 0 ? <EmptyState icon={Clock3} title="لا يوجد جدول" description="أضف المواعيد الأسبوعية لتوليد الحصص تلقائيًا." /> : (
              <div className="grid gap-2">
                {group.schedules.map((slot) => (
                  <div key={slot.id || slot.Id} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-surface-soft p-3">
                    <div>
                      <p className="text-[12.5px] font-bold">{weekDays[slot.dayOfWeek] || slot.dayOfWeek}</p>
                      <p className="text-[10.5px] text-muted">{slot.startTime} — {slot.endTime}{slot.location ? ` · ${slot.location}` : ''}</p>
                    </div>
                    <IconButton label="حذف" onClick={() => deleteSchedule(slot.id || slot.Id)}><Trash2 size={14} /></IconButton>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : null}

        {tab === 'homework' ? (
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13.5px] font-bold">واجبات المجموعة</h2>
              <Button size="sm" icon={Plus} onClick={() => { setModalError(''); setHomeworkOpen(true); }}>واجب جديد</Button>
            </div>
            {homework.length === 0 ? <EmptyState icon={FileText} title="لا توجد واجبات" description="أضف واجبًا وحدد موعد التسليم والدرجة." /> : (
              <div className="grid gap-2">
                {homework.map((item) => (
                  <button key={item.id} type="button" onClick={() => openHomeworkDetail(item.id)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-surface-soft p-3 text-right transition hover:border-primary/40">
                    <div>
                      <p className="text-[12.5px] font-bold">{item.title} {item.isPublished ? '' : <Badge tone="neutral">مسودة</Badge>}</p>
                      <p className="text-[10.5px] text-muted">{item.dueAtUtc ? `التسليم ${formatDate(item.dueAtUtc)}` : 'بدون موعد'} · {item.submissionCount || 0} تسليم</p>
                    </div>
                    <Badge tone={item.reviewedCount ? 'emerald' : 'warning'}>{item.reviewedCount || 0}/{item.submissionCount || 0} مصحح</Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>
        ) : null}

        <GroupForm open={formOpen} onClose={() => setFormOpen(false)} token={token} group={group} onSaved={() => loadDetail(activeId, true)} />

        <Modal open={sessionOpen} onClose={() => setSessionOpen(false)} title="حصة جديدة" icon={CalendarPlus} size="sm"
          footer={<><Button variant="ghost" size="sm" onClick={() => setSessionOpen(false)}>إلغاء</Button><Button size="sm" loading={modalBusy} onClick={createSession}>إضافة</Button></>}>
          <div className="grid gap-3 py-2">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <Field label="التاريخ"><Input type="date" value={sessionForm.date} onChange={(e) => setSessionForm((p) => ({ ...p, date: e.target.value }))} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="من"><Input type="time" value={sessionForm.startTime} onChange={(e) => setSessionForm((p) => ({ ...p, startTime: e.target.value }))} /></Field>
              <Field label="إلى"><Input type="time" value={sessionForm.endTime} onChange={(e) => setSessionForm((p) => ({ ...p, endTime: e.target.value }))} /></Field>
            </div>
            <Field label="عنوان الحصة"><Input value={sessionForm.title} onChange={(e) => setSessionForm((p) => ({ ...p, title: e.target.value }))} /></Field>
            <Field label="المكان"><Input value={sessionForm.location} onChange={(e) => setSessionForm((p) => ({ ...p, location: e.target.value }))} /></Field>
            <Field label="رابط الحصة"><Input value={sessionForm.onlineLink} onChange={(e) => setSessionForm((p) => ({ ...p, onlineLink: e.target.value }))} /></Field>
            {modalError ? null : null}
          </div>
        </Modal>

        <Modal open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="موعد أسبوعي" icon={Clock3} size="sm"
          footer={<><Button variant="ghost" size="sm" onClick={() => setScheduleOpen(false)}>إلغاء</Button><Button size="sm" loading={modalBusy} onClick={addSchedule}>حفظ</Button></>}>
          <div className="grid gap-3 py-2">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <Field label="اليوم"><Select value={scheduleForm.dayOfWeek} onChange={(e) => setScheduleForm((p) => ({ ...p, dayOfWeek: e.target.value }))}>{weekDays.map((day, index) => <option key={day} value={index}>{day}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="من"><Input type="time" value={scheduleForm.startTime} onChange={(e) => setScheduleForm((p) => ({ ...p, startTime: e.target.value }))} /></Field>
              <Field label="إلى"><Input type="time" value={scheduleForm.endTime} onChange={(e) => setScheduleForm((p) => ({ ...p, endTime: e.target.value }))} /></Field>
            </div>
            <Field label="المكان"><Input value={scheduleForm.location} onChange={(e) => setScheduleForm((p) => ({ ...p, location: e.target.value }))} /></Field>
          </div>
        </Modal>

        <Modal open={Boolean(attendanceSession)} onClose={() => setAttendanceSession(null)} title={`حضور: ${attendanceSession?.title || 'حصة'}`} icon={ClipboardCheck} size="lg"
          footer={<><Button variant="ghost" size="sm" onClick={() => setAttendanceSession(null)}>إغلاق</Button><Button size="sm" loading={attendanceBusy} onClick={saveAttendance}>حفظ الحضور</Button></>}>
          <div className="grid gap-2 py-2">
            {attendanceItems.map((student) => (
              <div key={student.studentId} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-surface-soft p-2.5">
                <div><p className="text-[12px] font-bold">{student.name}</p><p className="text-[10px] text-muted">{student.studentCode || ''}</p></div>
                <div className="flex gap-1">
                  {Object.entries(attendanceLabels).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setAttendanceItems((prev) => prev.map((item) => item.studentId === student.studentId ? { ...item, status: value } : item))}
                      className={cn('rounded-lg border px-2 py-1 text-[10.5px] font-bold transition', student.status === value ? 'border-primary bg-primary text-white' : 'border-line bg-surface text-muted')}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {attendanceItems.length === 0 ? <p className="py-4 text-center text-[11.5px] text-muted">لا يوجد أعضاء نشطون.</p> : null}
          </div>
        </Modal>

        <Modal open={homeworkOpen} onClose={() => setHomeworkOpen(false)} title="واجب جديد" icon={FileText} size="sm"
          footer={<><Button variant="ghost" size="sm" onClick={() => setHomeworkOpen(false)}>إلغاء</Button><Button size="sm" loading={modalBusy} onClick={createHomework}>نشر الواجب</Button></>}>
          <div className="grid gap-3 py-2">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <Field label="العنوان"><Input value={homeworkForm.title} onChange={(e) => setHomeworkForm((p) => ({ ...p, title: e.target.value }))} /></Field>
            <Field label="المطلوب"><Textarea value={homeworkForm.prompt} onChange={(e) => setHomeworkForm((p) => ({ ...p, prompt: e.target.value }))} className="min-h-24" /></Field>
            <Field label="موعد التسليم"><Input type="datetime-local" value={homeworkForm.dueAtUtc} onChange={(e) => setHomeworkForm((p) => ({ ...p, dueAtUtc: e.target.value }))} /></Field>
            <Field label="الدرجة"><Input type="number" min="1" value={homeworkForm.maxPoints} onChange={(e) => setHomeworkForm((p) => ({ ...p, maxPoints: e.target.value }))} /></Field>
            <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" className="accent-primary" checked={homeworkForm.allowLateSubmission} onChange={(e) => setHomeworkForm((p) => ({ ...p, allowLateSubmission: e.target.checked }))} />السماح بالتسليم المتأخر</label>
          </div>
        </Modal>

        <Modal open={Boolean(homeworkDetail)} onClose={() => setHomeworkDetail(null)} title={homeworkDetail?.title || 'الواجب'} icon={FileText} size="lg">
          {homeworkDetail ? (
            <div className="grid gap-3 py-2">
              {homeworkDetail.prompt ? <p className="rounded-xl bg-surface-soft p-3 text-[12px] leading-6 text-muted">{homeworkDetail.prompt}</p> : null}
              <div className="flex flex-wrap gap-2 text-[11px] text-muted">
                <Badge tone="blue">{homeworkDetail.targetCount || 0} طالب مستهدف</Badge>
                <Badge tone="warning">{homeworkDetail.maxPoints} درجة</Badge>
                {homeworkDetail.dueAtUtc ? <Badge tone="neutral">التسليم {formatDate(homeworkDetail.dueAtUtc)}</Badge> : null}
              </div>
              {(homeworkDetail.submissions || []).length === 0 ? <EmptyState icon={FileText} title="لا توجد تسليمات" description="سيظهر هنا تسليم الطلاب فور إرسالهم." /> : (
                <div className="grid gap-2">
                  {homeworkDetail.submissions.map((submission) => (
                    <div key={submission.id} className="rounded-[10px] border border-line bg-surface-soft p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div><p className="text-[12px] font-bold">{submission.studentName}</p><p className="text-[10px] text-muted">{submission.studentCode} · {submission.status}</p></div>
                        <div className="flex items-center gap-2">
                          {submission.grade != null ? <Badge tone="emerald">{submission.grade} / {homeworkDetail.maxPoints}</Badge> : null}
                          <Button size="xs" variant="soft" onClick={() => { setGradeForm({ grade: submission.grade ?? 0, feedback: submission.feedback || '' }); setGradeTarget(submission); }}>تصحيح</Button>
                        </div>
                      </div>
                      {submission.answerText ? <p className="mt-2 whitespace-pre-line text-[11.5px] leading-6">{submission.answerText}</p> : null}
                      {submission.attachmentUrl ? <a href={submission.attachmentUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[10.5px] font-bold text-primary">المرفق</a> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </Modal>

        <Modal open={Boolean(gradeTarget)} onClose={() => setGradeTarget(null)} title={`تصحيح: ${gradeTarget?.studentName || ''}`} icon={CheckCircle2} size="sm"
          footer={<><Button variant="ghost" size="sm" onClick={() => setGradeTarget(null)}>إلغاء</Button><Button size="sm" loading={modalBusy} onClick={saveGrade}>حفظ</Button></>}>
          <div className="grid gap-3 py-2">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <Field label={`الدرجة من ${homeworkDetail?.maxPoints || 10}`}><Input type="number" min="0" value={gradeForm.grade} onChange={(e) => setGradeForm((p) => ({ ...p, grade: e.target.value }))} /></Field>
            <Field label="ملاحظات"><Textarea value={gradeForm.feedback} onChange={(e) => setGradeForm((p) => ({ ...p, feedback: e.target.value }))} className="min-h-20" /></Field>
          </div>
        </Modal>
        {detailLoading ? <div className="fixed inset-0 z-40 grid place-items-center bg-[rgba(3,7,18,.3)]"><Skeleton className="size-14 rounded-full" /></div> : null}
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="المجموعات" title="المجموعات والحصص" description="نظّم طلابك في مجموعات، وحدد الجدول والرسوم والحضور والواجبات."
        action={<Button icon={Plus} size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>مجموعة جديدة</Button>} />
      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}
      <Card className="mb-4 p-3">
        <div className="flex gap-2">
          <div className="relative flex-1"><Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث باسم المجموعة أو المادة..." className="pr-9" /></div>
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => load(true)}>تحديث</Button>
        </div>
      </Card>
      {loading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-card" />)}</div>
        : groups.length === 0 ? <Card><EmptyState icon={Users} title="لا توجد مجموعات" description="أنشئ مجموعتك الأولى وابدأ بإضافة الطلاب والجدول." action={<Button icon={Plus} onClick={() => { setEditing(null); setFormOpen(true); }}>مجموعة جديدة</Button>} /></Card>
        : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <Card key={group.id} hover className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => { setTab('members'); setActiveId(group.id); }} className="min-w-0 text-right">
                    <h3 className="truncate text-[14px] font-bold">{group.name}</h3>
                    <p className="mt-0.5 text-[10.5px] text-muted">{group.subject} · {group.stage || 'كل المراحل'}</p>
                  </button>
                  <Badge tone={group.isActive ? 'emerald' : 'neutral'}>{group.isActive ? 'نشطة' : 'موقوفة'}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-surface-soft py-2"><p className="text-[13px] font-bold">{formatNumber(group.memberCount)}/{formatNumber(group.capacity)}</p><p className="text-[10px] text-muted">أعضاء</p></div>
                  <div className="rounded-lg bg-surface-soft py-2"><p className="text-[13px] font-bold">{formatNumber(group.sessionCount)}</p><p className="text-[10px] text-muted">حصص</p></div>
                  <div className="rounded-lg bg-surface-soft py-2"><p className="text-[13px] font-bold">{group.price ? formatNumber(group.price) : 'مجاني'}</p><p className="text-[10px] text-muted">ج.م</p></div>
                </div>
                <p className="mt-3 text-[10.5px] text-muted">{group.nextSessionAtUtc ? `الحصة القادمة: ${formatDate(group.nextSessionAtUtc)}` : 'لا توجد حصص قادمة'}</p>
                <div className="mt-auto flex gap-2 pt-3">
                  <Button size="xs" onClick={() => { setTab('members'); setActiveId(group.id); }}>إدارة</Button>
                  <Button size="xs" variant="secondary" icon={Pencil} onClick={() => { setEditing(group); setFormOpen(true); }}>تعديل</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      <GroupForm open={formOpen} onClose={() => setFormOpen(false)} token={token} group={editing} onSaved={(id) => { load(true); if (!editing && id) { setTab('members'); setActiveId(id); } }} />
    </div>
  );
}
