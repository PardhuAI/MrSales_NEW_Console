/**
 * Hiring somebody, their record, their documents, their phone login, and the
 * roles they are hired against: the old console's employee, roles,
 * phone-login and documents-and-coverage tests, on the demo company.
 */
import { expect, test } from '@playwright/test';
import { as, notice, top, watchErrors } from './helpers';

test('adding a person refuses an empty form, then puts them on the roster with their role', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'owner', '/team/new');
  await page.getByRole('button', { name: 'Add to the roster' }).click();
  await expect(page.getByText('Name the person.').or(page.locator('[id$="-err"]').first())).toBeVisible();

  await page.getByLabel('Full name').fill('Test Joiner');
  await page.getByLabel('Employee code').fill('CL-MR-099');
  await page.getByLabel('Email').fill('test.joiner@cleocure.in');
  await page.getByLabel('Manager').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Add to the roster' }).click();
  await expect(page.getByRole('heading', { name: 'Test Joiner is on the roster' })).toBeVisible();

  await page.getByRole('link', { name: 'Open their record' }).click();
  await expect(page.getByRole('heading', { name: 'Test Joiner' })).toBeVisible();
  await expect(page.getByText('CL-MR-099')).toBeVisible();
  await expect(page.getByText('No phone login')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a role somebody holds is refused deletion, and a new role is added, retired and deleted', async ({ page }) => {
  await as(page, 'owner', '/settings/roles');
  await expect(page.getByRole('row', { name: /Medical Representative/ }).getByRole('button', { name: 'Delete' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add a role' }).click();
  await top(page).getByLabel('Name', { exact: true }).fill('Territory Business Manager');
  await page.getByRole('button', { name: 'Add the role' }).click();
  await expect(notice(page)).toContainText('Territory Business Manager is offered');
  const row = page.getByRole('row', { name: /Territory Business Manager/ });
  await expect(row).toContainText('TBM');

  await page.getByRole('button', { name: 'Add a role' }).click();
  await top(page).getByLabel('Name', { exact: true }).fill('territory business manager');
  await page.getByRole('button', { name: 'Add the role' }).click();
  await expect(top(page).getByRole('alert')).toContainText('already one of your roles');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await row.getByRole('button', { name: 'Retire' }).click();
  await page.getByRole('button', { name: 'Retire the role' }).click();
  await expect(row).toContainText('Retired');
  await row.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete the role' }).click();
  await expect(page.getByRole('row', { name: /Territory Business Manager/ })).toHaveCount(0);
});

test('a phone login needs two matching passwords, and is then given', async ({ page }) => {
  await as(page, 'owner', '/settings/logins');
  const row = page.getByRole('row', { name: /Farhan Siddiqui/ });
  await expect(row).toContainText('No login');
  await row.getByRole('button', { name: 'Give a phone login' }).click();
  await top(page).getByLabel('Starting password').fill('Welcome@2026');
  await top(page).getByLabel('The same again').fill('Welcome@2027');
  await page.getByRole('button', { name: 'Give the login' }).click();
  await expect(top(page)).toContainText('The two passwords do not match.');
  await top(page).getByLabel('The same again').fill('Welcome@2026');
  await page.getByRole('button', { name: 'Give the login' }).click();
  await expect(notice(page)).toContainText('Farhan Siddiqui has a phone login');
  await expect(row).toContainText('Must choose a password');
});

test('switching a login off needs a reason', async ({ page }) => {
  await as(page, 'owner', '/settings/logins');
  const row = page.getByRole('row', { name: /Kiran Teja/ });
  await row.getByRole('button', { name: 'Switch off' }).click();
  await page.getByRole('button', { name: 'Switch the login off' }).click();
  await expect(top(page)).toBeVisible();
  await page.getByLabel('Why').fill('Phone lost on the bus.');
  await page.getByRole('button', { name: 'Switch the login off' }).click();
  await expect(row).toContainText('Switched off');
});

test('HR uploads a document to a person, and it is listed with its expiry', async ({ page }) => {
  await as(page, 'hr', '/team');
  await page.getByRole('link', { name: 'Divya Sree' }).first().click();
  await page.getByRole('tab', { name: 'Leave and documents' }).click();
  await page.getByRole('button', { name: 'Add a document' }).click();
  await top(page).locator('input[type=file]').setInputFiles({ name: 'licence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') });
  await top(page).getByLabel(/Title/).fill('Driving licence');
  await top(page).getByLabel(/Category|Kind/).selectOption({ label: 'Licence' });
  await top(page).getByLabel(/Expires/).fill('2027-03-31');
  await page.getByRole('button', { name: 'Add the document' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Driving licence' })).toBeVisible();
  await expect(page.getByText(/expires 31 March 2027/)).toBeVisible();
});

test('a staffed territory names who is posted there', async ({ page }) => {
  await as(page, 'owner', '/settings/geography');
  const t = page.getByRole('listitem').filter({ hasText: 'Hyderabad West' }).first();
  await expect(t).toContainText('7 people posted');
  await t.getByRole('button', { name: 'Open Hyderabad West' }).click();
  await expect(t).toContainText('Posted here:');
  await t.locator('.geo-row').first().getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Remove the territory' }).click();
  await expect(top(page)).toContainText('is in use');
});

test('a leave request is rejected only with a reason', async ({ page }) => {
  await as(page, 'owner', '/team/leave');
  await page.getByRole('button', { name: 'Reject', exact: true }).first().click();
  await page.getByRole('button', { name: 'Reject the leave' }).click();
  await expect(top(page)).toBeVisible();
  await page.getByLabel('Why it is rejected').fill('The team is short that week.');
  await page.getByRole('button', { name: 'Reject the leave' }).click();
  await expect(notice(page)).toContainText('rejected');
});
