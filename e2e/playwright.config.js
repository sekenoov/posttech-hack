const { defineConfig, devices } = require('@playwright/test');

// Runs against a live `docker compose up` stack.
//   E2E_BASE_URL  default http://localhost:3000
//   E2E_RESET=1   re-seed the demo database before the run (demo env only)
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  globalSetup: require.resolve('./global-setup.js'),
  outputDir: './test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
