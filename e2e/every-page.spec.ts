/**
 * Every page opens, without an error, for every role it is granted to; and a
 * page outside a role says which permission it needs instead of breaking.
 * The grants are the old console's matrix (src/app/access.ts).
 */
import { expect, test } from '@playwright/test';
import { as, watchErrors, type Role } from './helpers';
import { readFileSync } from 'node:fs';

// Every menu page, read from the menu itself so a new page is tested the day it is added.
const nav = readFileSync(new URL('../src/app/nav.ts', import.meta.url), 'utf8');
const pages = [...nav.matchAll(/path: '([^']+)', label: '([^']+)', module: '([^']+)'/g)].map(m => ({ path: m[1], label: m[2].replace(/\\'/g, "'"), module: m[3] }));

/** The old console's grants (Mr_Sales_Web/src/data/store.ts GRANTS), written out as the specification, plus chat for every role (owner decision, 5 October 2026), pay setup for the roles that pay or set expense rules, and announcements for owner, admin, HR and management (6 October 2026). */
const GRANTS: Record<Role, string[]> = {
  owner: ['*'],
  admin: ['dashboard', 'attention', 'field', 'clients', 'sales', 'orders', 'targets', 'products', 'stockists', 'people', 'org', 'geo', 'roles', 'resources', 'surveys', 'complaints', 'tours', 'rcpa', 'coverage', 'stock', 'onboarding', 'hr', 'tasks', 'notifications', 'ownership', 'reports', 'exports', 'config', 'paysetup', 'users', 'approvals', 'leave', 'expenses', 'attendance', 'audit', 'help', 'billing', 'chat', 'announcements'],
  hr: ['dashboard', 'attention', 'people', 'org', 'roles', 'attendance', 'leave', 'documents', 'tours', 'hr', 'onboarding', 'payroll', 'paysetup', 'ownership', 'reports', 'exports', 'config', 'approvals', 'help', 'chat', 'announcements'],
  it: ['dashboard', 'people', 'org', 'users', 'roles', 'audit', 'health', 'config', 'onboarding', 'help', 'chat'],
  finance: ['dashboard', 'attention', 'expenses', 'approvals', 'sales', 'orders', 'targets', 'people', 'payroll', 'paysetup', 'reports', 'exports', 'config', 'help', 'billing', 'chat'],
  management: ['dashboard', 'attention', 'field', 'clients', 'sales', 'orders', 'targets', 'people', 'resources', 'surveys', 'complaints', 'tours', 'rcpa', 'coverage', 'stock', 'stockists', 'tasks', 'notifications', 'reports', 'exports', 'expenses', 'help', 'chat', 'announcements'],
};
const can = (role: Role, module: string) => GRANTS[role].includes('*') || GRANTS[role].includes(module);

test('the menu was read', () => expect(pages.length).toBeGreaterThan(35));
const roles: Role[] = ['owner', 'admin', 'hr', 'it', 'finance', 'management'];

for (const role of roles) {
  test(`every page ${role} may open renders, and the rest say why not`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await as(page, role);
    for (const p of pages) {
      await page.goto(p.path);
      if (can(role, p.module)) {
        await expect(page.getByRole('heading', { level: 1 }).first(), p.path).toBeVisible();
        await expect(page.getByText(/is not open to your role|There is no page here|being rebuilt/), p.path).toHaveCount(0);
        await expect(page.getByText(/could not be read|Could not read/), p.path).toHaveCount(0);
      } else {
        await expect(page.getByText(`${p.label} is not open to your role`), p.path).toBeVisible();
      }
      expect(errors, `${p.path} as ${role}`).toEqual([]);
    }
  });
}

test('no page scrolls sideways on a phone', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await as(page, 'owner');
  for (const p of pages) {
    await page.goto(p.path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.waitForTimeout(250);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(over, p.path).toBeLessThanOrEqual(0);
  }
});
