import { test, expect } from '@playwright/test';
import {
  apiJson,
  apiResponse,
  createExam,
  enrollStudent,
  fourPartName,
  getPaper,
  openAppNav,
  openExam,
  registerAndLogin,
  uiLogin,
  uniqueNameToken,
  uniqueSuffix,
} from './helpers.js';

const E2E_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || 'admin-e2e@example.test',
  password: process.env.E2E_ADMIN_PASSWORD || 'AdminE2e!2026',
};

function questionSuffix() {
  return uniqueSuffix();
}

async function createThreeQuestionExam(request, teacher, suffix) {
  const exam = await createExam(request, teacher.token, {
    title: `امتحان التنقل ${suffix}`,
    questions: [
      { text: `السؤال الأول ${suffix}`, type: 'MultipleChoice', options: ['أ', 'ب', 'ج'], correctAnswer: 'أ', points: 1 },
      { text: `السؤال الثاني ${suffix}`, type: 'TrueFalse', correctAnswer: 'صح', points: 1 },
      { text: `السؤال الثالث ${suffix}`, type: 'ShortAnswer', correctAnswer: 'إجابة', points: 1 },
    ],
  });
  await openExam(request, teacher.token, exam.id);
  return exam;
}

test('exam room shows one question per page, keeps answers across navigation, and reviews before submitting', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Detailed navigation is covered once on desktop.');
  test.setTimeout(150_000);

  const suffix = questionSuffix();
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس تنقل الأسئلة');
  const student = await registerAndLogin(request, 'Student', 'طالب تنقل الأسئلة', { teacherIds: [teacher.id] });
  await enrollStudent(request, teacher, student);
  const exam = await createThreeQuestionExam(request, teacher, suffix);

  await uiLogin(page, student);
  await expect(page.getByRole('heading', { name: 'نظرة عامة', exact: true }).first()).toBeVisible();
  await openAppNav(page, 'الامتحانات المتاحة');
  await page.getByRole('button', { name: 'دخول الامتحان', exact: true }).click();

  const q1 = page.locator('[id^="question-"]').filter({ hasText: `السؤال الأول ${suffix}` });
  await expect(q1).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('[id^="question-"]')).toHaveCount(1);
  await expect(page.getByText(`السؤال 1 من 3`, { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'الانتقال إلى السؤال 1' })).toHaveAttribute('aria-current', 'step');

  await q1.locator('label').first().click();
  await expect(q1.getByRole('radio').first()).toBeChecked();
  await page.getByRole('button', { name: 'التالي', exact: true }).click();

  const q2 = page.locator('[id^="question-"]').filter({ hasText: `السؤال الثاني ${suffix}` });
  await expect(q2).toBeVisible();
  await expect(page.locator('[id^="question-"]')).toHaveCount(1);
  await expect(page.getByText('السؤال 2 من 3', { exact: false }).first()).toBeVisible();
  await q2.getByRole('button', { name: 'صح', exact: true }).click();

  // Jumping back with the map must restore the first answer, not reset it.
  await page.getByRole('button', { name: 'الانتقال إلى السؤال 1' }).click();
  await expect(q1).toBeVisible();
  await expect(q1.getByRole('radio').first()).toBeChecked();
  await expect(page.getByRole('button', { name: 'الانتقال إلى السؤال 1' })).toHaveAttribute('aria-current', 'step');

  // Jump to the third question from the map and answer it.
  await page.getByRole('button', { name: 'الانتقال إلى السؤال 3' }).click();
  const q3 = page.locator('[id^="question-"]').filter({ hasText: `السؤال الثالث ${suffix}` });
  await expect(q3).toBeVisible();
  await q3.locator('textarea').first().fill('إجابة ثالثة محفوظة');
  await expect(page.getByText('3 من 3', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('تم الحفظ تلقائياً', { exact: false }).first()).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.locator('h1').filter({ hasText: 'أهلاً' })).toBeVisible();
  await openAppNav(page, 'الامتحانات المتاحة');
  await page.getByRole('button', { name: 'استكمال المحاولة', exact: true }).click();
  const resumed = page.locator('[id^="question-"]').filter({ hasText: `السؤال الأول ${suffix}` });
  await expect(resumed).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('[id^="question-"]')).toHaveCount(1);
  await expect(resumed.getByRole('radio').first()).toBeChecked();
  await page.getByRole('button', { name: 'الانتقال إلى السؤال 2' }).click();
  await expect(page.getByRole('button', { name: 'صح', exact: true })).toHaveClass(/border-emerald/);

  await page.getByRole('button', { name: 'تسليم الامتحان', exact: true }).filter({ visible: true }).first().click();
  const review = page.getByRole('dialog').filter({ hasText: 'تسليم الامتحان؟' });
  await expect(review).toBeVisible();
  await expect(review.getByTestId('review-question-0')).toContainText('تمت الإجابة');
  await expect(review.getByTestId('review-question-1')).toContainText('تمت الإجابة');
  await expect(review.getByTestId('review-question-2')).toContainText('تمت الإجابة');

  // A review row jumps back to that question and closes the review screen.
  await review.getByTestId('review-question-1').click();
  await expect(page.getByRole('dialog').filter({ hasText: 'تسليم الامتحان؟' })).toHaveCount(0);
  await expect(q2).toBeVisible();
  await expect(page.getByRole('button', { name: 'صح', exact: true })).toHaveClass(/border-emerald/);

  await page.getByRole('button', { name: 'تسليم الامتحان', exact: true }).filter({ visible: true }).first().click();
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'تسليم نهائي', exact: true }).click();
  await expect(page.getByText('نتيجتك', { exact: true })).toBeVisible({ timeout: 30_000 });

  const results = await apiJson(request, 'GET', '/api/results/mine', student.token);
  expect(results.find((item) => item.examId === exam.id)).toBeTruthy();
});

