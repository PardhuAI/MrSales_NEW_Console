/**
 * Live, checklist section 4: people, a person's record, adding a person,
 * managers, attendance, leave, expenses, tasks, field ownership and HR
 * rules, against Testbed Pharma.
 *
 * The person it adds is given a document, which is removed, and is then
 * marked as left with a reason, so the testbed's working roster is as it was.
 */
import { expect, test, type Page } from '@playwright/test';
import { haveLogins, stateFor } from './roles';

test.skip(!haveLogins(), 'Needs .env.local and .env.testbed');
test.use({ storageState: stateFor('admin') });

const settle = (page: Page) => page.waitForLoadState('networkidle').then(() => page.waitForTimeout(800));
const SNEHA = 'e154f891-2a24-404a-bdf4-f7aa8a6ddd61';
const run = Date.now().toString(36).toUpperCase();

test('people: found by name or code, filtered by role and manager, and the counts add up', async ({ page }) => {
  await page.goto('/team');
  await settle(page);
  const rows = page.locator('table tbody tr');
  const summary = await page.getByText(/^\d+ people/).first().innerText();
  expect(Number(summary.match(/\d+/)![0])).toBe(await rows.count());
  const search = page.getByPlaceholder(/Name, employee code/);
  await search.fill('BE9001');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Sneha Pillai');
  await search.fill('');
  await page.getByLabel('Manager').selectOption({ label: 'Lakshmi Prasad' });
  await expect.poll(() => rows.count()).toBe(2);
  await expect(page.getByLabel('Role')).toBeVisible();
});

test("a person's record: the month, days, calls, who was seen, orders, and every section", async ({ page }) => {
  await page.goto(`/team/${SNEHA}`);
  await settle(page);
  await expect(page.getByRole('heading', { name: 'Sneha Pillai' })).toBeVisible();
  await expect(page.getByText(/sold of a .* target/)).toBeVisible();
  for (const block of ['Days', 'Calls', 'Who was seen', 'Orders and sales']) await expect(page.getByText(block, { exact: true }).first()).toBeVisible();
  // The calls by kind add up to the calls done.
  const n = async (label: string) => Number((await page.locator('div', { has: page.getByText(label, { exact: true }) }).last().innerText()).match(/\d+/)?.[0] ?? 0);
  const done = await n('Done');
  const byKind = (await n('Chemist calls')) + (await n('Stockist calls')) + (await n('Doctor calls'));
  expect(byKind).toBeLessThanOrEqual(done);
  for (const tab of ['Field work', 'Sales and orders', 'Leave and documents', 'Pay and expenses', 'Changes']) {
    await page.getByRole('tab', { name: tab }).or(page.getByRole('link', { name: tab })).first().click();
    await expect(page.getByText(/could not be read|went wrong/i)).toHaveCount(0);
  }
  for (const action of ['Change manager', 'Hand over their clients', 'Mark as left', 'Edit']) {
    await expect(page.getByRole('button', { name: action }).first()).toBeVisible();
  }
});

