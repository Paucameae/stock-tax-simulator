import { defineConfig, devices } from '@playwright/test';

// Minimal browser-side safety net. The jsdom journeys in `src/__tests__` cover
// the functional path; this config exists to catch what jsdom cannot see —
// the real bundle, the lazy chunks and the workers actually loading.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Preview serves the production build: that is the artefact users get, and
  // the only way a broken chunk split or a stale worker path shows up.
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
