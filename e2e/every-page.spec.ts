/**
 * Every page opens, without an error, for every role it is granted to; and a
 * page outside a role says which permission it needs instead of breaking.
 * The grants are the old console's matrix (src/app/access.ts).
 */
import { expect, test } from '@playwright/test';
import { as, watchErrors } from './helpers';
import { can, pages, type Role } from './grants';

test('the menu was read', () => expect(pages.length).toBeGreaterThan(35));
const roles: Role[] = ['owner', 'admin', 'hr', 'it', 'finance', 'management'];

for (const role of roles) {
  test(`every page ${role} may open renders, and the rest say why not`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await as(page, role);
    for (const p of pages) {
      await page.goto(p.path);
      if (can(role, p.module)) {
        await expect(page.getByRole('heading', { level: 1 }).first(), p.path).toBeVisible();
        await expect(page.getByText(/is not open to your role|There is no page here|being rebuilt/), p.path).toHaveCount(0);
        await expect(page.getByText(/could not be read|Could not read/), p.path).toHaveCount(0);
      } else {
        await expect(page.getByText(`${p.label} is not open to your role`), p.path).toBeVisible();
      }
      expect(errors, `${p.path} as ${role}`).toEqual([]);
    }
  });
}

test('no page scrolls sideways on a phone', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await as(page, 'owner');
  for (const p of pages) {
    await page.goto(p.path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.waitForTimeout(250);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(over, p.path).toBeLessThanOrEqual(0);
  }
});
