import { test, expect } from '@playwright/test';
import {
  apiJson,
  apiResponse,
  createExam,
  enrollStudent,
  openAppNav,
  registerAndLogin,
  uiLogin,
  uniqueSuffix,
} from './helpers.js';

test('teacher manages linked students with exam bans, suspension, reactivation, and unlink', async ({ page, browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Student management is covered once on desktop.');
  test.setTimeout(120_000);

  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس إدارة الطلاب');
  const student = await registerAndLogin(request, 'Student', 'طالب إدارة الطلاب');
  await enrollStudent(request, teacher, student);
  const bannedExam = await createExam(request, teacher.token, { title: `امتحان ممنوع ${uniqueSuffix()}` });
  const allowedExam = await createExam(request, teacher.token, { title: `امتحان متاح ${uniqueSuffix()}` });

  await uiLogin(page, teacher);
  await expect(page.getByRole('heading', { name: 'مركز التحكم', exact: true }).first()).toBeVisible();
  await openAppNav(page, 'إدارة الطلاب');
  await expect(page.getByRole('heading', { name: 'إدارة الطلاب', exact: true }).first()).toBeVisible();

  const card = page.locator(`[data-testid="student-card-${student.id}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByText('نشط', { exact: true })).toBeVisible();
  await expect(card.getByText(student.email, { exact: true })).toBeVisible();
  await expect(card.getByText(student.grade, { exact: true })).toBeVisible();

  // Search and education filters must narrow the linked students list.
  await page.getByLabel('ابحث في الطلاب المرتبطين').fill('طالب غير موجود إطلاقاً');
  await expect(page.getByText('لا توجد نتائج مطابقة', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'مسح الفلاتر', exact: true }).first().click();
  await expect(card).toBeVisible();
  await page.getByLabel('تصفية حسب المرحلة').selectOption(student.stage);
  await page.getByLabel('تصفية حسب الصف').selectOption(student.grade);
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'مسح الفلاتر', exact: true }).first().click();
  await expect(card).toBeVisible();

  // Ban a single exam.
  await card.getByRole('button', { name: 'منع من امتحان', exact: true }).click();
  const banDialog = page.getByRole('dialog').filter({ hasText: 'منع الطالب من امتحان' });
  await expect(banDialog).toBeVisible();
  await banDialog.getByLabel('اختر الامتحان').selectOption(bannedExam.id);
  await banDialog.getByRole('button', { name: 'تأكيد المنع', exact: true }).click();
  await expect(page.getByText(/تم منع الطالب من هذا الامتحان/).first()).toBeVisible();
  await expect(card.getByText('ممنوع من امتحان', { exact: true })).toBeVisible();
  await expect(card.getByText(bannedExam.title)).toBeVisible();

  const availableAfterBan = await apiJson(request, 'GET', '/api/exams/available', student.token);
  expect(availableAfterBan.items.some((exam) => exam.examId === bannedExam.id)).toBeFalsy();
  expect(availableAfterBan.items.some((exam) => exam.examId === allowedExam.id)).toBeTruthy();
  expect((await apiResponse(request, 'GET', `/api/exams/${bannedExam.id}`, student.token)).status()).toBe(403);

  // Unban from the student details panel.
  await card.getByRole('button', { name: 'التفاصيل', exact: true }).click();
  const detailDialog = page.getByRole('dialog').filter({ hasText: student.fullName });
  await expect(detailDialog.getByText('امتحاناتك وارتباط الطالب بها', { exact: true })).toBeVisible();
  const detailExam = detailDialog.locator(`[data-testid="detail-exam-${bannedExam.id}"]`);
  await expect(detailExam.getByText('ممنوع', { exact: true })).toBeVisible();
  await detailExam.getByRole('button', { name: 'رفع المنع', exact: true }).click();
  await expect(page.getByText(/تم رفع المنع عن هذا الامتحان/).first()).toBeVisible();
  await expect(detailExam.getByRole('button', { name: 'منع من الامتحان', exact: true })).toBeVisible();
  await detailDialog.getByRole('button', { name: 'إغلاق النافذة', exact: true }).click();
  await expect(card.getByText('نشط', { exact: true })).toBeVisible();

  const availableAfterUnban = await apiJson(request, 'GET', '/api/exams/available', student.token);
  expect(availableAfterUnban.items.some((exam) => exam.examId === bannedExam.id)).toBeTruthy();

  // Suspend the student from all teacher exams.
  await card.getByRole('button', { name: 'إيقاف الكل', exact: true }).click();
  const suspendDialog = page.getByRole('dialog').filter({ hasText: 'تأكيد إيقاف الطالب' });
  await expect(suspendDialog).toBeVisible();
  await suspendDialog.getByRole('button', { name: 'نعم، أوقف الطالب', exact: true }).click();
  await expect(page.getByText(/تم إيقاف الطالب عن جميع امتحاناتك/).first()).toBeVisible();
  await expect(card.getByText('موقوف من كل الامتحانات', { exact: true })).toBeVisible();

  const suspendedAvailable = await apiJson(request, 'GET', '/api/exams/available', student.token);
  expect(suspendedAvailable.items.some((exam) => exam.examId === bannedExam.id)).toBeFalsy();
  expect(suspendedAvailable.items.some((exam) => exam.examId === allowedExam.id)).toBeFalsy();
  expect((await apiResponse(request, 'GET', `/api/exams/${allowedExam.id}`, student.token)).status()).toBe(403);

  // Reactivate and confirm access is restored.
  await card.getByRole('button', { name: 'إعادة التفعيل', exact: true }).click();
  await expect(page.getByText(/تمت إعادة تفعيل الطالب/).first()).toBeVisible();
  await expect(card.getByText('نشط', { exact: true })).toBeVisible();
  const reactivatedAvailable = await apiJson(request, 'GET', '/api/exams/available', student.token);
  expect(reactivatedAvailable.items.some((exam) => exam.examId === bannedExam.id)).toBeTruthy();
  expect(reactivatedAvailable.items.some((exam) => exam.examId === allowedExam.id)).toBeTruthy();

  // Unlink while preserving the student account and history.
  await card.getByRole('button', { name: 'فك الارتباط', exact: true }).click();
  const unlinkDialog = page.getByRole('dialog').filter({ hasText: 'تأكيد فك الارتباط' });
  await expect(unlinkDialog.getByText(/لن يُحذف حساب الطالب/)).toBeVisible();
  await unlinkDialog.getByRole('button', { name: 'نعم، افك الارتباط', exact: true }).click();
  await expect(page.getByText(/تم فك ارتباط الطالب بك فقط/).first()).toBeVisible();
  await expect(page.getByText('لا يوجد طلاب مرتبطون بعد', { exact: true })).toBeVisible();

  const teacherStudents = await apiJson(request, 'GET', '/api/teacher/students', teacher.token);
  expect(teacherStudents.items).toHaveLength(0);
  expect((await apiResponse(request, 'GET', '/api/auth/me', student.token)).status()).toBe(200);
  const directory = await apiJson(request, 'GET', '/api/teachers', student.token);
  expect(directory.find((row) => row.id === teacher.id)?.requestStatus).toBe('Unlinked');

  // The student can request the teacher again from their own page.
  const studentContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    locale: 'ar-EG',
    viewport: { width: 1440, height: 1000 },
  });
  const studentPage = await studentContext.newPage();
  await uiLogin(studentPage, student);
  await expect(studentPage.getByRole('heading', { name: 'نظرة عامة', exact: true }).first()).toBeVisible();
  await openAppNav(studentPage, 'المدرسون');
  const teacherCard = studentPage.locator(`[data-testid="teacher-card-${teacher.id}"]`);
  await expect(teacherCard.getByText('تم فك الارتباط', { exact: true })).toBeVisible();
  await teacherCard.getByRole('button', { name: 'طلب التسجيل مجدداً', exact: true }).click();
  await expect(studentPage.getByText(/تم إرسال طلب التسجيل/).first()).toBeVisible();
  await expect(teacherCard.getByText('قيد المراجعة', { exact: true })).toBeVisible();
  await studentContext.close();

  const requests = await apiJson(request, 'GET', '/api/teacher/requests', teacher.token);
  const pending = requests.find((row) => row.studentEmail === student.email && row.status === 'Pending');
  expect(pending).toBeTruthy();
  await apiJson(request, 'PUT', `/api/teacher/requests/${pending.id}`, teacher.token, { action: 'accept' });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'مركز التحكم', exact: true }).first()).toBeVisible();
  await openAppNav(page, 'إدارة الطلاب');
  const relinkedCard = page.locator(`[data-testid="student-card-${student.id}"]`);
  await expect(relinkedCard).toBeVisible();
  await expect(relinkedCard.getByText('نشط', { exact: true })).toBeVisible();
});
