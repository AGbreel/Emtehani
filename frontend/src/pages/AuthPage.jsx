import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  Mail,
  Moon,
  Phone,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Ticket,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Alert, Badge, Button, Field, Input, Logo, ProgressBar, Segmented, Select } from '../components/ui';
import AnimatedBackground from '../components/AnimatedBackground';
import { request } from '../lib/api';
import { EDUCATION_STAGES, gradesForStage, isValidEducation } from '../lib/education';
import { isValidPhone, nameParts, normalizeDisplayName, parentNameError, phoneDigits, studentFullNameError } from '../lib/validation';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailIsValid(value) {
  return EMAIL_PATTERN.test(String(value || '').trim());
}

function passwordIsValid(value) {
  return String(value || '').length >= 10 && String(value || '').length <= 128;
}

function passwordStrength(value) {
  const text = String(value || '');
  if (!text) return { score: 0, label: '', bar: '', text: '' };
  let score = 0;
  if (text.length >= 8) score += 1;
  if (text.length >= 12) score += 1;
  if (/[a-z]/.test(text) || /[A-Z]/.test(text)) score += 1;
  if (/\d/.test(text)) score += 1;
  if (/[^A-Za-z0-9]/.test(text)) score += 1;
  score = Math.min(4, Math.max(1, score));
  const levels = {
    1: { label: 'ضعيفة', bar: 'bg-danger', text: 'text-danger' },
    2: { label: 'متوسطة', bar: 'bg-warning', text: 'text-warning' },
    3: { label: 'جيدة', bar: 'bg-blue', text: 'text-blue' },
    4: { label: 'قوية', bar: 'bg-emerald', text: 'text-emerald' },
  };
  return { score, ...levels[score] };
}

function PasswordMeter({ value }) {
  if (!value) return null;
  const strength = passwordStrength(value);
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
        <span className="text-subtle">قوة كلمة المرور</span>
        <span className={strength.text}>{strength.label}</span>
      </div>
      <div className="mt-1 flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <motion.span
            key={step}
            initial={false}
            animate={{ scaleX: step <= strength.score ? 1 : 0.92, opacity: step <= strength.score ? 1 : 0.45 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`h-1 flex-1 origin-right rounded-full ${step <= strength.score ? strength.bar : 'bg-surface-soft'}`}
          />
        ))}
      </div>
    </div>
  );
}

function AuthVisual() {
  return (
    <div className="relative hidden min-h-[680px] overflow-hidden bg-[#10172e] p-10 text-white lg:flex lg:flex-col dark:bg-[#080e1b]">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/25 blur-[90px]" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-emerald/15 blur-[100px]" />
      <div className="pointer-events-none absolute inset-0 ui-grid-bg opacity-[0.07]" />

      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-white/70">
          <Sparkles size={12} className="text-emerald" /> تجربة امتحان أكثر هدوءاً
        </span>
        <h2 className="mt-6 max-w-md font-display text-[clamp(2rem,3vw,2.8rem)] font-semibold leading-[1.28] tracking-[-0.05em]">
          كل ما يحدث في الجلسة،
          <span className="text-emerald"> أمامك بوضوح.</span>
        </h2>
        <p className="mt-3 max-w-sm text-[13px] leading-7 text-white/70">من دخول الطالب إلى آخر ورقة مسلّمة. لا تخمّن، راقب، وتحكّم.</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }} className="relative mt-10 w-full max-w-[430px] self-center">
        <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-[10px] bg-white/10"><Radio size={15} className="text-emerald" /></span>
              <div><p className="text-[10.5px] font-bold">غرفة الانتظار</p><p className="text-[8px] text-white/45">اختبار الرياضيات</p></div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald/10 px-2 py-1 text-[8px] font-bold text-emerald"><span className="size-1.5 animate-pulse rounded-full bg-emerald" />مفتوحة</span>
          </div>
          <div className="py-4 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full border border-white/10 bg-white/5 text-white/70"><Clock3 size={21} /></div>
            <p className="mt-3 text-[12px] font-bold">بانتظار بدء الامتحان</p>
            <p className="mx-auto mt-1 max-w-[260px] text-[9px] leading-5 text-white/45">سيبدأ الامتحان تلقائياً عندما يفتح المدرس الجلسة.</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[['18', 'حاضر'], ['02', 'متصل الآن'], ['45', 'دقيقة']].map(([v, l]) => (
              <div key={l} className="rounded-[10px] border border-white/10 bg-white/[0.04] px-2 py-2 text-center"><strong className="ui-number block text-sm font-bold">{v}</strong><span className="text-[7.5px] text-white/40">{l}</span></div>
            ))}
          </div>
        </div>

        <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.55, duration: 0.45 }} className="absolute -bottom-8 -left-5 flex items-center gap-2.5 rounded-[13px] border border-white/10 bg-[#0d1425] px-3 py-2.5 shadow-xl">
          <span className="grid size-7 place-items-center rounded-[8px] bg-emerald/15 text-emerald"><CheckCircle2 size={14} /></span>
          <div><p className="text-[8px] text-white/40">تم التسليم</p><p className="text-[9px] font-bold">سارة أحمد · 04:12</p></div>
        </motion.div>
      </motion.div>

      <div className="relative mt-auto pt-16">
        <div className="flex items-center gap-2 text-[9px] text-white/35">
          <ShieldCheck size={12} className="text-emerald" />
          جلسات مشفّرة، وكل محاولة مرتبطة بحساب طالب واحد.
        </div>
      </div>
    </div>
  );
}

