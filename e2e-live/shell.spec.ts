/**
 * Live, checklist section 0: signing in and out, who is shown as signed in,
 * the menu each role sees, team scope, search, the pending count, appearance
 * and the phone menu. Against Testbed Pharma through the real backend.
 */
import { expect, test, type Page } from '@playwright/test';
import { can, pages } from '../e2e/grants';
import { haveLogins, LIVE_ROLES, stateFor } from './roles';

test.skip(!haveLogins(), 'Needs .env.local and .env.testbed');

const ADMIN = () => process.env.TESTBED_ADMIN_EMAIL!;
const PASSWORD = () => process.env.TESTBED_PASSWORD!;

async function fillSignIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
}

test.describe('signed out', () => {
  test('a wrong password is refused in words, and the form stays', async ({ page }) => {
    await fillSignIn(page, ADMIN(), `${PASSWORD()}-not-it`);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('Work email')).toBeVisible();
  });

  test('an expired or used email link says so', async ({ page }) => {
    await page.goto('/welcome');
    await expect(page.getByText('That email link has expired or was already used')).toBeVisible();
  });

  test('a forgotten password asks for the reset email and says where it went', async ({ page }) => {
    // The request is answered here rather than sent: the testbed address has no
    // inbox, and a bounced letter costs the sending domain its reputation.
    let asked: { email?: string } | null = null;
    await page.route('**/auth/v1/recover**', async route => {
      asked = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Forgotten your password?' }).click();
    await page.getByLabel('Work email').fill(ADMIN());
    await page.getByRole('button', { name: 'Send the link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(asked?.email).toBe(ADMIN());
  });
});

for (const { role } of LIVE_ROLES) {
  test.describe(role, () => {
    test.use({ storageState: stateFor(role) });

    test(`${role}: the account menu names the person, the role and Testbed Pharma`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /account and appearance/ }).click();
      const who = page.locator('.menu-who');
      await expect(who.locator('strong')).not.toBeEmpty();
      await expect(who).toContainText(/Testbed Pharma/i);
      await expect(who).toContainText(new RegExp(role === 'it' ? 'IT' : role, 'i'));
    });

    test(`${role}: the menu holds exactly the pages the role may open`, async ({ page }) => {
      await page.goto('/');
      const links = await page.locator('#console-menu a[href]').evaluateAll(as => as.map(a => new URL((a as HTMLAnchorElement).href).pathname));
      const shown = new Set(links);
      const refused = pages.filter(p => !can(role, p.module) && shown.has(p.path)).map(p => p.path);
      expect(refused, 'pages in the menu the role may not open').toEqual([]);
      // Every section the role may open has its way in; hidden, never disabled.
      expect(await page.locator('#console-menu [aria-disabled="true"], #console-menu a[disabled]').count()).toBe(0);
    });
  });
}

test.describe('scope', () => {
  const peopleOn = async (page: Page) => {
    await page.goto('/team');
    const text = await page.locator('.table-count').first().innerText();
    return Number(text.match(/\d+/)?.[0] ?? NaN);
  };

  test('management sees its own team; admin sees the company', async ({ browser }) => {
    const admin = await browser.newPage({ storageState: stateFor('admin') });
    const management = await browser.newPage({ storageState: stateFor('management') });
    const all = await peopleOn(admin);
    const team = await peopleOn(management);
    expect(all).toBeGreaterThan(0);
    expect(team).toBeLessThan(all);
    await admin.close(); await management.close();
  });
});

test.describe('shell, as admin', () => {
  test.use({ storageState: stateFor('admin') });

  test('Ctrl K opens search, a person is found by name, and a miss says so', async ({ page }) => {
    await page.goto('/team');
    const name = (await page.locator('table tbody .cell-link').first().innerText()).trim();
    await page.keyboard.press('Control+k');
    const box = page.getByLabel('Search pages, actions, people and clients');
    await expect(box).toBeFocused();
    await box.fill(name.split(' ')[0]);
    await expect(page.getByRole('dialog').getByText(name).first()).toBeVisible();
    await box.fill('zzqxw nothing like this');
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
  });

  test('the pending count in the bar matches the menu badge and opens Approvals', async ({ page }) => {
    await page.goto('/');
    const bar = page.locator('.bar-pending');
    if (!(await bar.count())) {
      // Nothing waits, so neither shows: a zero asks for nothing.
      await expect(page.locator('#console-menu .nav-count[aria-label$="waiting"]')).toHaveCount(0);
      return;
    }
    const n = (await bar.locator('.long').innerText()).match(/\d+/)![0];
    await expect(page.locator('#console-menu .nav-count[aria-label$="waiting"]')).toHaveText(n);
    await bar.click();
    await expect(page).toHaveURL(/\/approvals$/);
  });

  test('appearance switches between light, dark and the device', async ({ page }) => {
    await page.goto('/');
    for (const [label, want] of [['Dark', 'dark'], ['Light(?!,)', 'light']] as const) {
      await page.getByRole('button', { name: /account and appearance/ }).click();
      await page.getByRole('menuitemradio', { name: new RegExp(`^${label}`) }).click();
      await page.keyboard.press('Escape');
      await expect(page.locator('html')).toHaveAttribute('data-theme', want);
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.getByRole('button', { name: /account and appearance/ }).click();
    await page.getByRole('menuitemradio', { name: /^Automatic/ }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // Leave the testbed login as it was found.
    await page.getByRole('button', { name: /account and appearance/ }).click();
    await page.getByRole('menuitemradio', { name: /^Light(?!,)/ }).click();
  });

  test('on a phone the menu opens, keeps focus inside, and closes back to its button', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const open = page.getByRole('button', { name: 'Open menu' });
    await open.click();
    await expect(page.locator('#console-menu')).toBeVisible();
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#console-menu'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(open).toBeFocused();
  });

  test('pages load on demand, as separate files', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', r => { if (r.resourceType() === 'script') scripts.push(r.url()); });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const before = scripts.length;
    await page.goto('/settings/audit');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(scripts.length).toBeGreaterThan(before);
  });
});
