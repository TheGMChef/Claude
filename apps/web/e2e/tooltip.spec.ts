import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// ux-audit icon-buttons: icon-only keys get a real tooltip on hover and on keyboard focus,
// kept inside the viewport (the theme key sits on the right edge), never a native title.
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('the theme key shows a tooltip on hover, inside the viewport and without page overflow', async ({
  page,
}) => {
  await page.goto('/');
  const key = page.getByRole('button', { name: /^Switch to \w+ theme$/ });
  await expect(key).not.toHaveAttribute('title', /.+/);
  await key.hover();
  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(/^Switch to \w+ theme$/);
  const box = await tip.boundingBox();
  const vw = page.viewportSize()?.width ?? 0;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
  expect(await noOverflow(page)).toBe(true);
  await page.mouse.move(0, 400);
  await expect(tip).toHaveCount(0);
});

test('keyboard focus shows the tooltip and Escape dismisses it', async ({ page }) => {
  await page.goto('/kit');
  const key = page.getByRole('button', { name: 'Roll again', exact: true }).first();
  await key.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tooltip')).toHaveText('Roll again');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  expect(await noOverflow(page)).toBe(true);
});
