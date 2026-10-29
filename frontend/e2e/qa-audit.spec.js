import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  API_URL,
  PASSWORD,
  apiJson,
  apiResponse,
  createExam,
  enrollStudent,
  getPaper,
  getSubmissionReview,
  openAppNav,
  openAuth,
  openExam,
  registerAndLogin,
  uiLogin,
  uniqueSuffix,
} from './helpers.js';

const ARTIFACTS = path.resolve('qa-artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });

async function capture(page, name, { fullPage = true } = {}) {
  const file = path.join(ARTIFACTS, `${name}.png`);
  await page.waitForTimeout(250);
  try {
    await page.screenshot({ path: file, fullPage, animations: 'disabled' });
  } catch (error) {
    // Chromium occasionally rejects a full-page capture while the screencast
    // recorder is active. One short retry makes the evidence collection stable
    // without touching the page under test.
    await page.waitForTimeout(750);
    await page.screenshot({ path: file, fullPage, animations: 'disabled' });
  }
  return file;
}

function isExternalUrl(url) {
  try {
    return new URL(url).origin !== new URL(pageBaseUrl()).origin;
  } catch {
    return false;
  }
}

function pageBaseUrl() {
  return `http://127.0.0.1:${process.env.E2E_APP_PORT || '4173'}`;
}

function monitorPage(page) {
  const problems = { console: [], pageErrors: [], failed: [], badResponses: [], externalOffline: [] };
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Chromium emits this generic message for failed cross-origin images. The
    // matching requestfailed event records the URL, so internal failures still
    // fail the audit through the failed-request assertion below.
    if (message.text().includes('ERR_INTERNET_DISCONNECTED')) return;
    problems.console.push(message.text());
  });
  page.on('pageerror', (error) => problems.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    if (request.url().includes('favicon')) return;
    const detail = `${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`;
    if (request.failure()?.errorText?.includes('ERR_INTERNET_DISCONNECTED') && isExternalUrl(request.url())) {
      problems.externalOffline.push(detail);
      return;
    }
    problems.failed.push(detail);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('favicon')) {
      problems.badResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return problems;
}

function expectClean(problems, allowBad = []) {
  const bad = problems.badResponses.filter((entry) => !allowBad.some((allowed) => entry.includes(allowed)));
  expect(problems.pageErrors, 'uncaught page errors').toEqual([]);
  // Browser resource-load messages have no URL and duplicate the explicit
  // badResponses/requestfailed evidence below, so only assert app console logs.
  expect(problems.console.filter((entry) => !entry.includes('React DevTools') && !entry.startsWith('Failed to load resource:')), 'console errors').toEqual([]);
  expect(problems.failed.filter((entry) => !entry.includes('favicon')), 'failed network requests').toEqual([]);
  expect(bad, 'unexpected HTTP error responses').toEqual([]);
}

async function expectNoDocumentOverflow(page, label) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const vw = doc.clientWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        for (let parent = element.parentElement; parent && parent !== body; parent = parent.parentElement) {
          const overflow = getComputedStyle(parent).overflowX;
          if (overflow === 'auto' || overflow === 'scroll') return false;
        }
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        return rect.right > vw + 2 || rect.left < -2;
      })
      .slice(0, 6)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: String(element.className || '').slice(0, 90),
        text: (element.textContent || '').trim().slice(0, 50),
        rect: [Math.round(element.getBoundingClientRect().left), Math.round(element.getBoundingClientRect().right)],
      }));
    return { viewport: vw, documentWidth: doc.scrollWidth, bodyWidth: body.scrollWidth, offenders };
  });
  expect(metrics.documentWidth, `${label}: document overflow (${JSON.stringify(metrics)})`).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.bodyWidth, `${label}: body overflow (${JSON.stringify(metrics)})`).toBeLessThanOrEqual(metrics.viewport + 1);
}

async function chooseQuestionType(page, label) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'اختر نوع السؤال' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: new RegExp(label) }).click();
}

function questionCard(page, text) {
  return page.locator('[id^="question-"]').filter({ hasText: text });
}

async function submitExamUi(page, { final = true } = {}) {
  await page.getByRole('button', { name: 'تسليم', exact: true }).filter({ visible: true }).first().click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'تسليم الامتحان؟' });
  await expect(dialog).toBeVisible();
  if (final) await dialog.getByRole('button', { name: 'تسليم نهائي', exact: true }).click();
  else await dialog.getByRole('button', { name: 'مراجعة الإجابات', exact: true }).click();
}

// ---------------------------------------------------------------------------
// Public experience
// ---------------------------------------------------------------------------

