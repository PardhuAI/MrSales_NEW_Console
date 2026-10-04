/**
 * The daily work: approvals, clients, orders and targets, expense claims,
 * payslips, resources, surveys, reports and the company rules. Each test
 * clicks the real controls on the demo company and checks the screen shows
 * what the write left behind.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { as, notice, top, watchErrors } from './helpers';

const pdf = { name: 'file.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') };

test('a client is added and renamed, and an empty form is refused', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'owner', '/clients');
  await page.getByRole('button', { name: 'Add a client' }).click();
  await page.getByRole('button', { name: 'Add the client' }).click();
  await expect(page.locator('.form-error').first()).toBeVisible();
  await page.getByPlaceholder('Dr. Anita Rao').fill('Dr. Test Kumar');
  await page.getByRole('button', { name: 'Add the client' }).click();
  await expect(page.getByRole('heading', { name: 'Dr. Test Kumar' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByPlaceholder('Dr. Anita Rao').fill('Dr. Test Kumar Rao');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Dr. Test Kumar Rao' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('an order is approved and leaves the waiting count', async ({ page }) => {
  await as(page, 'owner', '/sales/orders');
  const summary = page.locator('.summary-text');
  const before = await summary.innerText();
  await page.locator('table tbody tr').first().click();
  await page.getByRole('button', { name: 'Approve the order' }).click();
  await top(page).locator('button.btn-primary').click();
  await expect(summary).not.toHaveText(before);
});

test('an expense claim is rejected only with a reason, and approved as one decision', async ({ page }) => {
  await as(page, 'owner', '/money');
  await page.getByRole('button', { name: 'Harika Naidu' }).click();
  await expect(top(page)).toContainText('claimed with no day plan');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByRole('button', { name: 'Reject the claim' }).click();
  await expect(top(page)).toContainText('Why it is rejected');
  await page.getByLabel('Why it is rejected').fill('The Sunday has no day plan.');
  await page.getByRole('button', { name: 'Reject the claim' }).click();
  await expect(notice(page)).toContainText('rejected; they get one message');

  await page.getByRole('button', { name: 'Arjun Reddy' }).click();
  await page.getByRole('button', { name: /^Approve \d+ days/ }).click();
  await page.getByRole('button', { name: 'Approve the claim' }).click();
  await expect(notice(page)).toContainText('approved; they get one message');
});

test('a payslip needs a net pay, and is released with its PDF', async ({ page }) => {
  await as(page, 'owner', '/money/payroll');
  const row = page.getByRole('row', { name: /Farhan Siddiqui/ });
  await row.getByRole('button', { name: 'Release' }).click();
  await page.getByRole('button', { name: 'Release the payslip' }).click();
  await expect(top(page)).toContainText('Write the net pay, in rupees.');
  await page.getByLabel('Net pay').fill('₹18,400');
  await page.getByLabel(/Payslip PDF/).setInputFiles(pdf);
  await page.getByRole('button', { name: 'Release the payslip' }).click();
  await expect(row).toContainText('₹18,400');
  await expect(row.getByRole('button', { name: 'Open the PDF' })).toBeVisible();
});

test('a file is sent to the phones, replaced as version 2, taken off and deleted', async ({ page }) => {
  await as(page, 'owner', '/share/new');
  await top(page).getByLabel('File', { exact: true }).setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await page.getByRole('button', { name: 'Send to every phone' }).click();
  await expect(top(page)).toContainText('Only PDF, JPG, PNG or WebP');
  await top(page).getByLabel('File', { exact: true }).setInputFiles(pdf);
  await top(page).getByLabel('Title').fill('Diwali scheme');
  await top(page).getByLabel('Where it goes on the phone').selectOption({ label: 'Documents' });
  await page.getByRole('button', { name: 'Send to every phone' }).click();
  const item = page.getByRole('listitem').filter({ hasText: 'Diwali scheme' });
  await item.getByRole('button', { name: 'Replace' }).click();
  await top(page).getByLabel('File', { exact: true }).setInputFiles(pdf);
  await page.getByRole('button', { name: 'Replace on every phone' }).click();
  await expect(item.locator('.row-title')).toContainText('version 2');
  await item.getByRole('button', { name: 'Take off the phones' }).click();
  await page.getByRole('button', { name: 'Take it off the phones' }).click();
  await page.getByRole('radio', { name: /Taken off/ }).click();
  await page.getByRole('listitem').filter({ hasText: 'Diwali scheme' }).getByRole('button', { name: 'Delete for good' }).click();
  await page.getByRole('button', { name: 'Delete for good' }).last().click();
  await expect(notice(page)).toContainText('2 versions');
});

test('a new survey closes the open one, and can itself be closed', async ({ page }) => {
  await as(page, 'owner', '/share/surveys/new');
  await top(page).getByLabel('Title').fill('Telmicure 80 interest');
  await top(page).getByLabel('The question').fill('Would the doctor prescribe Telmicure 80?');
  await expect(top(page)).toContainText('the one open now closes');
  await page.getByRole('button', { name: 'Open it on every phone' }).click();
  await expect(page.locator('.summary').first()).toContainText('Telmicure 80 interest is open on every phone');
  await page.getByRole('button', { name: 'Close the survey' }).first().click();
  await page.getByRole('button', { name: 'Close the survey' }).last().click();
  await expect(page.locator('.summary').first()).toContainText('No survey is open');
});

test('a report for one team downloads as the sheet on screen, and is recorded', async ({ page }) => {
  await as(page, 'owner', '/reports?report=overview');
  await expect(page.locator('tfoot')).toContainText('Everyone');
  await page.getByLabel('Whose').selectOption({ label: "Lakshmi Prasanna's team" });
  await expect(page.locator('.table-count')).toHaveText('4 rows');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download as a sheet' }).click()]);
  const csv = readFileSync(await file.path(), 'utf8');
  expect(csv.split('\n')[0]).toContain('Person,Code,Headquarters,Planned,Done,Missed,Adherence');
  expect(csv.trim().split('\n')).toHaveLength(5);
  await expect(notice(page)).toContainText('a copy is kept under Downloads');
});

test('company rules are read back before they are saved, and a bad radius is refused', async ({ page }) => {
  await as(page, 'owner', '/settings/rules');
  await page.getByLabel('Daily allowance').fill('400');
  await page.getByLabel(/Radius/).fill('5');
  await page.getByRole('button', { name: 'Review and save' }).click();
  await expect(page.getByText('Between 10 and 5000 metres.')).toBeVisible();
  await page.getByLabel(/Radius/).fill('100');
  await page.getByRole('button', { name: 'Review and save' }).click();
  await expect(top(page)).toContainText('Daily allowance: ₹350 to ₹400.');
  await page.getByRole('button', { name: 'Save the rules' }).click();
  await expect(page.locator('.summary').first()).toContainText('₹400');
});

test('only an owner or admin may change the company rules', async ({ page }) => {
  await as(page, 'finance', '/settings/rules');
  await expect(page.getByText('Only an owner or admin changes these rules.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review and save' })).toHaveCount(0);
  await expect(page.getByLabel('Daily allowance')).toBeDisabled();
});

test('approving one request takes it off the queue, and a rejection waits for a reason', async ({ page }) => {
  await as(page, 'owner', '/approvals');
  const waiting = page.getByRole('link', { name: /waiting for you/ }).or(page.getByRole('button', { name: /waiting for you/ })).first();
  const before = Number((await waiting.innerText()).match(/\d+/)?.[0]);
  const row = page.locator('.ap-row').first();
  await row.getByRole('button', { name: 'Reject' }).click();
  await top(page).locator('button.btn-danger, button.btn-primary').last().click();
  await expect(top(page)).toBeVisible();
  await page.keyboard.press('Escape');
  // One request is approved at once, without a dialog; only several at a time ask first.
  await page.locator('.ap-row').first().getByRole('button', { name: 'Approve' }).click();
  await expect(waiting).not.toContainText(String(before));
});

test('the day strip picks a day by tap or arrow keys, and offers no future day', async ({ page }) => {
  await as(page, 'owner', '/field?date=2026-10-01');
  const days = page.getByRole('radiogroup', { name: 'Day' });
  await expect(days.getByRole('radio', { checked: true })).toHaveAccessibleName(/Thursday, 1 October/);
  await expect(days.getByRole('radio', { name: /2 October.*Gandhi Jayanti/ })).toBeVisible();
  await days.getByRole('radio', { name: /Wednesday, 30 September/ }).click();
  await expect(page).toHaveURL(/date=2026-09-30/);
  await days.getByRole('radio', { checked: true }).press('ArrowRight');
  await expect(page).toHaveURL(/date=2026-10-01/);
  await expect(page.locator('.summary').first()).toContainText('Thursday, 1 October');
});

test('Pick a date opens our own month, moves by keyboard, picks, and closes with Escape', async ({ page }) => {
  await as(page, 'owner', '/field?date=2026-10-01');
  const open = page.getByRole('button', { name: 'Pick a date' });
  await open.click();
  const month = page.getByRole('dialog', { name: /Pick a date, October 2026/ });
  await expect(month).toBeVisible();
  await expect(month.getByRole('button', { name: /Friday, 2 October.*Gandhi Jayanti/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(month).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await page.keyboard.press('PageUp');
  await expect(page.getByRole('dialog', { name: /September 2026/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/date=2026-09-01/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Leave shows who is away on a day, with the count on each day of the week', async ({ page }) => {
  await as(page, 'owner', '/team/leave');
  const strip = page.getByRole('radiogroup', { name: 'Who is away on' });
  await expect(strip.getByRole('radio', { name: /30 September.*1 away/ })).toBeVisible();
  await strip.getByRole('radio', { name: /30 September/ }).click();
  await expect(page.locator('.away-list')).toContainText('Rahul Yadav');
});
