import React, { useState } from "react";
import { ArrowLeft, BookOpen, Check, Code2, Moon, ShieldCheck, Sun } from "lucide-react";
import "./AuthLanding.css";

const PREVIEW_QUESTIONS = [
  {
    id: "q1",
    prompt: "ما ناتج ٧ × ٦؟",
    options: ["٣٦", "٤٢", "٤٨", "٥٤"],
    answer: "٤٢",
  },
  {
    id: "q2",
    prompt: "ما ناتج ١٥ + ٢٧؟",
    options: ["٣٢", "٤٠", "٤٢", "٥٢"],
    answer: "٤٢",
  },
];

function ExamPreview() {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const question = PREVIEW_QUESTIONS[index];
  const isLast = index === PREVIEW_QUESTIONS.length - 1;

  function nextQuestion() {
    setSelected("");
    setIndex(isLast ? 0 : index + 1);
  }

  return (
    <div className="signin-preview" aria-label="معاينة تفاعلية من المنصة">
      <div className="signin-preview-head">
        <span className="signin-preview-label">معاينة تفاعلية</span>
        <span className="signin-preview-count">سؤال {index + 1} من {PREVIEW_QUESTIONS.length}</span>
      </div>
      <div className="signin-preview-track" aria-hidden="true">
        <span style={{ width: `${((index + 1) / PREVIEW_QUESTIONS.length) * 100}%` }} />
      </div>
      <p className="signin-preview-question">{question.prompt}</p>
      <div className="signin-preview-options">
        {question.options.map((option) => {
          const active = selected === option;
          return (
            <button
              key={option}
              type="button"
              className={`signin-preview-option${active ? " is-selected" : ""}`}
              aria-pressed={active}
              onClick={() => setSelected(option)}
            >
              <span className="signin-preview-radio">{active ? <Check size={12} strokeWidth={3} /> : null}</span>
              <span>{option}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="signin-preview-next" onClick={nextQuestion} disabled={!selected}>
        {isLast ? "إعادة المعاينة" : "السؤال التالي"}
        <ArrowLeft size={15} />
      </button>
    </div>
  );
}

export default function AuthLanding({
  theme,
  onToggleTheme,
  authMode,
  auth,
  setAuth,
  authNotice,
  error,
  busy,
  onSubmit,
  onResend,
  onSwitchMode,
  onOpenPortfolio,
}) {
  const isRegister = authMode === "register";
  const isDark = theme === "dark";

  return (
    <main className={`signin-page ${isDark ? "is-dark" : "is-light"}`} dir="rtl">
      <section className="signin-form-side">
        <div className="signin-form-top">
          <div className="signin-mobile-brand">
            <span className="signin-mobile-mark"><BookOpen size={19} /></span>
            <span>امتحاني</span>
          </div>
          <button
            type="button"
            className="signin-theme"
            onClick={onToggleTheme}
            aria-label={isDark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
            <span>{isDark ? "فاتح" : "داكن"}</span>
          </button>
        </div>

        <div className="signin-form-wrap">
          <div className="signin-heading">
            <h1>{isRegister ? "أنشئ حسابك" : "سجّل الدخول"}</h1>
            <p>{isRegister ? "ابدأ بإنشاء اختبارك الأول في دقائق." : "تابع امتحاناتك أو أنشئ اختباراً جديداً."}</p>
          </div>

          {authNotice ? <div className="signin-notice" role="status">{authNotice}</div> : null}
          {error ? <div className="signin-error" role="alert">{error}</div> : null}

          <form className="signin-form" onSubmit={onSubmit}>
            {isRegister ? (
              <label>
                الاسم بالكامل
                <input
                  required
                  autoComplete="name"
                  value={auth.fullName}
                  onChange={(event) => setAuth({ ...auth, fullName: event.target.value })}
                  placeholder="اكتب اسمك"
                />
              </label>
            ) : null}
            <label>
              البريد الإلكتروني
              <input
                required
                type="email"
                dir="ltr"
                autoComplete="email"
                value={auth.email}
                onChange={(event) => setAuth({ ...auth, email: event.target.value })}
                placeholder="name@example.com"
              />
            </label>
            <label>
              كلمة المرور
              <input
                required
                minLength={8}
                type="password"
                dir="ltr"
                autoComplete={isRegister ? "new-password" : "current-password"}
                value={auth.password}
                onChange={(event) => setAuth({ ...auth, password: event.target.value })}
                placeholder="8 أحرف على الأقل"
              />
            </label>
            {isRegister ? (
              <label>
                نوع الحساب
                <select value={auth.role} onChange={(event) => setAuth({ ...auth, role: event.target.value })}>
                  <option value="Student">طالب</option>
                  <option value="Teacher">مدرس</option>
                </select>
              </label>
            ) : null}
            <button className="signin-submit" type="submit" disabled={busy}>
              {busy ? "جارٍ التنفيذ..." : isRegister ? "إنشاء الحساب" : "تسجيل الدخول"}
              <ArrowLeft size={17} />
            </button>
          </form>

          {!isRegister ? (
            <button type="button" className="signin-link signin-resend" onClick={onResend} disabled={busy}>
              {busy ? "جارٍ الإرسال..." : "لم يصلك رابط التأكيد؟ أعد إرساله"}
            </button>
          ) : null}

          <div className="signin-switch">
            {isRegister ? "لديك حساب بالفعل؟" : "ليس لديك حساب؟"}
            <button type="button" onClick={onSwitchMode}>
              {isRegister ? "سجّل الدخول" : "أنشئ حساباً"}
            </button>
          </div>

          <p className="signin-security">
            <ShieldCheck size={15} />
            الدخول متاح للطلاب والمدرسين فقط.
          </p>

          <button type="button" className="signin-portfolio" onClick={onOpenPortfolio}>
            <Code2 size={15} />
            تعرّف على المطور وأعماله
          </button>
        </div>
      </section>

      <aside className="signin-art-side">
        <div className="signin-brand">
          <span className="signin-brand-mark"><BookOpen size={20} /></span>
          <span className="signin-brand-copy">
            <strong>امتحاني</strong>
            <small>منصة الاختبارات</small>
          </span>
        </div>

        <div className="signin-art-inner">
          <div className="signin-art-copy">
            <h2>كل امتحان،<br /><span>خطوة للأمام.</span></h2>
            <p>أنشئ اختباراتك، حدّد المرحلة والصف، وتابع النتائج في مساحة واحدة واضحة وآمنة.</p>
          </div>
          <ExamPreview />
        </div>
      </aside>
    </main>
  );
}