test('mobile exam room keeps one question visible with map navigation', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile layout is verified on the mobile project.');
  test.setTimeout(120_000);

  const suffix = questionSuffix();
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس تنقل موبايل');
  const student = await registerAndLogin(request, 'Student', 'طالب تنقل موبايل', { teacherIds: [teacher.id] });
  await enrollStudent(request, teacher, student);
  await createThreeQuestionExam(request, teacher, suffix);

  await uiLogin(page, student);
  await expect(page.getByRole('heading', { name: 'نظرة عامة', exact: true }).first()).toBeVisible();
  await openAppNav(page, 'الامتحانات المتاحة');
  await page.getByRole('button', { name: 'دخول الامتحان', exact: true }).click();
  const q1 = page.locator('[id^="question-"]').filter({ hasText: `السؤال الأول ${suffix}` });
  await expect(q1).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('[id^="question-"]')).toHaveCount(1);
  await expect(page.getByText('السؤال 1 من 3', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'خريطة الأسئلة', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'الانتقال إلى السؤال 3' })).toBeVisible();
  await page.getByRole('button', { name: 'الانتقال إلى السؤال 3' }).click();
  await expect(page.locator('[id^="question-"]').filter({ hasText: `السؤال الثالث ${suffix}` })).toBeVisible();
  await expect(page.locator('fieldset')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'السابق', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تسليم الامتحان', exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test('24-hour session countdown warns at five minutes and expires safely', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop countdown labels are verified once.');
  test.setTimeout(90_000);
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس عداد الجلسة');
  await uiLogin(page, teacher);
  await expect(page.getByRole('heading', { name: 'مركز التحكم', exact: true }).first()).toBeVisible({ timeout: 20_000 });

  const countdown = page.getByTestId('session-countdown').filter({ visible: true }).first();
  await expect(countdown).toBeVisible();
  const initial = await countdown.textContent();
  expect(initial).toMatch(/\d{1,2}:\d{2}:\d{2}/);

  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('emtehani-session'));
    raw.expiresAtUtc = new Date(Date.now() + 4 * 60 * 1000).toISOString();
    raw.offsetMs = 0;
    localStorage.setItem('emtehani-session', JSON.stringify(raw));
    window.dispatchEvent(new Event('emtehani:session-updated'));
  });
  await expect(page.getByText('تنتهي الجلسة قريباً', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('emtehani-session'));
    raw.expiresAtUtc = new Date(Date.now() - 1000).toISOString();
    raw.offsetMs = 0;
    localStorage.setItem('emtehani-session', JSON.stringify(raw));
    window.dispatchEvent(new Event('emtehani:session-updated'));
  });
  await expect(page.getByText(/انتهت صلاحية الجلسة/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator('#auth-email')).toBeVisible();
});

