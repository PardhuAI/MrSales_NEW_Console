/**
 * Live: signing out. Last in the run (files go in name order) because the
 * console signs a login out everywhere, which ends the session the other
 * tests share.
 */
import { expect, test } from '@playwright/test';
import { haveLogins } from './roles';

test.skip(!haveLogins(), 'Needs .env.local and .env.testbed');

test('signing out ends the session, and a reload stays signed out', async ({ page }) => {
    await page.goto('/');
  await page.getByLabel('Work email').fill(process.env.TESTBED_ADMIN_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.TESTBED_PASSWORD!);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
    await expect(page.getByLabel('Work email')).toHaveCount(0, { timeout: 20_000 });
    await page.getByRole('button', { name: /account and appearance/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByLabel('Work email')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Work email')).toBeVisible();
  });