test('public landing page: anchors, FAQ, theme, links, and developer portfolio', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop public-page audit.');
  const problems = monitorPage(page);

  await page.goto('/');
  await expect(page).toHaveTitle(/امتحاني/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('امتحانات أونلاين');
  await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' })).toBeVisible();
  await capture(page, 'desktop-01-landing');

  // Section navigation and anchor targets.
  await page.locator('header').getByRole('link', { name: 'المزايا', exact: true }).click();
  await expect(page).toHaveURL(/#features$/);
  await expect(page.locator('#features')).toBeInViewport();
  await page.locator('header').getByRole('link', { name: 'كيف يعمل', exact: true }).click();
  await expect(page.locator('#workflow')).toBeInViewport();

  // FAQ disclosure.
  const faq = page.locator('details').filter({ hasText: 'هل أحتاج تثبيت أي برنامج؟' });
  await expect(faq).not.toHaveAttribute('open', '');
  await faq.locator('summary').click();
  await expect(faq).toHaveAttribute('open', '');
  await expect(faq.getByText('لا. المنصة تعمل من المتصفح')).toBeVisible();

  // Theme toggle persists.
  const startingTheme = await page.locator('html').getAttribute('data-theme');
  const toggleLabel = startingTheme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن';
  await page.getByRole('button', { name: toggleLabel }).click();
  const nextTheme = startingTheme === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
  await page.getByRole('button', { name: nextTheme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن' }).click();

  // External and contact links.
  await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/AGbreel');
  await expect(page.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', /linkedin\.com\/in\/ahmed-gbreel/);
  await expect(page.getByRole('link', { name: 'البريد الإلكتروني' })).toHaveAttribute('href', 'mailto:ahmedgbreel47@gmail.com');

  // Developer portfolio opens as an in-app route and can be closed.
  await page.getByRole('button', { name: 'ملف المطور', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/portfolio=1/);
  await expect(page).toHaveTitle(/Ahmed Gbreel/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('أبني منتجات');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.getByRole('button', { name: 'التبديل إلى العربية' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Emtehani' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('امتحانات أونلاين');
  await expect(page).not.toHaveURL(/portfolio=1/);

  await capture(page, 'desktop-02-landing-after-navigation');
  expectClean(problems);
});

// ---------------------------------------------------------------------------
// Authentication and form validation
// ---------------------------------------------------------------------------

test('authentication: validation, registration, duplicate email, login, and password toggle', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop auth audit.');
  test.setTimeout(120_000);
  const suffix = uniqueSuffix();
  const email = `qa-auth-${suffix}@example.com`;

  await openAuth(page, 'login');
  await expect(page.getByRole('heading', { name: 'أهلاً بعودتك.' })).toBeVisible();

  // Empty login submits through the client-side email check.
  await page.locator('form').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('أدخل بريداً إلكترونياً صحيحاً.');

  await page.locator('#auth-email').fill('not-an-email');
  await page.locator('#auth-password').fill('123');
  await page.locator('form').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('أدخل بريداً إلكترونياً صحيحاً.');

  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill('1234567');
  await page.locator('form').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('كلمة المرور يجب أن تكون بين 8 و128 حرفاً.');

  // Password visibility control.
  await expect(page.locator('#auth-password')).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'إظهار كلمة المرور' }).click();
  await expect(page.locator('#auth-password')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'إخفاء كلمة المرور' }).click();
  await expect(page.locator('#auth-password')).toHaveAttribute('type', 'password');

  // Resend verification validates an empty email, then accepts a valid one.
  await page.locator('#auth-email').fill('');
  await page.getByRole('button', { name: 'إعادة إرسال رابط التفعيل', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('أدخل بريدك الإلكتروني أولاً.');
  await page.locator('#auth-email').fill(email);
  await page.getByRole('button', { name: 'إعادة إرسال رابط التفعيل', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/إذا كان البريد مسجلاً وغير/);

  // Switch to registration and exercise role selection and per-field validation.
  await page.getByRole('button', { name: 'حساب جديد', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'أنشئ حسابك في دقيقة.' })).toBeVisible();
  await page.getByRole('button', { name: /مدرس/ }).click();
  await expect(page.getByRole('button', { name: /مدرس/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /طالب/ }).click();
  await expect(page.getByRole('button', { name: /طالب/ })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#auth-stage').selectOption('ثانوي');
  await page.locator('#auth-grade').selectOption('الصف الثالث الثانوي');

  await page.locator('#auth-name').fill('AB');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill('ValidPass!2026');
  await page.locator('input[type="checkbox"]').check();
  await page.locator('form').getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('اكتب الاسم الكامل');

  await page.locator('#auth-name').fill(`طالب جودة ${suffix}`);
  await page.locator('input[type="checkbox"]').uncheck();
  await page.locator('form').getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('يجب الموافقة على شروط الاستخدام');

  await page.locator('input[type="checkbox"]').check();
  await page.locator('form').getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  const success = page.getByRole('status').filter({ hasText: 'تم إنشاء الحساب' });
  await expect(success).toBeVisible({ timeout: 20_000 });
  await capture(page, 'desktop-03-auth-registered');

  // Registration switches to login and the registered account can sign in.
  await expect(page.locator('#auth-email')).toHaveValue(email);
  await page.locator('form').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('heading', { name: /أهلاً،/ })).toBeVisible({ timeout: 20_000 });
  await capture(page, 'desktop-04-student-dashboard');

  // Logout and verify duplicate-email handling through the register form.
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('امتحانات أونلاين');
  await page.getByRole('button', { name: 'ابدأ مجاناً', exact: true }).filter({ visible: true }).first().click();
  await page.locator('#auth-name').fill(`طالب مكرر ${suffix}`);
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill('ValidPass!2026');
  await page.locator('#auth-stage').selectOption('ثانوي');
  await page.locator('#auth-grade').selectOption('الصف الثالث الثانوي');
  await page.locator('input[type="checkbox"]').check();
  await page.locator('form').getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('البريد مستخدم بالفعل.');

  // Switch back and verify invalid credentials then a successful login.
  await page.getByRole('button', { name: 'سجّل الدخول', exact: true }).click();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill('WrongPass!2026');
  await page.locator('form').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('بيانات الدخول غير صحيحة');
  await page.locator('#auth-password').fill('ValidPass!2026');
  await page.locator('form').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('heading', { name: /أهلاً،/ })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Teacher UI workflow
// ---------------------------------------------------------------------------

test('teacher UI: create exam, validate questions, publish, session controls, results, essays, audit, filters, and CSV', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop teacher workflow audit.');
  test.setTimeout(180_000);
  const suffix = uniqueSuffix();
  const title = `اختبار واجهة المدرس ${suffix}`;
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس واجهة');
  const problems = monitorPage(page);

  await uiLogin(page, teacher);
  await expect(page.getByRole('heading', { name: 'مركز التحكم', exact: true }).first()).toBeVisible();
  await expect(page.getByText('إجمالي الامتحانات', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('لا توجد جلسة مفتوحة الآن')).toBeVisible();

  await openAppNav(page, 'الامتحانات');
  await expect(page.getByRole('heading', { name: 'الامتحانات', exact: true }).first()).toBeVisible();
  await capture(page, 'desktop-05-teacher-exams-empty');

  await page.getByRole('button', { name: 'امتحان جديد', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'أنشئ امتحاناً' })).toBeVisible();

  // Progressive validation: title, question text, options, then success.
  await page.getByRole('button', { name: 'حفظ الامتحان', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('اكتب عنواناً واضحاً للامتحان');
  await page.locator('#exam-title').fill(title);
  await page.locator('#exam-description').fill('تحقق شامل من نموذج إنشاء الامتحان.');
  await page.locator('#exam-duration').fill('20');
  await page.locator('#exam-stage').selectOption('ثانوي');
  await page.locator('#exam-grade').selectOption('الصف الثالث الثانوي');
  await page.getByRole('button', { name: 'حفظ الامتحان', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('السؤال 1: اكتب نص السؤال.');
  await page.locator('textarea[id$="-text"]').first().fill(`ما ناتج 5 + 5؟ ${suffix}`);
  await page.getByRole('button', { name: 'حفظ الامتحان', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('السؤال 1: أضف خيارين على الأقل.');

  await page.getByPlaceholder('الخيار 1').fill('10');
  await page.getByPlaceholder('الخيار 2').fill('9');
  await page.getByPlaceholder('الخيار 3').fill('8');
  await page.getByRole('button', { name: 'تحديد الخيار 1 كإجابة صحيحة' }).click();
  await expect(page.getByText('الدرجة الكلية').first()).toBeVisible();

  // Add a second question through the type picker.
  await page.getByRole('button', { name: 'إضافة سؤال جديد', exact: true }).click();
  await chooseQuestionType(page, 'صواب أو خطأ');
  await page.locator('textarea[id$="-text"]').nth(1).fill('الشمس تشرق من الشرق.');
  await expect(page.getByText('السؤال 2', { exact: true })).toBeVisible();
  await capture(page, 'desktop-06-teacher-create-form');

  await page.getByRole('button', { name: 'حفظ الامتحان', exact: true }).click();
  const createdDialog = page.getByRole('dialog').filter({ hasText: 'تم حفظ الامتحان' });
  await expect(createdDialog).toBeVisible({ timeout: 20_000 });
  await capture(page, 'desktop-07-teacher-exam-created-modal');
  await createdDialog.getByRole('button', { name: 'إدارة الامتحان', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true }).first()).toBeVisible();
  await expect(page.getByText('لا يوجد طلاب حاضرون بعد')).toBeVisible();

  // Publish, open, pause, resume, and close.
  await page.getByRole('button', { name: 'نشر الامتحان', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText(/تم نشر الامتحان/).first()).toBeVisible();
  await page.getByRole('button', { name: 'فتح الجلسة', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText(/تم فتح الجلسة/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'إيقاف مؤقت', exact: true }).filter({ visible: true }).first()).toBeVisible();
  await capture(page, 'desktop-08-teacher-exam-active');

  await page.getByRole('button', { name: 'إيقاف مؤقت', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText(/تم إيقاف الجلسة مؤقتاً/).first()).toBeVisible();
  await page.getByRole('button', { name: 'استئناف', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText(/تم استئناف الجلسة/).first()).toBeVisible();

  await page.getByRole('button', { name: 'إنهاء الجلسة', exact: true }).filter({ visible: true }).first().click();
  const closeDialog = page.getByRole('dialog').filter({ hasText: 'إنهاء الجلسة نهائياً؟' });
  await expect(closeDialog).toBeVisible();
  await closeDialog.getByRole('button', { name: 'نعم، أنهِ الجلسة', exact: true }).click();
  await expect(page.getByText(/تم إنهاء الجلسة/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'فتح النتائج', exact: true }).filter({ visible: true }).first()).toBeVisible();

  // Results page and CSV download.
  await page.getByRole('button', { name: 'فتح النتائج', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'النتائج والتحليلات' })).toBeVisible();
  await expect(page.locator('#results-exam')).toHaveValue(/.+/);
  await expect(page.getByText('لا توجد نتائج مسلّمة بعد')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تصدير CSV', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-results\.csv$/);
  await capture(page, 'desktop-09-teacher-results-empty');

  // Essays page with the same exam.
  await openAppNav(page, 'مراجعة المقالات');
  await expect(page.getByRole('heading', { name: 'مراجعة المقالات' })).toBeVisible();
  await expect(page.locator('#essays-exam')).toHaveValue(/.+/);
  await expect(page.getByText('لا توجد مقالات بانتظار المراجعة')).toBeVisible();

  // Audit page reflects the session actions and search filters rows.
  await openAppNav(page, 'سجل النشاط');
  await expect(page.getByRole('heading', { name: 'سجل النشاط' })).toBeVisible();
  await expect(page.getByText('إنشاء امتحان').first()).toBeVisible();
  const auditSearch = page.getByPlaceholder('ابحث في السجل...');
  await auditSearch.fill('exam.closed');
  await expect(page.getByText('إنهاء جلسة').first()).toBeVisible();
  await expect(page.getByText('فتح جلسة').first()).toHaveCount(0);
  await auditSearch.fill('');
  await expect(page.getByText('فتح جلسة').first()).toBeVisible();
  await capture(page, 'desktop-10-teacher-audit');

  // Exams list search and status filter.
  await openAppNav(page, 'الامتحانات');
  await page.getByPlaceholder('ابحث باسم الامتحان...').fill(title);
  await expect(page.getByText(title, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'منتهية', exact: true }).click();
  await expect(page.getByText(title, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await page.getByPlaceholder('ابحث باسم الامتحان...').fill(`غير موجود ${suffix}`);
  await expect(page.getByText('لا توجد نتائج مطابقة')).toBeVisible();
  await page.getByRole('button', { name: 'مسح الفلاتر', exact: true }).click();
  await expect(page.getByText(title, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await capture(page, 'desktop-11-teacher-exams-filtered');

  expectClean(problems);
});

// ---------------------------------------------------------------------------
// Student lifecycle across all question types, review, and essay grading
// ---------------------------------------------------------------------------

const suffix = uniqueSuffix();
const questionTexts = {
  mc: `اختيار من متعدد ${suffix}`,
  tf: `صواب وخطأ ${suffix}`,
  fill: `أكمل الفراغ ${suffix}`,
  short: `إجابة قصيرة ${suffix}`,
  matching: `مطابقة ${suffix}`,
  essay: `سؤال مقالي ${suffix}`,
};

test('student lifecycle: available exams, lobby, all question types, autosave, copy warning, submit, review, and teacher essay grading', async ({ browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop student lifecycle audit.');
  test.setTimeout(240_000);
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس دورة كاملة');
  const student = await registerAndLogin(request, 'Student', 'طالب دورة كاملة');
  await enrollStudent(request, teacher, student);
  const exam = await createExam(request, teacher.token, {
    title: `امتحان دورة كاملة ${suffix}`,
    durationMinutes: 30,
    questions: [
      { text: questionTexts.mc, type: 'MultipleChoice', options: ['4', '5', '3'], correctAnswer: '4', points: 2 },
      { text: questionTexts.tf, type: 'TrueFalse', options: [], correctAnswer: 'صح', points: 1 },
      { text: questionTexts.fill, type: 'FillBlank', options: [], correctAnswer: 'الرياض', points: 1 },
      { text: questionTexts.short, type: 'ShortAnswer', options: [], correctAnswer: 'الرياض', points: 1 },
      { text: questionTexts.matching, type: 'Matching', options: ['A||1', 'B||2'], correctAnswer: '', points: 2 },
      { text: questionTexts.essay, type: 'Essay', options: [], correctAnswer: null, points: 3 },
    ],
  });

  const studentContext = await browser.newContext({
    baseURL: new URL(testInfo.project.use.baseURL).origin,
    locale: 'ar-EG',
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const studentPage = await studentContext.newPage();
  const studentProblems = monitorPage(studentPage);
  await uiLogin(studentPage, student);
  await expect(studentPage.getByRole('heading', { name: /أهلاً،/ })).toBeVisible();

  // Available exams: search, tab filtering, and direct entry.
  await openAppNav(studentPage, 'الامتحانات المتاحة');
  await expect(studentPage.getByRole('heading', { name: 'الامتحانات المتاحة' })).toBeVisible();
  const search = studentPage.getByPlaceholder('ابحث باسم الامتحان أو المدرس...');
  await search.fill(exam.title);
  await expect(studentPage.getByText(exam.title, { exact: true })).toBeVisible();
  await studentPage.getByRole('button', { name: 'بانتظار البدء', exact: true }).click();
  await expect(studentPage.getByText(exam.title, { exact: true })).toBeVisible();
  await studentPage.getByRole('button', { name: 'الكل', exact: true }).click();
  await capture(studentPage, 'desktop-12-student-available');
  await studentPage.getByRole('button', { name: 'دخول الامتحان', exact: true }).click();
  await expect(studentPage.getByText('يرجى انتظار بدء الامتحان من قبل المعلم.', { exact: true })).toBeVisible({ timeout: 20_000 });
  await capture(studentPage, 'desktop-13-student-lobby');

  await openExam(request, teacher.token, exam.id);

  // Lobby auto-start and full exam room.
  const mcCard = questionCard(studentPage, questionTexts.mc);
  await expect(mcCard).toBeVisible({ timeout: 30_000 });
  await expect(studentPage.getByText('6 من 6').first()).toHaveCount(0);
  await mcCard.locator('label').first().click();
  await expect(mcCard.getByRole('radio').first()).toBeChecked();

  const tfCard = questionCard(studentPage, questionTexts.tf);
  await tfCard.getByRole('button', { name: 'صح', exact: true }).click();
  await expect(tfCard.getByRole('button', { name: 'صح', exact: true })).toHaveAttribute('aria-pressed', 'true');

  const fillCard = questionCard(studentPage, questionTexts.fill);
  await fillCard.getByRole('textbox').fill('الرياض');

  const shortCard = questionCard(studentPage, questionTexts.short);
  await shortCard.getByRole('textbox').fill('الرياض');

  const matchingCard = questionCard(studentPage, questionTexts.matching);
  await matchingCard.locator('select').nth(0).selectOption({ label: '1' });
  await matchingCard.locator('select').nth(1).selectOption({ label: '2' });

  const essayCard = questionCard(studentPage, questionTexts.essay);
  await essayCard.getByRole('textbox').fill('الرياض هي عاصمة المملكة العربية السعودية، وتُعد مركزاً إدارياً واقتصادياً مهماً.');
  await expect(studentPage.getByText('6 من 6 سؤال تمت الإجابة')).toBeVisible();

  // Explicit save + copy detection telemetry.
  await studentPage.getByRole('button', { name: 'حفظ الآن', exact: true }).click();
  await expect(studentPage.locator('header [role="status"]')).toContainText('تم الحفظ تلقائياً', { timeout: 15_000 });
  const copyRequest = studentPage.waitForResponse((response) => response.url().includes('/api/submissions/') && response.url().endsWith('/events'));
  await studentPage.evaluate(() => document.dispatchEvent(new Event('copy', { bubbles: true, cancelable: true })));
  expect((await copyRequest).status()).toBe(200);
  await expect(studentPage.getByText(/تم رصد خروجك من صفحة الامتحان أو محاولة نسخ/)).toBeVisible();
  await studentPage.getByRole('button', { name: 'إغلاق التنبيه' }).click();
  await capture(studentPage, 'desktop-14-student-exam-room');

  // Review modal can be dismissed, then submit for real.
  await submitExamUi(studentPage, { final: false });
  await expect(studentPage.getByRole('dialog')).toHaveCount(0);
  await submitExamUi(studentPage, { final: true });
  await expect(studentPage.getByText('نتيجتك', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(studentPage.getByText('بانتظار اعتماد النتائج').first()).toBeVisible();
  await expect(studentPage.getByText('الدرجات والإجابات الصحيحة محجوبة مؤقتاً')).toBeVisible();
  await expect(studentPage.getByText('قيد المراجعة').first()).toBeVisible();
  await expect(studentPage.getByText('الرياض هي عاصمة المملكة العربية السعودية')).toBeVisible();
  await capture(studentPage, 'desktop-15-student-review-pending');

  // API verification of persisted answers and grading.
  const mine = await apiJson(request, 'GET', '/api/results/mine', student.token);
  const submission = mine.find((item) => item.examId === exam.id);
  expect(submission).toBeTruthy();
  expect(submission.status).toBe('NeedsReview');
  // Scores and answer keys stay hidden until the teacher publishes results.
  expect(submission.resultsAvailable).toBe(false);
  expect(submission.score).toBeNull();
  expect(submission.maxScore).toBeNull();
  const studentReview = await getSubmissionReview(request, student.token, submission.id);
  expect(studentReview.resultsAvailable).toBe(false);
  expect(studentReview.score).toBeNull();
  expect(studentReview.answers).toHaveLength(6);
  expect(studentReview.answers.every((answer) => answer.correctAnswer === null)).toBe(true);
  expect(studentReview.answers.every((answer) => answer.awardedPoints === null)).toBe(true);
  expect(studentReview.copyAttemptCount).toBeGreaterThan(0);

  // Student results page.
  await openAppNav(studentPage, 'نتائجي');
  await expect(studentPage.getByRole('heading', { name: 'نتائجي' })).toBeVisible();
  await expect(studentPage.getByText(exam.title, { exact: true }).first()).toBeVisible();
  await studentPage.getByRole('button', { name: 'مراجعة', exact: true }).first().click();
  await expect(studentPage.getByText('نتيجتك', { exact: true })).toBeVisible();

  // Teacher grades the essay in the UI.
  const teacherContext = await browser.newContext({
    baseURL: new URL(testInfo.project.use.baseURL).origin,
    locale: 'ar-EG',
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const teacherPage = await teacherContext.newPage();
  const teacherProblems = monitorPage(teacherPage);
  await uiLogin(teacherPage, teacher);
  await openAppNav(teacherPage, 'مراجعة المقالات');
  await expect(teacherPage.getByRole('heading', { name: 'مراجعة المقالات' })).toBeVisible();
  const essayRow = teacherPage.getByRole('row').filter({ hasText: student.fullName });
  await expect(essayRow).toBeVisible();
  await essayRow.getByRole('button', { name: 'تصحيح', exact: true }).click();
  await expect(teacherPage.getByRole('heading', { name: 'تصحيح الأسئلة المقالية' })).toBeVisible();
  await teacherPage.locator('input[type="number"]').first().fill('3');
  await teacherPage.locator('textarea[id^="feedback-"]').first().fill('إجابة دقيقة ومكتملة، أحسنت.');
  await teacherPage.getByRole('button', { name: 'حفظ درجة السؤال', exact: true }).click();
  await expect(teacherPage.getByText(/اكتملت مراجعة هذه المحاولة|تم حفظ درجة السؤال/).first()).toBeVisible();
  await expect(teacherPage.getByText('اكتملت المراجعة').first()).toBeVisible();
  await capture(teacherPage, 'desktop-16-teacher-essay-graded');

  // Extra attempt action on the reviewed submission.
  await openAppNav(teacherPage, 'النتائج');
  await expect(teacherPage.getByRole('heading', { name: 'النتائج والتحليلات' })).toBeVisible();
  const resultRow = teacherPage.getByRole('row').filter({ hasText: student.fullName });
  await expect(resultRow).toBeVisible();
  await resultRow.getByRole('button', { name: 'محاولة إضافية', exact: true }).click();
  const grantDialog = teacherPage.getByRole('dialog').filter({ hasText: 'منح محاولة إضافية؟' });
  await expect(grantDialog).toBeVisible();
  await grantDialog.getByRole('button', { name: 'منح المحاولة', exact: true }).click();
  await expect(teacherPage.getByText(/تم منح الطالب محاولة إضافية/).first()).toBeVisible();
  await expect(resultRow.getByRole('button', { name: 'تم منح محاولة', exact: true })).toBeVisible();
  await capture(teacherPage, 'desktop-17-teacher-results-graded');

  // Finish the session, then explicitly publish the now fully graded results.
  await apiJson(request, 'PUT', `/api/exams/${exam.id}/state`, teacher.token, { action: 'close' });
  await apiJson(request, 'POST', `/api/exams/${exam.id}/results/publish`, teacher.token);

  // Student reload returns to the dashboard by design; the published result is
  // visible there and remains accessible from the results list.
  await studentPage.reload();
  await expect(studentPage.getByRole('heading', { name: /أهلاً،/ })).toBeVisible();
  await expect(studentPage.getByText(/10\s*\/\s*10/).first()).toBeVisible();
  await expect(studentPage.getByText('تم التصحيح').first()).toBeVisible();
  await openAppNav(studentPage, 'نتائجي');
  await expect(studentPage.getByRole('heading', { name: 'نتائجي' })).toBeVisible();
  await studentPage.getByRole('button', { name: 'مراجعة', exact: true }).first().click();
  await expect(studentPage.getByText('نتيجتك', { exact: true })).toBeVisible();
  await expect(studentPage.getByText('ملاحظة المدرس')).toBeVisible();
  await expect(studentPage.getByText('إجابة دقيقة ومكتملة، أحسنت.')).toBeVisible();
  await capture(studentPage, 'desktop-18-student-review-graded');

  // The reviewed score is now persisted and exposed through the results API.
  const gradedMine = await apiJson(request, 'GET', '/api/results/mine', student.token);
  const gradedSubmission = gradedMine.find((item) => item.examId === exam.id);
  expect(gradedSubmission.status).toBe('Reviewed');
  expect(gradedSubmission.resultsAvailable).toBe(true);
  expect(Number(gradedSubmission.score)).toBe(10);
  expect(Number(gradedSubmission.maxScore)).toBe(10);

  expectClean(studentProblems);
  expectClean(teacherProblems, ['/events']); // intentional telemetry request may race after close
  await studentContext.close();
  await teacherContext.close();
});

// ---------------------------------------------------------------------------
// API authorization boundaries
// ---------------------------------------------------------------------------

test('API authorization: unauthenticated, role separation, cross-teacher, and cross-student access', async ({ request }) => {
  test.setTimeout(120_000);
  const teacherA = await registerAndLogin(request, 'Teacher', 'مدرس صلاحيات أ');
  const teacherB = await registerAndLogin(request, 'Teacher', 'مدرس صلاحيات ب');
  const studentA = await registerAndLogin(request, 'Student', 'طالب صلاحيات أ');
  const studentB = await registerAndLogin(request, 'Student', 'طالب صلاحيات ب');
  await enrollStudent(request, teacherA, studentA);
  const exam = await createExam(request, teacherA.token, {
    title: `امتحان صلاحيات ${uniqueSuffix()}`,
    questions: [{ text: 'سؤال صلاحيات', type: 'MultipleChoice', options: ['أ', 'ب'], correctAnswer: 'أ', points: 1 }],
  });

  // Enrolled students enter a published exam directly; eligibility is enforced
  // by the API without any shared code.
  await apiJson(request, 'POST', `/api/exams/${exam.id}/enter`, studentA.token);
  await openExam(request, teacherA.token, exam.id);
  const started = await apiJson(request, 'POST', `/api/exams/${exam.id}/start`, studentA.token);
  const paper = await getPaper(request, studentA.token, exam.id);
  const submissionId = started.id;
  await apiJson(request, 'POST', `/api/submissions/${submissionId}/submit`, studentA.token, {
    answers: [{ questionId: paper.questions[0].id, answerText: 'أ' }],
    focusLossDetected: false,
  });
  const review = await getSubmissionReview(request, teacherA.token, submissionId);
  const answerId = review.answers[0].id;

  const unauth = [
    ['GET', '/api/exams/available'],
    ['GET', '/api/teacher/overview'],
    ['GET', '/api/audit'],
    ['GET', '/api/results/mine'],
    ['POST', '/api/exams'],
    ['GET', '/api/auth/me'],
    ['GET', `/api/exams/${exam.id}/results`],
  ];
  for (const [method, route] of unauth) {
    const response = await apiResponse(request, method, route);
    expect(response.status(), `unauthenticated ${method} ${route}`).toBe(401);
  }

  const invalidToken = await apiResponse(request, 'GET', '/api/auth/me', 'not-a-real-token');
  expect(invalidToken.status()).toBe(401);

  const studentCannot = [
    ['POST', '/api/exams', { title: 'x', durationMinutes: 10, maxAttempts: 1, questions: [{ text: 'x', type: 'TrueFalse', options: [], correctAnswer: 'صح', points: 1 }] }],
    ['GET', '/api/teacher/overview'],
    ['GET', '/api/audit'],
    ['GET', `/api/exams/${exam.id}/live`],
    ['GET', `/api/exams/${exam.id}/results`],
    ['GET', `/api/exams/${exam.id}/review`],
    ['GET', `/api/exams/${exam.id}/export`],
    ['GET', `/api/exams/${exam.id}/participants`],
    ['GET', `/api/exams/${exam.id}/participants/export`],
    ['PUT', `/api/exams/${exam.id}/state`, { action: 'close' }],
    ['PUT', `/api/exams/${exam.id}/publish`],
    ['POST', `/api/submissions/${submissionId}/grant-extra-attempt`],
    ['PUT', `/api/submissions/${submissionId}/answers/${answerId}/grade`, { awardedPoints: 0 }],
  ];
  for (const [method, route, data] of studentCannot) {
    const response = await apiResponse(request, method, route, studentA.token, data);
    expect(response.status(), `student ${method} ${route}`).toBe(403);
  }

  const teacherCannot = [
    ['GET', '/api/exams/available'],
    ['POST', '/api/exams/enter-code', { code: studentA.studentCode }],
    ['GET', `/api/exams/${exam.id}/session`],
    ['GET', `/api/exams/${exam.id}/paper`],
    ['POST', `/api/exams/${exam.id}/start`],
    ['PUT', `/api/submissions/${submissionId}/answers`, { answers: [], focusLossDetected: false }],
    ['POST', `/api/submissions/${submissionId}/submit`, { answers: [], focusLossDetected: false }],
    ['POST', `/api/submissions/${submissionId}/events`, { type: 'copy' }],
  ];
  for (const [method, route, data] of teacherCannot) {
    const response = await apiResponse(request, method, route, teacherA.token, data);
    expect(response.status(), `teacher ${method} ${route}`).toBe(403);
  }

  // Teacher B cannot inspect or mutate teacher A's exam/submission.
  const crossTeacher = [
    ['GET', `/api/exams/${exam.id}`, 403],
    ['PUT', `/api/exams/${exam.id}/publish`, 404],
    ['PUT', `/api/exams/${exam.id}/state`, 404],
    ['GET', `/api/exams/${exam.id}/live`, 404],
    ['GET', `/api/exams/${exam.id}/results`, 404],
    ['GET', `/api/exams/${exam.id}/review`, 404],
    ['GET', `/api/exams/${exam.id}/export`, 404],
    ['GET', `/api/exams/${exam.id}/participants`, 404],
    ['GET', `/api/exams/${exam.id}/participants/export`, 404],
    ['GET', `/api/submissions/${submissionId}/review`, 403],
    ['POST', `/api/submissions/${submissionId}/grant-extra-attempt`, 403],
    ['PUT', `/api/submissions/${submissionId}/answers/${answerId}/grade`, 403],
  ];
  for (const [method, route, expected] of crossTeacher) {
    const response = await apiResponse(request, method, route, teacherB.token, method === 'PUT' ? { action: 'close', awardedPoints: 0 } : undefined);
    expect(response.status(), `teacher B ${method} ${route}`).toBe(expected);
  }

  // Student B cannot read or write student A's submission or use A's code.
  const crossStudent = [
    ['GET', `/api/submissions/${submissionId}/review`, 403],
    ['PUT', `/api/submissions/${submissionId}/answers`, 404],
    ['POST', `/api/submissions/${submissionId}/submit`, 404],
    ['POST', `/api/submissions/${submissionId}/events`, 404],
    ['GET', `/api/exams/${exam.id}/session`, 403],
    ['GET', `/api/exams/${exam.id}/paper`, 403],
    ['POST', '/api/exams/enter-code', 404],
  ];
  const crossPayloads = {
    [`PUT /api/submissions/${submissionId}/answers`]: { answers: [], focusLossDetected: false },
    [`POST /api/submissions/${submissionId}/submit`]: { answers: [], focusLossDetected: false },
    [`POST /api/submissions/${submissionId}/events`]: { type: 'copy' },
    'POST /api/exams/enter-code': { code: studentA.studentCode },
  };
  for (const [method, route, expected] of crossStudent) {
    const response = await apiResponse(request, method, route, studentB.token, crossPayloads[`${method} ${route}`]);
    expect(response.status(), `student B ${method} ${route}`).toBe(expected);
  }

  // Student payloads never leak join codes or answer keys before submission.
  const studentExamList = await apiJson(request, 'GET', '/api/exams', studentA.token);
  const listed = studentExamList.items.find((item) => item.id === exam.id);
  expect(listed).toBeTruthy();
  expect(listed.joinCode).toBeNull();
  expect(JSON.stringify(listed)).not.toContain('correctAnswer');
  const sessionPayload = await apiJson(request, 'GET', `/api/exams/${exam.id}/session`, studentA.token);
  expect(sessionPayload).not.toHaveProperty('joinCode');
  expect(sessionPayload).not.toHaveProperty('correctAnswer');

  // CORS preflight for the configured frontend origin.
  const preflight = await request.fetch(`${API_URL}/api/exams`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://127.0.0.1:4173',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  expect(preflight.status()).toBe(204);
  expect(preflight.headers()['access-control-allow-origin']).toBe('http://127.0.0.1:4173');
});

// ---------------------------------------------------------------------------
// Responsive sweep across every major page
// ---------------------------------------------------------------------------

test('responsive and runtime health sweep at 1440, 390, and 320 pixels', async ({ browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Explicit viewport sweep.');
  test.setTimeout(240_000);
  const suffix = uniqueSuffix();
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس تجاوب');
  const student = await registerAndLogin(request, 'Student', 'طالب تجاوب');
  await enrollStudent(request, teacher, student);
  const exam = await createExam(request, teacher.token, {
    title: `امتحان التجاوب ${suffix}`,
    questions: [
      { text: `سؤال تجاوب ${suffix}`, type: 'MultipleChoice', options: ['أ', 'ب', 'ج'], correctAnswer: 'أ', points: 1 },
      { text: `سؤال مقالي تجاوب ${suffix}`, type: 'Essay', options: [], correctAnswer: null, points: 2 },
    ],
  });

  const teacherUser = { fullName: teacher.fullName, email: teacher.email, role: teacher.role, studentCode: '' };
  const studentUser = { fullName: student.fullName, email: student.email, role: student.role, studentCode: student.studentCode };

  async function seededPage(viewport, user, token) {
    const context = await browser.newContext({ viewport, locale: 'ar-EG', reducedMotion: 'reduce' });
    await context.addInitScript(({ tokenValue, userValue }) => {
      localStorage.setItem('emtehani-token', tokenValue);
      localStorage.setItem('emtehani-user', JSON.stringify(userValue));
      localStorage.setItem('emtehani-theme', 'light');
    }, { tokenValue: token, userValue: user });
    const page = await context.newPage();
    const problems = monitorPage(page);
    await page.goto('/');
    return { context, page, problems };
  }

  async function check(page, name, label, screenshot = false) {
    await page.waitForTimeout(500);
    await expectNoDocumentOverflow(page, `${label} ${name}`);
    if (screenshot) await capture(page, `${label}-${name}`);
  }

  const allProblems = [];

  for (const viewport of [{ width: 1440, height: 1000, key: '1440' }, { width: 390, height: 844, key: '390' }, { width: 320, height: 760, key: '320' }]) {
    // Public landing.
    const publicContext = await browser.newContext({ viewport, locale: 'ar-EG', reducedMotion: 'reduce' });
    const publicPage = await publicContext.newPage();
    const publicProblems = monitorPage(publicPage);
    await publicPage.goto('/');
    await expect(publicPage.getByRole('heading', { level: 1 })).toContainText('امتحانات أونلاين');
    await check(publicPage, 'landing', viewport.key, viewport.key !== '1440');
    if (viewport.key === '390') {
      await publicPage.getByRole('button', { name: 'فتح القائمة' }).click();
      const menu = publicPage.getByRole('button', { name: 'إغلاق القائمة' });
      await expect(menu).toBeVisible();
      await expect(publicPage.locator('body')).toHaveCSS('overflow', 'hidden');
      await check(publicPage, 'landing-menu', viewport.key);
      // Use the link inside the mobile menu, not the identical footer anchor.
      await publicPage.locator('header').getByRole('link', { name: 'المزايا', exact: true }).filter({ visible: true }).last().click();
      await expect(publicPage.locator('#features')).toBeInViewport();
      await expect(publicPage.getByRole('button', { name: 'فتح القائمة' })).toBeVisible();
      await expect(publicPage.locator('body')).not.toHaveCSS('overflow', 'hidden');
    }
    allProblems.push({ label: `${viewport.key} public`, problems: publicProblems });
    await publicContext.close();

    // Authenticated teacher pages.
    const { context: teacherContext, page: teacherPage, problems: teacherProblems } = await seededPage(viewport, teacherUser, teacher.token);
    await expect(teacherPage.getByRole('heading', { name: 'مركز التحكم', exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await check(teacherPage, 'dashboard', viewport.key, true);

    await openAppNav(teacherPage, 'الامتحانات');
    await expect(teacherPage.getByRole('heading', { name: 'الامتحانات', exact: true }).first()).toBeVisible();
    await check(teacherPage, 'exams', viewport.key, viewport.key !== '1440');

    await teacherPage.getByText(exam.title, { exact: true }).filter({ visible: true }).first().click();
    await expect(teacherPage.getByRole('heading', { name: exam.title, exact: true }).first()).toBeVisible();
    await check(teacherPage, 'exam-detail', viewport.key, true);
    allProblems.push({ label: `${viewport.key} teacher detail`, problems: teacherProblems });

    await openAppNav(teacherPage, 'النتائج');
    await expect(teacherPage.getByRole('heading', { name: 'النتائج والتحليلات' })).toBeVisible();
    await check(teacherPage, 'results', viewport.key);

    await openAppNav(teacherPage, 'مراجعة المقالات');
    await expect(teacherPage.getByRole('heading', { name: 'مراجعة المقالات' })).toBeVisible();
    await check(teacherPage, 'essays', viewport.key);

    await openAppNav(teacherPage, 'سجل النشاط');
    await expect(teacherPage.getByRole('heading', { name: 'سجل النشاط' })).toBeVisible();
    await check(teacherPage, 'audit', viewport.key);

    await openAppNav(teacherPage, 'إنشاء امتحان');
    await expect(teacherPage.getByRole('heading', { name: 'أنشئ امتحاناً' })).toBeVisible();
    await check(teacherPage, 'create', viewport.key, viewport.key !== '1440');

    if (viewport.key === '390') {
      await teacherPage.getByRole('button', { name: 'فتح القائمة' }).click();
      const drawer = teacherPage.getByRole('dialog', { name: 'قائمة التنقل' });
      await expect(drawer).toBeVisible();
      await check(teacherPage, 'drawer', viewport.key);
      await drawer.getByRole('button', { name: 'إغلاق القائمة' }).click();
    }
    allProblems.push({ label: `${viewport.key} teacher`, problems: teacherProblems });
    await teacherContext.close();

    // Authenticated student pages.
    const { context: studentContext, page: studentPage, problems: studentProblems } = await seededPage(viewport, studentUser, student.token);
    await expect(studentPage.getByRole('heading', { name: /أهلاً،/ })).toBeVisible({ timeout: 20_000 });
    await check(studentPage, 'dashboard', viewport.key, viewport.key !== '1440');

    await openAppNav(studentPage, 'الامتحانات المتاحة');
    await expect(studentPage.getByRole('heading', { name: 'الامتحانات المتاحة' })).toBeVisible();
    await studentPage.getByPlaceholder('ابحث باسم الامتحان أو المدرس...').fill(exam.title);
    try {
      await expect(studentPage.getByText(exam.title, { exact: true })).toBeVisible({ timeout: 8000 });
    } catch (error) {
      const diagnosis = await studentPage.evaluate(async () => {
        const token = localStorage.getItem('emtehani-token');
        const started = performance.now();
        try {
          const response = await fetch('http://127.0.0.1:5099/api/exams/available', { headers: { Authorization: `Bearer ${token}` } });
          const text = await response.text();
          return { direct: { status: response.status, length: text.length, ms: Math.round(performance.now() - started) }, resources: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/available')).map((entry) => ({ name: entry.name, duration: entry.duration, size: entry.transferSize })) };
        } catch (directError) {
          return { directError: String(directError), resources: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/available')).map((entry) => ({ name: entry.name, duration: entry.duration, size: entry.transferSize })) };
        }
      });
      console.log('QA DIAGNOSTIC', JSON.stringify(diagnosis));
      console.log('QA MAIN', (await studentPage.locator('main').innerText()).slice(0, 600));
      console.log('QA PROBLEMS', JSON.stringify(studentProblems));
      throw error;
    }
    await check(studentPage, 'available', viewport.key, viewport.key !== '1440');

    await openAppNav(studentPage, 'المدرسون');
    await expect(studentPage.getByRole('heading', { name: 'المدرسون', exact: true })).toBeVisible();
    await check(studentPage, 'teachers', viewport.key, viewport.key === '320');

    await openAppNav(studentPage, 'نتائجي');
    await expect(studentPage.getByRole('heading', { name: 'نتائجي' })).toBeVisible();
    await check(studentPage, 'results', viewport.key);
    allProblems.push({ label: `${viewport.key} student`, problems: studentProblems });
    await studentContext.close();
  }

  // Developer portfolio is responsive too.
  for (const viewport of [{ width: 390, height: 844, key: '390' }, { width: 320, height: 760, key: '320' }]) {
    const context = await browser.newContext({ viewport, locale: 'ar-EG', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const problems = monitorPage(page);
    await page.goto('/?portfolio=1');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('أبني منتجات');
    await check(page, 'portfolio', viewport.key, true);
    allProblems.push({ label: `${viewport.key} portfolio`, problems: problems });
    await context.close();
  }

  for (const entry of allProblems) {
    expectClean(entry.problems);
  }
});

// ---------------------------------------------------------------------------
// Mobile-only exam room interactions
// ---------------------------------------------------------------------------

test('mobile exam room: question map, responsive header, dialog, and submission', async ({ browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile-only interaction audit.');
  test.setTimeout(180_000);
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس جوال');
  const student = await registerAndLogin(request, 'Student', 'طالب جوال');
  await enrollStudent(request, teacher, student);
  const suffix = uniqueSuffix();
  const exam = await createExam(request, teacher.token, {
    title: `امتحان الجوال ${suffix}`,
    durationMinutes: 15,
    questions: [
      { text: `سؤال جوال أول ${suffix}`, type: 'MultipleChoice', options: ['صح', 'خطأ'], correctAnswer: 'صح', points: 1 },
      { text: `سؤال جوال ثانٍ ${suffix}`, type: 'TrueFalse', options: [], correctAnswer: 'صح', points: 1 },
    ],
  });
  const context = await browser.newContext({
    baseURL: new URL(testInfo.project.use.baseURL).origin,
    locale: 'ar-EG',
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const problems = monitorPage(page);
  await uiLogin(page, student);
  await openAppNav(page, 'الامتحانات المتاحة');
  await page.getByPlaceholder('ابحث باسم الامتحان أو المدرس...').fill(exam.title);
  await expect(page.getByText(exam.title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'دخول الامتحان', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText('يرجى انتظار بدء الامتحان من قبل المعلم.', { exact: true })).toBeVisible();
  await openExam(request, teacher.token, exam.id);

  const firstCard = questionCard(page, `سؤال جوال أول ${suffix}`);
  await expect(firstCard).toBeVisible({ timeout: 30_000 });
  await expectNoDocumentOverflow(page, 'mobile exam room');
  await expect(page.getByRole('button', { name: 'تسليم الامتحان', exact: true }).filter({ visible: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'خريطة الأسئلة', exact: true }).click();
  const mapPanel = page.locator('div').filter({ has: page.getByRole('heading', { name: 'خريطة الأسئلة' }) }).last();
  await expect(page.getByRole('button', { name: 'إغلاق', exact: true })).toBeVisible();
  await capture(page, 'mobile-01-question-map');
  await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
  expect(mapPanel).toBeTruthy();

  await firstCard.locator('label').first().click();
  const secondCard = questionCard(page, `سؤال جوال ثانٍ ${suffix}`);
  await secondCard.getByRole('button', { name: 'صح', exact: true }).click();
  await expect(page.getByText('2 من 2 سؤال تمت الإجابة')).toBeVisible();

  await page.getByRole('button', { name: 'تسليم الامتحان', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('dialog').filter({ hasText: 'تسليم الامتحان؟' })).toBeVisible();
  await capture(page, 'mobile-02-submit-dialog');
  await page.getByRole('dialog').getByRole('button', { name: 'تسليم نهائي', exact: true }).click();
  await expect(page.getByText('نتيجتك', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expectNoDocumentOverflow(page, 'mobile review');
  await capture(page, 'mobile-03-review');
  expectClean(problems);
  await context.close();
});
