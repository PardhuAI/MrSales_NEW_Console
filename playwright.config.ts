/**
 * End-to-end tests for the new console.
 *
 * They run against the demo company (Cleocure Lifesciences, in memory), so
 * they prove that every page opens for every role it is granted to, and that
 * each flow clicks through and writes what it should, without touching any
 * real organisation. They are the equivalents of Mr_Sales_Web/e2e, run on
 * demo data until this environment has the testbed credentials; the live run
 * against Testbed Pharma is still owed before the switch (FEATURE_CHECKLIST.md
 * section 10).
 *
 *     npm run e2e
 */
import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// The machine's own Chromium when there is one, rather than downloading another.
const CHROMIUM = '/opt/pw-browsers/chromium';

const PORT = 8921;

export default defineConfig({
  testDir: './e2e',
  workers: 2,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {},
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
