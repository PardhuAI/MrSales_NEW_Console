/**
 * Live, checklist section 3: Sales, Orders, Targets, Products, Stockists,
 * Prescription audit and Stock, against Testbed Pharma.
 *
 * What a test adds it takes back: the product it adds is retired, the
 * stockist taken off the list, and the stock batch written off in full.
 */
import { expect, test, type Page } from '@playwright/test';
import { haveLogins, stateFor } from './roles';

test.skip(!haveLogins(), 'Needs .env.local and .env.testbed');
test.use({ storageState: stateFor('admin') });

const settle = (page: Page) => page.waitForLoadState('networkidle').then(() => page.waitForTimeout(800));
const run = Date.now().toString(36).toUpperCase();
const drawer = (page: Page) => page.getByRole('dialog');

test('sales: the month against target, twelve months, and by person', async ({ page }) => {
  await page.goto('/sales');
  await settle(page);
  await expect(page.getByText(/sold in \w+/).first()).toBeVisible();
  await expect(page.getByText(/in primary sales and .* from approved field orders, before GST/)).toBeVisible();
  for (const legend of ['Primary sales', 'Field orders', 'Target']) await expect(page.getByText(legend, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /^By person,/ })).toBeVisible();
  await page.locator('table', { has: page.getByRole('columnheader', { name: 'Person' }) }).locator('tbody tr').first().click();
  await expect(drawer(page)).toBeVisible();
});

test('orders: filters by status and stockist, and an order shows its lines, tax and total', async ({ page }) => {
  await page.goto('/sales/orders');
  await settle(page);
  await expect(page.getByText(/orders? worth ₹[\d,]+ with GST/)).toBeVisible();
  const rows = page.locator('table tbody tr');
  const all = await rows.count();
  expect(all).toBeGreaterThan(0);
  await page.getByRole('radio', { name: /^Rejected/ }).click();
  await expect.poll(() => rows.count()).toBeLessThanOrEqual(all);
  await page.getByRole('radio', { name: /^All/ }).click();
  await expect(page.getByLabel('Stockist')).toBeVisible();
  await rows.first().click();
  await expect(drawer(page).getByText(/GST/).first()).toBeVisible();
  await expect(drawer(page).getByText(/Total/i).first()).toBeVisible();
});

test('targets: a person by month grid, and the assign form for one person or everyone', async ({ page }) => {
  await page.goto('/sales/targets');
  await settle(page);
  await expect(page.getByRole('columnheader', { name: /now$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Assign a target' }).click();
  await expect(drawer(page).getByText('For', { exact: true })).toBeVisible();
  await expect(drawer(page).getByLabel('Month')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('products: add one with its pack, edit it, and retire it', async ({ page }) => {
  test.setTimeout(120_000);
  const code = `LIVE-${run}`;
  await page.goto('/sales/products');
  await settle(page);
  await page.getByRole('button', { name: 'Add a product' }).click();
  await drawer(page).getByPlaceholder('CLC-017').fill(code);
  await drawer(page).getByPlaceholder('10 tablets').fill('10 tablets');
  await drawer(page).getByPlaceholder('Cleopan 40').fill(`Live check ${run}`);
  await drawer(page).getByLabel('MRP').fill('120');
  await drawer(page).getByLabel('GST %').fill('12');
  await drawer(page).getByRole('button', { name: 'Add the product' }).click();
  const row = page.locator('table tbody tr', { hasText: code });
  await expect(row).toBeVisible({ timeout: 20_000 });

  await row.click();
  await expect(drawer(page).getByText('Fixed once the product exists')).toBeVisible();
  await drawer(page).getByPlaceholder('Cleopan 40').fill(`Live check ${run} edited`);
  await drawer(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('table tbody tr', { hasText: `Live check ${run} edited` })).toBeVisible({ timeout: 20_000 });

  await page.locator('table tbody tr', { hasText: code }).click();
  await drawer(page).getByRole('button', { name: 'Retired' }).click();
  await expect(page.locator('table tbody tr', { hasText: code })).toContainText('Retired', { timeout: 20_000 });
});

test('stockists: add one, then take it off the list', async ({ page }) => {
  test.setTimeout(120_000);
  const code = `STK-LIVE-${run}`;
  await page.goto('/sales/stockists');
  await settle(page);
  await page.getByRole('button', { name: 'Add a stockist' }).click();
  await drawer(page).getByPlaceholder('STK-HYD-03').fill(code);
  await drawer(page).getByLabel('Name').fill(`Live check distributors ${run}`);
  await drawer(page).getByLabel('City').fill('Hyderabad');
  await drawer(page).getByRole('button', { name: 'Add the stockist' }).click();
  const row = page.locator('table tbody tr', { hasText: code });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await drawer(page).getByRole('button', { name: 'Take off the list' }).click();
  // It asks first, naming what it does to the orders that already name it.
  await page.getByRole('alertdialog').or(page.getByRole('dialog').last()).getByRole('button', { name: 'Take off the list' }).last().click();
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: /^Off the list/ }).click();
  await expect(page.locator('table tbody tr', { hasText: code })).toBeVisible({ timeout: 20_000 });
});

test('prescription audit says when nothing is recorded', async ({ page }) => {
  await page.goto('/sales/prescriptions');
  await settle(page);
  await expect(page.getByText(/No audits recorded|our share|Our share/i).first()).toBeVisible();
});

test('stock: a batch arrives, and is written off in full', async ({ page }) => {
  test.setTimeout(120_000);
  const batch = `B${run}`;
  await page.goto('/sales/stock');
  await settle(page);
  await page.getByRole('button', { name: 'Record stock' }).click();
  await drawer(page).getByLabel('Product').selectOption({ index: 1 });
  await drawer(page).getByLabel('Batch number').fill(batch);
  const expiry = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
  await drawer(page).getByLabel('Expires').fill(expiry);
  await drawer(page).getByLabel('Units', { exact: true }).fill('40');
  await drawer(page).getByRole('button', { name: 'Record the stock' }).click();
  const row = page.locator('table tbody tr', { hasText: batch });
  await expect(row).toBeVisible({ timeout: 20_000 });

  await row.getByRole('button', { name: 'Change' }).click();
  await drawer(page).getByRole('radio', { name: 'Write some off' }).click();
  await drawer(page).getByLabel('Units to write off').fill('40');
  await drawer(page).getByRole('button', { name: 'Write off' }).click();
  await expect(page.locator('table tbody tr', { hasText: batch })).toHaveCount(0, { timeout: 20_000 });
});
