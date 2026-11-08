import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// R31: pressable controls are raised "keys" that sink on press. Tablet-landscape only.
test.skip(({ viewport }) => viewport?.width !== 1194, 'key checks run on tablet-landscape');

const DEPTH = 3;

/** translateY from a computed transform (`none` or `matrix(a, b, c, d, tx, ty)`). */
const translateY = (el: Locator) =>
  el.evaluate((n) => {
    const t = getComputedStyle(n).transform;
    if (t === 'none') return 0;
    return Number(t.slice(t.indexOf('(') + 1, -1).split(',')[5]);
  });

/** Vertical offset of the first (hard edge) shadow layer. */
const edgeOffset = (el: Locator) =>
  el.evaluate((n) => {
    const s = getComputedStyle(n).boxShadow;
    if (s === 'none') return 0;
    // Computed form: "rgb(...) 0px 3px 0px 0px, rgba(...) ..."; colour first, then lengths.
    const first = s.split(/,(?![^(]*\))/)[0] ?? '';
    const lengths = first
      .replace(/rgba?\([^)]*\)/, '')
      .trim()
      .split(/\s+/);
    return parseFloat(lengths[1] ?? '0');
  });

async function openKit(page: Page) {
  await page.goto('/kit');
  await expect(page.getByRole('heading', { level: 1, name: 'Kit' })).toBeVisible();
}

test('a solid key sinks by its depth while pressed and comes back up', async ({ page }) => {
  await openKit(page);
  const key = page.locator('.kit-theme[data-theme="light"] .btn--solid.btn--md').first();
  await expect(key).toBeVisible();
  expect(await translateY(key)).toBe(0);
  expect(await edgeOffset(key)).toBe(DEPTH);

  const box = await key.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => translateY(key)).toBeCloseTo(DEPTH, 1);
  await expect.poll(() => edgeOffset(key)).toBe(0);

  await page.mouse.up();
  await expect.poll(() => translateY(key)).toBe(0);
  await expect.poll(() => edgeOffset(key)).toBe(DEPTH);
});

test('keys only transition transform and box-shadow', async ({ page }) => {
  await openKit(page);
  const key = page.locator('.btn').first();
  const t = await key.evaluate((n) => {
    const s = getComputedStyle(n);
    return { property: s.transitionProperty, duration: s.transitionDuration };
  });
  expect(t.property).toBe('transform, box-shadow');
  expect(t.duration).toBe('0.09s, 0.09s');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('keys do not animate', async ({ page }) => {
    await openKit(page);
    const durations = await page
      .locator('.btn, .icon-btn, .tabs__tab, .dock-btn, .topbar__link')
      .evaluateAll((els) => els.map((n) => getComputedStyle(n).transitionDuration));
    expect(durations.length).toBeGreaterThan(10);
    for (const d of durations) expect(d.split(', ').every((x) => x === '0s')).toBe(true);
  });
});

test('the selected tab and the current page are pressed in', async ({ page }) => {
  await openKit(page);
  const tabs = page.locator('.kit-theme[data-theme="light"] [role="tab"]');
  const selected = tabs.and(page.locator('[aria-selected="true"]')).first();
  const other = tabs.and(page.locator('[aria-selected="false"]')).first();
  expect(await translateY(selected)).toBeCloseTo(DEPTH, 1);
  expect(await edgeOffset(selected)).toBe(0);
  expect(await translateY(other)).toBe(0);
  expect(await edgeOffset(other)).toBe(DEPTH);

  await page.goto('/prep');
  await expect(page.getByRole('heading', { level: 1, name: 'Prep' })).toBeVisible();
  const current = page.locator('.topbar__link[aria-current="page"]');
  expect(await translateY(current)).toBeCloseTo(DEPTH, 1);
});

test('no pill shapes remain on pressable controls or their rings', async ({ page }) => {
  for (const [path, h1] of [
    ['/kit', 'Kit'],
    ['/forge-preview', 'Forge preview'],
    ['/', 'Prep Desk'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: h1, exact: true })).toBeVisible();
    const { scanned, pills } = await page.evaluate(() => {
      const sel = 'button, a[href], [role="tab"], button .ink-outline, a .ink-outline';
      const els = [...document.querySelectorAll<HTMLElement>(sel)];
      const pills = els
        .filter((el) => {
          const s = getComputedStyle(el);
          return [
            s.borderTopLeftRadius,
            s.borderTopRightRadius,
            s.borderBottomLeftRadius,
            s.borderBottomRightRadius,
          ].some((r) => parseFloat(r) >= 100);
        })
        .map((el) => el.outerHTML.slice(0, 100));
      return { scanned: els.length, pills };
    });
    expect(scanned, `${path} scanned controls`).toBeGreaterThan(3);
    expect(pills, path).toEqual([]);
  }
});
