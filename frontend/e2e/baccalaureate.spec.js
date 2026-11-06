import { test, expect } from '@playwright/test';
import {
  PASSWORD,
  apiJson,
  enrollStudent,
  openAppNav,
  openAuth,
  registerAndLogin,
  uiLogin,
  fourPartName,
  uniqueNameToken,
  uniquePhone,
  uniqueSuffix,
} from './helpers.js';

test('baccalaureate stage is selectable in registration and exam creation and visible to the matching student', async ({ page, browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Baccalaureate coverage runs once on desktop.');
  test.setTimeout(180_000);

  const suffix = uniqueSuffix();
  const student = {
    fullName: fourPartName(`طالب بكالوريا ${uniqueNameToken(4)}`),
    email: `baccalaureate-student-${suffix}@example.com`,
    password: PASSWORD,
    role: 'Student',
    stage: 'البكالوريا',
    grade: 'أولى بكالوريا',
  };
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس بكالوريا');
  const examTitle = `امتحان بكالوريا ${suffix}`;

  // Registration must expose the new stage and exactly its two grades.
  await page.goto('/');
  await openAuth(page, 'register');
  await expect(page.locator('#auth-stage')).toBeVisible();
  await expect(page.locator('#auth-stage option', { hasText: 'البكالوريا' })).toHaveCount(1);
  await page.locator('#auth-stage').selectOption('البكالوريا');
  await expect(page.locator('#auth-grade option')).toHaveText(['اختر الصف', 'أولى بكالوريا', 'تانية بكالوريا']);

  await page.locator('#auth-name').fill(student.fullName);
  await page.locator('#auth-email').fill(student.email);
  await page.locator('#auth-password').fill(student.password);
  await page.locator('#auth-grade').selectOption('أولى بكالوريا');
  await page.locator('#auth-student-phone').fill(uniquePhone());
  await page.locator('#auth-parent-phone').fill(uniquePhone());
  await page.locator('#auth-parent-name').fill('أحمد محمد علي حسن');
  await page.getByLabel('ابحث باسم المدرس').fill(teacher.fullName);
  await expect(page.locator(`[data-testid="auth-teacher-${teacher.id}"]`)).toBeVisible();
  await page.locator(`[data-testid="auth-teacher-${teacher.id}"]`).click();
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  await expect(page.getByText(/تم إنشاء الحساب/).first()).toBeVisible();
  await page.locator('#auth-email').fill(student.email);
  await page.locator('#auth-password').fill(student.password);
  await page.locator('form').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('heading', { name: /أهلاً/ }).first()).toBeVisible();

  const login = await apiJson(request, 'POST', '/api/auth/login', null, { email: student.email, password: student.password });
  const me = await apiJson(request, 'GET', '/api/auth/me', login.token);
  expect(me.stage).toBe('البكالوريا');
  expect(me.grade).toBe('أولى بكالوريا');
  await enrollStudent(request, teacher, { ...student, id: me.id, token: login.token });

  // Exam creation must expose the same stage/grades and persist the selection.
  const teacherContext = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    locale: 'ar-EG',
    viewport: { width: 1440, height: 1000 },
  });
  const teacherPage = await teacherContext.newPage();
  await uiLogin(teacherPage, teacher);
  await expect(teacherPage.getByRole('heading', { name: 'مركز التحكم', exact: true }).first()).toBeVisible();
  await openAppNav(teacherPage, 'الامتحانات');
  await teacherPage.getByRole('button', { name: 'امتحان جديد', exact: true }).filter({ visible: true }).first().click();
  await expect(teacherPage.getByRole('heading', { name: 'أنشئ امتحاناً' })).toBeVisible();

  await teacherPage.locator('#exam-title').fill(examTitle);
  await teacherPage.locator('#exam-description').fill('تحقق من اختيارات مرحلة البكالوريا.');
  await teacherPage.locator('#exam-duration').fill('20');
  await teacherPage.locator('#exam-stage').selectOption('البكالوريا');
  await expect(teacherPage.locator('#exam-grade option')).toHaveText(['اختر الصف', 'أولى بكالوريا', 'تانية بكالوريا']);
  await teacherPage.locator('#exam-grade').selectOption('أولى بكالوريا');
  await teacherPage.locator('textarea[id$="-text"]').first().fill(`سؤال بكالوريا ${suffix}`);
  await teacherPage.getByPlaceholder('الخيار 1').fill('4');
  await teacherPage.getByPlaceholder('الخيار 2').fill('5');
  await teacherPage.getByRole('button', { name: 'تحديد الخيار 1 كإجابة صحيحة' }).click();
  await teacherPage.getByRole('button', { name: 'حفظ الامتحان', exact: true }).click();

  const createdDialog = teacherPage.getByRole('dialog').filter({ hasText: 'تم حفظ الامتحان' });
  await expect(createdDialog).toBeVisible({ timeout: 20_000 });
  await createdDialog.getByRole('button', { name: 'إدارة الامتحان', exact: true }).click();
  await expect(teacherPage.getByRole('heading', { name: examTitle, exact: true }).first()).toBeVisible();
  const teacherExams = await apiJson(request, 'GET', '/api/exams?page=1&pageSize=100', teacher.token);
  const createdExam = teacherExams.items.find((exam) => exam.title === examTitle);
  expect(createdExam?.stage).toBe('البكالوريا');
  expect(createdExam?.grade).toBe('أولى بكالوريا');
  await teacherPage.getByRole('button', { name: 'نشر الامتحان', exact: true }).filter({ visible: true }).first().click();
  await expect(teacherPage.getByText(/تم نشر الامتحان/).first()).toBeVisible();

  // The enrolled first-year Baccalaureate student sees the published exam.
  await openAppNav(page, 'الامتحانات المتاحة');
  await expect(page.getByRole('heading', { name: 'الامتحانات المتاحة', exact: true }).first()).toBeVisible();
  await expect(page.getByText(examTitle, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

  // A second-year Baccalaureate student is enrolled but must not see this first-year exam.
  const otherStudent = await registerAndLogin(request, 'Student', 'طالب بكالوريا تانية', 'البكالوريا', 'تانية بكالوريا');
  await enrollStudent(request, teacher, otherStudent);
  const otherAvailable = await apiJson(request, 'GET', '/api/exams/available', otherStudent.token);
  expect(otherAvailable.items.some((exam) => exam.examTitle === examTitle)).toBeFalsy();

  await teacherContext.close();
});
