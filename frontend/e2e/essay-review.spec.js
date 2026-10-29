import { test, expect } from '@playwright/test';
import {
  apiJson,
  createExam,
  enrollStudent,
  enterExam,
  getPaper,
  getSubmissionReview,
  openAppNav,
  openExam,
  registerAndLogin,
  startExam,
  submitExam,
  uiLogin,
  uniqueSuffix,
} from './helpers.js';

test('teacher grades an essay and student sees the final score and feedback', async ({ page, browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'The essay workflow is covered once on desktop.');

  const suffix = uniqueSuffix();
  const mcText = `اختيار مقالي ${suffix}`;
  const essayText = `مقال E2E ${suffix}`;
  const studentAnswer = `إجابة الطالب المقالية ${suffix}`;
  const feedback = `ملاحظة المدرس ${suffix}`;
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس مقال');
  const student = await registerAndLogin(request, 'Student', 'طالب مقال');
  await enrollStudent(request, teacher, student);
  const exam = await createExam(request, teacher.token, {
    questions: [
      {
        text: mcText,
        type: 'MultipleChoice',
        options: ['4', '5'],
        correctAnswer: '4',
        points: 1,
      },
      {
        text: essayText,
        type: 'Essay',
        options: [],
        correctAnswer: null,
        points: 2,
      },
    ],
  });
  await openExam(request, teacher.token, exam.id);
  await enterExam(request, student.token, exam.id);
  const started = await startExam(request, student.token, exam.id);
  const paper = await getPaper(request, student.token, exam.id);
  const answers = paper.questions.map((question) => ({
    questionId: question.id,
    answerText: question.type === 'Essay' ? studentAnswer : '4',
  }));
  const submitted = await submitExam(request, student.token, started.id, answers);
  expect(submitted.status).toBe('NeedsReview');
  expect(submitted.resultsAvailable).toBe(false);
  expect(submitted.score).toBeNull();

  await uiLogin(page, teacher);
  await expect(page.getByRole('heading', { name: 'مركز التحكم', exact: true }).first()).toBeVisible();
  await openAppNav(page, 'مراجعة المقالات');
  await page.locator('#essays-exam').selectOption(exam.id);
  const row = page.locator('tr').filter({ hasText: student.fullName });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: 'تصحيح', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'تصحيح الأسئلة المقالية', exact: true })).toBeVisible();

  await page.locator('input[type="number"]').first().fill('2');
  await page.locator('textarea').first().fill(feedback);
  await page.getByRole('button', { name: 'حفظ درجة السؤال', exact: true }).click();
  await expect(page.getByText(/تم حفظ درجة السؤال/).first()).toBeVisible();

  const graded = await getSubmissionReview(request, teacher.token, started.id);
  expect(graded.status).toBe('Reviewed');
  expect(Number(graded.score)).toBe(3);
  expect(Number(graded.maxScore)).toBe(3);
  expect(graded.answers.find((answer) => answer.type === 'Essay').teacherFeedback).toBe(feedback);

  await apiJson(request, 'PUT', `/api/exams/${exam.id}/state`, teacher.token, { action: 'close' });

  // Closing the exam is not publication: the graded score and answer key stay hidden
  // until the teacher explicitly releases the results.
  const pendingReview = await getSubmissionReview(request, student.token, started.id);
  expect(pendingReview.resultsAvailable).toBe(false);
  expect(pendingReview.score).toBeNull();
  expect(pendingReview.answers.find((answer) => answer.type === 'Essay').teacherFeedback).toBeNull();

  await apiJson(request, 'POST', `/api/exams/${exam.id}/results/publish`, teacher.token);

  const releasedReview = await getSubmissionReview(request, student.token, started.id);
  expect(releasedReview.resultsAvailable).toBe(true);
  expect(Number(releasedReview.score)).toBe(3);

  const studentContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    locale: 'ar-EG',
    viewport: { width: 1440, height: 1000 },
  });
  const studentPage = await studentContext.newPage();
  await uiLogin(studentPage, student);
  await openAppNav(studentPage, 'نتائجي');
  const resultRow = studentPage.locator('tr').filter({ hasText: exam.title });
  await expect(resultRow).toBeVisible({ timeout: 15_000 });
  await resultRow.getByRole('button', { name: 'مراجعة', exact: true }).click();
  await expect(studentPage.getByRole('heading', { name: exam.title, exact: true })).toBeVisible();
  await expect(studentPage.getByText(/3\s*\/\s*3/).first()).toBeVisible();
  await expect(studentPage.getByText(feedback, { exact: true })).toBeVisible();
  await expect(studentPage.getByText(studentAnswer, { exact: true })).toBeVisible();

  await studentContext.close();
});
