import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // `next build` alone can take well over a minute; give the full
    // build + typecheck + start sequence a generous window.
    timeout: 300 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
