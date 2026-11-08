import { expect, test } from '@playwright/test';

// Service workers are per-origin: keep this file to one worker and run it on one viewport.
test.describe.configure({ mode: 'serial' });
test.skip(({ viewport }) => viewport?.width !== 1194, 'offline checks run on tablet-landscape');

const FONT = '16px "Instrument Sans Variable"';

test('works offline after the first load', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Prep Desk' })).toBeVisible();

  // A first-ever worker activates and controls the page once it navigates again.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active?.state !== 'activated') {
      await new Promise<void>((resolve) => {
        reg.active?.addEventListener('statechange', () => {
          if (reg.active?.state === 'activated') resolve();
        });
      });
    }
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state))
    .toBe('activated');
  // "Update ready" must not appear for a first install.
  await expect(page.getByText('Update ready')).toHaveCount(0);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Prep Desk').first()).toBeVisible();

  await page.goto('/table');
  await expect(page.getByRole('heading', { level: 1, name: 'Table' })).toBeVisible();
  await expect.poll(() => page.evaluate((f) => document.fonts.check(f), FONT)).toBe(true);
  await expect(page.getByText('Update ready')).toHaveCount(0);

  // Client-side navigation between modes keeps working offline.
  for (const [link, h1] of [
    ['Codex', 'Codex'],
    ['Forge', 'Forge'],
    ['Prep', 'Prep'],
  ] as const) {
    await page
      .getByRole('navigation', { name: /modes/i })
      .getByRole('link', { name: new RegExp(`^${link}`) })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1, name: h1, exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${link.toLowerCase()}$`));
  }
});
