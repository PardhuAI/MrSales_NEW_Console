/**
 * Live: a page says when its figures were read, refreshes on request, and a
 * refresh that fails says so while keeping what was read before.
 */
import { expect, test } from '@playwright/test';
import { haveLogins, stateFor } from './roles';

test.skip(!haveLogins(), 'Needs .env.local and .env.testbed');
test.use({ storageState: stateFor('admin') });

test('Today says when it was read, refreshes, and a failed refresh is said plainly', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.live-tag')).toContainText(/Updated (just now|a minute ago|\d+ minutes ago)/);

  const refresh = page.getByRole('button', { name: 'Refresh the dashboard' });
  // A click during a refresh joins it, so the next one waits for this one's
  // reads to come back (the page was already idle when it was clicked).
  const done = page.waitForResponse(r => r.url().includes('/rest/v1/targets'));
  await refresh.click();
  await done;
  // networkidle fires once per page load, not per refresh: a short settle lets
  // the rest of this refresh's reads land.
  await page.waitForTimeout(1500);
  await expect(page.locator('.live-error')).toHaveCount(0);

  // The next refresh cannot reach the database.
  await page.route('**/rest/v1/**', route => route.abort('internetdisconnected'));
  await refresh.click();
  // The database client retries each read before it gives up (about 7 s).
  await expect(page.locator('.live-error')).toHaveText('The last refresh failed; showing what was read before.', { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
});
