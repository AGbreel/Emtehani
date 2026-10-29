import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const seed = JSON.parse(fs.readFileSync('C:/Users/safaa/AppData/Local/Temp/opencode/visual-seed.json', 'utf8'));
const outDir = 'C:/Users/safaa/AppData/Local/Temp/opencode/baseline';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar-EG', colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[console] ${message.text()}`);
  });
  page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`));
  return { context, page };
}

async function measure(page, name) {
  const data = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const candidates = [...document.querySelectorAll('body *')]
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        if (style.pointerEvents === 'none') return false;
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const overflowX = getComputedStyle(parent).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll') return false;
        }
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        return rect.right > vw + 2 || rect.left < -2;
      })
      .slice(0, 8)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: String(element.className || '').slice(0, 90),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          text: (element.textContent || '').trim().slice(0, 45),
        };
      });
    const smallText = [...document.querySelectorAll('p, span, small, td, th, label, button, a')]
      .filter((element) => {
        const style = getComputedStyle(element);
        const size = parseFloat(style.fontSize);
        return style.display !== 'none' && size > 0 && size < 10 && (element.textContent || '').trim().length > 1;
      })
      .length;
    return {
      viewport: vw,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: candidates,
      smallTextCount: smallText,
    };
  });
  console.log(JSON.stringify({ name, ...data }));
}

async function reveal(page) {
  await page.evaluate(async () => {
    const start = window.scrollY;
    const step = Math.max(240, Math.round(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    window.scrollTo(0, start);
  });
  await page.waitForTimeout(300);
}

async function shot(page, name, { fullPage = true } = {}) {
  if (fullPage) await reveal(page);
  await page.waitForTimeout(350);
  await measure(page, name);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage });
}

async function login(page, account) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  const menu = page.getByRole('button', { name: 'فتح القائمة' });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  const loginButton = page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).filter({ visible: true }).first();
  await loginButton.click();
  await page.locator('#auth-email').waitFor();
  await page.locator('#auth-email').fill(account.email);
  await page.locator('#auth-password').fill(account.password);
  await page.locator('form').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await page.getByRole('heading', { name: /نورة|أهلاً/ }).first().waitFor({ timeout: 15000 });
}

async function nav(page, label) {
  await page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first().click();
  await page.waitForTimeout(800);
}

const desktop = await newPage({ width: 1440, height: 1000 });
await desktop.page.goto(APP, { waitUntil: 'networkidle' });
await shot(desktop.page, '01-landing-desktop');
await desktop.page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).filter({ visible: true }).first().click();
await desktop.page.locator('#auth-email').waitFor();
await shot(desktop.page, '02-auth-desktop');
await login(desktop.page, seed.teacher);
await shot(desktop.page, '03-teacher-dashboard-desktop');
await nav(desktop.page, 'الامتحانات');
await shot(desktop.page, '04-exams-desktop');
await desktop.page.getByText(seed.exams.math.title, { exact: true }).first().click();
await desktop.page.getByRole('heading', { name: seed.exams.math.title }).first().waitFor();
await shot(desktop.page, '05-exam-detail-desktop');
await nav(desktop.page, 'النتائج');
await shot(desktop.page, '06-results-desktop');
await nav(desktop.page, 'مراجعة المقالات');
await shot(desktop.page, '07-essays-desktop');
await nav(desktop.page, 'سجل النشاط');
await shot(desktop.page, '08-audit-desktop');
await nav(desktop.page, 'إنشاء امتحان');
await shot(desktop.page, '09-create-desktop');
await desktop.context.close();

const dark = await newPage({ width: 1440, height: 1000 });
await dark.page.addInitScript(() => localStorage.setItem('emtehani-theme', 'dark'));
await login(dark.page, seed.teacher);
await shot(dark.page, '10-teacher-dashboard-dark');
await dark.context.close();

const mobile = await newPage({ width: 390, height: 844 });
await mobile.page.goto(APP, { waitUntil: 'networkidle' });
await shot(mobile.page, '11-landing-mobile');
await mobile.page.getByRole('button', { name: 'فتح القائمة' }).click();
await mobile.page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).filter({ visible: true }).first().click();
await mobile.page.locator('#auth-email').waitFor();
await shot(mobile.page, '12-auth-mobile');

await login(mobile.page, seed.teacher);
await shot(mobile.page, '13-teacher-dashboard-mobile');
await mobile.page.getByRole('button', { name: 'فتح القائمة' }).click();
await mobile.page.getByRole('button', { name: 'الامتحانات', exact: true }).filter({ visible: true }).last().click();
await mobile.page.waitForTimeout(700);
await shot(mobile.page, '14-exams-mobile');
await mobile.page.getByText(seed.exams.math.title, { exact: true }).filter({ visible: true }).first().click();
await mobile.page.getByRole('heading', { name: seed.exams.math.title }).first().waitFor();
await shot(mobile.page, '15-exam-detail-mobile');
await mobile.context.close();

const student = await newPage({ width: 1440, height: 1000 });
await login(student.page, seed.students[0]);
await shot(student.page, '16-student-dashboard-desktop');
await nav(student.page, 'نتائجي');
await shot(student.page, '17-student-results-desktop');
await student.context.close();

const studentMobile = await newPage({ width: 390, height: 844 });
await login(studentMobile.page, seed.students[0]);
await shot(studentMobile.page, '18-student-dashboard-mobile');
await studentMobile.page.getByRole('button', { name: 'فتح القائمة' }).click();
const studentDrawer = studentMobile.page.getByRole('dialog', { name: 'قائمة التنقل' });
await studentDrawer.getByRole('button', { name: 'دخول امتحان', exact: true }).click();
await studentMobile.page.waitForTimeout(700);
await shot(studentMobile.page, '19-join-mobile');
await studentMobile.context.close();

const narrow = await newPage({ width: 320, height: 760 });
await narrow.page.goto(APP, { waitUntil: 'networkidle' });
await shot(narrow.page, '20-landing-320');
await login(narrow.page, seed.teacher);
await shot(narrow.page, '21-teacher-dashboard-320');
await narrow.page.getByRole('button', { name: 'فتح القائمة' }).click();
const narrowDrawer = narrow.page.getByRole('dialog', { name: 'قائمة التنقل' });
await narrowDrawer.getByRole('button', { name: 'الامتحانات', exact: true }).click();
await narrow.page.waitForTimeout(700);
await shot(narrow.page, '22-exams-320');
await narrow.page.getByText(seed.exams.math.title, { exact: true }).filter({ visible: true }).first().click();
await narrow.page.getByRole('heading', { name: seed.exams.math.title }).first().waitFor();
await shot(narrow.page, '23-exam-detail-320');
await narrow.context.close();

await browser.close();
console.log(`Screenshots: ${outDir}`);
