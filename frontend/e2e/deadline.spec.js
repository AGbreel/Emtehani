import { test, expect } from '@playwright/test';
import {
  apiJson,
  createExam,
  enrollStudent,
  getSubmissionReview,
  openAppNav,
  openExam,
  registerAndLogin,
  uiLogin,
} from './helpers.js';

test('exam auto-submits when the timer expires', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Timer expiry is covered once on desktop.');
  test.setTimeout(150_000);

  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس مؤقت');
  const student = await registerAndLogin(request, 'Student', 'طالب مؤقت');
  await enrollStudent(request, teacher, student);
  const exam = await createExam(request, teacher.token, {
    durationMinutes: 1,
    questions: [{
      text: 'سؤال انتهاء الوقت',
      type: 'MultipleChoice',
      options: ['4', '5'],
      correctAnswer: '4',
      points: 1,
    }],
  });
  await openExam(request, teacher.token, exam.id);

  await uiLogin(page, student);
  await openAppNav(page, 'الامتحانات المتاحة');
  await page.getByRole('button', { name: 'دخول الامتحان', exact: true }).click();

  const questionCard = page.locator('[id^="question-"]').filter({ hasText: 'سؤال انتهاء الوقت' });
  await expect(questionCard).toBeVisible({ timeout: 20_000 });
  await questionCard.locator('label').first().click();
  await expect(page.locator('header [role="status"]')).toContainText('تم الحفظ تلقائياً', { timeout: 20_000 });

  await expect(page.getByText('نتيجتك', { exact: true })).toBeVisible({ timeout: 80_000 });
  await expect(page.getByText('بانتظار اعتماد النتائج').first()).toBeVisible();

  await apiJson(request, 'PUT', `/api/exams/${exam.id}/state`, teacher.token, { action: 'close' });

  const pendingResults = await apiJson(request, 'GET', '/api/results/mine', student.token);
  const pending = pendingResults.find((item) => item.examId === exam.id);
  expect(pending).toBeTruthy();
  expect(pending.resultsAvailable).toBe(false);
  expect(pending.score).toBeNull();
  expect(pending.maxScore).toBeNull();
  expect(pending.durationSeconds).toBeGreaterThanOrEqual(55);

  await apiJson(request, 'POST', `/api/exams/${exam.id}/results/publish`, teacher.token);

  const results = await apiJson(request, 'GET', '/api/results/mine', student.token);
  const result = results.find((item) => item.examId === exam.id);
  expect(result).toBeTruthy();
  expect(result.resultsAvailable).toBe(true);
  expect(['Reviewed', 'Submitted']).toContain(result.status);
  expect(Number(result.score)).toBe(1);

  const review = await getSubmissionReview(request, teacher.token, result.id);
  expect(review.status).toBe('Reviewed');
  expect(review.answers[0].studentAnswer).toBe('4');

  const studentReview = await getSubmissionReview(request, student.token, result.id);
  expect(studentReview.resultsAvailable).toBe(true);
  expect(Number(studentReview.score)).toBe(1);
  expect(studentReview.answers[0].correctAnswer).toBe('4');

  const teacherResults = await apiJson(request, 'GET', `/api/exams/${exam.id}/results`, teacher.token);
  expect(teacherResults.total).toBe(1);
});
