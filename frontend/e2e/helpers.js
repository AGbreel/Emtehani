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

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

/** A digit-free token that can safely be used as one part of a student name. */
export function uniqueNameToken(length = 6) {
  return Array.from({ length }, () => ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)]).join('');
}

/** Builds a valid four-part student display name from any prefix. */
export function fourPartName(prefix) {
  const parts = String(prefix || '')
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/\d/g, '').trim())
    .filter((part) => part.length >= 2);
  while (parts.length < 4) parts.push(uniqueNameToken(5));
  // Keep the e2e database repeatable: always add a digit-free unique token.
  return [...parts.slice(0, 7), uniqueNameToken(5)].slice(0, 8).join(' ');
}

export function uniquePhone() {
  return `01${Math.floor(100000000 + Math.random() * 899999999)}`;
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
    fullName: role === 'Student' ? fourPartName(`${namePrefix} ${uniqueNameToken(6)}`) : `${namePrefix} ${suffix}`,
    email: `${role.toLowerCase()}-${suffix}@example.com`,
    password: PASSWORD,
    role,
  };
  if (role === 'Student') {
    // Student registration requires at least one selected teacher. Tests that need a
    // specific teacher pass teacherIds; otherwise a dedicated host teacher is created.
    let teacherIds = education.teacherIds;
    if (!teacherIds?.length) {
      const host = education.teacher || await registerAndLogin(request, 'Teacher', 'مدرس استضافة التسجيل');
      teacherIds = [host.id];
    }
    Object.assign(account, {
      stage: education.stage || DEFAULT_STAGE,
      grade: education.grade || DEFAULT_GRADE,
      studentPhone: education.studentPhone || uniquePhone(),
      parentPhone: education.parentPhone || uniquePhone(),
      parentName: education.parentName || 'أحمد محمد علي حسن',
      teacherCount: education.teacherCount ?? teacherIds.length,
      teacherIds,
    });
  }
  await apiJson(request, 'POST', '/api/auth/register', null, account);
  const login = await apiJson(request, 'POST', '/api/auth/login', null, {
    email: account.email,
    password: account.password,
  });
  if (role === 'Teacher' && education.confirmSubscription !== false) {
    await apiJson(request, 'POST', '/api/teacher/subscription', login.token, { planCode: 'free' });
    login.subscriptionStatus = 'Confirmed';
    login.subscriptionPlan = 'free';
  }
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
  const target = page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first();
  const menu = page.getByRole('button', { name: 'فتح القائمة' });
  // Wait for the authenticated shell to mount before deciding whether the sidebar is
  // already visible (desktop) or needs the mobile drawer to be opened.
  await menu.or(target).first().waitFor({ state: 'visible', timeout: 30_000 });
  if (!(await target.isVisible())) {
    if (await menu.isVisible()) await menu.click();
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
    maxAttempts: options.maxAttempts || 1,
    allowResumeAfterFocusLoss: true,
    resultsReleaseMode: options.resultsReleaseMode || null,
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
  const response = await apiResponse(request, 'POST', `/api/teachers/${teacher.id}/request`, student.token);
  // Students registered with this teacher already have a pending request; reuse it
  // instead of creating a duplicate (the backend correctly rejects duplicates).
  if (!response.ok() && response.status() !== 409) {
    throw new Error(`POST /api/teachers/${teacher.id}/request failed: ${response.status()} ${await response.text()}`);
  }
  const rows = await apiJson(request, 'GET', '/api/teacher/requests', teacher.token);
  const row = rows.find((item) => item.studentEmail === student.email && item.status === 'Pending');
  if (!row) {
    const students = await apiJson(request, 'GET', '/api/teacher/students', teacher.token);
    if (students.items.some((item) => item.studentId === student.id)) return;
    throw new Error(`Pending enrollment request not found for ${student.email}`);
  }
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
