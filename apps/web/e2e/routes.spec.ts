import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedCampaignRaw } from './helpers/seed';

async function noHorizontalScroll(page: Page) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
  }));
  expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
  // The app must not hide overflow to pass the check above.
  expect(m.bodyOverflowX).not.toBe('hidden');
  expect(m.htmlOverflowX).not.toBe('hidden');
}

// With no campaign: the first-run desk, the redirects, and the dev pages.
const FIRST_RUN: { path: string; h1: string; lands: string }[] = [
  { path: '/', h1: 'Prep Desk', lands: '/' },
  { path: '/prep', h1: 'Prep Desk', lands: '/' },
  { path: '/table', h1: 'Prep Desk', lands: '/' },
  { path: '/codex', h1: 'Create a campaign', lands: '/campaigns/new' },
  { path: '/forge', h1: 'Create a campaign', lands: '/campaigns/new' },
  { path: '/campaigns/new', h1: 'Create a campaign', lands: '/campaigns/new' },
  { path: '/kit', h1: 'Kit', lands: '/kit' },
  { path: '/forge-preview', h1: 'Forge preview', lands: '/forge-preview' },
  { path: '/no/such/page', h1: 'Nothing here', lands: '/no/such/page' },
];

for (const { path, h1, lands } of FIRST_RUN) {
  test(`${path} renders "${h1}" with no horizontal page scroll`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: h1, exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(lands);
    await noHorizontalScroll(page);
  });
}

test('campaign routes render their h1, the redirects follow the current campaign, no horizontal scroll', async ({
  page,
}) => {
  const cid = await seedCampaignRaw(page);
  const routes: [string, string][] = [
    [`/c/${cid}/forge`, 'Forge'],
    [`/c/${cid}/codex`, 'Codex'],
    [`/c/${cid}/codex/new`, 'Create an entry'],
    [`/c/${cid}/settings`, 'Settings'],
    [`/c/${cid}/codex/ent_X`, 'Nothing here'],
    [`/c/${cid}/codex/ent_X/edit`, 'Nothing here'],
  ];
  for (const [path, h1] of routes) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: h1, exact: true })).toBeVisible();
    await noHorizontalScroll(page);
  }
  await page.goto('/codex');
  await expect(page).toHaveURL(new RegExp(`/c/${cid}/codex$`));
  await page.goto('/forge');
  await expect(page).toHaveURL(new RegExp(`/c/${cid}/forge$`));
  await page.goto(`/c/${cid}`);
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/c/cmp_NOPE000000000000/forge');
  await expect(
    page.getByText("We can't find that campaign. It may have been deleted."),
  ).toBeVisible();
  await noHorizontalScroll(page);
});
