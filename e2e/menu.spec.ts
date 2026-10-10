/**
 * The phone menu keeps the keyboard inside it while it is open and hands focus
 * back to its button when it closes. The page behind it once stayed reachable,
 * so Tab walked out of the open menu into the page underneath.
 */
import { expect, test } from '@playwright/test';
import { as } from './helpers';

test('on a phone the open menu keeps focus inside and closes back to its button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await as(page, 'owner');
  const open = page.getByRole('button', { name: 'Open menu' });
  await open.click();
  await expect(page.locator('#console-menu')).toBeVisible();
  // Checked after every press: enough presses wrap round back into the menu,
  // so only the path shows whether focus ever left it.
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.closest('#console-menu') ? 'menu' : `${el?.tagName.toLowerCase()}.${el?.className}`;
    });
    expect(where, `after ${i + 1} presses of Tab`).toBe('menu');
  }
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
});
