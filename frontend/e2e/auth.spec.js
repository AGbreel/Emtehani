import { test, expect } from '@playwright/test';
import {
  PASSWORD,
  openAppNav,
  openAuth,
  registerAndLogin,
  uiLogin,
  uniqueSuffix,
} from './helpers.js';

test('open teacher registration and Arabic RTL student login', async ({ page, browser, request }) => {
  const suffix = uniqueSuffix();
  const teacher = {
    name: `مدرس E2E ${suffix}`,
    email: `ui-teacher-${suffix}@example.com`,
  };
  const student = await registerAndLogin(request, 'Student', 'طالب E2E');

  await openAuth(page, 'register');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await page.locator('#auth-name').fill(teacher.name);
  await page.locator('#auth-email').fill(teacher.email);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('button[aria-pressed]').filter({ hasText: 'طالب' }).click();
  await expect(page.locator('#auth-stage')).toBeVisible();
  await expect(page.locator('#auth-grade')).toBeVisible();
  await page.locator('#auth-stage').selectOption('ثانوي');
  await page.locator('#auth-grade').selectOption('الصف الثالث الثانوي');
  await page.locator('button[aria-pressed]').filter({ hasText: 'مدرس' }).click();
  await expect(page.locator('#auth-stage')).toHaveCount(0);
  await expect(page.locator('#auth-invite')).toHaveCount(0);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  await expect(page.getByText(/تم إنشاء الحساب/).first()).toBeVisible();

  await page.locator('#auth-email').fill(teacher.email);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'مركز التحكم', exact: true }).first()).toBeVisible();

  await openAppNav(page, 'الامتحانات');
  await expect(page.getByRole('heading', { name: 'الامتحانات', exact: true }).first()).toBeVisible();

  const studentContext = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    locale: 'ar-EG',
    viewport: test.info().project.use.viewport,
    userAgent: test.info().project.use.userAgent,
    isMobile: test.info().project.use.isMobile,
    hasTouch: test.info().project.use.hasTouch,
  });
  const studentPage = await studentContext.newPage();
  await uiLogin(studentPage, student);
  await expect(studentPage.locator('h1').filter({ hasText: 'أهلاً' })).toBeVisible();
  await expect(studentPage.locator('html')).toHaveAttribute('dir', 'rtl');
  await studentContext.close();
});
