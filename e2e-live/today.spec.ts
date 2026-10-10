/**
 * Live, checklist section 1: Today for each role, Needs attention, and
 * Approvals, against Testbed Pharma. The approvals test decides two of the
 * testbed's own sample leave requests (one rejected with a reason, one
 * approved), which is what that queue is there for.
 */
import { expect, test, type Page } from '@playwright/test';
import { haveLogins, stateFor } from './roles';

test.skip(!haveLogins(), 'Needs .env.local and .env.testbed');

const settle = (page: Page) => page.waitForLoadState('networkidle').then(() => page.waitForTimeout(800));
const pendingInBar = async (page: Page) => {
  const bar = page.locator('.bar-pending .long');
  return (await bar.count()) ? Number((await bar.innerText()).match(/\d+/)![0]) : 0;
};

test.describe('admin: the field view', () => {
  test.use({ storageState: stateFor('admin') });

  test('Today answers the day, the month, the managers and who is ahead', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
    await expect(page.getByRole('heading', { name: 'The field today' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /so far$/ })).toBeVisible();
    await expect(page.getByText('calls done', { exact: true })).toBeVisible();
    await expect(page.getByText('checked at the client', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'By manager' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Checked at the client' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ahead and behind' })).toBeVisible();

    // The waiting count on Today is the one in the bar.
    const waiting = await pendingInBar(page);
    if (waiting) await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Waiting for your decision' }) })).toContainText(String(waiting));
  });

  test('the calls chart switches between the last 20 days and two months', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    const heading = page.getByRole('heading', { name: /^Calls (on|in) / });
    for (const range of ['October', 'September', 'Last 20 days']) {
      const option = page.getByRole('radio', { name: range }).or(page.getByRole('button', { name: range, exact: true })).first();
      if (!(await option.count())) continue;
      await option.click();
      await expect(heading).toBeVisible();
    }
    await expect(page.getByText(/calls done, .* a day on average|No calls/).first()).toBeVisible();
  });

  test('a month figure and the managers beside it count the same month', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    const monthShare = (await page.locator('.mf', { hasText: 'checked at the client' }).locator('.mf-value').innerText()).trim();
    if (monthShare === '0%') {
      // Nothing checked this month for the company, so no team can show more.
      const cells = await page.locator('table', { has: page.getByRole('columnheader', { name: 'Checked at the client' }) })
        .locator('tbody tr td:nth-child(3)').allInnerTexts();
      for (const c of cells) expect(c.trim()).toMatch(/^(0%|No calls)$/);
    }
  });
});

test.describe('the other roles get their own Today', () => {
  test('HR: who is at work, the oldest leave waiting with a way to all of it, and documents', async ({ browser }) => {
    const page = await browser.newPage({ storageState: stateFor('hr') });
    await page.goto('/');
    await settle(page);
    await expect(page.getByText(/\d+ of \d+ (people|person) at work today/)).toBeVisible();
    const leave = page.locator('section', { has: page.getByRole('heading', { name: 'Leave waiting for a decision' }) });
    await expect(leave).toBeVisible();
    expect(await leave.locator('li').count()).toBeLessThanOrEqual(6);
    await expect(page.getByRole('heading', { name: 'Away in the next week' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Documents that lapse/ })).toBeVisible();
    await page.close();
  });

  test('Finance: the month of claims, days above the allowance, and per working day', async ({ browser }) => {
    const page = await browser.newPage({ storageState: stateFor('finance') });
    await page.goto('/');
    await settle(page);
    await expect(page.getByRole('heading', { name: /claims so far$/ })).toBeVisible();
    await expect(page.getByText(/daily allowance ₹[\d,]+/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Days above the allowance' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Claimed per working day' })).toBeVisible();
    await page.close();
  });

  test('IT: logins, phones, first passwords named by person, and recent changes', async ({ browser }) => {
    const page = await browser.newPage({ storageState: stateFor('it') });
    await page.goto('/');
    await settle(page);
    await expect(page.getByText(/office logins? and \d+ phone logins?/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Phones not heard from/ })).toBeVisible();
    const first = page.locator('section', { has: page.getByRole('heading', { name: 'Still on their first password' }) });
    await expect(first.locator('.row-title').filter({ hasText: /^a login$/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Recent changes' })).toBeVisible();
    await page.close();
  });
});

test.describe('Needs attention, as admin', () => {
  test.use({ storageState: stateFor('admin') });

  test('a ranked list, each with a reason and a way to act; decisions waiting among them', async ({ page }) => {
    await page.goto('/attention');
    await settle(page);
    await expect(page.getByText(/things? to look at|Nothing needs you/).first()).toBeVisible();
    const actions = page.locator('main a.link, main a[href^="/"]').filter({ hasText: /\S/ });
    expect(await actions.count()).toBeGreaterThan(0);
    if (await pendingInBar(page)) await expect(page.getByText(/waiting for a decision/)).toBeVisible();
    // Copy says a claim is money only when a claim is waiting.
    const decision = page.locator('li, .att-item, div').filter({ hasText: /waiting for a decision/ }).last();
    if ((await decision.count()) && !(await decision.innerText()).includes('expense claim')) {
      await expect(decision).not.toContainText('A claim is money');
    }
  });

  test('a client needing fixing opens Clients', async ({ page }) => {
    await page.goto('/attention');
    await settle(page);
    const fix = page.getByRole('link', { name: 'Fix in clients' });
    if (!(await fix.count())) test.skip(true, 'No client needs fixing on the testbed today');
    await fix.click();
    await expect(page).toHaveURL(/\/clients/);
  });
});

test.describe('Approvals, as admin', () => {
  test.use({ storageState: stateFor('admin') });

  test('filter by kind, reject only with a reason, approve, and both show as decided', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/approvals');
    await settle(page);
    if (await page.getByText(/Nothing is waiting|appear here as soon as someone sends them/).count()) {
      test.skip(true, 'The testbed queue is empty');
    }
    const total = async () => Number((await page.locator('main strong').filter({ hasText: /request/ }).first().innerText()).match(/\d+/)![0]);
    const before = await total();

    // Filter by kind: only leave waits on the testbed today.
    await page.getByRole('radio', { name: /^Leave/ }).click();
    await expect(page.getByRole('radio', { name: /^Leave/ })).toHaveAttribute('aria-checked', 'true');

    // Reject: refused without a reason, done with one.
    await page.getByRole('button', { name: 'Reject', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Reject/ }).last().click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Reason', { exact: true })).toBeFocused();
    await dialog.getByLabel('Reason', { exact: true }).fill('Live check: dates clash with the team review.');
    await dialog.getByRole('button', { name: /^Reject/ }).last().click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect.poll(total, { timeout: 20_000 }).toBe(before - 1);

    // Approve the next one.
    await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
    const confirm = page.getByRole('dialog');
    if (await confirm.count()) await confirm.getByRole('button', { name: /^Approve/ }).last().click();
    await expect.poll(total, { timeout: 20_000 }).toBe(before - 2);

    // Both are in Decided, the rejection with its reason.
    await page.getByRole('link', { name: 'Decided' }).first().click();
    await settle(page);
    await expect(page.getByText('Live check: dates clash with the team review.').first()).toBeVisible();
  });
});