export default function AuthPage({ initialMode = 'login', onAuth, onBack, onOpenPortfolio, theme, onToggleTheme, notice, clearNotice, noticeTone = 'success' }) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState('Student');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  const [localNotice, setLocalNotice] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    stage: '',
    grade: '',
    studentPhone: '',
    parentPhone: '',
    parentName: '',
    teacherCount: '1',
    teacherIds: [],
  });
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [invitation, setInvitation] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('resetToken');
      if (token) {
        setResetToken(token);
        setMode('reset');
      }
      const invite = params.get('invite');
      if (invite) {
        setInviteToken(invite);
        setMode('register');
        setRole('Student');
        request(`/api/public/invitations/${encodeURIComponent(invite)}`)
          .then((data) => {
            setInvitation(data);
            setForm((current) => ({
              ...current,
              fullName: data?.studentName || current.fullName,
              studentPhone: data?.studentPhone || current.studentPhone,
              parentPhone: data?.parentPhone || current.parentPhone,
              parentName: data?.parentName || current.parentName,
              stage: data?.stage || current.stage,
              grade: data?.grade || current.grade,
              teacherCount: '1',
              teacherIds: data?.teacherId ? [data.teacherId] : current.teacherIds,
            }));
            setLocalNotice(`دعوة من ${data?.teacherName || 'المدرس'}: أكمل بياناتك لإنشاء حسابك والموافقة على الارتباط.`);
          })
          .catch((err) => {
            setInviteToken('');
            setError(err.message || 'رابط الدعوة غير صالح أو منتهي الصلاحية.');
          });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (mode !== 'register' || role !== 'Student') return;
    let active = true;
    setTeachersLoading(true);
    request('/api/public/teachers')
      .then((rows) => { if (active) setTeachers(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (active) setTeachers([]); })
      .finally(() => { if (active) setTeachersLoading(false); });
    return () => { active = false; };
  }, [mode, role]);

  // The public directory is capped, so search on the server as the user types and
  // merge the results. This keeps large directories discoverable without loading
  // every teacher into the registration form.
  useEffect(() => {
    if (mode !== 'register' || role !== 'Student') return;
    const term = teacherSearch.trim();
    if (term.length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      request(`/api/public/teachers?search=${encodeURIComponent(term)}`)
        .then((rows) => {
          if (!active || !Array.isArray(rows)) return;
          setTeachers((current) => {
            const merged = new Map(current.map((teacher) => [teacher.id, teacher]));
            for (const teacher of rows) merged.set(teacher.id, teacher);
            return Array.from(merged.values());
          });
        })
        .catch(() => { /* keep the already loaded directory */ });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [mode, role, teacherSearch]);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function updateStage(event) {
    const stage = event.target.value;
    setForm((current) => ({ ...current, stage, grade: '' }));
  }

  function toggleTeacher(teacherId) {
    setForm((current) => {
      const selected = current.teacherIds.includes(teacherId);
      if (selected) {
        return { ...current, teacherIds: current.teacherIds.filter((id) => id !== teacherId) };
      }
      const limit = Math.max(1, Number(current.teacherCount) || 1);
      if (current.teacherIds.length >= limit) return current;
      return { ...current, teacherIds: [...current.teacherIds, teacherId] };
    });
  }

  function updateTeacherCount(event) {
    const value = event.target.value;
    setForm((current) => ({ ...current, teacherCount: value }));
  }

  function switchMode(next) {
    setMode(next);
    setError('');
    clearNotice?.();
    setLocalNotice('');
    if (next === 'login') { setResetToken(''); setNewPassword(''); setConfirmPassword(''); }
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLocalNotice('');
    clearNotice?.();
    if (!readiness.complete) return setError('أكمل جميع الحقول المطلوبة أولاً لتفعيل الزر.');
    if (mode === 'forgot') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('أدخل بريداً إلكترونياً صحيحاً.');
      setBusy(true);
      try {
        const result = await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: form.email.trim() }) });
        if (result?.resetToken) {
          setResetToken(result.resetToken);
          setMode('reset');
          setLocalNotice('بيئة تطوير: تم توليد رابط إعادة تعيين محلي. أدخل كلمة المرور الجديدة.');
        } else {
          setLocalNotice(result?.message || 'إذا كان البريد مسجلاً فسيصلك رابط لإعادة تعيين كلمة المرور.');
        }
      } catch (err) {
        setError(err.message || 'تعذر إرسال رابط الاستعادة.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === 'reset') {
      if (!resetToken) return setError('رابط إعادة التعيين غير صالح. اطلب رابطاً جديداً.');
      if (newPassword.length < 10 || newPassword.length > 128) return setError('كلمة المرور يجب أن تكون بين 10 و128 حرفاً.');
      if (newPassword !== confirmPassword) return setError('كلمتا المرور غير متطابقتين.');
      setBusy(true);
      try {
        const result = await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: resetToken, password: newPassword }) });
        setMode('login');
        setResetToken('');
        setNewPassword('');
        setConfirmPassword('');
        setLocalNotice(result?.message || 'تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن.');
      } catch (err) {
        setError(err.message || 'تعذر تغيير كلمة المرور.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === 'register' && role === 'Teacher' && normalizeDisplayName(form.fullName).length < 3) return setError('اكتب الاسم الكامل (3 أحرف على الأقل).');
    if (mode === 'register' && role === 'Student') {
      const nameError = studentFullNameError(form.fullName);
      if (nameError) return setError(nameError);
    }
    if (mode === 'register' && role === 'Student' && !isValidEducation(form.stage, form.grade)) return setError('اختر المرحلة التعليمية والصف الدراسي المناسب له.');
    if (mode === 'register' && role === 'Student') {
      const studentPhone = phoneDigits(form.studentPhone);
      const parentPhone = phoneDigits(form.parentPhone);
      if (!isValidPhone(studentPhone)) return setError('أدخل رقم هاتف طالب صحيحاً (7 إلى 15 رقماً).');
      if (!isValidPhone(parentPhone)) return setError('أدخل رقم هاتف ولي أمر صحيحاً (7 إلى 15 رقماً).');
      if (studentPhone === parentPhone) return setError('رقم هاتف الطالب يجب أن يختلف عن رقم هاتف ولي الأمر.');
      const parentError = parentNameError(form.parentName, { required: true });
      if (parentError) return setError(parentError);
      const teacherCount = Number(form.teacherCount);
      if (!Number.isInteger(teacherCount) || teacherCount < 1 || teacherCount > 20) return setError('حدد عدد المدرسين من 1 إلى 20.');
      if (form.teacherIds.length < 1) return setError('اختر مدرساً واحداً على الأقل من القائمة.');
      if (form.teacherIds.length > teacherCount) return setError(`اخترت ${form.teacherIds.length} مدرساً، وهو أكثر من العدد الذي حددته (${teacherCount}).`);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('أدخل بريداً إلكترونياً صحيحاً.');
    if (form.password.length < 10 || form.password.length > 128) return setError('كلمة المرور يجب أن تكون بين 10 و128 حرفاً.');
    if (mode === 'register' && !accepted) return setError('يجب الموافقة على شروط الاستخدام وسياسة الخصوصية.');
    setBusy(true);
    try {
      const result = await onAuth(mode, {
        fullName: normalizeDisplayName(form.fullName),
        email: form.email.trim(),
        password: form.password,
        role,
        stage: role === 'Student' ? form.stage : null,
        grade: role === 'Student' ? form.grade : null,
        studentPhone: role === 'Student' ? phoneDigits(form.studentPhone) : null,
        parentPhone: role === 'Student' ? phoneDigits(form.parentPhone) : null,
        parentName: role === 'Student' ? normalizeDisplayName(form.parentName) : null,
        teacherCount: role === 'Student' ? Number(form.teacherCount) : null,
        teacherIds: role === 'Student' ? form.teacherIds : null,
        invitationToken: role === 'Student' && inviteToken ? inviteToken : null,
      });
      if (result?.registered && !result.autoLoggedIn) {
        setMode('login');
        setLocalNotice(result.message || 'تم إنشاء الحساب. تحقق من بريدك الإلكتروني ثم سجّل الدخول.');
      }
    } catch (err) {
      setError(err.message || 'تعذر إكمال العملية. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!form.email.trim()) return setError('أدخل بريدك الإلكتروني أولاً.');
    setResendBusy(true);
    setError('');
    try {
      const result = await request('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: form.email.trim() }) });
      setLocalNotice(result?.message || 'إذا كان البريد مسجلاً وغير مفعّل، فسيصلك رابط تفعيل جديد.');
    } catch (err) {
      setError(err.message);
    } finally {
      setResendBusy(false);
    }
  }

  const activeNotice = notice || localNotice;
  const invitationTeacher = invitation?.teacherId
    ? { id: invitation.teacherId, fullName: invitation.teacherName || 'المدرس المدعو' }
    : null;
  const allTeachers = invitationTeacher && !teachers.some((teacher) => teacher.id === invitationTeacher.id)
    ? [invitationTeacher, ...teachers]
    : teachers;
  const filteredTeachers = allTeachers
    .filter((teacher) => !teacherSearch.trim() || teacher.fullName.includes(teacherSearch.trim()))
    .slice(0, 60);
  const selectedTeachers = form.teacherIds
    .map((id) => allTeachers.find((teacher) => teacher.id === id))
    .filter(Boolean);
  const teacherLimit = Math.max(1, Number(form.teacherCount) || 1);

  const readiness = useMemo(() => {
    const items = [];
    const emailOk = emailIsValid(form.email);
    const passwordOk = passwordIsValid(form.password);
    // Partial progress per field so the bar reacts to every keystroke, not only when a field is valid.
    const typed = (value, target) => {
      const length = String(value ?? '').trim().length;
      if (!length) return 0;
      return Math.min(0.95, length / Math.max(1, target));
    };
    const add = (key, label, done, value = '', target = 1) => {
      items.push({ key, label, done, progress: done ? 1 : typed(value, target) });
    };

    if (mode === 'login') {
      add('email', 'بريد إلكتروني صحيح', emailOk, form.email, 18);
      add('password', 'كلمة المرور (10+)', passwordOk, form.password, 10);
    } else if (mode === 'register') {
      if (role === 'Teacher') {
        const teacherName = normalizeDisplayName(form.fullName);
        add('name', 'الاسم الكامل', teacherName.length >= 3, teacherName, 12);
      } else {
        const studentPhone = phoneDigits(form.studentPhone);
        const parentPhone = phoneDigits(form.parentPhone);
        const count = Number(form.teacherCount);
        const countOk = Number.isInteger(count) && count >= 1 && count <= 20;
        add('name', 'الاسم رباعياً', !studentFullNameError(form.fullName), normalizeDisplayName(form.fullName), 16);
        add('education', 'المرحلة والصف', isValidEducation(form.stage, form.grade));
        add('student-phone', 'هاتف الطالب', isValidPhone(studentPhone), studentPhone, 11);
        add('parent-phone', 'هاتف ولي الأمر', isValidPhone(parentPhone) && parentPhone !== studentPhone, parentPhone, 11);
        add('parent-name', 'اسم ولي الأمر', !parentNameError(form.parentName, { required: true }), normalizeDisplayName(form.parentName), 14);
        add('teacher-count', 'عدد المدرسين', countOk);
        items.push({
          key: 'teachers',
          label: 'اختيار مدرس',
          done: form.teacherIds.length >= 1 && form.teacherIds.length <= teacherLimit,
          progress: Math.min(0.92, form.teacherIds.length / Math.max(1, teacherLimit)),
        });
      }
      add('email', 'البريد الإلكتروني', emailOk, form.email, 18);
      add('password', 'كلمة مرور قوية (10+)', passwordOk, form.password, 10);
      add('terms', 'الموافقة على الشروط', accepted);
    } else if (mode === 'forgot') {
      add('email', 'بريد إلكتروني صحيح', emailOk, form.email, 18);
    } else {
      add('token', 'رابط إعادة التعيين', Boolean(resetToken));
      add('new-password', 'كلمة مرور جديدة (10+)', passwordIsValid(newPassword), newPassword, 10);
      items.push({
        key: 'confirm',
        label: 'تطابق كلمتي المرور',
        done: confirmPassword.length > 0 && newPassword === confirmPassword,
        progress: confirmPassword.length === 0 ? 0 : Math.min(0.95, confirmPassword.length / Math.max(10, newPassword.length)),
      });
    }

    const done = items.filter((item) => item.done).length;
    const total = Math.max(1, items.length);
    const progress = items.reduce((sum, item) => sum + Math.min(1, Math.max(0, item.progress || 0)), 0);
    return {
      items,
      done,
      total,
      percent: Math.round((progress / total) * 100),
      complete: done === items.length && items.length > 0,
    };
  }, [mode, role, form, accepted, newPassword, confirmPassword, resetToken, teacherLimit]);

  return (
    <div className="relative isolate grid min-h-dvh overflow-hidden bg-canvas lg:grid-cols-[1.02fr_.98fr]">
      <AnimatedBackground variant="auth" />
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <button type="button" onClick={onBack} className="rounded-lg"><Logo /></button>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onOpenPortfolio} className="hidden h-9 items-center rounded-[10px] px-3 text-[11.5px] font-bold text-muted transition hover:bg-surface-soft hover:text-ink sm:inline-flex">ملف المطور</button>
            <button type="button" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'} className="grid size-10 place-items-center rounded-[10px] border border-line bg-surface text-muted transition hover:text-ink">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 pb-10 pt-4 sm:px-8">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="w-full max-w-[430px]">
            <button type="button" onClick={onBack} className="mb-6 inline-flex min-h-10 items-center gap-1.5 text-[11.5px] font-bold text-muted transition hover:text-primary"><ArrowRight size={14} />العودة للرئيسية</button>

            <motion.div key={`intro-${mode}`} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }} className="mb-6">
              <motion.div
                initial={reduce ? false : { opacity: 0, scale: 0.6, rotate: -16 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="relative mb-3 inline-grid size-11 place-items-center rounded-[14px] bg-primary-soft text-primary"
              >
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[14px] border border-primary/35 motion-safe:animate-[ui-pulse-ring_3.4s_ease-out_infinite]" />
                <motion.span animate={reduce ? undefined : { y: [0, -2.5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} className="grid place-items-center">
                  <LockKeyhole size={21} />
                </motion.span>
              </motion.div>
              <h1 className="font-display text-[clamp(1.7rem,3vw,2.15rem)] font-semibold leading-tight tracking-[-0.045em] text-ink">
                {mode === 'login' ? 'أهلاً بعودتك.' : mode === 'register' ? 'أنشئ حسابك في دقيقة.' : mode === 'forgot' ? 'استعادة كلمة المرور.' : 'تعيين كلمة مرور جديدة.'}
              </h1>
              <p className="mt-1.5 text-[13.5px] leading-6 text-muted">
                {mode === 'login' ? 'سجّل الدخول لمتابعة امتحاناتك أو إدارة جلستك القادمة.' : mode === 'register' ? 'اختر نوع الحساب، وأدخل بياناتك، وستكون جاهزاً للبدء.' : mode === 'forgot' ? 'أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين إذا كان الحساب موجوداً.' : 'اختر كلمة مرور جديدة لحسابك.'}
              </p>
            </motion.div>

            {mode === 'login' || mode === 'register' ? (
              <Segmented
                value={mode}
                onChange={switchMode}
                ariaLabel="طريقة الدخول"
                className="mb-5 w-full"
                options={[{ value: 'login', label: 'تسجيل الدخول' }, { value: 'register', label: 'حساب جديد' }]}
              />
            ) : (
              <button type="button" onClick={() => switchMode('login')} className="mb-5 inline-flex min-h-9 items-center gap-1.5 text-[11.5px] font-bold text-muted transition hover:text-primary"><ArrowRight size={14} />العودة لتسجيل الدخول</button>
            )}

            {activeNotice ? <Alert tone={notice ? noticeTone : 'success'} className="mb-4" onClose={() => { clearNotice?.(); setLocalNotice(''); }}>{activeNotice}</Alert> : null}
            {error ? <Alert tone="danger" className="mb-4" onClose={() => setError('')}>{error}</Alert> : null}

            <motion.div
              className={`relative mb-4 overflow-hidden rounded-[16px] border p-3.5 transition-colors duration-300 ${readiness.complete ? 'border-emerald/30 bg-emerald-soft/60' : 'border-line bg-surface/80'} backdrop-blur-sm`}
              animate={reduce ? undefined : { scale: readiness.complete ? 1.012 : 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              data-testid="auth-readiness"
            >
              <motion.span
                aria-hidden="true"
                className={`pointer-events-none absolute -left-10 -top-12 size-28 rounded-full blur-2xl ${readiness.complete ? 'bg-emerald/20' : 'bg-primary/10'}`}
                animate={reduce ? undefined : { scale: [1, 1.22, 1], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="relative mb-2 flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1.5 text-[11.5px] font-bold ${readiness.complete ? 'text-emerald' : 'text-muted'}`}>
                  {readiness.complete ? <CheckCircle2 size={13} /> : <ShieldCheck size={13} />}
                  {readiness.complete ? (mode === 'login' ? 'جاهز للدخول' : mode === 'register' ? 'جاهز لإنشاء الحساب' : mode === 'forgot' ? 'جاهز للإرسال' : 'جاهز للتعيين') : `جاهزية النموذج · ${readiness.done} من ${readiness.total}`}
                </span>
                <motion.span
                  key={readiness.percent}
                  initial={reduce ? false : { opacity: 0.35, y: -3, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className={`ui-number text-[11px] font-bold ${readiness.complete ? 'text-emerald' : 'text-subtle'}`}
                >
                  {readiness.percent}%
                </motion.span>
              </div>
              <div className="relative mt-0.5 overflow-hidden rounded-full">
                <ProgressBar value={readiness.percent} className="h-1.5" tone={readiness.complete ? 'emerald' : 'primary'} />
                {!readiness.complete && readiness.percent > 0 ? (
                  <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-l from-transparent via-white/70 to-transparent"
                    animate={reduce ? undefined : { x: ['140%', '-360%'] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
                  />
                ) : null}
              </div>
              <div className="relative mt-2.5 flex flex-wrap gap-1.5">
                {readiness.items.map((item) => (
                  <motion.span
                    key={item.key}
                    layout={!reduce}
                    animate={reduce ? undefined : { scale: item.done ? 1.03 : 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold transition-colors duration-300 ${item.done ? 'bg-emerald-soft text-emerald' : 'bg-surface-soft text-subtle'}`}
                  >
                    {item.done ? (
                      <CheckCircle2 size={9} />
                    ) : item.progress > 0 ? (
                      <span className="relative h-1 w-3.5 overflow-hidden rounded-full bg-current opacity-25">
                        <motion.span
                          className="absolute inset-y-0 right-0 rounded-full bg-current opacity-80"
                          animate={{ width: `${Math.round(item.progress * 100)}%` }}
                          transition={{ duration: 0.22, ease: 'easeOut' }}
                        />
                      </span>
                    ) : (
                      <span className="size-1.5 rounded-full bg-current opacity-50" />
                    )}
                    {item.label}
                  </motion.span>
                ))}
              </div>
            </motion.div>

            <motion.form
              key={`${mode}-${mode === 'register' ? role : ''}`}
              onSubmit={submit}
              className="grid gap-4"
              noValidate
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              {mode === 'register' ? (
                <>
                  <Field
                    label={role === 'Student' ? 'اسم الطالب رباعياً' : 'الاسم الكامل'}
                    id="auth-name"
                    hint={role === 'Student' ? 'اكتب أربعة أسماء واضحة: الاسم الأول، اسم الأب، اسم الجد، اسم العائلة.' : undefined}
                  >
                    <div className="relative">
                      <UserRound size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-subtle" />
                      <Input id="auth-name" autoComplete="name" maxLength={120} value={form.fullName} onChange={update('fullName')} placeholder={role === 'Student' ? 'مثال: سارة أحمد محمد علي' : 'مثال: سارة أحمد'} className="pr-10" />
                    </div>
                    {role === 'Student' ? (
                      <p className={`mt-1 text-[10.5px] font-bold ${nameParts(form.fullName).length >= 4 ? 'text-emerald' : 'text-warning'}`}>
                        عدد الأجزاء: {nameParts(form.fullName).length} / 4
                      </p>
                    ) : null}
                  </Field>

                  <Field label="نوع الحساب" id="auth-role" hint={role === 'Teacher' ? 'ستحصل على لوحة تحكم كاملة لإنشاء الامتحانات ومتابعة الطلاب.' : 'ستظهر لك امتحانات مدرسيك المطابقة لمرحلتك وصفك مباشرة بعد تسجيل الدخول.'}>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'Student', label: 'طالب', icon: GraduationCap, detail: 'أداء الامتحانات' },
                        { value: 'Teacher', label: 'مدرس', icon: Users, detail: 'إدارة الجلسات' },
                      ].map((item) => (
                        <button key={item.value} type="button" data-testid={`auth-role-${item.value.toLowerCase()}`} onClick={() => setRole(item.value)} aria-pressed={role === item.value} className={`flex items-center gap-2.5 rounded-[12px] border p-3 text-right transition ${role === item.value ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-line-strong'}`}>
                          <span className={`grid size-8 shrink-0 place-items-center rounded-[9px] ${role === item.value ? 'bg-primary text-white' : 'bg-surface-soft text-muted'}`}><item.icon size={15} /></span>
                          <span><strong className="block text-[12.5px] text-ink">{item.label}</strong><span className="text-[10.5px] text-muted">{item.detail}</span></span>
                        </button>
                      ))}
                    </div>
                  </Field>

                  {role === 'Student' ? (
                    <>
                      {invitation ? (
                        <div className="rounded-[13px] border border-emerald/25 bg-emerald-soft p-3" data-testid="invitation-banner">
                          <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-emerald"><Ticket size={13} />دعوة من {invitation.teacherName || 'المدرس'}</p>
                          <p className="mt-1 text-[10.5px] leading-5 text-muted">تم تعبئة بيانات الدعوة. راجعها وأكمل إنشاء الحساب للموافقة على الارتباط بهذا المدرس.</p>
                        </div>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="المرحلة التعليمية" id="auth-stage" hint="اختر مرحلتك الدراسية الحالية.">
                          <Select id="auth-stage" value={form.stage} onChange={updateStage}>
                            <option value="">اختر المرحلة</option>
                            {EDUCATION_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                          </Select>
                        </Field>
                        <Field label="الصف الدراسي" id="auth-grade" hint="تظهر الامتحانات المطابقة لصفك فقط.">
                          <Select id="auth-grade" value={form.grade} onChange={update('grade')} disabled={!form.stage}>
                            <option value="">{form.stage ? 'اختر الصف' : 'اختر المرحلة أولاً'}</option>
                            {gradesForStage(form.stage).map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                          </Select>
                        </Field>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="رقم هاتف الطالب" id="auth-student-phone" hint="رقم فريد على مستوى المنصة.">
                          <div className="relative">
                            <Phone size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-subtle" />
                            <Input id="auth-student-phone" dir="ltr" inputMode="tel" autoComplete="tel" maxLength={20} value={form.studentPhone} onChange={update('studentPhone')} placeholder="01xxxxxxxxx" className="pr-10 text-left" />
                          </div>
                        </Field>
                        <Field label="رقم هاتف ولي الأمر" id="auth-parent-phone" hint="قد يشترك فيه الإخوة، ويجب أن يختلف عن رقم الطالب.">
                          <Input id="auth-parent-phone" dir="ltr" inputMode="tel" maxLength={20} value={form.parentPhone} onChange={update('parentPhone')} placeholder="01xxxxxxxxx" className="text-left" />
                        </Field>
                      </div>

                      <Field label="اسم ولي الأمر" id="auth-parent-name" hint="يظهر للمدرس المسؤول لمتابعة الطالب، ولا يُنشر علناً.">
                        <Input id="auth-parent-name" autoComplete="off" maxLength={200} value={form.parentName} onChange={update('parentName')} placeholder="مثال: أحمد محمد علي" />
                      </Field>

                      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                        <Field label="عدد المدرسين" id="auth-teacher-count" hint="الحد الذي تختاره لنفسك.">
                          <Input id="auth-teacher-count" type="number" min={1} max={20} inputMode="numeric" value={form.teacherCount} onChange={updateTeacherCount} className="text-center" />
                        </Field>
                        <div className="flex flex-col justify-end">
                          <div className="flex flex-wrap items-center gap-1.5 pb-1">
                            <span className="text-[11px] font-bold text-muted">المختارون:</span>
                            <Badge tone={form.teacherIds.length > teacherLimit ? 'danger' : form.teacherIds.length ? 'emerald' : 'neutral'}>
                              {form.teacherIds.length} / {teacherLimit}
                            </Badge>
                            {selectedTeachers.map((teacher) => (
                              <button key={teacher.id} type="button" onClick={() => toggleTeacher(teacher.id)} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-1 text-[10px] font-bold text-primary transition hover:bg-danger-soft hover:text-danger" title="إزالة المدرس">
                                {teacher.fullName}<X size={10} />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[13px] border border-line bg-surface-soft/60 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-[11.5px] font-bold text-ink">اختر المدرسين</p>
                          <span className="text-[10px] text-subtle">سيصل لكل مدرس طلب ارتباط</span>
                        </div>
                        <div className="relative mb-2">
                          <Search size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
                          <input
                            value={teacherSearch}
                            onChange={(event) => setTeacherSearch(event.target.value)}
                            placeholder="ابحث باسم المدرس..."
                            aria-label="ابحث باسم المدرس"
                            className="h-9 w-full rounded-[9px] border border-line bg-surface pr-8 pl-3 text-[12px] text-ink outline-none transition placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary-soft"
                          />
                        </div>
                        {teachersLoading ? (
                          <p className="py-3 text-center text-[11px] text-muted">جارٍ تحميل المدرسين...</p>
                        ) : filteredTeachers.length === 0 ? (
                          <p className="py-3 text-center text-[11px] text-muted">لا يوجد مدرسون متاحون الآن. يمكنك التسجيل لاحقاً واختيار مدرس من صفحة المدرسين.</p>
                        ) : (
                          <div className="ui-scrollbar-hidden grid max-h-44 gap-1 overflow-y-auto pe-1">
                            {filteredTeachers.map((teacher) => {
                              const selected = form.teacherIds.includes(teacher.id);
                              const disabled = !selected && form.teacherIds.length >= teacherLimit;
                              return (
                                <button
                                  key={teacher.id}
                                  type="button"
                                  data-testid={`auth-teacher-${teacher.id}`}
                                  onClick={() => toggleTeacher(teacher.id)}
                                  disabled={disabled}
                                  aria-pressed={selected}
                                  className={`flex items-center justify-between gap-2 rounded-[9px] border px-2.5 py-2 text-right text-[11.5px] transition ${selected ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-ink hover:border-line-strong'} ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
                                >
                                  <span className="flex items-center gap-2"><GraduationCap size={13} />{teacher.fullName}</span>
                                  <span className={`grid size-4 place-items-center rounded-full border ${selected ? 'border-primary bg-primary text-white' : 'border-line-strong'}`}>{selected ? <CheckCircle2 size={10} /> : null}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {form.teacherIds.length > teacherLimit ? <p className="mt-2 text-[10.5px] font-bold text-danger">عدد المختارين أكبر من الحد. قلّل الاختيار أو ارفع العدد.</p> : null}
                        <p className="mt-2 text-[10px] leading-5 text-subtle">لا يظهر الطالب للمدرس إلا بعد قبول طلب الارتباط. لا يمكن إرسال أكثر من طلب معلّق لنفس المدرس، ويمكن إعادة الطلب بعد الرفض أو فك الارتباط.</p>
                      </div>
                    </>
                  ) : null}

                </>
              ) : null}

              {mode !== 'reset' ? (
                <Field label="البريد الإلكتروني" id="auth-email">
                  <div className="relative">
                    <Mail size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-subtle" />
                    <Input id="auth-email" type="email" autoComplete="email" dir="ltr" maxLength={254} value={form.email} onChange={update('email')} placeholder="name@example.com" className="pr-10 text-left" />
                  </div>
                </Field>
              ) : null}

              {mode === 'forgot' ? null : mode === 'reset' ? (
                <>
                  <Field label="كلمة المرور الجديدة" id="auth-new-password" hint="10 أحرف على الأقل، ويفضل مزيج من الحروف والأرقام.">
                    <Input id="auth-new-password" type="password" autoComplete="new-password" maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="••••••••" className="px-3.5" />
                    <PasswordMeter value={newPassword} />
                  </Field>
                  <Field label="تأكيد كلمة المرور" id="auth-confirm-password">
                    <Input id="auth-confirm-password" type="password" autoComplete="new-password" maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="••••••••" className="px-3.5" />
                    {confirmPassword ? (
                      <p className={`mt-1.5 flex items-center gap-1 text-[10.5px] font-bold ${newPassword === confirmPassword ? 'text-emerald' : 'text-danger'}`}>
                        {newPassword === confirmPassword ? <CheckCircle2 size={11} /> : null}
                        {newPassword === confirmPassword ? 'كلمتا المرور متطابقتان.' : 'كلمتا المرور غير متطابقتين.'}
                      </p>
                    ) : null}
                  </Field>
                </>
              ) : (
                <Field label="كلمة المرور" id="auth-password" hint={mode === 'register' ? '10 أحرف على الأقل، ويفضل مزيج من الحروف والأرقام.' : undefined}>
                  <div className="relative">
                    <LockKeyhole size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-subtle" />
                    <Input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={128} value={form.password} onChange={update('password')} placeholder="••••••••" className="pl-10 pr-10" />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-subtle transition hover:bg-surface-soft hover:text-ink" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {mode === 'register' ? <PasswordMeter value={form.password} /> : null}
                </Field>
              )}

              {mode === 'login' ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={resend} disabled={resendBusy} className="min-h-9 font-bold text-primary transition hover:text-primary-strong disabled:opacity-60">{resendBusy ? 'جارٍ الإرسال...' : 'إعادة إرسال رابط التفعيل'}</button>
                    <button type="button" onClick={() => switchMode('forgot')} className="min-h-9 font-bold text-muted transition hover:text-primary">نسيت كلمة المرور؟</button>
                  </div>
                  <span className="text-subtle">الدخول متاح للطلاب والمدرسين</span>
                </div>
              ) : mode === 'register' ? (
                <label className="flex items-start gap-2 text-[12px] leading-6 text-muted">
                  <input type="checkbox" required checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1.5 size-4 accent-primary" />
                  <span>أوافق على استخدام المنصة لأغراض تعليمية، وعلى سياسة الخصوصية.</span>
                </label>
              ) : null}

              <Button
                type="submit"
                loading={busy}
                disabled={!readiness.complete}
                className="mt-1 w-full"
                size="lg"
                data-testid="auth-submit"
                icon={readiness.complete ? (mode === 'login' || mode === 'reset' ? LockKeyhole : mode === 'forgot' ? Mail : UserRound) : ShieldCheck}
              >
                {!readiness.complete ? 'أكمل بياناتك للتفعيل' : mode === 'login' ? 'تسجيل الدخول' : mode === 'register' ? 'إنشاء الحساب' : mode === 'forgot' ? 'إرسال رابط الاستعادة' : 'تعيين كلمة المرور'}
              </Button>
              {!readiness.complete ? (
                <p className="text-center text-[10.5px] font-semibold text-subtle">الزر يعمل تلقائياً بعد اكتمال جميع الحقول أعلاه.</p>
              ) : null}
            </motion.form>

            {mode === 'login' || mode === 'register' ? (
              <p className="mt-5 text-center text-[12px] text-muted">
                {mode === 'login' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}{' '}
                <button type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')} className="font-extrabold text-primary hover:underline">
                  {mode === 'login' ? 'أنشئ حساباً جديداً' : 'سجّل الدخول'}
                </button>
              </p>
            ) : null}

            <div className="mt-7 flex items-center justify-center gap-1.5 text-[10.5px] text-subtle">
              <ShieldCheck size={11} />
              بياناتك محمية ولا تُشارك مع أي طرف ثالث.
            </div>
          </motion.div>
        </main>
      </div>

      <AuthVisual />
    </div>
  );
}
