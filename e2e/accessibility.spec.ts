/**
 * Every page passes the automatic accessibility checks (axe, WCAG 2.1 AA):
 * contrast, labels, names, landmarks and roles, in light and in dark.
 * Automatic checks catch only part of what matters; keyboard order and
 * focus are checked in team.spec.ts and work.spec.ts by driving the page.
 */
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { as } from './helpers';

// Content that fades in is measured where it settles, not halfway through.
test.use({ reducedMotion: 'reduce' });

const nav = readFileSync(new URL('../src/app/nav.ts', import.meta.url), 'utf8');
const paths = [...nav.matchAll(/path: '([^']+)', label: '[^']+', module: '[^']+'/g)].map(m => m[1]);

for (const theme of ['light', 'dark'] as const) {
  test(`every page passes axe in ${theme}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(t => { try { localStorage.setItem('mrsales.theme', t); } catch { /* light */ } }, theme);
    await as(page, 'owner');
    const found: string[] = [];
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await page.waitForTimeout(700);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      for (const v of r.violations) found.push(`${path} · ${v.id} · ${v.nodes.length} · ${v.nodes[0]?.target.join(' ')} · ${v.nodes[0]?.failureSummary?.split('\n')[1]?.trim() ?? ''}`);
    }
    expect(found, found.join('\n')).toEqual([]);
  });
}

// Hover is a colour too, and axe only measures it when something is hovered:
// the light accent's hover once put white button text at 4.3:1.
for (const theme of ['light', 'dark'] as const) {
  test(`a hovered button and link keep their contrast in ${theme}`, async ({ page }) => {
    await page.addInitScript(t => { try { localStorage.setItem('mrsales.theme', t); } catch { /* light */ } }, theme);
    await as(page, 'owner');
    await page.waitForTimeout(700);
    for (const target of [page.locator('main .btn-primary').first(), page.locator('main a:not(.btn)').first()]) {
      await target.hover();
      await page.waitForTimeout(400);
      const r = await new AxeBuilder({ page }).withRules(['color-contrast']).include('main').analyze();
      expect(r.violations.flatMap(v => v.nodes.map(n => n.target.join(' ')))).toEqual([]);
    }
  });
}
