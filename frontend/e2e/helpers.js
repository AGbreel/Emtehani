import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL
  || `http://127.0.0.1:${process.env.E2E_API_PORT || '5099'}`;
export const PASSWORD = 'E2ePass!2026';
export const DEFAULT_STAGE = 'ثانوي';
export const DEFAULT_GRADE = 'الصف الثالث الثانوي';

export function uniqueSuffix() {
  return randomUUID().slice(0, 8);
}

async function requestApi(request, method, path, token, data) {
  return request.fetch(`${API_URL}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data,
  });
}

export async function apiJson(request, method, path, token, data) {
  const response = await requestApi(request, method, path, token, data);
  const body = await response.text();
  if (!response.ok()) {
    throw new Error(`${method} ${path} failed: ${response.status()} ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

export async function apiResponse(request, method, path, token, data) {
  return requestApi(request, method, path, token, data);
}

export async function registerAndLogin(request, role, namePrefix, education = {}) {
  const suffix = uniqueSuffix();
  const account = {
    fullName: `${namePrefix} ${suffix}`,
    email: `${role.toLowerCase()}-${suffix}@example.com`,
    password: PASSWORD,
    role,
    ...(role === 'Student'
      ? {
          stage: education.stage || DEFAULT_STAGE,
          grade: education.grade || DEFAULT_GRADE,
        }
      : {}),
  };
  await apiJson(request, 'POST', '/api/auth/register', null, account);
  const login = await apiJson(request, 'POST', '/api/auth/login', null, {
    email: account.email,
    password: account.password,
  });
  const me = await apiJson(request, 'GET', '/api/auth/me', login.token);
  return { ...account, ...login, id: me.id };
}

export async function openAuth(page, mode = 'login') {
  await page.goto('/');
  if (await page.getByRole('button', { name: 'فتح القائمة' }).isVisible()) {
    await page.getByRole('button', { name: 'فتح القائمة' }).click();
  }
  const label = mode === 'login' ? 'تسجيل الدخول' : 'ابدأ مجاناً';
  await page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first().click();
  await expect(page.locator('#auth-email')).toBeVisible();
}

export async function uiLogin(page, account) {
  await openAuth(page, 'login');
  await page.locator('#auth-email').fill(account.email);
  await page.locator('#auth-password').fill(account.password);
  await page.locator('form').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
}

export async function openAppNav(page, label) {
  let target = page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first();
  if (!await target.count()) {
    const menu = page.getByRole('button', { name: 'فتح القائمة' });
    if (await menu.isVisible()) await menu.click();
    target = page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first();
  }
  await target.click();
}

export async function createExam(request, token, options = {}) {
  const suffix = uniqueSuffix();
  const title = options.title || `E2E امتحان ${suffix}`;
  const exam = await apiJson(request, 'POST', '/api/exams', token, {
    title,
    description: 'E2E automated verification',
    durationMinutes: options.durationMinutes || 30,
    maxAttempts: 1,
    allowResumeAfterFocusLoss: true,
    stage: options.stage || DEFAULT_STAGE,
    grade: options.grade || DEFAULT_GRADE,
    questions: options.questions || [
      {
        text: `ما ناتج 2 + 2؟ ${suffix}`,
        type: 'MultipleChoice',
        options: ['4', '5', '3'],
        correctAnswer: '4',
        points: 1,
      },
    ],
  });
  await apiJson(request, 'PUT', `/api/exams/${exam.id}/publish`, token);
  return { ...exam, title };
}

export async function openExam(request, teacherToken, examId) {
  await apiJson(request, 'PUT', `/api/exams/${examId}/state`, teacherToken, { action: 'open' });
}

export async function enrollStudent(request, teacher, student) {
  await apiJson(request, 'POST', `/api/teachers/${teacher.id}/request`, student.token);
  const rows = await apiJson(request, 'GET', '/api/teacher/requests', teacher.token);
  const row = rows.find((item) => item.studentEmail === student.email && item.status === 'Pending');
  if (!row) throw new Error(`Pending enrollment request not found for ${student.email}`);
  await apiJson(request, 'PUT', `/api/teacher/requests/${row.id}`, teacher.token, { action: 'accept' });
}

export async function enterExam(request, studentToken, examId) {
  return apiJson(request, 'POST', `/api/exams/${examId}/enter`, studentToken);
}

export async function startExam(request, studentToken, examId) {
  return apiJson(request, 'POST', `/api/exams/${examId}/start`, studentToken);
}

export async function getPaper(request, studentToken, examId) {
  return apiJson(request, 'GET', `/api/exams/${examId}/paper`, studentToken);
}

export async function submitExam(request, studentToken, submissionId, answers = []) {
  return apiJson(request, 'POST', `/api/submissions/${submissionId}/submit`, studentToken, {
    answers,
    focusLossDetected: false,
  });
}

export async function getSubmissionReview(request, token, submissionId) {
  return apiJson(request, 'GET', `/api/submissions/${submissionId}/review`, token);
}