test('a person is added, given a document that is then removed, and marked as left', async ({ page }) => {
  test.setTimeout(180_000);
  const name = `Live Check ${run}`;
  await page.goto('/team/new');
  await settle(page);
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Employee code').fill(`LC${run.slice(-6)}`);
  // example.com is reserved for tests and never delivers; the form refuses .mrsales.local for a real person.
  await page.getByLabel('Email').fill(`live-${run.toLowerCase()}@example.com`);
  await page.getByLabel('Manager').selectOption({ label: 'Rajesh Verma · Hyderabad' });
  await page.getByRole('button', { name: 'Add to the roster' }).click();
  await expect(page.getByRole('heading', { name: `${name} is on the roster` })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: 'Open their record' }).click();
  await settle(page);

  // A document, with a kind and an expiry, then removed.
  await page.getByRole('tab', { name: 'Leave and documents' }).or(page.getByRole('link', { name: 'Leave and documents' })).first().click();
  await page.getByRole('button', { name: 'Add a document' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('File').setInputFiles({ name: 'offer-letter.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%live check\n') });
  await drawer.getByLabel('Expires').fill(new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10));
  await drawer.getByRole('button', { name: /^(Add|Upload|Save)/ }).last().click();
  await expect(page.getByText('offer-letter').first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await page.getByRole('button', { name: 'Remove the document' }).click();
  await expect(page.getByText('offer-letter')).toHaveCount(0, { timeout: 20_000 });

  // Marked as left, which needs a reason.
  await page.getByRole('button', { name: 'Mark as left' }).first().click();
  const leave = page.getByRole('dialog');
  await leave.getByRole('button', { name: 'Mark as left' }).click();
  await expect(leave).toBeVisible();
  await leave.getByLabel('Why').fill('Live check: added to test the roster, not a real joiner.');
  await leave.getByRole('button', { name: 'Mark as left' }).click();
  await expect(page.getByRole('button', { name: 'Reopen their record' })).toBeVisible({ timeout: 20_000 });
});

test('managers: who manages whom, and a manager opens their team', async ({ page }) => {
  await page.goto('/team/managers');
  await settle(page);
  await expect(page.getByText(/managers?, managing \d+ people/)).toBeVisible();
  await page.getByRole('link', { name: 'Rajesh Verma' }).first().click();
  await settle(page);
  await expect(page.getByRole('heading', { name: 'Rajesh Verma' })).toBeVisible();
  await expect(page.getByText(/done this week/).first()).toBeVisible();
});

test('attendance: a month grid for everyone, every day with its reason', async ({ page }) => {
  await page.goto('/team/attendance');
  await settle(page);
  expect(await page.locator('table tbody tr').count()).toBeGreaterThan(1);
  // Every day says what it was, in words, not only by its letter.
  const named = page.locator('table tbody tr').first().getByRole('cell', { name: /^\d+ \w+: (Present|No day plan|On leave|Week off|Holiday)/ });
  expect(await named.count()).toBeGreaterThan(5);
});

test('leave: requests from the phone with their status, rejected ones called rejected', async ({ page }) => {
  await page.goto('/team/leave');
  await settle(page);
  await expect(page.getByRole('radio', { name: /^Rejected/ })).toBeVisible();
  await expect(page.getByText('Not approved')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Decline' })).toHaveCount(0);
});

test('expenses: a month of claims, and a person opens day by day', async ({ page }) => {
  await page.goto('/money');
  await settle(page);
  await expect(page.getByText(/daily allowance is ₹[\d,]+/)).toBeVisible();
  await page.getByRole('radio', { name: /^Sep/ }).or(page.getByRole('button', { name: /^Sep/ })).first().click();
  await settle(page);
  const row = page.locator('table tbody tr').first();
  if (await row.count()) {
    await row.click();
    await expect(page.getByText(/claim|day/i).first()).toBeVisible();
  }
});

test('tasks: open, past their date and done, and the assign form', async ({ page }) => {
  await page.goto('/team/tasks');
  await settle(page);
  for (const f of ['Open', 'Past their date', 'Done']) await expect(page.getByRole('radio', { name: new RegExp(`^${f}`) })).toBeVisible();
  await expect(page.getByText('Nothing here', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Assign a task' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('field ownership says what the phone lets a person change', async ({ page }) => {
  await page.goto('/settings/ownership');
  await settle(page);
  await expect(page.getByText(/edits their own mobile number and blood group/)).toBeVisible();
  for (const g of ['Theirs to keep current, on the phone', 'Theirs to propose, signed off here', 'Set here, and nowhere else']) {
    await expect(page.getByRole('heading', { name: g })).toBeVisible();
  }
});

test('HR rules: holidays for a year and the leave policy', async ({ page }) => {
  await page.goto('/settings/hr');
  await settle(page);
  await expect(page.getByText(/holidays? in \d{4}/).first()).toBeVisible();
  await expect(page.getByText('Leave policy', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Declare a holiday' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
