/**
 * Pay is seen by owner, HR and finance only (NEXT_WORK.md, Phase 8). Admin,
 * IT and management never see a salary, a payslip or a basic: not on Payroll
 * or Salaries, not on a person's record, not in Pay and expenses, and not as
 * a column in the people import.
 */
import { expect, test } from '@playwright/test';
import { as, type Role } from './helpers';

for (const role of ['admin', 'it', 'management'] as Role[]) {
  test(`${role} sees no pay anywhere`, async ({ page }) => {
    await as(page, role, '/money/payroll');
    await expect(page.getByText('Payroll is not open to your role')).toBeVisible();
    await page.goto('/money/salaries');
    await expect(page.getByText('Salaries is not open to your role')).toBeVisible();

    await page.goto('/team');
    await page.getByRole('link', { name: 'Sai Kiran Reddy' }).click();
    await expect(page.getByRole('heading', { name: 'Sai Kiran Reddy' })).toBeVisible();
    for (const tab of await page.getByRole('tab').all()) {
      await tab.click();
      await expect(page.getByRole('tabpanel')).not.toContainText(/Salary|Payslip|Basic|Net pay|CTC/);
    }

    await page.goto('/settings/pay');
    await expect(page.getByText(/Salary components|Salary structure|Basic/)).toHaveCount(0);
  });
}

test('the people template carries a basic salary column for HR and none for admin', async ({ page }) => {
  await as(page, 'hr', '/team/import');
  await expect(page.getByText('Department, HQ town, mobile, basic salary.')).toBeVisible();
  await as(page, 'admin', '/team/import');
  await expect(page.getByText('Department, HQ town, mobile.')).toBeVisible();
});

test('the same search finds the salary for the owner, so the checks above are not empty', async ({ page }) => {
  await as(page, 'owner', '/team');
  await page.getByRole('link', { name: 'Sai Kiran Reddy' }).click();
  await page.getByRole('tab', { name: 'Pay and expenses' }).click();
  await expect(page.getByRole('tabpanel')).toContainText(/Salary/);
});
