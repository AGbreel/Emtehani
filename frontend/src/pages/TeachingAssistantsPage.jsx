import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, UserCog, UserPlus, Users, XCircle,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal,
  PageHeader, Skeleton, Textarea, cn,
} from '../components/ui';
import { request } from '../lib/api';
import { formatDate } from '../lib/format';

function PermissionMatrix({ groups, selected, onToggle, disabled = false }) {
  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <div key={group.name}>
          <p className="mb-2 text-[12px] font-extrabold text-ink">{group.name}</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {group.items.map((item) => (
              <label
                key={item.key}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border border-line/60 px-2.5 py-2 text-[11.5px] font-bold transition hover:bg-surface-soft',
                  selected.includes(item.key) && 'border-primary/30 bg-primary-soft/50 text-primary',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={selected.includes(item.key)}
                  disabled={disabled}
                  onChange={() => onToggle(item.key)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TeachingAssistantsPage({ token }) {
  const [items, setItems] = useState([]);
  const [permissionItems, setPermissionItems] = useState([]);
  const [groups, setGroups] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ email: '', fullName: '', password: '', permissions: [], groupIds: [] });
  const [modalError, setModalError] = useState('');
  const [credentials, setCredentials] = useState(null);

  const flash = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3600);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [assistantData, permissionData, groupData] = await Promise.all([
        request('/api/teaching/assistants', { token }),
        request('/api/teaching/permissions', { token }),
        request('/api/teaching/groups', { token }).catch(() => ({ items: [] })),
      ]);
      setItems(assistantData?.items || []);
      setPermissionItems(permissionData?.items || []);
      setIsOwner(Boolean(permissionData?.isOwner));
      setGroups(groupData?.items || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const groupedPermissions = useMemo(() => {
    const map = new Map();
    permissionItems.forEach((item) => {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group).push(item);
    });
    return Array.from(map, ([name, list]) => ({ name, items: list }));
  }, [permissionItems]);

  const activeCount = items.filter((item) => item.status === 'Active').length;

  function openCreate() {
    setEditing(null);
    setModal('edit');
    setModalError('');
    setForm({
      email: '',
      fullName: '',
      password: '',
      permissions: permissionItems.filter((item) => ['Students.View', 'Groups.View', 'Sessions.View', 'Attendance.Manage'].includes(item.key)).map((item) => item.key),
      groupIds: [],
    });
  }

  function openEdit(item) {
    setEditing(item);
    setModal('edit');
    setModalError('');
    setForm({
      email: item.email,
      fullName: item.name,
      password: '',
      permissions: item.permissions || [],
      groupIds: item.groupIds || [],
    });
  }

  function togglePermission(key) {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((item) => item !== key)
        : [...prev.permissions, key],
    }));
  }

  function toggleGroup(id) {
    setForm((prev) => ({
      ...prev,
      groupIds: prev.groupIds.includes(id)
        ? prev.groupIds.filter((item) => item !== id)
        : [...prev.groupIds, id],
    }));
  }

  async function save() {
    setModalError('');
    if (!editing && !form.email.includes('@')) return setModalError('اكتب بريداً إلكترونياً صالحاً.');
    if (form.permissions.length === 0) return setModalError('اختر صلاحية واحدة على الأقل.');
    setBusy('save');
    try {
      if (editing) {
        await request(`/api/teaching/assistants/${editing.id}`, {
          token, method: 'PUT',
          body: JSON.stringify({ status: editing.status, permissions: form.permissions, groupIds: form.groupIds }),
        });
        setModal(null);
        flash('تم تحديث صلاحيات المساعد.');
      } else {
        const result = await request('/api/teaching/assistants', {
          token, method: 'POST',
          body: JSON.stringify({
            email: form.email.trim(),
            fullName: form.fullName.trim() || null,
            password: form.password || null,
            permissions: form.permissions,
            groupIds: form.groupIds,
          }),
        });
        setModal(null);
        if (result?.temporaryPassword) {
          setCredentials({ email: result.email, password: result.temporaryPassword });
        } else {
          flash(result?.message || 'تم ربط المساعد.');
        }
      }
      await load();
    } catch (err) { setModalError(err.message); } finally { setBusy(''); }
  }

  async function suspend(item) {
    if (!window.confirm(`إيقاف المساعد «${item.name}»؟ سيتم إلغاء صلاحياته فوراً.`)) return;
    setBusy(item.id);
    try {
      await request(`/api/teaching/assistants/${item.id}`, { token, method: 'DELETE' });
      flash('تم إيقاف المساعد وإلغاء صلاحياته.');
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  async function reactivate(item) {
    setBusy(item.id);
    try {
      await request(`/api/teaching/assistants/${item.id}`, {
        token, method: 'PUT',
        body: JSON.stringify({ status: 'Active', permissions: item.permissions || [], groupIds: item.groupIds || [] }),
      });
      flash('تم تفعيل المساعد.');
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="الفريق"
        title="المساعدون والصلاحيات"
        description="كل صلاحية تُفحص على الخادم. المساعد يرى فقط المجموعات المخصصة له إن حددت."
        action={<div className="flex flex-wrap gap-2">
          <Button variant="soft" size="sm" icon={RefreshCw} onClick={load} loading={loading}>تحديث</Button>
          {isOwner ? <Button size="sm" icon={UserPlus} onClick={openCreate}>مساعد جديد</Button> : null}
        </div>}
      />

      {error ? <Alert tone="danger" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert> : null}
      {!isOwner && !loading ? <Alert tone="info">إضافة المساعدين وتعديل صلاحياتهم متاحة لمالك الحساب فقط.</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><Users size={18} /></span>
          <div><p className="text-[11px] font-bold text-muted">إجمالي المساعدين</p><p className="text-lg font-extrabold text-ink">{items.length}</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-emerald-soft text-emerald"><CheckCircle2 size={18} /></span>
          <div><p className="text-[11px] font-bold text-muted">نشطون</p><p className="text-lg font-extrabold text-ink">{activeCount}</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-soft text-blue"><KeyRound size={18} /></span>
          <div><p className="text-[11px] font-bold text-muted">الصلاحيات المتاحة</p><p className="text-lg font-extrabold text-ink">{permissionItems.length}</p></div>
        </Card>
      </div>

      {loading ? <Card className="p-4"><Skeleton className="h-32 w-full" /></Card> : items.length === 0 ? (
        <Card><EmptyState icon={UserCog} title="لا يوجد مساعدون بعد" description="أضف مساعداً وحدد له ما يمكنه فعله بالضبط." action={isOwner ? <Button icon={Plus} onClick={openCreate}>إضافة مساعد</Button> : null} /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary font-bold">{(item.name || '؟').slice(0, 1)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-ink">{item.name || 'مساعد'}</p>
                    <p className="truncate text-[11px] text-muted">{item.email}</p>
                  </div>
                </div>
                <Badge tone={item.status === 'Active' ? 'success' : 'neutral'}>{item.status === 'Active' ? 'نشط' : 'موقوف'}</Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {(item.permissions || []).slice(0, 7).map((permission) => (
                  <span key={permission} className="rounded-md bg-surface-soft px-1.5 py-0.5 text-[10px] font-bold text-muted">{permission}</span>
                ))}
                {(item.permissions || []).length > 7 ? <span className="rounded-md bg-surface-soft px-1.5 py-0.5 text-[10px] font-bold text-muted">+{item.permissions.length - 7}</span> : null}
                {(item.permissions || []).length === 0 ? <span className="text-[10.5px] text-danger">لا توجد صلاحيات</span> : null}
              </div>

              <p className="mt-2 text-[10.5px] text-muted">
                {item.groupIds?.length ? `مجموعات مخصصة: ${item.groupIds.length}` : 'كل المجموعات'}
                {' · '}أُضيف {formatDate(item.createdAtUtc)}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {isOwner ? (
                  <>
                    <Button size="xs" variant="soft" icon={Pencil} onClick={() => openEdit(item)}>تعديل الصلاحيات</Button>
                    {item.status === 'Active'
                      ? <Button size="xs" variant="ghost" loading={busy === item.id} onClick={() => suspend(item)}>إيقاف</Button>
                      : <Button size="xs" variant="ghost" loading={busy === item.id} onClick={() => reactivate(item)}>تفعيل</Button>}
                  </>
                ) : <Badge tone="neutral">للقراءة فقط</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {modal === 'edit' ? (
        <Modal
          open onClose={() => setModal(null)} size="xl" icon={ShieldCheck}
          title={editing ? `صلاحيات ${editing.name}` : 'مساعد جديد'}
          description={editing ? 'عدّل ما يستطيع المساعد الوصول إليه داخل حسابك.' : 'أنشئ حساب مساعد أو اربط حساباً موجوداً بنفس البريد.'}
          footer={<><Button variant="ghost" onClick={() => setModal(null)}>إلغاء</Button><Button loading={busy === 'save'} onClick={save}>{editing ? 'حفظ' : 'إضافة'}</Button></>}
        >
          <div className="grid gap-4">
            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}
            {!editing ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="البريد الإلكتروني"><Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></Field>
                <Field label="الاسم"><Input value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} /></Field>
                <Field label="كلمة مرور مبدئية (اختياري)" hint="اتركها فارغة وسيُنشئ الخادم كلمة مرور مؤقتة.">
                  <Input type="text" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
                </Field>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-[12px] font-bold text-ink">المجموعات المسموحة</p>
              <p className="mb-2 text-[11px] text-muted">عدم اختيار أي مجموعة يعني الوصول لكل المجموعات.</p>
              <div className="flex flex-wrap gap-2">
                {groups.map((group) => (
                  <label key={group.id} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border border-line/60 px-2.5 py-1.5 text-[11.5px] font-bold', form.groupIds.includes(group.id) && 'border-primary/30 bg-primary-soft/50 text-primary')}>
                    <input type="checkbox" className="accent-primary" checked={form.groupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} />
                    {group.name}
                  </label>
                ))}
                {groups.length === 0 ? <span className="text-[11.5px] text-muted">لا توجد مجموعات بعد.</span> : null}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-bold text-ink">الصلاحيات</p>
              <div className="flex gap-1">
                <Button size="xs" variant="ghost" onClick={() => setForm((p) => ({ ...p, permissions: permissionItems.map((item) => item.key) }))}>تحديد الكل</Button>
                <Button size="xs" variant="ghost" onClick={() => setForm((p) => ({ ...p, permissions: [] }))}>مسح</Button>
              </div>
            </div>
            <PermissionMatrix groups={groupedPermissions} selected={form.permissions} onToggle={togglePermission} />
          </div>
        </Modal>
      ) : null}

      {credentials ? (
        <Modal open onClose={() => setCredentials(null)} icon={KeyRound} title="تم إنشاء حساب المساعد" description="اعرض بيانات الدخول مرة واحدة وسلّمها للمساعد بشكل آمن."
          footer={<Button onClick={() => setCredentials(null)}>تم</Button>}>
          <div className="grid gap-3">
            <div className="rounded-xl border border-line bg-surface-soft p-3">
              <p className="text-[11px] font-bold text-muted">البريد</p>
              <p className="mt-1 break-all font-mono text-[13px] text-ink">{credentials.email}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-soft p-3">
              <p className="text-[11px] font-bold text-muted">كلمة المرور المؤقتة</p>
              <p className="mt-1 break-all font-mono text-[13px] text-ink">{credentials.password}</p>
            </div>
            <Alert tone="warning">اطلب من المساعد تغيير كلمة المرور بعد أول تسجيل دخول.</Alert>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
