/**
 * Announcements: the sent list shows who each went to and how many have read
 * it; one opens with the names of those who have not, who can be reminded;
 * and writing one to a team names the count in the confirm and arrives in the
 * list as read by none of them.
 */
import { expect, test } from '@playwright/test';
import { as, notice, top, watchErrors } from './helpers';

test('the sent list says who read each announcement, and the unread can be reminded', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'hr', '/share/announcements');
  const row = page.getByRole('row', { name: /New price list from 1 November/ });
  await expect(row).toContainText('Everyone');
  await expect(row).toContainText('Pinned');
  await expect(row).toContainText(/\d+ of \d+/);

  await row.getByRole('button', { name: 'New price list from 1 November' }).click();
  const drawer = top(page);
  await expect(drawer.getByRole('heading', { name: /Not read yet: \d+/ })).toBeVisible();
  await drawer.getByRole('button', { name: /^Remind the \d+ who have not read it$/ }).click();
  await page.getByRole('button', { name: /^Remind \d+ people$/ }).click();
  await expect(drawer.getByRole('status')).toContainText(/people were reminded just now/);
  await expect(drawer.getByText(/^Reminded /).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('writing to a team names the count in the confirm, and the list shows read by 0 of them', async ({ page }) => {
  await as(page, 'owner', '/share/announcements');
  await page.getByRole('link', { name: 'Write an announcement' }).click();
  const drawer = top(page);
  await drawer.getByRole('button', { name: /^Send to \d+ people$/ }).click();
  await expect(drawer.getByText('Give it a title, as the phone will show it.')).toBeVisible();

  await drawer.getByLabel('Title').fill('Stock of Cleozin is back');
  await drawer.getByLabel('Message').fill('Stockists have Cleozin 500 again from today.\nTake orders as usual.');
  await drawer.getByRole('radio', { name: 'A team' }).click();
  const team = drawer.getByLabel('Whose team');
  const option = team.locator('option', { hasText: "Ravi Teja Varma's team" });
  const n = Number((await option.textContent())!.match(/\((\d+)\)/)![1]);
  expect(n).toBeGreaterThan(1);
  await team.selectOption({ label: (await option.textContent())! });
  await expect(drawer.getByRole('complementary', { name: 'How it will look on the phone' })).toContainText('Stock of Cleozin is back');

  await drawer.getByRole('button', { name: `Send to ${n} people` }).click();
  await expect(page.getByRole('heading', { name: `Send to ${n} people?` })).toBeVisible();
  await page.getByRole('button', { name: 'Send the announcement' }).click();
  await expect(notice(page)).toContainText(`Sent to ${n} people.`);

  const row = page.getByRole('row', { name: /Stock of Cleozin is back/ });
  await expect(row).toContainText("Ravi Teja Varma's team");
  await expect(row).toContainText(`0 of ${n}`);
});

test('a manager writes to their own team only', async ({ page }) => {
  await as(page, 'management', '/share/announcements/new');
  const drawer = top(page);
  await expect(drawer.getByRole('radiogroup', { name: 'Who it goes to' })).toHaveCount(0);
  await expect(drawer.getByText(/^Your team, \d+ people$/)).toBeVisible();
});
