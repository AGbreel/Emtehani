import { defineConfig, devices } from '@playwright/test';

// Audit config for the already-running local services
export default defineConfig({
  testDir: './e2e',
  testMatch: /qa-running-audit\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    // No webServer — services already running on 5000/5173
    baseURL: 'http://127.0.0.1:5173',
    locale: 'ar-EG',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
});
