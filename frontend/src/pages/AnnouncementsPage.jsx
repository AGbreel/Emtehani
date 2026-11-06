import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing, CalendarClock, Eye, Megaphone, Pencil, Pin, Plus, RefreshCw, Send,
  Trash2, Users, X,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal,
  PageHeader, Select, Skeleton, Textarea, cn,
} from '../components/ui';
import ImageUploader from '../components/ImageUploader';
import { request } from '../lib/api';
import { formatDate } from '../lib/format';

const teacherAudiences = [
  { value: 'Students', label: 'كل طلابي' },
  { value: 'Group', label: 'مجموعة محددة' },
  { value: 'Course', label: 'كورس محدد' },
  { value: 'Selected', label: 'طلاب محددون' },
];
const adminAudiences = [
  { value: 'Platform', label: 'كل مستخدمي المنصة' },
  { value: 'Teachers', label: 'كل المدرسين' },
  { value: 'Students', label: 'كل الطلاب' },
];
const audienceLabels = {
  Students: 'الطلاب', Group: 'مجموعة', Course: 'كورس', Selected: 'طلاب محددون',
  Platform: 'المنصة', Teachers: 'المدرسون', All: 'الجميع',
};

const emptyForm = {
  title: '', summary: '', body: '', imageUrl: '', audience: 'Students',
  groupId: '', courseId: '', studentIds: [], isPinned: false, isPublished: true,
  publishAt: '', expiresAt: '',
};

