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

test('someone paid outside Mr Sales gets an uploaded payslip, which needs a net pay', async ({ page }) => {
  await as(page, 'owner', '/money/payroll');
  // The current month: the demo's joining dates move with today, so whether a
  // newcomer is on last month's roster depends on the date the test runs.
  await page.getByRole('radiogroup', { name: 'Payroll for' }).getByRole('radio').last().click();
  const row = page.getByRole('row', { name: /Farhan Siddiqui/ });
  await row.getByRole('button', { name: 'Upload a payslip' }).click();
  await page.getByRole('button', { name: 'Release the payslip' }).click();
  await expect(top(page)).toContainText('Write the net pay, in rupees.');
  await top(page).getByLabel('Net pay').fill('₹18,400');
  await top(page).getByLabel(/Payslip PDF/).setInputFiles(pdf);
  await page.getByRole('button', { name: 'Release the payslip' }).click();
  await expect(row).toContainText('₹18,400');
  await expect(row.getByRole('button', { name: 'PDF' })).toBeVisible();
});

test('a payslip is worked out from the salary, corrected with a reason, and released to the phone', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'owner', '/money/payroll');
  await page.getByRole('radio', { name: /^Ready/ }).click();
  const row = page.locator('table tbody tr').first();
  const name = (await row.locator('th .row-open').innerText()).trim();
  await row.locator('th .row-open').click();
  await expect(top(page)).toContainText('Earnings');
  const lop = top(page).getByLabel('Loss-of-pay days');
  await lop.fill('2');
  await expect(top(page).getByText('Days paid')).toBeVisible();
  await page.getByRole('button', { name: 'Generate and release', exact: true }).click();
  await expect(top(page)).toContainText('Say why the loss of pay is different');
  await top(page).getByLabel('Why it is different').fill('Two days at the training, no plan filed');
  await page.getByRole('button', { name: 'Add a one-off line' }).click();
  await top(page).getByLabel('What it is').fill('Festival bonus');
  await top(page).getByLabel('Amount').fill('2000');
  await expect(top(page).getByText('Festival bonus').first()).toBeVisible();
  await page.getByRole('button', { name: 'Generate and release', exact: true }).click();
  await expect(notice(page)).toContainText(`${name}'s payslip`);
  await page.getByRole('radio', { name: /^Released/ }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('Released');
  expect(errors).toEqual([]);
});

