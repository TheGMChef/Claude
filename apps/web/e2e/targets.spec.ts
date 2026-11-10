import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { seedCampaignRaw } from './helpers/seed';
import { measureTargets } from './helpers/targets';

const CID = 'cmp_E2E0000000000000';

// Touch targets: at least 44×44, proven by box size or by hit-testing (R33).
test.skip(
  ({ viewport }) => viewport?.width !== 1194 && viewport?.width !== 390,
  'target checks run on tablet-landscape and phone',
);

// Each page waits for its real content (dev pages are lazy-loaded), then must measure at least
// `min` elements so the check can never silently shrink to the top bar again. Floors come from a
// green run: with no campaign the top bar has 2 targets (wordmark, theme); with one, tablet = 5
// (wordmark, Forge, Codex, Settings, theme) and phone = 3 (wordmark, Menu, theme). The stub pages
// add nothing yet (their tasks raise the floors). /kit measured 62/59 and /forge-preview 89/86
// with a rolled generator card (tablet/phone).
type Floor = { tablet: number; phone: number };
const PAGES: { path: string; ready: (p: Page) => Locator; min: Floor; seeded?: true }[] = [
  {
    path: '/',
    ready: (p) => p.getByRole('heading', { level: 1, name: 'Prep Desk' }),
    min: { tablet: 2, phone: 2 },
  },
  {
    path: '/campaigns/new',
    ready: (p) => p.getByRole('heading', { level: 1, name: 'Create a campaign' }),
    min: { tablet: 2, phone: 2 },
  },
  {
    path: '/',
    seeded: true,
    ready: (p) => p.getByRole('heading', { level: 1, name: 'The Salt Marsh Debts' }),
    min: { tablet: 5, phone: 3 },
  },
  {
    path: `/c/${CID}/forge`,
    seeded: true,
    ready: (p) => p.getByRole('heading', { level: 1, name: 'Forge' }),
    min: { tablet: 5, phone: 3 },
  },
  {
    path: `/c/${CID}/codex`,
    seeded: true,
    ready: (p) => p.getByRole('heading', { level: 1, name: 'Codex' }),
    min: { tablet: 5, phone: 3 },
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

for (const { path, ready, min, seeded } of PAGES) {
  test(`${path}${seeded ? ' (with a campaign)' : ''}: interactive targets are at least 44x44`, async ({
    page,
  }, testInfo) => {
    if (seeded) await seedCampaignRaw(page);
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
    await seedCampaignRaw(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    const nav = page.locator('#topbar-modes');
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(3);
    const { checked, small } = await measureTargets(page);
    // wordmark, Menu, theme, 3 open campaign links
    expect(checked).toBeGreaterThanOrEqual(6);
    // the open menu is a two-column grid of keys (three keys: two rows)
    const cols = await nav.evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(' '));
    expect(cols).toHaveLength(2);
    const tops = await nav
      .getByRole('link')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(2);
    expect(small).toEqual([]);
  });
});
