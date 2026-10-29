import { test, expect } from '@playwright/test';
import { PASSWORD, openAuth, registerAndLogin, uniqueSuffix } from './helpers.js';

test('forgot-password flow sets a new password and allows login', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Password reset regression runs once on desktop.');
  const student = await registerAndLogin(request, 'Student', 'طالب استعادة');
  const newPassword = `${PASSWORD}New1`;

  await openAuth(page, 'login');
  await page.getByRole('button', { name: 'نسيت كلمة المرور؟', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'استعادة كلمة المرور.' })).toBeVisible();
  await page.locator('#auth-email').fill(student.email);
  await page.getByRole('button', { name: 'إرسال رابط الاستعادة', exact: true }).click();

  // Development mode returns a local reset token when SMTP is not configured.
  await expect(page.getByRole('heading', { name: 'تعيين كلمة مرور جديدة.' })).toBeVisible({ timeout: 15_000 });
  await page.locator('#auth-new-password').fill(newPassword);
  await page.locator('#auth-confirm-password').fill(newPassword);
  await page.getByRole('button', { name: 'تعيين كلمة المرور', exact: true }).click();

  await expect(page.getByText(/تم تغيير كلمة المرور/).first()).toBeVisible({ timeout: 15_000 });
  await page.locator('#auth-email').fill(student.email);
  await page.locator('#auth-password').fill(newPassword);
  await page.locator('form').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('heading', { name: /أهلاً،/ })).toBeVisible({ timeout: 20_000 });
});
