import { expect, test } from '@playwright/test';

const ROUTES: { path: string; h1: string }[] = [
  { path: '/', h1: 'Prep Desk' },
  { path: '/prep', h1: 'Prep' },
  { path: '/table', h1: 'Table' },
  { path: '/codex', h1: 'Codex' },
  { path: '/forge', h1: 'Forge' },
  { path: '/kit', h1: 'Kit' },
  { path: '/forge-preview', h1: 'Forge preview' },
];

for (const { path, h1 } of ROUTES) {
  test(`${path} renders "${h1}" with no horizontal page scroll`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: h1, exact: true })).toBeVisible();

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
  });
}
