import { test, expect } from '@playwright/test';

// Audit against REAL running services (backend 5000, frontend 5173)
const API_URL = 'http://127.0.0.1:5000';
const APP_URL = 'http://127.0.0.1:5173';

test('QA audit: landing page loads clean with RTL and no console/network errors', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page).toHaveTitle(/امتحاني/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('امتحانات أونلاين');
  // Check navigation links are visible
  await expect(page.getByRole('button', { name: 'تسجيل الدخول' }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'ابدأ مجاناً' }).filter({ visible: true }).first()).toBeVisible();
  // No console errors
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.waitForTimeout(500);
  expect(errors.length, 'console errors on landing').toBe(0);
});

test('QA audit: API health endpoint responds', async ({ request }) => {
  const res = await request.get(`${API_URL}/health`);
  expect(res.ok()).toBeTruthy();
  const text = await res.text();
  expect(text).toContain('Healthy');
});

test('QA audit: API root responds', async ({ request }) => {
  const res = await request.get(`${API_URL}/api`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('service', 'Emtehani API');
});
