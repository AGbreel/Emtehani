import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
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
  Radio,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  Users,
} from 'lucide-react';
import { Alert, Button, Field, Input, Logo, Segmented, Select } from '../components/ui';
import { request } from '../lib/api';
import { EDUCATION_STAGES, gradesForStage, isValidEducation } from '../lib/education';

function AuthVisual() {
  return (
    <div className="relative hidden min-h-[680px] overflow-hidden bg-[#10172e] p-10 text-white lg:flex lg:flex-col dark:bg-[#080e1b]">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/25 blur-[90px]" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-emerald/15 blur-[100px]" />
      <div className="pointer-events-none absolute inset-0 ui-grid-bg opacity-[0.07]" />

      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-white/70">
          <Sparkles size={12} className="text-emerald" /> تجربة امتحان أكثر
          هدوءاً
        </span>
        <h2 className="mt-6 max-w-md font-display text-[clamp(2rem,3vw,2.8rem)] font-semibold leading-[1.28] tracking-[-0.05em]">
          كل ما يحدث في الجلسة،
          <span className="text-emerald"> أمامك بوضوح.</span>
        </h2>
        <p className="mt-3 max-w-sm text-[13px] leading-7 text-white/70">
          من دخول الطالب إلى آخر ورقة مسلّمة. لا تخمّن، راقب، وتحكّم.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="relative mt-10 w-full max-w-[430px] self-center"
      >
        <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-[10px] bg-white/10">
                <Radio size={15} className="text-emerald" />
              </span>
              <div>
                <p className="text-[10.5px] font-bold">غرفة الانتظار</p>
                <p className="text-[8px] text-white/45">اختبار الرياضيات</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald/10 px-2 py-1 text-[8px] font-bold text-emerald">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald" />
              مفتوحة
            </span>
          </div>
          <div className="py-4 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full border border-white/10 bg-white/5 text-white/70">
              <Clock3 size={21} />
            </div>
            <p className="mt-3 text-[12px] font-bold">بانتظار بدء الامتحان</p>
            <p className="mx-auto mt-1 max-w-[260px] text-[9px] leading-5 text-white/45">
              سيبدأ الامتحان تلقائياً عندما يفتح المدرس الجلسة.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              ["18", "حاضر"],
              ["02", "متصل الآن"],
              ["45", "دقيقة"],
            ].map(([v, l]) => (
              <div
                key={l}
                className="rounded-[10px] border border-white/10 bg-white/[0.04] px-2 py-2 text-center"
              >
                <strong className="ui-number block text-sm font-bold">
                  {v}
                </strong>
                <span className="text-[7.5px] text-white/40">{l}</span>
              </div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.55, duration: 0.45 }}
          className="absolute -bottom-8 -left-5 flex items-center gap-2.5 rounded-[13px] border border-white/10 bg-[#0d1425] px-3 py-2.5 shadow-xl"
        >
          <span className="grid size-7 place-items-center rounded-[8px] bg-emerald/15 text-emerald">
            <CheckCircle2 size={14} />
          </span>
          <div>
            <p className="text-[8px] text-white/40">تم التسليم</p>
            <p className="text-[9px] font-bold">احمد جبريل · 04:12</p>
          </div>
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
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState('Student');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  const [localNotice, setLocalNotice] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', stage: '', grade: '' });
  const [accepted, setAccepted] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    try {
      const token = new URLSearchParams(window.location.search).get('resetToken');
      if (token) {
        setResetToken(token);
        setMode('reset');
      }
    } catch { /* ignore */ }
  }, []);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function updateStage(event) {
    const stage = event.target.value;
    setForm((current) => ({ ...current, stage, grade: '' }));
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
      if (newPassword.length < 8 || newPassword.length > 128) return setError('كلمة المرور يجب أن تكون بين 8 و128 حرفاً.');
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
    if (mode === 'register' && form.fullName.trim().length < 3) return setError('اكتب الاسم الكامل (3 أحرف على الأقل).');
    if (mode === 'register' && role === 'Student' && !isValidEducation(form.stage, form.grade)) return setError('اختر المرحلة التعليمية والصف الدراسي المناسب له.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('أدخل بريداً إلكترونياً صحيحاً.');
    if (form.password.length < 8 || form.password.length > 128) return setError('كلمة المرور يجب أن تكون بين 8 و128 حرفاً.');
    if (mode === 'register' && !accepted) return setError('يجب الموافقة على شروط الاستخدام وسياسة الخصوصية.');
    setBusy(true);
    try {
      const result = await onAuth(mode, {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        role,
        stage: role === 'Student' ? form.stage : null,
        grade: role === 'Student' ? form.grade : null,
      });
      if (result?.registered) {
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

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[1.02fr_.98fr]">
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <button type="button" onClick={onBack} className="rounded-lg">
            <Logo />
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenPortfolio}
              className="hidden h-9 items-center rounded-[10px] px-3 text-[11.5px] font-bold text-muted transition hover:bg-surface-soft hover:text-ink sm:inline-flex"
            >
              ملف المطور
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
              className="grid size-10 place-items-center rounded-[10px] border border-line bg-surface text-muted transition hover:text-ink"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 pb-10 pt-4 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="w-full max-w-[430px]"
          >
            <button
              type="button"
              onClick={onBack}
              className="mb-6 inline-flex min-h-10 items-center gap-1.5 text-[11.5px] font-bold text-muted transition hover:text-primary"
            >
              <ArrowRight size={14} />
              العودة للرئيسية
            </button>

            <div className="mb-6">
              <div className="mb-3 inline-flex size-11 items-center justify-center rounded-[14px] bg-primary-soft text-primary">
                <LockKeyhole size={21} />
              </div>
              <h1 className="font-display text-[clamp(1.7rem,3vw,2.15rem)] font-semibold leading-tight tracking-[-0.045em] text-ink">
                {mode === "login"
                  ? "أهلاً بعودتك."
                  : mode === "register"
                    ? "أنشئ حسابك في دقيقة."
                    : mode === "forgot"
                      ? "استعادة كلمة المرور."
                      : "تعيين كلمة مرور جديدة."}
              </h1>
              <p className="mt-1.5 text-[13.5px] leading-6 text-muted">
                {mode === "login"
                  ? "سجّل الدخول لمتابعة امتحاناتك أو إدارة جلستك القادمة."
                  : mode === "register"
                    ? "اختر نوع الحساب، وأدخل بياناتك، وستكون جاهزاً للبدء."
                    : mode === "forgot"
                      ? "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين إذا كان الحساب موجوداً."
                      : "اختر كلمة مرور جديدة لحسابك."}
              </p>
            </div>

            {mode === "login" || mode === "register" ? (
              <Segmented
                value={mode}
                onChange={switchMode}
                ariaLabel="طريقة الدخول"
                className="mb-5 w-full"
                options={[
                  { value: "login", label: "تسجيل الدخول" },
                  { value: "register", label: "حساب جديد" },
                ]}
              />
            ) : (
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="mb-5 inline-flex min-h-9 items-center gap-1.5 text-[11.5px] font-bold text-muted transition hover:text-primary"
              >
                <ArrowRight size={14} />
                العودة لتسجيل الدخول
              </button>
            )}

            {activeNotice ? (
              <Alert
                tone={notice ? noticeTone : "success"}
                className="mb-4"
                onClose={() => {
                  clearNotice?.();
                  setLocalNotice("");
                }}
              >
                {activeNotice}
              </Alert>
            ) : null}
            {error ? (
              <Alert
                tone="danger"
                className="mb-4"
                onClose={() => setError("")}
              >
                {error}
              </Alert>
            ) : null}

            <form onSubmit={submit} className="grid gap-4" noValidate>
              {mode === "register" ? (
                <>
                  <Field label="الاسم الكامل" id="auth-name">
                    <div className="relative">
                      <UserRound
                        size={16}
                        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-subtle"
                      />
                      <Input
                        id="auth-name"
                        autoComplete="name"
                        maxLength={120}
                        value={form.fullName}
                        onChange={update("fullName")}
                        placeholder="مثال: احمد جبريل"
                        className="pr-10"
                      />
                    </div>
                  </Field>

                  <Field
                    label="نوع الحساب"
                    id="auth-role"
                    hint={
                      role === "Teacher"
                        ? "ستحصل على لوحة تحكم كاملة لإنشاء الامتحانات ومتابعة الطلاب."
                        : "ستظهر لك امتحانات مدرسيك المطابقة لمرحلتك وصفك مباشرة بعد تسجيل الدخول."
                    }
                  >
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          value: "Student",
                          label: "طالب",
                          icon: GraduationCap,
                          detail: "أداء الامتحانات",
                        },
                        {
                          value: "Teacher",
                          label: "مدرس",
                          icon: Users,
                          detail: "إدارة الجلسات",
                        },
                      ].map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setRole(item.value)}
                          aria-pressed={role === item.value}
                          className={`flex items-center gap-2.5 rounded-[12px] border p-3 text-right transition ${role === item.value ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong"}`}
                        >
                          <span
                            className={`grid size-8 shrink-0 place-items-center rounded-[9px] ${role === item.value ? "bg-primary text-white" : "bg-surface-soft text-muted"}`}
                          >
                            <item.icon size={15} />
                          </span>
                          <span>
                            <strong className="block text-[12.5px] text-ink">
                              {item.label}
                            </strong>
                            <span className="text-[10.5px] text-muted">
                              {item.detail}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </Field>

                  {role === "Student" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        label="المرحلة التعليمية"
                        id="auth-stage"
                        hint="اختر مرحلتك الدراسية الحالية."
                      >
                        <Select
                          id="auth-stage"
                          value={form.stage}
                          onChange={updateStage}
                        >
                          <option value="">اختر المرحلة</option>
                          {EDUCATION_STAGES.map((stage) => (
                            <option key={stage} value={stage}>
                              {stage}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field
                        label="الصف الدراسي"
                        id="auth-grade"
                        hint="تظهر الامتحانات المطابقة لصفك فقط."
                      >
                        <Select
                          id="auth-grade"
                          value={form.grade}
                          onChange={update("grade")}
                          disabled={!form.stage}
                        >
                          <option value="">
                            {form.stage ? "اختر الصف" : "اختر المرحلة أولاً"}
                          </option>
                          {gradesForStage(form.stage).map((grade) => (
                            <option key={grade} value={grade}>
                              {grade}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  ) : null}
                </>
              ) : null}

              {mode !== "reset" ? (
                <Field label="البريد الإلكتروني" id="auth-email">
                  <div className="relative">
                    <Mail
                      size={16}
                      className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-subtle"
                    />
                    <Input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      dir="ltr"
                      maxLength={254}
                      value={form.email}
                      onChange={update("email")}
                      placeholder="name@example.com"
                      className="pr-10 text-left"
                    />
                  </div>
                </Field>
              ) : null}

              {mode === "forgot" ? null : mode === "reset" ? (
                <>
                  <Field
                    label="كلمة المرور الجديدة"
                    id="auth-new-password"
                    hint="8 أحرف على الأقل، ويفضل مزيج من الحروف والأرقام."
                  >
                    <Input
                      id="auth-new-password"
                      type="password"
                      autoComplete="new-password"
                      maxLength={128}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="••••••••"
                      className="px-3.5"
                    />
                  </Field>
                  <Field label="تأكيد كلمة المرور" id="auth-confirm-password">
                    <Input
                      id="auth-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      maxLength={128}
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder="••••••••"
                      className="px-3.5"
                    />
                  </Field>
                </>
              ) : (
                <Field
                  label="كلمة المرور"
                  id="auth-password"
                  hint={
                    mode === "register"
                      ? "8 أحرف على الأقل، ويفضل مزيج من الحروف والأرقام."
                      : undefined
                  }
                >
                  <div className="relative">
                    <LockKeyhole
                      size={16}
                      className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-subtle"
                    />
                    <Input
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      maxLength={128}
                      value={form.password}
                      onChange={update("password")}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-subtle transition hover:bg-surface-soft hover:text-ink"
                      aria-label={
                        showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                      }
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>
              )}

              {mode === "login" ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={resend}
                      disabled={resendBusy}
                      className="min-h-9 font-bold text-primary transition hover:text-primary-strong disabled:opacity-60"
                    >
                      {resendBusy
                        ? "جارٍ الإرسال..."
                        : "إعادة إرسال رابط التفعيل"}
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="min-h-9 font-bold text-muted transition hover:text-primary"
                    >
                      نسيت كلمة المرور؟
                    </button>
                  </div>
                  <span className="text-subtle">
                    الدخول متاح للطلاب والمدرسين
                  </span>
                </div>
              ) : mode === "register" ? (
                <label className="flex items-start gap-2 text-[12px] leading-6 text-muted">
                  <input
                    type="checkbox"
                    required
                    checked={accepted}
                    onChange={(event) => setAccepted(event.target.checked)}
                    className="mt-1.5 size-4 accent-primary"
                  />
                  <span>
                    أوافق على استخدام المنصة لأغراض تعليمية، وعلى سياسة
                    الخصوصية.
                  </span>
                </label>
              ) : null}

              <Button
                type="submit"
                loading={busy}
                className="mt-1 w-full"
                size="lg"
                icon={
                  mode === "login" || mode === "reset"
                    ? LockKeyhole
                    : mode === "forgot"
                      ? Mail
                      : UserRound
                }
              >
                {mode === "login"
                  ? "تسجيل الدخول"
                  : mode === "register"
                    ? "إنشاء الحساب"
                    : mode === "forgot"
                      ? "إرسال رابط الاستعادة"
                      : "تعيين كلمة المرور"}
              </Button>
            </form>

            {mode === "login" || mode === "register" ? (
              <p className="mt-5 text-center text-[12px] text-muted">
                {mode === "login" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
                <button
                  type="button"
                  onClick={() =>
                    switchMode(mode === "login" ? "register" : "login")
                  }
                  className="font-extrabold text-primary hover:underline"
                >
                  {mode === "login" ? "أنشئ حساباً جديداً" : "سجّل الدخول"}
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