export default function AnnouncementsPage({ token, role = 'Teacher' }) {
  const isStudent = role === 'Student';
  const isAdmin = role === 'Admin';
  const basePath = isAdmin ? '/api/admin/announcements' : '/api/teaching/announcements';
  const listPath = isStudent ? '/api/teaching/my/announcements?take=60' : basePath;

  const [items, setItems] = useState([]);
  const [groups, setGroups] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [modalError, setModalError] = useState('');
  const [filter, setFilter] = useState('');
  const [studentQuery, setStudentQuery] = useState('');

  const flash = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const requests = [request(listPath, { token })];
      if (!isStudent) {
        requests.push(request('/api/teaching/groups', { token }).catch(() => ({ items: [] })));
        requests.push(request('/api/teaching/courses?pageSize=100', { token }).catch(() => ({ items: [] })));
        requests.push(request('/api/teacher/students', { token }).catch(() => ({ items: [] })));
      }
      const [list, groupData, courseData, studentData] = await Promise.all(requests);
      setItems(list?.items || []);
      if (!isStudent) {
        setGroups(groupData?.items || []);
        setCourses(courseData?.items || []);
        setStudents(studentData?.items || []);
      }
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [token, listPath, isStudent]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, audience: isAdmin ? 'Platform' : 'Students' });
    setModalError('');
    setStudentQuery('');
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      title: item.title || '',
      summary: item.summary || '',
      body: item.body || '',
      imageUrl: item.imageUrl || '',
      audience: item.audience || (isAdmin ? 'Platform' : 'Students'),
      groupId: item.groupId || '',
      courseId: item.courseId || '',
      studentIds: [],
      isPinned: Boolean(item.isPinned),
      isPublished: Boolean(item.isPublished),
      publishAt: item.publishAtUtc ? item.publishAtUtc.slice(0, 16) : '',
      expiresAt: item.expiresAtUtc ? item.expiresAtUtc.slice(0, 16) : '',
    });
    setModalError('');
    setStudentQuery('');
    setModalOpen(true);
  }

  const filteredStudents = useMemo(() => {
    const term = studentQuery.trim();
    if (!term) return students;
    return students.filter((student) =>
      (student.fullName || '').includes(term) || (student.email || '').includes(term));
  }, [students, studentQuery]);

  function toggleStudent(id) {
    setForm((prev) => ({
      ...prev,
      studentIds: prev.studentIds.includes(id)
        ? prev.studentIds.filter((x) => x !== id)
        : [...prev.studentIds, id],
    }));
  }

  async function save() {
    setModalError('');
    if (form.title.trim().length < 3) return setModalError('عنوان الإعلان مطلوب (3 أحرف على الأقل).');
    if (form.audience === 'Group' && !form.groupId) return setModalError('اختر المجموعة.');
    if (form.audience === 'Course' && !form.courseId) return setModalError('اختر الكورس.');
    if (form.audience === 'Selected' && form.studentIds.length === 0) return setModalError('اختر طالباً واحداً على الأقل.');
    setBusy('save');
    try {
      const payload = {
        title: form.title.trim(),
        summary: form.summary || null,
        body: form.body || null,
        imageUrl: form.imageUrl || null,
        audience: form.audience,
        groupId: form.audience === 'Group' ? form.groupId : null,
        courseId: form.audience === 'Course' ? form.courseId : null,
        studentIds: form.audience === 'Selected' ? form.studentIds : null,
        isPinned: form.isPinned,
        isPublished: form.isPublished,
        publishAtUtc: form.publishAt ? new Date(form.publishAt).toISOString() : null,
        expiresAtUtc: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };
      if (editing) {
        await request(`${basePath}/${editing.id}`, { token, method: 'PUT', body: JSON.stringify(payload) });
        flash('تم تحديث الإعلان.');
      } else {
        await request(basePath, { token, method: 'POST', body: JSON.stringify(payload) });
        flash('تم إنشاء الإعلان وإشعار المستهدفين.');
      }
      setModalOpen(false);
      await load();
    } catch (err) { setModalError(err.message); } finally { setBusy(''); }
  }

  async function publish(item) {
    setBusy(item.id);
    try {
      const result = await request(`${basePath}/${item.id}/publish`, { token, method: 'POST' });
      flash(`تم النشر${result?.delivered ? ` وإشعار ${result.delivered} مستخدم` : ''}.`);
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  async function remove(item) {
    if (!window.confirm(`حذف إعلان «${item.title}»؟`)) return;
    setBusy(item.id);
    try {
      await request(`${basePath}/${item.id}`, { token, method: 'DELETE' });
      flash('تم حذف الإعلان.');
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  const visible = useMemo(() => {
    const term = filter.trim();
    if (!term) return items;
    return items.filter((item) =>
      (item.title || '').includes(term) || (item.summary || '').includes(term) || (item.body || '').includes(term));
  }, [items, filter]);

  const audiences = isAdmin ? adminAudiences : teacherAudiences;

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="التواصل"
        title={isStudent ? 'إعلانات معلميك' : 'الإعلانات'}
        description={isStudent
          ? 'كل ما ينشره معلموك أو إدارة المنصة في مكان واحد.'
          : 'انشر إعلاناً لطلابك أو مجموعة أو كورس، وحدد موعد النشر والانتهاء.'}
        action={!isStudent ? <div className="flex flex-wrap gap-2">
          <Button variant="soft" size="sm" icon={RefreshCw} onClick={load} loading={loading}>تحديث</Button>
          <Button size="sm" icon={Plus} onClick={openCreate}>إعلان جديد</Button>
        </div> : <Button variant="soft" size="sm" icon={RefreshCw} onClick={load} loading={loading}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert> : null}

      {!isStudent ? (
        <Card className="flex items-center gap-2 p-3">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ابحث في الإعلانات..." className="flex-1" />
        </Card>
      ) : null}

      {loading ? (
        <div className="grid gap-3">{Array.from({ length: 3 }).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-20 w-full" /></Card>)}</div>
      ) : visible.length === 0 ? (
        <Card><EmptyState icon={Megaphone} title="لا توجد إعلانات" description={isStudent ? 'ستظهر هنا إعلانات معلميك فور نشرها.' : 'ابدأ بنشر أول إعلان لطلابك.'} /></Card>
      ) : (
        <div className="grid gap-3">
          {visible.map((item) => {
            const scheduled = item.isPublished && item.publishAtUtc && new Date(item.publishAtUtc).getTime() > Date.now();
            return (
              <Card key={item.id} className={cn('overflow-hidden p-0', item.isPinned && 'ring-1 ring-primary/25')}>
                {item.imageUrl ? <div className="h-36 w-full overflow-hidden bg-surface-soft"><img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /></div> : null}
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        {item.isPinned ? <Badge tone="primary"><Pin size={11} className="me-1 inline" />مثبت</Badge> : null}
                        <Badge tone={item.isPublished ? (scheduled ? 'warning' : 'success') : 'neutral'}>
                          {item.isPublished ? (scheduled ? 'مجدول' : 'منشور') : 'مسودة'}
                        </Badge>
                        <Badge tone="neutral">{audienceLabels[item.audience] || item.audience}</Badge>
                        {item.expiresAtUtc ? <span className="text-[10.5px] text-muted">ينتهي {formatDate(item.expiresAtUtc)}</span> : null}
                      </div>
                      <h3 className="font-display text-[15px] font-semibold text-ink">{item.title}</h3>
                      {item.summary ? <p className="mt-1 text-[12.5px] leading-6 text-muted">{item.summary}</p> : null}
                    </div>
                    {!isStudent ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {!item.isPublished || scheduled ? (
                          <IconButton label="نشر الآن" tone="success" loading={busy === item.id} onClick={() => publish(item)}><Send size={15} /></IconButton>
                        ) : null}
                        <IconButton label="تعديل" onClick={() => openEdit(item)}><Pencil size={15} /></IconButton>
                        <IconButton label="حذف" tone="danger" onClick={() => remove(item)}><Trash2 size={15} /></IconButton>
                      </div>
                    ) : null}
                  </div>

                  {item.body ? (
                    <details className="group mt-3">
                      <summary className="cursor-pointer list-none text-[11.5px] font-bold text-primary">عرض التفاصيل</summary>
                      <p className="mt-2 whitespace-pre-line text-[12.5px] leading-7 text-ink/90">{item.body}</p>
                    </details>
                  ) : null}

                  <p className="mt-3 flex flex-wrap items-center gap-3 text-[10.5px] text-muted">
                    <span className="inline-flex items-center gap-1"><CalendarClock size={11} />{formatDate(item.publishAtUtc || item.createdAtUtc)}</span>
                    {item.deliveredAtUtc ? <span className="inline-flex items-center gap-1 text-emerald"><BellRing size={11} />أُرسل {formatDate(item.deliveredAtUtc)}</span> : null}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {modalOpen ? (
        <Modal
          open onClose={() => setModalOpen(false)} size="xl" icon={Megaphone}
          title={editing ? 'تعديل الإعلان' : 'إعلان جديد'}
          description="حدد الجمهور وموعد النشر. يُرسل الإشعار مرة واحدة فقط لكل مستخدم."
          footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>إلغاء</Button><Button loading={busy === 'save'} onClick={save}>{editing ? 'حفظ' : 'إنشاء'}</Button></>}
        >
          <div className="grid gap-4">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            <Field label="العنوان"><Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} maxLength={200} /></Field>
            <Field label="ملخص قصير (يظهر في الإشعار)"><Input value={form.summary} onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))} maxLength={500} /></Field>
            <Field label="النص الكامل"><Textarea value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} className="min-h-28" maxLength={20000} /></Field>
            <ImageUploader token={token} value={form.imageUrl} onChange={(url) => setForm((p) => ({ ...p, imageUrl: url }))} label="صورة الإعلان (اختياري)" aspect="cover" />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="الجمهور">
                <Select value={form.audience} onChange={(e) => setForm((p) => ({ ...p, audience: e.target.value }))}>
                  {audiences.map((audience) => <option key={audience.value} value={audience.value}>{audience.label}</option>)}
                </Select>
              </Field>

              {form.audience === 'Group' ? (
                <Field label="المجموعة">
                  <Select value={form.groupId} onChange={(e) => setForm((p) => ({ ...p, groupId: e.target.value }))}>
                    <option value="">اختر المجموعة</option>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </Select>
                </Field>
              ) : null}

              {form.audience === 'Course' ? (
                <Field label="الكورس">
                  <Select value={form.courseId} onChange={(e) => setForm((p) => ({ ...p, courseId: e.target.value }))}>
                    <option value="">اختر الكورس</option>
                    {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                  </Select>
                </Field>
              ) : null}

              <Field label="يبدأ النشر (اختياري)">
                <Input type="datetime-local" value={form.publishAt} onChange={(e) => setForm((p) => ({ ...p, publishAt: e.target.value }))} />
              </Field>
              <Field label="ينتهي في (اختياري)">
                <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))} />
              </Field>
            </div>

            {!isAdmin && form.audience === 'Selected' ? (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[12px] font-bold text-ink">اختر الطلاب ({form.studentIds.length} محدد)</p>
                  <Input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="بحث..." className="w-40" />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-line/70 p-2">
                  {filteredStudents.length === 0 ? <p className="p-2 text-[11.5px] text-muted">لا يوجد طلاب مطابقون.</p> : filteredStudents.map((student) => (
                    <label key={student.studentId || student.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-surface-soft">
                      <input type="checkbox" className="accent-primary"
                        checked={form.studentIds.includes(student.studentId || student.id)}
                        onChange={() => toggleStudent(student.studentId || student.id)} />
                      <span className="truncate">{student.fullName}</span>
                      <span className="truncate text-[10.5px] text-muted">{student.email}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-4 text-xs font-bold">
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={form.isPinned} onChange={(e) => setForm((p) => ({ ...p, isPinned: e.target.checked }))} />تثبيت الإعلان</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={form.isPublished} onChange={(e) => setForm((p) => ({ ...p, isPublished: e.target.checked }))} />نشر فوري</label>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
