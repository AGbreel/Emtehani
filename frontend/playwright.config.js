import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT || '5099';
const appPort = process.env.E2E_APP_PORT || '4173';
const apiUrl = `http://127.0.0.1:${apiPort}`;
const appUrl = `http://127.0.0.1:${appPort}`;
const connection = process.env.E2E_DATABASE_CONNECTION
  || 'Host=127.0.0.1;Port=55432;Database=emtehani_e2e;Username=postgres;SSL Mode=Disable';

export default defineConfig({
  testDir: './e2e',
  // This audit targets already-running services on fixed ports (5000/5173) and is
  // executed through playwright.qa.config.js instead of the managed E2E harness.
  testIgnore: ['**/qa-running-audit.spec.js'],
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: appUrl,
    locale: 'ar-EG',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node e2e/start-api.mjs',
      url: `${apiUrl}/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        E2E_API_PORT: apiPort,
        E2E_DATABASE_CONNECTION: connection,
        E2E_FRONTEND_ORIGIN: appUrl,
        E2E_PUBLIC_API_URL: apiUrl,
      },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${appPort}`,
      url: appUrl,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: { ...process.env, VITE_API_URL: apiUrl },
    },
  ],
});
