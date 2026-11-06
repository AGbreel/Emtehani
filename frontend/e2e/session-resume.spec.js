import { test, expect } from '@playwright/test';
import {
  createExam,
  enrollStudent,
  getPaper,
  openAppNav,
  openExam,
  registerAndLogin,
  uiLogin,
  uniqueSuffix,
} from './helpers.js';

test('student resumes after refresh, token renewal, and offline autosave without extending the deadline', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Resume and reconnect regression runs once on desktop.');
  test.setTimeout(180_000);

  const suffix = uniqueSuffix();
  const questionText = `سؤال استعادة المحاولة ${suffix}`;
  const teacher = await registerAndLogin(request, 'Teacher', 'مدرس استعادة');
  const student = await registerAndLogin(request, 'Student', 'طالب استعادة');
  await enrollStudent(request, teacher, student);
  const exam = await createExam(request, teacher.token, {
    title: `امتحان استعادة ${suffix}`,
    durationMinutes: 30,
    questions: [{
      text: questionText,
      type: 'MultipleChoice',
      options: ['4', '5'],
      correctAnswer: '4',
      points: 1,
    }],
  });

  await uiLogin(page, student);
  await expect(page.locator('h1').filter({ hasText: 'أهلاً' })).toBeVisible();
  await openAppNav(page, 'الامتحانات المتاحة');
  await page.getByRole('button', { name: 'دخول الامتحان', exact: true }).click();
  await expect(page.getByText('يرجى انتظار بدء الامتحان من قبل المعلم.', { exact: true })).toBeVisible();

  await openExam(request, teacher.token, exam.id);
  const questionCard = page.locator('[id^="question-"]').filter({ hasText: questionText });
  await expect(questionCard).toBeVisible({ timeout: 20_000 });
  await questionCard.locator('label').first().click();
  const saveStatus = page.locator('[data-testid="exam-save-status"]');
  await expect(saveStatus).toContainText('تم الحفظ تلقائياً', { timeout: 20_000 });

  const before = await getPaper(request, student.token, exam.id);
  expect(before.deadlineUtc).toBeTruthy();
  const originalDeadline = before.deadlineUtc;
  const originalRemaining = before.remainingSeconds;
  expect(before.answers.some((answer) => answer.answerText === '4')).toBe(true);

  // 1) Browser refresh: the student returns to the dashboard and must resume from the
  // available-exams page with the saved answer intact.
  await page.reload();
  await expect(page.locator('h1').filter({ hasText: 'أهلاً' })).toBeVisible();
  await openAppNav(page, 'الامتحانات المتاحة');
  await page.getByRole('button', { name: 'استكمال المحاولة', exact: true }).click();
  const resumedCard = page.locator('[id^="question-"]').filter({ hasText: questionText });
  await expect(resumedCard).toBeVisible({ timeout: 20_000 });
  await expect(resumedCard.getByRole('radio').first()).toBeChecked();

  const afterRefresh = await getPaper(request, student.token, exam.id);
  expect(afterRefresh.deadlineUtc).toBe(originalDeadline);
  expect(afterRefresh.remainingSeconds).toBeLessThanOrEqual(originalRemaining);

  // 2) Simulate an expired/invalid access token while the refresh token survives. The
  // next autosave must renew the session transparently and persist the new answer.
  const refreshToken = await page.evaluate(() => localStorage.getItem('emtehani-refresh-token'));
  expect(refreshToken).toBeTruthy();
  await page.evaluate(() => localStorage.setItem('emtehani-token', 'expired-or-revoked-access-token'));

  await resumedCard.locator('label').nth(1).click();
  await expect(saveStatus).toContainText('تم الحفظ تلقائياً', { timeout: 25_000 });
  const renewedToken = await page.evaluate(() => localStorage.getItem('emtehani-token'));
  expect(renewedToken).not.toBe('expired-or-revoked-access-token');

  const afterRenewal = await getPaper(request, student.token, exam.id);
  expect(afterRenewal.deadlineUtc).toBe(originalDeadline);
  expect(afterRenewal.answers.some((answer) => answer.answerText === '5')).toBe(true);

  // 3) Network interruption: the failure must be visible, the draft must remain local,
  // and a later manual save must succeed after reconnection without a new deadline.
  await page.context().setOffline(true);
  await resumedCard.locator('label').first().click();
  await expect(saveStatus).toContainText('تعذر الحفظ', { timeout: 30_000 });
  await page.context().setOffline(false);
  await page.getByRole('button', { name: 'حفظ الآن', exact: true }).click();
  await expect(saveStatus).toContainText('تم الحفظ تلقائياً', { timeout: 25_000 });

  const afterReconnect = await getPaper(request, student.token, exam.id);
  expect(afterReconnect.deadlineUtc).toBe(originalDeadline);
  expect(afterReconnect.remainingSeconds).toBeLessThanOrEqual(originalRemaining);
  expect(afterReconnect.answers.some((answer) => answer.answerText === '4')).toBe(true);
  expect(afterReconnect.submission.id).toBe(before.submission.id);
});
