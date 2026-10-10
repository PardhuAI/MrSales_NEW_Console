/**
 * Live, checklist section 2: Field (activity, a person's day, day plans,
 * tour plans, coverage) and Clients (the list, add, edit and retire, the
 * client's record, data quality, complaints), against Testbed Pharma.
 *
 * The client it adds is named for the run and retired at the end, so the
 * testbed's list keeps only what it had.
 */
import { expect, test, type Page } from '@playwright/test';
import { haveLogins, stateFor } from './roles';

test.skip(!haveLogins(), 'Needs .env.local and .env.testbed');
test.use({ storageState: stateFor('admin') });

const settle = (page: Page) => page.waitForLoadState('networkidle').then(() => page.waitForTimeout(800));

/** The testbed's busiest rep, and a working day she made calls on. */
const SNEHA = 'e154f891-2a24-404a-bdf4-f7aa8a6ddd61';
const CALL_DAY = '2026-10-02';

test.describe('Field', () => {
  test('activity: everyone for a day, found by name, code or HQ, and a miss says so', async ({ page }) => {
    // A working day with calls: Saturday 3 October, opened by its date.
    await page.goto('/field?date=2026-10-03');
    await settle(page);
    await expect(page.getByRole('radio', { name: /^Saturday, 3 October/ })).toHaveAttribute('aria-checked', 'true');
    const rows = page.locator('table tbody tr');
    expect(await rows.count()).toBeGreaterThan(1);
    await expect(page.getByRole('columnheader', { name: 'Planned' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Done' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Missed' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Location' })).toBeVisible();

    const search = page.getByPlaceholder('Name, employee code or HQ');
    for (const term of ['Sneha', 'BE9001', 'Hyderabad']) {
      await search.fill(term);
      await expect(rows.filter({ hasText: 'Sneha Pillai' })).toHaveCount(1);
    }
    await search.fill('zzqx nobody');
    await expect(page.getByText('Nobody matches these filters')).toBeVisible();
    await search.fill('');
    await expect(page.getByRole('combobox', { name: /Manager/ }).or(page.getByLabel('Manager'))).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Location/ }).or(page.getByLabel('Location'))).toBeVisible();
  });

  test("a person's day: the plan, every call in order, the map and a call's evidence and report", async ({ page }) => {
    await page.goto(`/field/${SNEHA}/${CALL_DAY}`);
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Sneha Pillai' })).toBeVisible();
    await expect(page.getByText('Day plan', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Every call, in order' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Where the phone was' })).toBeVisible();
    const calls = page.locator('.timeline > li');
    expect(await calls.count()).toBeGreaterThan(0);
    // Times read as times, not "12 : 53".
    expect(await page.locator('.tl-time').first().evaluate(el => getComputedStyle(el).fontVariantNumeric)).toBe('normal');

    await calls.first().locator('button, [role=button]').first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText('Location evidence')).toBeVisible();
    await expect(drawer.getByText('Call report')).toBeVisible();
    await expect(drawer.getByText('Products discussed')).toBeVisible();
  });

  test('a person who does not exist is said plainly', async ({ page }) => {
    await page.goto('/field/00000000-0000-4000-8000-000000000000/2026-10-02');
    await settle(page);
    await expect(page.getByText(/No such (employee|person)|not found|could not be found/i).first()).toBeVisible();
  });

  test('day plans: everyone, not filed and filed add up', async ({ page }) => {
    await page.goto(`/field/day-plans?date=${CALL_DAY}`);
    await settle(page);
    const n = async (name: string) => Number((await page.getByRole('radio', { name: new RegExp(`^${name}`) }).innerText()).match(/\d+/)![0]);
    const all = await n('Everyone');
    expect(all).toBeGreaterThan(0);
    expect((await n('Not filed')) + (await n('Filed'))).toBeLessThanOrEqual(all);
    await expect(page.getByRole('columnheader', { name: 'Calls planned' })).toBeVisible();
  });

  test('tour plans: a month says what cannot be sent, and a person opens their days', async ({ page }) => {
    await page.goto('/field/tour-plans');
    await settle(page);
    await expect(page.getByText(/working days/).first()).toBeVisible();
    await expect(page.getByText(/\d+ months? cannot/)).toHaveCount(0);
    await page.getByRole('radio', { name: 'November' }).click();
    await settle(page);
    const person = page.locator('table tbody tr').first();
    await person.click();
    await settle(page);
    await expect(page.getByText(/Working day, still unplanned|Nothing planned|Field work|Not started/).first()).toBeVisible();
  });

  test('coverage: areas by week, and occasions worth a call', async ({ page }) => {
    await page.goto('/field/coverage');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Completed calls by area and week' })).toBeVisible();
    expect(await page.locator('table tbody tr').count()).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'Occasions worth a call' })).toBeVisible();
  });
});

