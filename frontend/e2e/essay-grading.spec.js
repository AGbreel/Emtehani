import { test, expect } from '@playwright/test';
import {
  apiJson,
  createExam,
  enrollStudent,
  getSubmissionReview,
  openAppNav,
  registerAndLogin,
  uiLogin,
  uniqueSuffix,
} from './helpers.js';

test('essay grade is saved, applied to the final score, and visible after reload', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Essay grading regression runs once on desktop.');
  const suffix = uniqueSuffix();
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس مقالي');
  const student = await registerAndLogin(request, 'Student', 'طالب مقالي');
  await enrollStudent(request, teacher, student);

  const exam = await createExam(request, teacher.token, {
    title: `امتحان مقالي ${suffix}`,
    durationMinutes: 30,
    questions: [
      { text: `اختيار ${suffix}`, type: 'MultipleChoice', options: ['4', '5'], correctAnswer: '4', points: 1 },
      { text: `مقال ${suffix}`, type: 'Essay', options: [], correctAnswer: null, points: 3 },
    ],
  });

  const entered = await apiJson(request, 'POST', `/api/exams/${exam.id}/enter`, student.token);
  await apiJson(request, 'PUT', `/api/exams/${exam.id}/state`, teacher.token, { action: 'open' });
  const started = await apiJson(request, 'POST', `/api/exams/${exam.id}/start`, student.token);
  const paper = await apiJson(request, 'GET', `/api/exams/${exam.id}/paper`, student.token);
  const mcq = paper.questions.find((q) => q.type === 'MultipleChoice');
  const essay = paper.questions.find((q) => q.type === 'Essay');
  await apiJson(request, 'POST', `/api/submissions/${started.id}/submit`, student.token, {
    answers: [
      { questionId: mcq.id, answerText: '4' },
      { questionId: essay.id, answerText: 'إجابة مقالية مفصلة للاختبار.' },
    ],
    focusLossDetected: false,
  });
  expect(entered.examId).toBe(exam.id);

  await uiLogin(page, teacher);
  await openAppNav(page, 'مراجعة المقالات');
  await expect(page.getByRole('heading', { name: 'مراجعة المقالات' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: student.fullName });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'تصحيح', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'تصحيح الأسئلة المقالية' })).toBeVisible();
  await page.locator('input[type="number"]').first().fill('2.5');
  await page.locator('textarea[id^="feedback-"]').first().fill('إجابة جيدة، راجع التفاصيل.');
  await page.getByRole('button', { name: 'حفظ درجة السؤال', exact: true }).click();
  await expect(page.getByText(/اكتملت مراجعة هذه المحاولة|تم حفظ درجة السؤال/).first()).toBeVisible();
  await expect(page.getByText('اكتملت المراجعة').first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'مركز التحكم', exact: true }).first()).toBeVisible();

  const persisted = await getSubmissionReview(request, teacher.token, started.id);
  expect(Number(persisted.answers.find((a) => a.type === 'Essay').awardedPoints)).toBe(2.5);
  expect(Number(persisted.score)).toBe(3.5);
  expect(persisted.status).toBe('Reviewed');

  await openAppNav(page, 'النتائج');
  await expect(page.getByRole('heading', { name: 'النتائج والتحليلات' })).toBeVisible();
  const resultRow = page.getByRole('row').filter({ hasText: student.fullName });
  await expect(resultRow).toContainText('3.5');
  await expect(resultRow).toContainText('4');
});
