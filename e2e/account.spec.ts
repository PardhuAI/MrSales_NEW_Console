/**
 * Your account: changing the password refuses a wrong current password and a
 * short new one, in words; two-step sign-in shows a QR code and the key, and
 * is turned on with a code (any six digits in the demo) and off again.
 */
import { expect, test } from '@playwright/test';
import { as, notice, watchErrors } from './helpers';

test('the password change refuses a wrong current password and a short new one, then changes it', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'hr', '/account');
  await expect(page.getByRole('heading', { name: 'Your account', level: 1 })).toBeVisible();
  const part = page.getByRole('region', { name: 'Password' });

  await part.getByLabel('Current password').fill('Cleocure@2025');
  await part.getByLabel('New password', { exact: true }).fill('short1A');
  await part.getByLabel('New password again').fill('short1A');
  await part.getByRole('button', { name: 'Change the password' }).click();
  await expect(part.getByText(/The new password needs: at least 12 characters/)).toBeVisible();

  await part.getByLabel('New password', { exact: true }).fill('Harbour2026Lights');
  await part.getByLabel('New password again').fill('Harbour2026Lights');
  await part.getByRole('button', { name: 'Change the password' }).click();
  await expect(part.getByRole('alert')).toContainText('That is not your current password.');

  await part.getByLabel('Current password').fill('Cleocure@2026');
  await part.getByRole('button', { name: 'Change the password' }).click();
  await expect(notice(page)).toContainText('Your password is changed.');
  expect(errors).toEqual([]);
});

test('two-step sign-in shows a QR code and the key, turns on with a code, and needs a code to turn off', async ({ page }) => {
  await as(page, 'owner', '/account');
  const part = page.getByRole('region', { name: 'Two-step sign-in' });
  await expect(part.getByText('Off', { exact: true })).toBeVisible();
  await part.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await expect(part.getByRole('img', { name: 'QR code to scan with your authenticator app' })).toBeVisible();
  await expect(part.getByRole('button', { name: 'Copy the key' })).toBeVisible();

  await part.getByLabel('Then type the six-digit code the app shows').fill('12');
  await part.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await expect(part.getByText('Type the six digits your app shows for Mr Sales.')).toBeVisible();
  await part.getByLabel('Then type the six-digit code the app shows').fill('482913');
  await part.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await expect(notice(page)).toContainText('Two-step sign-in is on.');
  await expect(part.getByText('On', { exact: true })).toBeVisible();

  // A password change now asks for a code too.
  await expect(page.getByRole('region', { name: 'Password' }).getByLabel('Code from your authenticator app')).toBeVisible();

  await part.getByRole('button', { name: 'Turn it off' }).click();
  await part.getByLabel('Code from your authenticator app').fill('551204');
  await part.getByRole('button', { name: 'Turn off two-step sign-in' }).click();
  await expect(notice(page)).toContainText('Two-step sign-in is off.');
});

test('signing out everywhere else is confirmed by name, and recent activity lists this login\'s changes', async ({ page }) => {
  await as(page, 'owner', '/account');
  await page.getByRole('button', { name: 'Sign out everywhere else' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out everywhere else' }).click();
  await expect(notice(page)).toContainText('Every other device is signed out.');
  const activity = page.getByRole('region', { name: 'Your recent activity' });
  await expect(activity.getByRole('listitem').first()).toBeVisible();
  expect(await activity.getByRole('listitem').count()).toBeLessThanOrEqual(20);
});

test('the account menu opens Your account first', async ({ page }) => {
  await as(page, 'management');
  await page.getByRole('button', { name: /account and appearance/ }).click();
  const items = page.getByRole('menuitem');
  await expect(items.filter({ hasText: 'Your account' })).toBeVisible();
  await items.filter({ hasText: 'Your account' }).click();
  await expect(page.getByRole('heading', { name: 'Your account', level: 1 })).toBeVisible();
});
