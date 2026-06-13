import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration voor Logo Recognition Project
 *
 * Deze configuratie gebruikt MCP (Model Context Protocol) voor geavanceerde
 * browser automation en testing capabilities.
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list']
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    // Use port 5173 (Vite default) to avoid conflict with other apps on 3000
    baseURL: process.env.BASE_URL || 'http://localhost:5173',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Timeout for each action
    actionTimeout: 10000,
  },

  // CI installs only chromium (playwright install --with-deps chromium); the
  // other browsers would fail to launch. Keep a single project so the suite is
  // deterministic and matches the installed browser.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the frontend automatically. The E2E job (and a local run) bring up the
  // backend stack separately; the frontend talks to it via the proxy/baseURL.
  // reuseExistingServer locally so a dev server you already have is reused; in CI
  // it always starts fresh.
  webServer: {
    command: 'pnpm --filter @logo-recognition/web dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
