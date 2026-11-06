import { test, expect } from '@playwright/test';
import {
  apiJson,
  createExam,
  enrollStudent,
  enterExam,
  openAppNav,
  openExam,
  registerAndLogin,
  startExam,
  uiLogin,
} from './helpers.js';

test.describe('student management upgrade', () => {
  test('teacher detail exposes guardian data and attempt counters inline', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop detail coverage.');
    test.setTimeout(120_000);

    const teacher = await registerAndLogin(request, 'Teacher', 'مدرس بيانات الطالب');
    const parentName = 'أحمد محمد علي حسن';
    const student = await registerAndLogin(request, 'Student', 'طالب بيانات', {
      teacherIds: [teacher.id],
      parentName,
    });
    await enrollStudent(request, teacher, student);
    const exam = await createExam(request, teacher.token, { maxAttempts: 2, title: `امتحان محاولات ${Date.now()}` });
    await openExam(request, teacher.token, exam.id);
    await enterExam(request, student.token, exam.id);
    await startExam(request, student.token, exam.id);

    await uiLogin(page, teacher);
    await openAppNav(page, 'إدارة الطلاب');
    await page.getByTestId(`student-card-${student.id}`).getByRole('button', { name: 'التفاصيل', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(parentName, { exact: true })).toBeVisible();
    await expect(dialog.getByText('هاتف الطالب')).toBeVisible();
    await expect(dialog.getByText('هاتف ولي الأمر')).toBeVisible();
    await expect(dialog.getByText('المسموح')).toBeVisible();
    await expect(dialog.getByText('المستخدم')).toBeVisible();
    await expect(dialog.getByText('المكتمل')).toBeVisible();
    await expect(dialog.getByText('المتبقي')).toBeVisible();
  });

  test('teacher portfolio can be previewed, published, and opened by a student', async ({ page, browser, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Portfolio coverage runs once on desktop.');
    test.setTimeout(150_000);

    const teacher = await registerAndLogin(request, 'Teacher', 'مدرس الملف التعريفي');
    const slug = `e2e-portfolio-${Date.now().toString(36)}`;
    const professionalName = `أ. تجربة ${Date.now().toString(36)}`;

    await uiLogin(page, teacher);
    await openAppNav(page, 'صفحتي التعريفية');
    await page.locator('#tp-professional').fill(professionalName);
    await page.locator('#tp-specialty').fill('الرياضيات');
    await page.locator('#tp-bio').fill('خبرة في تدريس المرحلة الثانوية.');
    await page.locator('#tp-slug').fill(slug);
    await page.getByRole('button', { name: 'حفظ', exact: true }).first().click();
    await expect(page.getByText(/تم حفظ الصفحة التعريفية/).first()).toBeVisible();

    await page.getByRole('button', { name: 'معاينة الصفحة', exact: true }).click();
    await expect(page.getByText(professionalName, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'إخفاء المعاينة', exact: true }).click();

    await page.getByRole('button', { name: 'نشر الصفحة', exact: true }).click();
    await expect(page.getByText('منشورة للطلاب')).toBeVisible();

    const student = await registerAndLogin(request, 'Student', 'طالب ملف المدرس', { teacherIds: [teacher.id] });
    const studentContext = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      locale: 'ar-EG',
      viewport: { width: 1440, height: 1000 },
    });
    const studentPage = await studentContext.newPage();
    await uiLogin(studentPage, student);
    await openAppNav(studentPage, 'المدرسون');
    const card = studentPage.getByTestId(`teacher-card-${teacher.id}`);
    const profileLink = card.getByRole('link', { name: /عرض الملف التعريفي/ });
    await expect(profileLink).toBeVisible();
    const [profilePage] = await Promise.all([
      studentContext.waitForEvent('page'),
      profileLink.click(),
    ]);
    await expect(profilePage).toHaveURL(new RegExp(`/t/${slug}$`));
    await expect(profilePage.getByText(professionalName, { exact: true }).first()).toBeVisible();
    await expect(profilePage.getByText('الرياضيات').first()).toBeVisible();
    await studentContext.close();
  });

  test('unlinked relationship is shown as a distinct status instead of Accepted', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Status label coverage runs once on desktop.');
    test.setTimeout(120_000);

    const teacher = await registerAndLogin(request, 'Teacher', 'مدرس فك الارتباط');
    const student = await registerAndLogin(request, 'Student', 'طالب فك الارتباط', { teacherIds: [teacher.id] });
    const pending = await apiJson(request, 'GET', '/api/teacher/requests', teacher.token);
    const row = pending.find((item) => item.studentEmail === student.email && item.status === 'Pending');
    await apiJson(request, 'PUT', `/api/teacher/requests/${row.id}`, teacher.token, { action: 'accept' });
    await apiJson(request, 'DELETE', `/api/teacher/students/${student.id}`, teacher.token);

    await uiLogin(page, teacher);
    await openAppNav(page, 'طلبات الطلاب');
    await expect(page.getByText('تم فك الارتباط').first()).toBeVisible();
  });
});