test('a salary is set from the role structure and revised from a later date', async ({ page }) => {
  await as(page, 'hr', '/money/salaries');
  const row = page.getByRole('row', { name: /Farhan Siddiqui/ });
  await row.getByRole('button', { name: 'Set salary' }).click();
  await expect(top(page).getByLabel('Monthly basic')).not.toHaveValue('');
  await top(page).getByLabel('Monthly basic').fill('20000');
  await expect(top(page).locator('.pay-net')).toContainText('₹');
  await page.getByRole('button', { name: 'Save the salary' }).click();
  await expect(notice(page)).toContainText("Farhan Siddiqui's salary is set");
  await expect(row).toContainText('₹20,000');
  await row.getByRole('button', { name: 'Revise' }).click();
  await top(page).getByLabel('Monthly basic').fill('22000');
  await top(page).getByLabel('Why').fill('Confirmation after probation');
  await page.getByRole('button', { name: 'Save the revision' }).click();
  await expect(row).toContainText('Revised from');
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

test('HR rules keep the leave each type allows', async ({ page }) => {
  await as(page, 'owner', '/settings/hr');
  await page.getByRole('row', { name: /Casual/ }).getByRole('button', { name: 'Edit' }).click();
  await top(page).getByLabel('Days in a year').fill('14');
  await page.getByRole('button', { name: 'Save policy' }).click();
  await expect(page.getByRole('row', { name: /Casual/ })).toContainText('14');
});

test('pay setup keeps components, a structure for each role and role expense rules', async ({ page }) => {
  await as(page, 'owner', '/settings/pay');
  await page.getByRole('button', { name: 'Add a component' }).click();
  await top(page).getByLabel('Name').fill('Basic');
  await page.getByRole('button', { name: 'Save the component' }).click();
  await expect(top(page)).toContainText('Basic is set for each person');
  await top(page).getByLabel('Name').fill('Medical allowance');
  await top(page).getByLabel(/Company figure/).fill('1250');
  await page.getByRole('button', { name: 'Save the component' }).click();
  await expect(page.getByRole('row', { name: /Medical allowance/ })).toContainText('₹1,250');

  await page.getByRole('button', { name: 'Add a structure' }).click();
  await top(page).getByLabel('Name').fill('RSM band');
  await top(page).getByLabel('For the role').selectOption({ label: 'Regional Sales Manager' });
  await top(page).getByLabel('Monthly basic').fill('50000');
  await page.getByRole('button', { name: 'Save the structure' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'RSM band' })).toContainText('basic ₹50,000');

  await page.getByRole('button', { name: "Add a role's rule" }).click();
  await top(page).getByLabel('Role').selectOption({ label: 'Medical Representative' });
  await top(page).getByLabel('Daily allowance').fill('425');
  await top(page).getByLabel('Bill needed above').fill('650');
  await top(page).getByLabel('Monthly ceiling').fill('14000');
  await page.getByRole('button', { name: 'Save the rule' }).click();
  await expect(page.getByRole('row', { name: /Medical Representative/ })).toContainText('₹425');
});

test('finance gives a person their own expense rule, above the role rule', async ({ page }) => {
  await as(page, 'finance', '/team');
  await page.getByRole('link', { name: 'Anil Kumar Goud' }).first().click();
  await page.getByRole('tab', { name: 'Pay and expenses' }).click();
  await page.getByRole('button', { name: 'Give them their own rule' }).click();
  await top(page).getByLabel('Daily allowance').fill('600');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.facts').filter({ hasText: 'Daily allowance' })).toContainText('₹600');
  await expect(page.locator('.facts').filter({ hasText: 'Daily allowance' })).toContainText('their own');
});

test('the company details and logo are kept for payslips', async ({ page }) => {
  await as(page, 'owner', '/settings/company');
  await page.getByLabel('GSTIN').fill('36AABCC1234K1Z');
  await page.getByRole('button', { name: 'Save the details' }).click();
  await expect(page.getByText('A GSTIN is 15 characters')).toBeVisible();
  await page.getByLabel('GSTIN').fill('36AABCC1234K1Z5');
  await page.getByLabel('Registered address').fill('Plot 12, Hitech City Road, Hyderabad');
  await page.getByRole('button', { name: 'Save the details' }).click();
  await expect(notice(page)).toContainText('company details are saved');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#logo-file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.logo-frame img')).toBeVisible();
});

test('only the owner changes the company details', async ({ page }) => {
  await as(page, 'admin', '/settings/company');
  await expect(page.getByText('Only the owner changes these')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save the details' })).toHaveCount(0);
});

test('leave balances show what is left, and HR adjusts one with a reason', async ({ page }) => {
  await as(page, 'hr', '/team/leave');
  const row = page.getByRole('row', { name: /Anil Kumar Goud/ }).filter({ has: page.getByRole('button', { name: 'Adjust' }) });
  await expect(row).toContainText('of 15');
  await row.getByRole('button', { name: 'Adjust' }).click();
  await page.getByRole('radio', { name: 'Take away days' }).click();
  await top(page).getByLabel('Days').fill('6');
  await page.getByRole('button', { name: 'Save the adjustment' }).click();
  await expect(top(page)).toContainText('Say why');
  await top(page).getByLabel('Why').fill('6 casual days used before Mr Sales');
  await page.getByRole('button', { name: 'Save the adjustment' }).click();
  await expect(notice(page)).toContainText('down by 6 days');
  await expect(row).toContainText('6 taken off');
});

test('a reviewed fake-location warning leaves Needs attention and stays on the day as a record', async ({ page }) => {
  await as(page, 'owner', '/attention');
  const alert = page.getByText('Sai Kiran Reddy tried to use a fake location');
  await expect(alert).toBeVisible();
  await page.getByRole('link', { name: 'Open their day' }).first().click();
  await page.getByRole('button', { name: 'Mark as reviewed' }).click();
  await top(page).getByPlaceholder(/spoke to them/).fill('Spoke to him; a location app was left on.');
  await top(page).getByRole('button', { name: 'Mark as reviewed' }).click();
  await expect(page.getByText(/were reviewed by .*a location app was left on/)).toBeVisible();
  // In-app navigation: a reload would start the demo company afresh.
  await page.evaluate(() => { history.pushState({}, '', '/attention'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading').first()).toBeVisible();
  await expect(page.getByText('Sai Kiran Reddy tried to use a fake location')).toHaveCount(0);
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
  // It leaves the queue. The count in the bar drops too, unless it was one day of a
  // month's claim, which stays one request until its last day is decided.
  const first = page.locator('.ap-row').first();
  const id = await first.getAttribute('data-request');
  await first.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator(`.ap-row[data-request="${id}"]`)).toHaveCount(0);
  expect(Number((await waiting.innerText()).match(/\d+/)?.[0])).toBeLessThanOrEqual(before);
});

test('the day strip picks a day by tap or arrow keys, and offers no future day', async ({ page }) => {
  await as(page, 'owner', '/field?date=2026-10-01');
  const days = page.getByRole('radiogroup', { name: 'Day' });
  await expect(days.getByRole('radio', { checked: true })).toHaveAccessibleName(/Thursday, 1 October/);
  await expect(days.getByRole('radio', { name: /2 October.*Gandhi Jayanti/ })).toBeVisible();
  await days.getByRole('radio', { name: /Wednesday, 30 September/ }).click();
  await expect(page).toHaveURL(/date=2026-09-30/);
  // The address changes before the strip redraws; press from the day on screen.
  await expect(days.getByRole('radio', { checked: true })).toHaveAccessibleName(/Wednesday, 30 September/);
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
  // The demo's approved leave sits in the last fortnight; step back a week until it is in view.
  const away = strip.getByRole('radio', { name: /\d+ away/ }).first();
  for (let i = 0; i < 3 && !(await away.count()); i++) await page.getByRole('button', { name: /^The week of/ }).first().click();
  await expect(away).toBeVisible();
  await away.click();
  await expect(page.locator('.away-list .row').first()).toContainText(/leave/i);
});

test('the month strip picks a month by tap, arrow key or the year panel, and offers no future month', async ({ page }) => {
  await as(page, 'owner', '/team/attendance');
  const months = page.getByRole('radiogroup', { name: 'Attendance for' });
  const now = months.getByRole('radio', { name: /, this month/ });
  await expect(now).toBeChecked();
  await now.press('ArrowLeft');
  await expect(months.getByRole('radio', { checked: true })).not.toHaveAccessibleName(/this month/);
  await page.getByRole('button', { name: 'Pick a month' }).click();
  const year = page.getByRole('dialog', { name: /Pick a month/ });
  // Every month after this one is offered disabled, never as a choice.
  const thisMonth = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);
  for (const b of await year.locator('button[data-month]').all()) {
    if ((await b.getAttribute('data-month'))! > thisMonth) await expect(b).toBeDisabled();
  }
  await page.keyboard.press('PageUp');
  await page.keyboard.press('Enter');
  await expect(year).toHaveCount(0);
  await expect(months.getByRole('radio', { checked: true })).toHaveAccessibleName(/\d{4}/);
  await page.getByRole('button', { name: 'This month' }).click();
  await expect(now).toBeChecked();
});

test('a person dragged onto another manager is staged, reviewed and saved with a reason', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'owner', '/team/org-chart');
  await page.getByRole('radio', { name: 'Board' }).click();
  const cols = page.locator('.board-col:not(.is-nobody)');
  const from = cols.nth(0);
  const to = cols.nth(1);
  const card = from.locator('.board-card').first();
  const who = (await card.locator('.board-name').innerText()).replace('Manager', '').trim();
  const a = (await card.boundingBox())!;
  const b = (await to.locator('.board-head').boundingBox())!;
  await page.mouse.move(a.x + 40, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(a.x + 80, a.y + 40, { steps: 5 });
  await page.mouse.move(b.x + 60, b.y + 20, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.board-stage')).toContainText('1 change staged');
  await expect(to.locator('.board-card.is-moved')).toContainText(who);
  await page.getByRole('button', { name: 'Review 1 change' }).click();
  await page.getByRole('button', { name: 'Save 1 change' }).click();
  await expect(page.locator('.form-error').first()).toBeVisible();
  await page.getByLabel('Why').fill('Moved for the test');
  await page.getByRole('button', { name: 'Save 1 change' }).click();
  await expect(page.getByText(`${who} now reports to`)).toBeVisible();
  await expect(page.locator('.board-stage')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a mark on Today shows what happened there, and opens that visit on the person\'s day', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'owner', '/');
  const dot = page.locator('.ribbon-calls .mark.done .mark-hit').first();
  await dot.hover();
  await expect(page.locator('.mark-card')).toContainText('Click to open the visit');
  const client = (await page.locator('.mark-card strong').innerText()).trim();
  await dot.click();
  await expect(page).toHaveURL(/\/field\/[^/]+\/\d{4}-\d{2}-\d{2}\?visit=/);
  await expect(top(page)).toContainText(client);
  await expect(top(page)).toContainText('Location evidence');
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/visit=/);
  expect(errors).toEqual([]);
});
