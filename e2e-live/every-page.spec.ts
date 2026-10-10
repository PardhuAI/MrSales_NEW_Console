/**
 * Live: every page opens for every Testbed role granted it, reads its data
 * without an error, and the pages outside a role say why instead of breaking.
 * The same specification as e2e/every-page.spec.ts, against the real backend.
 */
import { expect, test } from '@playwright/test';
import { can, pages } from '../e2e/grants';
import { haveLogins, LIVE_ROLES, stateFor } from './roles';

test.skip(!haveLogins(), 'Needs .env.local and .env.testbed');

for (const { role } of LIVE_ROLES) {
  test.describe(role, () => {
    test.use({ storageState: stateFor(role) });
    test(`every page ${role} may open reads live data; the rest say why not`, async ({ page }) => {
      test.setTimeout(300_000);
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      const failed: string[] = [];
      for (const p of pages) {
        await page.goto(p.path);
        await expect(page.getByRole('heading', { level: 1 }).first(), p.path).toBeVisible();
        // Live reads finish after the heading; give them time to fail if they will.
        await page.waitForLoadState('networkidle').catch(() => {});
        if (can(role, p.module)) {
          if (await page.getByText(/is not open to your role|There is no page here|being rebuilt/).count()) failed.push(`${p.path}: refused or missing`);
          if (await page.getByText(/could not be read|Could not read|went wrong/i).count()) failed.push(`${p.path}: a read failed`);
        } else if (!(await page.getByText(`${p.label} is not open to your role`).count())) {
          failed.push(`${p.path}: opened for a role it is not granted to`);
        }
        if (errors.length) failed.push(`${p.path}: ${errors.splice(0).join('; ')}`);
      }
      expect(failed, failed.join('\n')).toEqual([]);
    });
  });
}