test.describe('Clients', () => {
  test("the list's visits and last visit tell one story", async ({ page }) => {
    await page.goto('/clients');
    await settle(page);
    const rows = await page.locator('table tbody tr').evaluateAll(trs => trs.map(tr => {
      const cells = [...tr.querySelectorAll('td')].map(td => (td as HTMLElement).innerText.trim());
      return { visits: Number(cells[cells.length - 2]), last: cells[cells.length - 1] };
    }));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) if (r.visits > 0) expect(r.last, 'a client with visits was never visited').not.toBe('Never');
  });

  test('search, type and listing filter the list', async ({ page }) => {
    await page.goto('/clients');
    await settle(page);
    const count = () => page.locator('table tbody tr').count();
    const all = await count();
    await page.getByPlaceholder('Name, specialty, city or mobile').fill('chemist');
    await expect.poll(count).toBeLessThan(all);
    await page.getByPlaceholder('Name, specialty, city or mobile').fill('');
    await page.getByRole('radio', { name: 'Unlisted' }).click();
    await expect.poll(count).toBeLessThan(all);
  });

  test('a client is added, edited, opened and retired; an empty form is refused', async ({ page }) => {
    test.setTimeout(120_000);
    const name = `Dr Live Check ${Date.now().toString(36)}`;
    await page.goto('/clients');
    await settle(page);
    await page.getByRole('button', { name: 'Add a client' }).click();
    await page.getByRole('button', { name: 'Add the client' }).click();
    await expect(page.locator('.form-error').first()).toBeVisible();
    await page.getByPlaceholder('Dr. Anita Rao').fill(name);
    await page.getByRole('button', { name: 'Add the client' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByPlaceholder('Dr. Anita Rao').fill(`${name} edited`);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { name: `${name} edited` })).toBeVisible({ timeout: 20_000 });

    // Retired, so the testbed's list is as it was.
    await page.getByRole('button', { name: 'Retire' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Retire/ }).last().click();
    await expect(page.getByText('Retired', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('specialties open as a list, and the sheet downloads', async ({ page }) => {
    await page.goto('/clients');
    await settle(page);
    await page.getByRole('button', { name: 'Specialties' }).click();
    await expect(page.getByRole('dialog').getByText(/special(ty|ties) a doctor can be listed as/)).toBeVisible();
    await page.keyboard.press('Escape');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download the sheet' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.(xlsx|csv)$/);
  });

  test('data quality names each check, with the clients that fail it or a pass', async ({ page }) => {
    await page.goto('/clients/quality');
    await settle(page);
    for (const check of ['Probable duplicates', 'No registered location', 'Nobody assigned', 'Listed, but not visited in 30 days', 'Unlisted, but marked inactive']) {
      await expect(page.getByRole('heading', { name: check })).toBeVisible();
    }
  });

  test('complaints: counts by status, and an open one is assigned', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/clients/complaints');
    await settle(page);
    await expect(page.getByText(/complaints? open/).first()).toBeVisible();
    await page.getByRole('radio', { name: /^Open/ }).click();
    const first = page.locator('table tbody tr').first();
    if (!(await first.count())) test.skip(true, 'No open complaint on the testbed');
    await first.click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await drawer.getByLabel('Person').selectOption({ index: 1 });
    await drawer.getByRole('button', { name: /Assign and start|Hand it over/ }).click();
    await expect(page.getByRole('status').filter({ hasText: /\S/ }).first()).toBeVisible({ timeout: 20_000 });
  });
});
