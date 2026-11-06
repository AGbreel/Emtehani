import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArrowLeftRight, BookOpen, CheckCircle2, GraduationCap, History, RefreshCw, Save, ShieldCheck, UserRound, Users } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, StatCard } from '../components/ui';
import { request } from '../lib/api';
import { EDUCATION_STAGES, gradesForStage, isValidEducation } from '../lib/education';
import { formatDate, formatNumber, scoreText } from '../lib/format';
import { isValidPhone, nameParts, normalizeDisplayName, parentNameError, phoneDigits, studentFullNameError } from '../lib/validation';

function emptyForm(profile) {
  return {
    fullName: profile?.fullName || '',
    studentPhone: profile?.studentPhone || '',
    parentPhone: profile?.parentPhone || '',
    parentName: profile?.parentName || '',
    stage: profile?.stage || '',
    grade: profile?.grade || '',
  };
}

export default function StudentProfilePage({ token, onProfileUpdated }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(emptyForm(null));
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const result = await request('/api/student/profile', { token });
      setData(result);
      setForm(emptyForm(result?.profile));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const profile = data?.profile;
  const history = data?.history || [];
  const changes = data?.changes || [];
  const linkedTeachers = data?.linkedTeachers || [];
  const educationChanged = Boolean(profile) && (profile.stage !== form.stage || profile.grade !== form.grade);
  const archivedAttempts = useMemo(
    () => history.reduce((total, group) => total + Number(group.attemptsCount || 0), 0),
    [history],
  );

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function updateStage(event) {
    const stage = event.target.value;
    setForm((current) => ({ ...current, stage, grade: '' }));
  }

  function validate() {
    // Legacy accounts may keep their old three-part display name while updating
    // phone/guardian/grade fields. A real name change still requires four parts.
    const nameUnchanged = normalizeDisplayName(form.fullName) === normalizeDisplayName(profile?.fullName || '');
    if (!nameUnchanged) {
      const nameError = studentFullNameError(form.fullName);
      if (nameError) return nameError;
    }
    if (!isValidPhone(form.studentPhone)) return 'أدخل رقم هاتف طالب صحيحاً.';
    if (!isValidPhone(form.parentPhone)) return 'أدخل رقم هاتف ولي أمر صحيحاً.';
    if (phoneDigits(form.studentPhone) === phoneDigits(form.parentPhone)) return 'رقم هاتف الطالب يجب أن يختلف عن رقم ولي الأمر.';
    const parentError = parentNameError(form.parentName);
    if (parentError) return parentError;
    if (form.stage && !isValidEducation(form.stage, form.grade)) return 'اختر المرحلة والصف المناسبين.';
    return '';
  }

  async function persist() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/student/profile', {
        token,
        method: 'PUT',
        body: JSON.stringify({
          fullName: normalizeDisplayName(form.fullName),
          studentPhone: phoneDigits(form.studentPhone),
          parentPhone: phoneDigits(form.parentPhone),
          parentName: normalizeDisplayName(form.parentName),
          stage: form.stage || null,
          grade: form.grade || null,
        }),
      });
      setNotice(result?.message || 'تم تحديث بياناتك.');
      setConfirmOpen(false);
      onProfileUpdated?.({ fullName: result?.fullName, stage: result?.stage, grade: result?.grade });
      await load(true);
    } catch (err) {
      setError(err.message);
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    const validation = validate();
    if (validation) return setError(validation);
    if (educationChanged) {
      setError('');
      setConfirmOpen(true);
      return;
    }
    persist();
  }

  if (loading) {
    return (
      <div>
        <PageHeader eyebrow="بياناتي وسجلي" title="ملفي الأكاديمي" description="بياناتك الشخصية ومرحلتك الدراسية وسجلك الأكاديمي السابق." />
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <Skeleton className="h-96 w-full rounded-card" />
          <Skeleton className="h-96 w-full rounded-card" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="بياناتي وسجلي"
        title="ملفي الأكاديمي"
        description="عدّل بياناتك الشخصية ومرحلتك الدراسية. تغيير المرحلة أو الصف لا يحذف أي امتحان أو نتيجة سابقة."
        action={<Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={() => load(true)}>تحديث</Button>}
      />

      {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mb-4" onClose={() => setNotice('')}>{notice}</Alert> : null}

      <div className="ui-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={GraduationCap} label="المرحلة الحالية" value={profile?.stage || '—'} note={profile?.grade || 'صف غير محدد'} />
        <StatCard icon={Users} label="المدرسون المرتبطون" value={formatNumber(linkedTeachers.length)} note="ارتباط مقبول ونشط" tone="emerald" />
        <StatCard icon={History} label="المحاولات السابقة" value={formatNumber(archivedAttempts)} note={`في ${formatNumber(history.length)} مجموعة أكاديمية`} tone="primary" />
        <StatCard icon={ArrowLeftRight} label="تغييرات المرحلة" value={formatNumber(changes.length)} note="محفوظة بالتاريخ" tone="warning" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4">
          <Card className="p-4 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-[10px] bg-primary-soft text-primary"><UserRound size={17} /></span>
              <div>
                <h2 className="text-[14px] font-bold text-ink">البيانات الشخصية</h2>
                <p className="text-[11px] text-muted">يمكنك تعديل الاسم وبيانات الاتصال والمرحلة والصف.</p>
              </div>
            </div>

            <form onSubmit={submit} className="grid gap-4" noValidate>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="اسم الطالب رباعياً" id="profile-name" hint="أربعة أسماء واضحة، ويجب أن يطابق اسمك في المدرسة.">
                  <Input id="profile-name" maxLength={120} value={form.fullName} onChange={update('fullName')} autoComplete="name" />
                  <p className={`mt-1 text-[10.5px] font-bold ${nameParts(form.fullName).length >= 4 ? 'text-emerald' : 'text-warning'}`}>
                    عدد الأجزاء: {nameParts(form.fullName).length} / 4
                  </p>
                </Field>
                <Field label="كود الطالب" id="profile-code" hint="يُستخدم لدخول الامتحانات ولا يمكن تغييره.">
                  <Input id="profile-code" value={profile?.studentCode || ''} readOnly dir="ltr" className="ui-number text-left" />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="رقم هاتف الطالب" id="profile-student-phone" hint="فريد على مستوى المنصة.">
                  <Input id="profile-student-phone" dir="ltr" inputMode="tel" maxLength={20} value={form.studentPhone} onChange={update('studentPhone')} className="text-left" placeholder="01xxxxxxxxx" />
                </Field>
                <Field label="رقم هاتف ولي الأمر" id="profile-parent-phone" hint="يمكن أن يشترك فيه الإخوة، ويجب أن يختلف عن رقمك.">
                  <Input id="profile-parent-phone" dir="ltr" inputMode="tel" maxLength={20} value={form.parentPhone} onChange={update('parentPhone')} className="text-left" placeholder="01xxxxxxxxx" />
                </Field>
              </div>

              <Field label="اسم ولي الأمر" id="profile-parent-name" hint="يظهر للمدرسين المرتبطين بك فقط.">
                <Input id="profile-parent-name" maxLength={200} value={form.parentName} onChange={update('parentName')} placeholder="مثال: أحمد محمد علي" />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="المرحلة التعليمية" id="profile-stage">
                  <Select id="profile-stage" value={form.stage} onChange={updateStage}>
                    <option value="">اختر المرحلة</option>
                    {EDUCATION_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                  </Select>
                </Field>
                <Field label="الصف الدراسي" id="profile-grade">
                  <Select id="profile-grade" value={form.grade} onChange={update('grade')} disabled={!form.stage}>
                    <option value="">{form.stage ? 'اختر الصف' : 'اختر المرحلة أولاً'}</option>
                    {gradesForStage(form.stage).map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                  </Select>
                </Field>
              </div>

              {educationChanged ? (
                <Alert tone="warning" title="أنت بصدد تغيير المرحلة أو الصف">
                  ستبقى كل الامتحانات والنتائج والمحاولات السابقة محفوظة في «السجل الأكاديمي السابق» مع المرحلة والصف والسنة الدراسية وقت المحاولة. لن يظهر أي امتحان من سنة دراسية سابقة ضمن الامتحانات المتاحة.
                </Alert>
              ) : null}

              <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-1.5 text-[10.5px] text-subtle"><ShieldCheck size={12} />يتم التحقق من الاسم والهاتف على الخادم وقاعدة البيانات.</p>
                <Button type="submit" icon={Save} loading={saving}>حفظ التعديلات</Button>
              </div>
            </form>
          </Card>

          <Card className="p-4 sm:p-6">
            <h2 className="text-[14px] font-bold text-ink">سجل تغييرات المرحلة والصف</h2>
            <p className="mt-1 text-[11px] text-muted">كل تغيير يُحفظ بالمرحلة والصف السابقين والجديدين وتاريخ التغيير ومن نفّذه.</p>
            {changes.length === 0 ? (
              <div className="mt-4 rounded-[12px] border border-line bg-surface-soft p-4 text-center text-[12px] text-muted">لم تغيّر مرحلتك أو صفك بعد.</div>
            ) : (
              <div className="mt-4 grid gap-2">
                {changes.map((change) => (
                  <div key={change.id} className="rounded-[12px] border border-line bg-surface-soft p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12px] font-bold text-ink">
                        {change.previousStage || 'غير محددة'} · {change.previousGrade || 'غير محدد'}
                        <span className="mx-1.5 text-subtle">←</span>
                        <span className="text-primary">{change.newStage || 'غير محددة'} · {change.newGrade || 'غير محدد'}</span>
                      </p>
                      <Badge tone="neutral">{change.changedByRole === 'Teacher' ? 'بواسطة المدرس' : 'بواسطة الطالب'}</Badge>
                    </div>
                    <p className="mt-1 text-[10.5px] text-subtle">{formatDate(change.changedAtUtc)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="grid gap-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-[9px] bg-emerald-soft text-emerald"><Archive size={15} /></span>
              <div>
                <h2 className="text-[13.5px] font-bold text-ink">السجل الأكاديمي السابق</h2>
                <p className="text-[10.5px] text-muted">مجموعات حسب المرحلة والصف والسنة.</p>
              </div>
            </div>

            {history.length === 0 ? (
              <EmptyState icon={BookOpen} title="لا يوجد سجل سابق بعد" description="ستظهر هنا محاولاتك السابقة بعد أداء أول امتحان." className="py-6" />
            ) : (
              <div className="grid gap-2">
                {history.map((group) => (
                  <div key={`${group.academicYear}-${group.stage}-${group.grade}`} className="rounded-[12px] border border-line bg-surface-soft p-3">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <p className="text-[12px] font-bold text-ink">{group.stage || 'مرحلة غير محددة'}</p>
                      <Badge tone="primary">{group.academicYear || 'سنة غير محددة'}</Badge>
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-muted">{group.grade || 'صف غير محدد'} · {formatNumber(group.attemptsCount)} محاولة</p>
                    <div className="mt-2 grid gap-1">
                      {(group.items || []).slice(0, 3).map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 text-[10.5px]">
                          <span className="min-w-0 truncate text-muted">{item.examTitle}</span>
                          <span className="ui-number shrink-0 font-bold text-ink">{item.resultsAvailable ? scoreText(item.score, item.maxScore) : 'النتيجة غير متاحة'}</span>
                        </div>
                      ))}
                      {(group.items || []).length > 3 ? <p className="text-[10px] text-subtle">و{formatNumber(group.items.length - 3)} محاولة أخرى</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] leading-5 text-subtle">هذه المجموعات ثابتة: تغيير مرحلتك لاحقاً لا يعيد كتابة المرحلة أو الصف أو السنة المحفوظة وقت كل محاولة.</p>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary"><Users size={15} /></span>
              <h2 className="text-[13.5px] font-bold text-ink">المدرسون المرتبطون</h2>
            </div>
            {linkedTeachers.length === 0 ? (
              <p className="rounded-[10px] bg-surface-soft p-3 text-[11px] text-muted">لا يوجد مدرس مرتبط بعد. أرسل طلباً من صفحة المدرسين.</p>
            ) : (
              <div className="grid gap-2">
                {linkedTeachers.map((teacher) => (
                  <div key={teacher.teacherId} className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface-soft p-2.5">
                    <Avatar name={teacher.fullName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-bold text-ink">{teacher.fullName}</p>
                      <p className="truncate text-[10px] text-subtle" dir="ltr">{teacher.email}</p>
                    </div>
                    {teacher.suspendedAtUtc ? <Badge tone="warning">موقوف</Badge> : <CheckCircle2 size={14} className="shrink-0 text-emerald" />}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => { if (!saving) setConfirmOpen(false); }}
        title="تأكيد تغيير المرحلة أو الصف"
        description="هذا التغيير يؤثر على الامتحانات المتاحة لك من الآن، لكنه لا يحذف أي شيء من سجلك."
        icon={ArrowLeftRight}
        tone="warning"
        footer={(
          <>
            <Button variant="secondary" size="sm" disabled={saving} onClick={() => setConfirmOpen(false)}>إلغاء</Button>
            <Button size="sm" loading={saving} onClick={persist}>نعم، حدّث مرحلتي</Button>
          </>
        )}
      >
        <Alert tone="warning" title="السجل الأكاديمي السابق محفوظ">
          امتحاناتك ونتائجك ومحاولاتك السابقة ستبقى كما هي في سجل منفصل، مصنفة حسب المرحلة والصف والسنة الدراسية وقت المحاولة. لن تتغير الدرجات أو الإجابات التاريخية.
        </Alert>
        <div className="mt-3 rounded-[12px] border border-line bg-surface-soft p-3 text-[12px]">
          <p className="text-muted">من: <strong className="text-ink">{profile?.stage || 'غير محددة'} · {profile?.grade || 'غير محدد'}</strong></p>
          <p className="mt-1 text-muted">إلى: <strong className="text-primary">{form.stage || 'غير محددة'} · {form.grade || 'غير محدد'}</strong></p>
        </div>
      </Modal>
    </div>
  );
}
