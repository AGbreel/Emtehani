import { test, expect } from '@playwright/test';
import {
  apiJson,
  apiResponse,
  createExam,
  enrollStudent,
  enterExam,
  getPaper,
  openExam,
  registerAndLogin,
  startExam,
} from './helpers.js';

test('concurrent autosave and submit leave one coherent submission', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Concurrency is covered once on desktop.');

  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس تزامن');
  const student = await registerAndLogin(request, 'Student', 'طالب تزامن');
  await enrollStudent(request, teacher, student);
  const exam = await createExam(request, teacher.token, {
    questions: [{
      text: 'سؤال التزامن',
      type: 'MultipleChoice',
      options: ['4', '5'],
      correctAnswer: '4',
      points: 1,
    }],
  });
  await openExam(request, teacher.token, exam.id);
  await enterExam(request, student.token, exam.id);
  const started = await startExam(request, student.token, exam.id);
  const paper = await getPaper(request, student.token, exam.id);
  const answers = paper.questions.map((question) => ({
    questionId: question.id,
    answerText: '4',
  }));

  const [save, submit] = await Promise.all([
    apiResponse(request, 'PUT', `/api/submissions/${started.id}/answers`, student.token, {
      answers,
      focusLossDetected: false,
    }),
    apiResponse(request, 'POST', `/api/submissions/${started.id}/submit`, student.token, {
      answers,
      focusLossDetected: false,
    }),
  ]);

  const saveBody = await save.text();
  const submitBody = await submit.text();
  expect([200, 400, 404, 409], `save=${save.status()} ${saveBody}`).toContain(save.status());
  expect([200, 409], `submit=${submit.status()} ${submitBody}`).toContain(submit.status());

  const results = await apiJson(request, 'GET', '/api/results/mine', student.token);
  const result = results.find((item) => item.examId === exam.id);
  expect(result).toBeTruthy();
  expect(['Reviewed', 'Submitted', 'NeedsReview']).toContain(result.status);

  const teacherResults = await apiJson(request, 'GET', `/api/exams/${exam.id}/results`, teacher.token);
  expect(teacherResults.total).toBe(1);
  expect(teacherResults.items[0].id).toBe(started.id);
});
