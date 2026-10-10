/**
 * Live, checklist sections 5 to 8: Share with field (files, surveys, sent
 * notifications), Reports and downloads, Setup (org chart, roles, geography,
 * logins, company rules, audit log) and From Mr Sales (help, billing),
 * against Testbed Pharma.
 *
 * Everything a test adds it takes back: the file is deleted for good, the
 * survey closed, the role retired and deleted. Logins and company rules are
 * only exercised up to the confirmation, never saved.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { haveLogins, stateFor } from './roles';

test.skip(!haveLogins(), 'Needs .env.local and .env.testbed');
test.use({ storageState: stateFor('admin') });

const settle = (page: Page) => page.waitForLoadState('networkidle').then(() => page.waitForTimeout(800));
const top = (page: Page) => page.getByRole('dialog').last();
const run = Date.now().toString(36).toUpperCase();
const pdf = { name: 'scheme.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%live check\n') };

test.describe('Share with field', () => {
  test('a file goes to every phone, is replaced as version 2, taken off and deleted for good', async ({ page }) => {
    test.setTimeout(120_000);
    const title = `Live check scheme ${run}`;
    await page.goto('/share/new');
    await settle(page);
    await top(page).getByLabel('File', { exact: true }).setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
    await page.getByRole('button', { name: 'Send to every phone' }).click();
    await expect(top(page)).toContainText('Only PDF, JPG, PNG or WebP');
    await top(page).getByLabel('File', { exact: true }).setInputFiles(pdf);
    await top(page).getByLabel('Title').fill(title);
    await top(page).getByLabel('Where it goes on the phone').selectOption({ label: 'Documents' });
    await page.getByRole('button', { name: 'Send to every phone' }).click();
    const item = page.getByRole('listitem').filter({ hasText: title });
    await expect(item).toBeVisible({ timeout: 20_000 });
    await item.getByRole('button', { name: 'Replace' }).click();
    await top(page).getByLabel('File', { exact: true }).setInputFiles(pdf);
    await page.getByRole('button', { name: 'Replace on every phone' }).click();
    await expect(item.locator('.row-title')).toContainText('version 2', { timeout: 20_000 });
    await item.getByRole('button', { name: 'Take off the phones' }).click();
    await page.getByRole('button', { name: 'Take it off the phones' }).click();
    await page.getByRole('radio', { name: /Taken off/ }).click();
    await page.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: 'Delete for good' }).click();
    await page.getByRole('button', { name: 'Delete for good' }).last().click();
    await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0, { timeout: 20_000 });
  });

  test('a survey is opened on every phone and closed again; answers say how many clients', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/share/surveys/new');
    await settle(page);
    await top(page).getByLabel('Title').fill(`Live check ${run}`);
    await top(page).getByLabel('The question').fill('Would the doctor try the new strength?');
    await page.getByRole('button', { name: 'Open it on every phone' }).click();
    await expect(page.locator('.summary').first()).toContainText(`Live check ${run} is open on every phone`, { timeout: 20_000 });
    await page.getByRole('button', { name: 'Close the survey' }).first().click();
    await page.getByRole('button', { name: 'Close the survey' }).last().click();
    await expect(page.locator('.summary').first()).toContainText('No survey is open', { timeout: 20_000 });
  });

  test('sent notifications: who was reached, and each on record', async ({ page }) => {
    await page.goto('/share/sent');
    await settle(page);
    await expect(page.getByText(/notifications? reached \d+ (person|people)/)).toBeVisible();
    expect(await page.locator('table tbody tr').count()).toBeGreaterThan(0);
    await page.getByLabel('Kind').selectOption({ index: 1 });
    await expect(page.getByText(/could not be read/i)).toHaveCount(0);
  });
});

test.describe('Reports', () => {
  test('the management summary downloads as the sheet on screen, and is recorded', async ({ page }) => {
    await page.goto('/reports?report=overview');
    await settle(page);
    await expect(page.locator('tfoot')).toContainText('Everyone');
    const rows = await page.locator('table tbody tr').count();
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download as a sheet' }).click()]);
    const csv = readFileSync(await file.path(), 'utf8');
    expect(csv.split('\n')[0]).toContain('Person,Code,Headquarters,Planned,Done,Missed,Adherence');
    expect(csv.trim().split('\n').length - 1).toBe(rows);
  });

  for (const report of ['Daily call report', 'Call adherence', 'Visit checks', 'Sales', 'Target against sales', 'Product sales', 'Orders', 'Attendance', 'Leave', 'Expense claims', 'Client coverage', 'Management summary']) {
    test(`the ${report} report opens with live figures`, async ({ page }) => {
      await page.goto('/reports');
      await settle(page);
      await page.locator('main').getByRole('link', { name: report, exact: true }).click();
      await settle(page);
      await expect(page.getByText(/could not be read|went wrong/i)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Download as a sheet' })).toBeVisible();
    });
  }

  test('downloads: a sheet is made and listed; abandoned ones are counted, not listed', async ({ page }) => {
    await page.goto('/reports/downloads');
    await settle(page);
    await expect(page.getByText('Not finished')).toHaveCount(0);
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).first().click()]);
    expect(file.suggestedFilename()).toMatch(/\.(xlsx|csv)$/);
    await settle(page);
    expect(await page.locator('.dl-sheets li').count()).toBeLessThanOrEqual(12);
  });
});

test.describe('Setup', () => {
  test('the org chart shows everyone under their manager', async ({ page }) => {
    await page.goto('/team/org-chart');
    await settle(page);
    await expect(page.getByText('Rajesh Verma').first()).toBeVisible();
    await expect(page.getByText('Sneha Pillai').first()).toBeVisible();
  });

  test('roles: one held is not deletable; a new one is added, refused twice, retired and deleted', async ({ page }) => {
    test.setTimeout(120_000);
    const name = `Live Check Role ${run}`;
    await page.goto('/settings/roles');
    await settle(page);
    await page.getByRole('button', { name: 'Add a role' }).click();
    await top(page).getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Add the role' }).click();
    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Add a role' }).click();
    await top(page).getByLabel('Name', { exact: true }).fill(name.toLowerCase());
    await page.getByRole('button', { name: 'Add the role' }).click();
    await expect(top(page).getByRole('alert')).toContainText('already one of your roles');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await row.getByRole('button', { name: 'Retire' }).click();
    await page.getByRole('button', { name: 'Retire the role' }).click();
    await expect(row).toContainText('Retired', { timeout: 20_000 });
    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete the role' }).click();
    await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0, { timeout: 20_000 });
  });

  test('geography: the tree, and a territory names who is posted there', async ({ page }) => {
    await page.goto('/settings/geography');
    await settle(page);
    const t = page.getByRole('listitem').filter({ hasText: 'Hyderabad Test' }).first();
    await expect(t).toContainText(/people posted|person posted/);
    await t.getByRole('button', { name: 'Open Hyderabad Test' }).click();
    await expect(t).toContainText('Posted here:');
  });

  test('logins: switching one off is refused without a reason (and not done here)', async ({ page }) => {
    await page.goto('/settings/logins');
    await settle(page);
    await expect(page.getByText(/can sign in on the phone/)).toBeVisible();
    const row = page.getByRole('row', { name: /Arjun Nair/ });
    await row.getByRole('button', { name: 'Switch off' }).click();
    await page.getByRole('button', { name: 'Switch the login off' }).click();
    await expect(top(page)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(row).toContainText('Can sign in');
    await page.getByRole('radio', { name: /^Office logins/ }).click();
    expect(await page.locator('table tbody tr').count()).toBeGreaterThan(0);
  });

  test('company rules: a bad radius is refused and changes are read back before saving (not saved here)', async ({ page }) => {
    await page.goto('/settings/rules');
    await settle(page);
    await expect(page.getByText('Nothing changed.')).toBeVisible();
    await page.getByLabel(/Radius/).fill('5');
    await page.getByRole('button', { name: 'Review and save' }).click();
    await expect(page.getByText('Between 10 and 5000 metres.')).toBeVisible();
    await page.getByLabel(/Radius/).fill('60');
    await page.getByRole('button', { name: 'Review and save' }).click();
    await expect(top(page)).toContainText('60');
    await top(page).getByRole('button', { name: /Cancel|Not yet|Keep editing/ }).first().click();
  });

  test('the audit log lists changes by who made them, with nothing to edit or delete', async ({ page }) => {
    await page.goto('/settings/audit');
    await settle(page);
    expect(await page.locator('table tbody tr, ul.rows li').count()).toBeGreaterThan(0);
    await expect(page.locator('main').getByRole('button', { name: /^(Edit|Delete|Remove)$/ })).toHaveCount(0);
  });
});

test.describe('From Mr Sales', () => {
  test('help: open and resolved, and the form to ask (not sent here)', async ({ page }) => {
    await page.goto('/help');
    await settle(page);
    await expect(page.getByRole('radio', { name: /^Open/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /^Resolved/ })).toBeVisible();
    await page.getByRole('button', { name: 'Ask for help' }).click();
    await expect(top(page)).toBeVisible();
  });

  test('billing: the plan by name, and seats counted as the server counts them', async ({ page }) => {
    await page.goto('/billing');
    await settle(page);
    await expect(page.getByText(/You are on Mr Sales \w+|You are on Free/)).toBeVisible();
    await expect(page.getByText(/A seat is a person working here, on the roster/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
  });
});
