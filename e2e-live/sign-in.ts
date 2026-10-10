/**
 * Signs in once per role through the real sign-in form and keeps the session,
 * so the tests do not sign in a hundred times and trip the rate limit.
 */
import { chromium, expect, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { haveLogins, LIVE_ROLES, stateFor } from './roles';

export default async function signIn(config: FullConfig) {
  if (!haveLogins()) return;
  const baseURL = config.projects[0].use.baseURL!;
  mkdirSync('e2e-live/.auth', { recursive: true });
  const browser = await chromium.launch(config.projects[0].use.launchOptions);
  for (const { role, emailVar } of LIVE_ROLES) {
    const page = await browser.newPage();
    await page.goto(baseURL);
    await page.getByLabel('Work email').fill(process.env[emailVar]!);
    await page.getByLabel('Password', { exact: true }).fill(process.env.TESTBED_PASSWORD!);
    await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page.getByLabel('Work email'), `${role} signs in: ${await page.locator('[role=alert], .auth-error, .field-error').allInnerTexts().catch(() => [])}`)
      .toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
    await page.context().storageState({ path: stateFor(role) });
    await page.close();
  }
  await browser.close();
}
