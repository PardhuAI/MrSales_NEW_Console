/**
 * Live, checklist sections 9 to 11: the gaps the old console left (joiner
 * drafts), and what the rebuild added (import people, announcements, your
 * account), against Testbed Pharma.
 *
 * The import is only taken as far as its row-by-row check, which writes
 * nothing. The announcement goes to one small testbed team.
 */
import { expect, test, type Page } from '@playwright/test';
import { haveLogins, stateFor } from './roles';

test.skip(!haveLogins(), 'Needs .env.local and .env.testbed');
test.use({ storageState: stateFor('admin') });

const settle = (page: Page) => page.waitForLoadState('networkidle').then(() => page.waitForTimeout(800));
const top = (page: Page) => page.getByRole('dialog').last();
const run = Date.now().toString(36).toUpperCase();

const HEAD = 'Employee code,Name,Role,Department,Territory or HQ,HQ town,Reports to (employee code),Joined on,Mobile,Email';
const sheet = (rows: string[]) => ({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from([HEAD, ...rows].join('\r\n')) });

test('a half-finished joiner is kept and reopened, then discarded', async ({ page }) => {
  await page.goto('/team/new');
  await settle(page);
  await page.getByLabel('Full name').fill(`Draft Joiner ${run}`);
  await page.goto('/team');
  await settle(page);
  await page.goto('/team/new');
  await settle(page);
  await expect(page.getByLabel('Full name')).toHaveValue(`Draft Joiner ${run}`);
  await page.getByRole('button', { name: 'Discard' }).click();
  await page.goto('/team/new');
  await expect(page.getByLabel('Full name')).toHaveValue('');
});

test('import: a sheet with bad rows names each problem by row and column, and adds nobody', async ({ page }) => {
  await page.goto('/team');
  await settle(page);
  const before = Number((await page.getByText(/^\d+ people/).first().innerText()).match(/\d+/)![0]);
  await page.getByRole('link', { name: 'Import from a sheet' }).click();
  const drawer = top(page);
  await expect(drawer.getByRole('button', { name: 'Download the template' })).toBeVisible();
  await drawer.getByLabel('The filled sheet, as CSV or Excel').setInputFiles(sheet([
    `LC${run.slice(-5)}1,Live Import One,Business Executive,,Hyderabad Test,,NOSUCHCODE,1 Oct 2026,98480 11111,live-one-${run.toLowerCase()}@example.com`,
    `LC${run.slice(-5)}2,Live Import Two,Business Executive,,Hyderabad Test,,TBM9001,1 Oct 2026,12345,live-two-${run.toLowerCase()}@example.com`,
  ]));
  await expect(drawer.getByText('2 rows need fixing')).toBeVisible({ timeout: 20_000 });
  await expect(drawer.getByRole('row', { name: /Reports to No employee has the code NOSUCHCODE/ })).toBeVisible();
  await expect(drawer.getByRole('row', { name: /Mobile "12345" is not a 10 digit mobile number/ })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Add the people' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.reload();
  await settle(page);
  expect(Number((await page.getByText(/^\d+ people/).first().innerText()).match(/\d+/)![0])).toBe(before);
});

test('announcements: written to one team, read by 0 of them, and the unread named', async ({ page }) => {
  test.setTimeout(120_000);
  const title = `Live check notice ${run}`;
  await page.goto('/share/announcements');
  await settle(page);
  await page.getByRole('link', { name: 'Write an announcement' }).click();
  const drawer = top(page);
  await drawer.getByLabel('Title').fill(title);
  await drawer.getByLabel('Message').fill('A check of the announcement path on the testbed. Nothing to do.');
  await drawer.getByRole('radio', { name: 'A team' }).click();
  const team = drawer.getByLabel('Whose team');
  const option = team.locator('option', { hasText: "Lakshmi Prasad's team" });
  const n = Number((await option.textContent())!.match(/\((\d+)\)/)![1]);
  await team.selectOption({ label: (await option.textContent())! });
  await expect(drawer.getByRole('complementary', { name: 'How it will look on the phone' })).toContainText(title);
  await drawer.getByRole('button', { name: `Send to ${n} ${n === 1 ? 'person' : 'people'}` }).click();
  await page.getByRole('button', { name: 'Send the announcement' }).click();
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toContainText(`0 of ${n}`, { timeout: 20_000 });

  await row.getByRole('button', { name: title }).click();
  await expect(top(page).getByRole('heading', { name: /Not read yet: \d+/ })).toBeVisible();
  await expect(top(page).getByText(/Kiran Kumar|Meena Reddy/).first()).toBeVisible();
});

test('your account: who you are, the name in Messages, and the changes this login made', async ({ page }) => {
  await page.goto('/account');
  await settle(page);
  await expect(page.getByText('admin@testbed.mrsales.local').first()).toBeVisible();
  await expect(page.getByText(/name .*Messages|in Messages/i).first()).toBeVisible();
  await expect(page.getByText(/could not be read|went wrong/i)).toHaveCount(0);
});
