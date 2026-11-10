import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { measureTargets } from './helpers/targets';

// Touch targets: at least 44×44, proven by box size or by hit-testing (R33).
test.skip(
  ({ viewport }) => viewport?.width !== 1194 && viewport?.width !== 390,
  'target checks run on tablet-landscape and phone',
);

// Each page waits for its real content (dev pages are lazy-loaded), then must measure at least
// `min` elements so the check can never silently shrink to the top bar again. Floors come from a
// green run: tablet top bar = 6 (wordmark, 4 modes, theme); phone top bar = 3 (wordmark, Menu,
// theme). Each mode page adds 3 links to the other modes, home adds 4; /kit measured 62/59 and
// /forge-preview 89/86 with a rolled generator card (tablet/phone).
type Floor = { tablet: number; phone: number };
const PAGES: { path: string; ready: (p: Page) => Locator; min: Floor }[] = [
  {
    path: '/',
    ready: (p) => p.getByRole('heading', { level: 1, name: 'Prep Desk' }),
    min: { tablet: 10, phone: 7 },
  },
  {
    path: '/prep',
    ready: (p) => p.getByRole('heading', { level: 1, name: 'Prep' }),
    min: { tablet: 9, phone: 6 },
  },
  {
    path: '/table',
    ready: (p) => p.getByRole('heading', { level: 1, name: 'Table' }),
    min: { tablet: 9, phone: 6 },
  },
  {
    path: '/codex',
    ready: (p) => p.getByRole('heading', { level: 1, name: 'Codex' }),
    min: { tablet: 9, phone: 6 },
  },
  {
    path: '/forge',
    ready: (p) => p.getByRole('heading', { level: 1, name: 'Forge' }),
    min: { tablet: 9, phone: 6 },
  },
  {
    path: '/kit',
    ready: (p) => p.getByRole('heading', { name: 'Keys' }).first(),
    min: { tablet: 55, phone: 52 },
  },
  {
    path: '/forge-preview',
    ready: (p) => p.getByRole('button', { name: 'Lock name' }),
    min: { tablet: 81, phone: 78 },
  },
];

for (const { path, ready, min } of PAGES) {
  test(`${path}: interactive targets are at least 44x44`, async ({ page }, testInfo) => {
    await page.goto(path);
    if (path === '/forge-preview') {
      await page.getByRole('button', { name: 'Create NPC' }).click();
      await page.getByRole('button', { name: 'Roll', exact: true }).click();
    }
    await expect(ready(page)).toBeVisible();
    const { checked, small } = await measureTargets(page);
    testInfo.annotations.push({ type: 'checked', description: `${path}: ${checked}` });
    const floor = testInfo.project.name === 'phone' ? min.phone : min.tablet;
    expect(checked, `${path} measured elements`).toBeGreaterThanOrEqual(floor);
    expect(small, path).toEqual([]);
  });
}

test.describe('phone Menu', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'the Menu only shows at phone width');

  test("the open Menu's stacked links are at least 44x44", async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Prep Desk' })).toBeVisible();
    await page.getByRole('button', { name: 'Menu' }).click();
    const nav = page.locator('#topbar-modes');
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(4);
    const { checked, small } = await measureTargets(page);
    // wordmark, Menu, theme, 4 open mode links, 4 home links
    expect(checked).toBeGreaterThanOrEqual(11);
    // the open menu is a 2x2 grid of keys
    const cols = await nav.evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(' '));
    expect(cols).toHaveLength(2);
    const tops = await nav
      .getByRole('link')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(2);
    expect(small).toEqual([]);
  });
});
