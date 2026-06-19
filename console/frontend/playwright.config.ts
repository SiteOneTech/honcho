import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke configuration for the Honcho Memory Console shell.
 *
 * The webServer builds the production bundle and serves it via `vite preview`
 * so the smoke exercises the same artifact that ships, not the dev server.
 * Set PLAYWRIGHT_BASE_URL to point the smoke at an already-running instance.
 */
const PORT = 4178;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './smoke',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
        url: baseURL,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
