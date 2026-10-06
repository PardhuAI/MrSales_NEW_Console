/**
 * Importing people from a sheet: a sheet with problems shows each one and
 * cannot be added; the fixed sheet adds everyone, and they are on the roster.
 */
import { expect, test } from '@playwright/test';
import { as, top, watchErrors } from './helpers';

const HEAD = 'Employee code,Name,Role,Department,Territory or HQ,HQ town,Reports to (employee code),Joined on,Mobile,Email';
const sheet = (rows: string[]) => ({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from([HEAD, ...rows].join('\r\n')) });

test('a sheet with two bad rows shows both problems and cannot be added; the fixed sheet adds the people', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'owner', '/team');
  await page.getByRole('link', { name: 'Import from a sheet' }).click();
  const drawer = top(page);
  await expect(drawer.getByRole('heading', { name: 'Import people from a sheet' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Download the template' })).toBeVisible();

  await drawer.getByLabel('The filled sheet, as CSV or Excel').setInputFiles(sheet([
    'CL-ASM-09,Bhavana Rao,Area Sales Manager,,Warangal,,CL-RSM-01,1 Apr 2026,+91 98480 11111,bhavana.rao@example.com',
    'CL-MR-201,Imran Shaikh,Medical Representative,,Warangal,,ASM-04,01/04/2026,98480 22222,imran.shaikh@example.com',
    'CL-MR-202,Neha Joshi,Medical Representative,,Warangal,,CL-ASM-09,2026-04-01,12345,neha.joshi@example.com',
  ]));
  await expect(drawer.getByText('2 rows need fixing')).toBeVisible();
  await expect(drawer.getByRole('row', { name: /3 Reports to No employee has the code ASM-04/ })).toBeVisible();
  await expect(drawer.getByRole('row', { name: /4 Mobile "12345" is not a 10 digit mobile number/ })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Add the people' })).toBeDisabled();

  // Fixed, and picked again without closing the drawer.
  await drawer.getByLabel('The filled sheet, as CSV or Excel').setInputFiles(sheet([
    'CL-ASM-09,Bhavana Rao,Area Sales Manager,,Warangal,,CL-RSM-01,1 Apr 2026,+91 98480 11111,bhavana.rao@example.com',
    'CL-MR-201,Imran Shaikh,Medical Representative,,Warangal,,CL-ASM-09,01/04/2026,98480 22222,imran.shaikh@example.com',
  ]));
  await expect(drawer.getByText('2 people ready.')).toBeVisible();
  await drawer.getByRole('button', { name: 'Add 2 people' }).click();
  await expect(drawer.getByText('2 people added.')).toBeVisible();
  await expect(drawer.getByText('Their phone logins are not sent yet.', { exact: false })).toBeVisible();

  await drawer.getByRole('button', { name: 'Send logins to the 2 new people' }).click();
  await page.getByRole('button', { name: 'Send 2 logins' }).click();
  await expect(drawer.getByText('2 logins sent.')).toBeVisible();

  await drawer.getByRole('link', { name: 'See the new people' }).click();
  await expect(page.getByText('Showing the 2 people just imported.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bhavana Rao' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Imran Shaikh' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Imran Shaikh/ })).toContainText('Bhavana Rao');
  expect(errors).toEqual([]);
});

test('admin may import, but a pay column in their sheet is left alone', async ({ page }) => {
  await as(page, 'admin', '/team/import');
  const drawer = top(page);
  await drawer.getByLabel('The filled sheet, as CSV or Excel').setInputFiles({
    name: 'people.csv', mimeType: 'text/csv',
    buffer: Buffer.from(`${HEAD},Basic salary (monthly)\r\nCL-MR-301,Ravi Kumar,MR,,Uppal,,CL-ASM-02,2026-04-01,,ravi.kumar@example.com,18000`),
  });
  await expect(drawer.getByText('Columns not recognised, and left alone: Basic salary (monthly).')).toBeVisible();
  await expect(drawer.getByText('1 person ready.')).toBeVisible();
});
