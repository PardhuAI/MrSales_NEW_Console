/**
 * The live suite: the console against the real backend, signed in to Testbed
 * Pharma as each office role. Testbed Pharma is a throwaway organisation in
 * the development project; nothing here touches another company.
 *
 *     npx playwright test -c playwright.live.config.ts
 *
 * Needs `.env.local` (the project's URL and publishable key) and
 * `.env.testbed` (one login per office role), both kept out of git. Without
 * them every test is skipped rather than failed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

for (const file of ['.env.local', '.env.testbed']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

const PORT = Number(process.env.E2E_LIVE_PORT ?? 8932);
const CHROMIUM = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './e2e-live',
  globalSetup: './e2e-live/sign-in.ts',
  globalTeardown: './e2e-live/sign-out.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    ...(existsSync(CHROMIUM) ? { launchOptions: { executablePath: CHROMIUM } } : {}),
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