test('teacher selects the Free package after registration without any payment fields', async ({ page, request }) => {
  test.setTimeout(90_000);
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس اختيار الباقة', { confirmSubscription: false });

  await uiLogin(page, teacher);
  await expect(page.getByRole('heading', { name: 'الاشتراك', exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('plan-free')).toBeVisible();
  await expect(page.getByTestId('plan-free')).toContainText('بدون رسوم');
  await expect(page.getByText(/لا يوجد دفع إلكتروني/).first()).toBeVisible();
  await expect(page.getByText(/سعر|ريال|جنيه|USD|SAR/).first()).toHaveCount(0);

  await page.getByRole('button', { name: 'تأكيد الباقة', exact: true }).click();
  await expect(page.getByText(/تم تأكيد اشتراكك/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('plan-free').getByRole('button', { name: 'مؤكدة', exact: true })).toBeDisabled();

  const subscription = await apiJson(request, 'GET', '/api/teacher/subscription', teacher.token);
  expect(subscription.subscription.status).toBe('Confirmed');
  expect(subscription.subscription.planCode).toBe('free');
  expect(subscription.requiresSelection).toBeFalsy();
});

test('exam answers survive session expiry and a fresh login', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Session expiry during an exam is verified once on desktop.');
  test.setTimeout(120_000);

  const suffix = questionSuffix();
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس انتهاء جلسة الامتحان');
  const student = await registerAndLogin(request, 'Student', 'طالب انتهاء جلسة الامتحان', { teacherIds: [teacher.id] });
  await enrollStudent(request, teacher, student);
  const exam = await createExam(request, teacher.token, {
    title: `امتحان انتهاء الجلسة ${suffix}`,
    questions: [{ text: `سؤال محفوظ بعد الجلسة ${suffix}`, type: 'MultipleChoice', options: ['أ', 'ب'], correctAnswer: 'أ', points: 1 }],
  });
  await openExam(request, teacher.token, exam.id);

  await uiLogin(page, student);
  await expect(page.getByRole('heading', { name: 'نظرة عامة', exact: true }).first()).toBeVisible();
  await openAppNav(page, 'الامتحانات المتاحة');
  await page.getByRole('button', { name: 'دخول الامتحان', exact: true }).click();
  const card = page.locator('[id^="question-"]').filter({ hasText: `سؤال محفوظ بعد الجلسة ${suffix}` });
  await expect(card).toBeVisible({ timeout: 25_000 });
  await card.locator('label').first().click();
  await expect(card.getByRole('radio').first()).toBeChecked();
  await expect(page.getByTestId('exam-save-status')).toContainText('تم الحفظ تلقائياً', { timeout: 20_000 });

  // Expire the local 24-hour session while the exam attempt is still open.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('emtehani-session'));
    raw.expiresAtUtc = new Date(Date.now() - 1000).toISOString();
    raw.offsetMs = 0;
    localStorage.setItem('emtehani-session', JSON.stringify(raw));
    window.dispatchEvent(new Event('emtehani:session-updated'));
  });
  await expect(page.locator('#auth-email')).toBeVisible();
  await expect(page.getByText(/انتهت صلاحية الجلسة/).first()).toBeVisible();

  // A fresh login starts a new session, and the attempt resumes with the answer intact.
  await uiLogin(page, student);
  await expect(page.getByRole('heading', { name: 'نظرة عامة', exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await openAppNav(page, 'الامتحانات المتاحة');
  await page.getByRole('button', { name: 'استكمال المحاولة', exact: true }).click();
  const resumed = page.locator('[id^="question-"]').filter({ hasText: `سؤال محفوظ بعد الجلسة ${suffix}` });
  await expect(resumed).toBeVisible({ timeout: 25_000 });
  await expect(resumed.getByRole('radio').first()).toBeChecked();

  const paper = await getPaper(request, student.token, exam.id);
  expect(paper.answers.some((answer) => answer.answerText === 'أ')).toBe(true);
});

test('teacher looks up a student, requests consent, and the student accepts', async ({ page, browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Consent flow is covered once on desktop.');
  test.setTimeout(150_000);

  const hostTeacher = await registerAndLogin(request, 'Teacher', 'مدرس استضافة الطالب');
  const linkingTeacher = await registerAndLogin(request, 'Teacher', 'مدرس طلب الارتباط');
  const student = await registerAndLogin(request, 'Student', 'طالب موافقة المدرس', { teacherIds: [hostTeacher.id] });

  await uiLogin(page, linkingTeacher);
  await expect(page.getByRole('heading', { name: 'مركز التحكم', exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await openAppNav(page, 'إدارة الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب', exact: true }).click();

  const addDialog = page.getByRole('dialog').filter({ hasText: 'إضافة طالب' });
  await expect(addDialog).toBeVisible();
  await addDialog.getByLabel('رقم هاتف الطالب').fill(student.studentPhone);
  await addDialog.getByRole('button', { name: 'بحث', exact: true }).click();
  await expect(addDialog.getByText(student.fullName, { exact: true })).toBeVisible();
  await addDialog.getByRole('button', { name: 'إرسال طلب ارتباط', exact: true }).click();
  await expect(page.getByText(/تم إرسال طلب ارتباط/).first()).toBeVisible();
  await addDialog.getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();

  // The request must not create a link before the student consents.
  const before = await apiJson(request, 'GET', '/api/teacher/students', linkingTeacher.token);
  expect(before.items.some((row) => row.studentId === student.id)).toBeFalsy();

  const studentContext = await browser.newContext({ baseURL: new URL(page.url()).origin, locale: 'ar-EG', viewport: { width: 1440, height: 1000 } });
  const studentPage = await studentContext.newPage();
  await uiLogin(studentPage, student);
  await expect(studentPage.getByRole('heading', { name: 'نظرة عامة', exact: true }).first()).toBeVisible();
  await openAppNav(studentPage, 'المدرسون');
  const incoming = studentPage.getByTestId('incoming-link-requests');
  await expect(incoming).toBeVisible({ timeout: 15_000 });
  await expect(incoming).toContainText(linkingTeacher.fullName);
  await incoming.getByRole('button', { name: 'قبول', exact: true }).click();
  await expect(studentPage.getByText(/تم قبول طلب المدرس/).first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'مركز التحكم', exact: true }).first()).toBeVisible();
  await openAppNav(page, 'إدارة الطلاب');
  await expect(page.getByTestId(`student-card-${student.id}`)).toBeVisible({ timeout: 15_000 });
  await studentContext.close();
});

test('invitation link pre-fills registration and selects the inviting teacher', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Invitation prefill is covered once on desktop.');
  const suffix = uniqueSuffix();
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس دعوة التسجيل');
  const studentPhone = `01${Math.floor(100000000 + Math.random() * 899999999)}`;
  const inviteName = fourPartName(`طالب دعوة ${uniqueNameToken(4)}`);
  const invitation = await apiJson(request, 'POST', '/api/teacher/students/invite', teacher.token, {
    fullName: inviteName,
    studentPhone,
    parentPhone: `01${Math.floor(100000000 + Math.random() * 899999999)}`,
    stage: 'ثانوي',
    grade: 'الصف الثالث الثانوي',
  });

  await page.goto(`/?invite=${encodeURIComponent(invitation.token)}`);
  const banner = page.getByTestId('invitation-banner');
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toContainText(teacher.fullName);
  await expect(page.locator('#auth-name')).toHaveValue(inviteName);
  await expect(page.locator('#auth-student-phone')).toHaveValue(studentPhone);
  await expect(page.locator('#auth-stage')).toHaveValue('ثانوي');
  await expect(page.locator('#auth-grade')).toHaveValue('الصف الثالث الثانوي');
  await expect(page.getByText(teacher.fullName).filter({ visible: true }).first()).toBeVisible();
});

test('student changes stage with a clear archive warning and sees the previous academic record section', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Student profile is covered once on desktop.');
  test.setTimeout(120_000);

  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس سجل الطالب');
  const student = await registerAndLogin(request, 'Student', 'طالب تغيير المرحلة', { teacherIds: [teacher.id] });

  await uiLogin(page, student);
  await expect(page.getByRole('heading', { name: 'نظرة عامة', exact: true }).first()).toBeVisible();
  await openAppNav(page, 'ملفي الأكاديمي');
  await expect(page.getByRole('heading', { name: 'ملفي الأكاديمي', exact: true }).first()).toBeVisible();
  await expect(page.getByText('السجل الأكاديمي السابق', { exact: true }).first()).toBeVisible();

  await page.locator('#profile-stage').selectOption('البكالوريا');
  await page.locator('#profile-grade').selectOption('أولى بكالوريا');
  await expect(page.getByText(/ستبقى كل الامتحانات والنتائج والمحاولات السابقة/).first()).toBeVisible();
  await page.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();

  const confirm = page.getByRole('dialog').filter({ hasText: 'تأكيد تغيير المرحلة أو الصف' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('السجل الأكاديمي السابق محفوظ');
  await confirm.getByRole('button', { name: 'نعم، حدّث مرحلتي', exact: true }).click();
  await expect(page.getByText(/تم تحديث بياناتك/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('البكالوريا', { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test('admin dashboard is role-protected and lists subscriptions and linked-student counts', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Admin dashboard is covered once on desktop.');
  test.setTimeout(120_000);

  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس لوحة المنصة', { confirmSubscription: false });
  await uiLogin(page, E2E_ADMIN);
  await expect(page.getByRole('heading', { name: 'لوحة الإدارة', exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('إجمالي المدرسين', { exact: true })).toBeVisible();
  await expect(page.getByText('على باقة Free', { exact: true })).toBeVisible();

  await page.getByLabel('ابحث في المدرسين').fill(teacher.email);
  const row = page.getByTestId(`admin-teacher-${teacher.id}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('الخطة المجانية');
  await expect(row).toContainText('بانتظار التأكيد');
  await expect(row).toContainText(teacher.email);

  await page.getByLabel('تصفية حسب الاشتراك').selectOption('Pending');
  await expect(row).toBeVisible();
  await page.getByLabel('ترتيب المدرسين').selectOption('name');
  await expect(row).toBeVisible();

  await expect(page.getByText('إعدادات ميزات باقة Free', { exact: true })).toBeVisible();
  expect((await apiResponse(request, 'GET', '/api/admin/overview', teacher.token)).status()).toBe(403);
  expect((await apiResponse(request, 'GET', '/api/admin/subscription-settings', teacher.token)).status()).toBe(403);
});
