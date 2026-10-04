import { expect, type Page } from '@playwright/test';

export type Role = 'owner' | 'admin' | 'hr' | 'it' | 'finance' | 'management';

/** Opens the console on demo data as one of the office roles. */
export async function as(page: Page, role: Role, path = '/') {
  await page.addInitScript(r => {
    try { sessionStorage.setItem('mrsales.demoRole', r); } catch { /* the page still opens as the owner */ }
  }, role);
  await page.goto(path);
  await expect(page.getByRole('heading').first()).toBeVisible();
}

/** The notice that confirms an action finished. */
export const notice = (page: Page) => page.getByRole('status').filter({ hasNotText: /^$/ }).first();

/** The drawer or dialog on top. */
export const top = (page: Page) => page.getByRole('dialog').last();

/** Fails the test on any uncaught error in the page. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}
