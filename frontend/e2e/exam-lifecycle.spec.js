import { test, expect } from '@playwright/test';
import {
  apiJson,
  apiResponse,
  createExam,
  enrollStudent,
  getSubmissionReview,
  openAppNav,
  registerAndLogin,
  uiLogin,
  uniqueSuffix,
} from './helpers.js';

test('teacher and student complete an exam with autosave, secure CSV, and idempotent submit', async ({ page, browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'The full lifecycle is covered once on desktop.');

  const suffix = uniqueSuffix();
  const questionText = `ما ناتج 2 + 2؟ ${suffix}`;
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس دورة');
  const student = await registerAndLogin(request, 'Student', 'طالب دورة');
  await enrollStudent(request, teacher, student);
  const exam = await createExam(request, teacher.token, {
    questions: [{
      text: questionText,
      type: 'MultipleChoice',
      options: ['4', '5', '3'],
      correctAnswer: '4',
      points: 1,
    }],
  });

  await uiLogin(page, teacher);
  await expect(page.getByRole('heading', { name: 'مركز التحكم', exact: true }).first()).toBeVisible();
  await openAppNav(page, 'الامتحانات');
  const examRow = page.getByRole('row').filter({ hasText: exam.title });
  await examRow.getByRole('button', { name: 'إدارة الامتحان', exact: true }).click();
  await expect(page.getByRole('button', { name: 'فتح الجلسة', exact: true }).filter({ visible: true }).first()).toBeVisible();

  const studentContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    locale: 'ar-EG',
    viewport: { width: 1440, height: 1000 },
  });
  const studentPage = await studentContext.newPage();
  await uiLogin(studentPage, student);
  await expect(studentPage.locator('h1').filter({ hasText: 'أهلاً' })).toBeVisible();
  await openAppNav(studentPage, 'الامتحانات المتاحة');
  await studentPage.getByRole('button', { name: 'دخول الامتحان', exact: true }).click();
  await expect(studentPage.getByText('يرجى انتظار بدء الامتحان من قبل المعلم.', { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'فتح الجلسة', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText(/تم فتح الجلسة/).first()).toBeVisible();

  const questionCard = studentPage.locator('[id^="question-"]').filter({ hasText: questionText });
  await expect(questionCard).toBeVisible({ timeout: 20_000 });
  await questionCard.locator('label').first().click();
  await expect(questionCard.getByRole('radio').first()).toBeChecked();
  await expect(studentPage.locator('header [role="status"]')).toContainText('تم الحفظ تلقائياً', { timeout: 15_000 });

  studentPage.on('dialog', (dialog) => dialog.accept());
  await studentPage.reload();
  await expect(studentPage.locator('h1').filter({ hasText: 'أهلاً' })).toBeVisible();
  await openAppNav(studentPage, 'الامتحانات المتاحة');
  await studentPage.getByRole('button', { name: 'استكمال المحاولة', exact: true }).click();
  const resumedCard = studentPage.locator('[id^="question-"]').filter({ hasText: questionText });
  await expect(resumedCard).toBeVisible({ timeout: 20_000 });
  await expect(resumedCard.getByRole('radio').first()).toBeChecked();

  await studentPage.getByRole('button', { name: 'تسليم الامتحان', exact: true }).filter({ visible: true }).first().click();
  await studentPage.getByRole('button', { name: 'تسليم نهائي', exact: true }).click();
  await expect(studentPage.getByText('نتيجتك', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(studentPage.getByText('بانتظار اعتماد النتائج').first()).toBeVisible();

  await apiJson(request, 'PUT', `/api/exams/${exam.id}/state`, teacher.token, { action: 'close' });

  // Closing the exam must not reveal results before the teacher publishes them.
  await studentPage.reload();
  await expect(studentPage.locator('h1').filter({ hasText: 'أهلاً' })).toBeVisible();
  await openAppNav(studentPage, 'نتائجي');
  const pendingRow = studentPage.getByRole('row').filter({ hasText: exam.title });
  await expect(pendingRow).toContainText('بانتظار اعتماد النتائج');

  await expect(page.getByRole('button', { name: 'نشر النتائج للطلاب', exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'نشر النتائج للطلاب', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'نعم، انشر النتائج', exact: true }).click();
  await expect(page.getByText(/تم نشر النتائج/).first()).toBeVisible();

  await studentPage.reload();
  await expect(studentPage.locator('h1').filter({ hasText: 'أهلاً' })).toBeVisible();
  await openAppNav(studentPage, 'نتائجي');
  const resultRow = studentPage.getByRole('row').filter({ hasText: exam.title });
  await expect(resultRow).toContainText('1 / 1');
  await resultRow.getByRole('button', { name: 'مراجعة', exact: true }).click();
  await expect(studentPage.getByText(/1\s*\/\s*1/).first()).toBeVisible();

  const results = await apiJson(request, 'GET', '/api/results/mine', student.token);
  const submission = results.find((item) => item.examId === exam.id);
  expect(submission).toBeTruthy();
  const repeated = await apiJson(request, 'POST', `/api/submissions/${submission.id}/submit`, student.token, {
    answers: [],
    focusLossDetected: false,
  });
  expect(repeated.status).toBe('Reviewed');
  expect(Number(repeated.score)).toBe(1);
  expect(Number(repeated.maxScore)).toBe(1);

  const review = await getSubmissionReview(request, teacher.token, submission.id);
  expect(review.status).toBe('Reviewed');
  expect(review.answers).toHaveLength(1);

  const teacherResults = await apiJson(request, 'GET', `/api/exams/${exam.id}/results`, teacher.token);
  expect(teacherResults.total).toBe(1);
  expect(teacherResults.items[0].id).toBe(submission.id);

  const teacherCsv = await apiResponse(request, 'GET', `/api/exams/${exam.id}/export`, teacher.token);
  expect(teacherCsv.status()).toBe(200);
  expect(teacherCsv.headers()['content-type']).toContain('text/csv');

  const codesCsv = await apiResponse(request, 'GET', `/api/exams/${exam.id}/participants/export`, teacher.token);
  expect(codesCsv.status()).toBe(200);
  const roster = await apiJson(request, 'GET', `/api/exams/${exam.id}/participants`, teacher.token);
  expect(await codesCsv.text()).toContain(roster.items[0].code);

  const studentCsv = await apiResponse(request, 'GET', `/api/exams/${exam.id}/export`, student.token);
  expect(studentCsv.status()).toBe(403);
  const studentCodesCsv = await apiResponse(request, 'GET', `/api/exams/${exam.id}/participants/export`, student.token);
  expect(studentCodesCsv.status()).toBe(403);

  await studentContext.close();
});
