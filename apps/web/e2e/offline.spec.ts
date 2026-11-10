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
  const reloaded = await page.reload();
  expect(reloaded?.fromServiceWorker()).toBe(true);
  await expect(page.getByText('Prep Desk').first()).toBeVisible();

  // A placeholder path that now redirects: the redirect works offline too.
  await page.goto('/table');
  await expect(page.getByRole('heading', { level: 1, name: 'Prep Desk' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
  // fonts.check() is also true for an undeclared family, so require a real, loaded FontFace.
  await expect
    .poll(() =>
      page.evaluate(async (f) => {
        const loaded = await document.fonts.load(f);
        return {
          check: document.fonts.check(f),
          faces: loaded
            .filter((x) => x.family.includes('Instrument Sans Variable'))
            .map((x) => x.status),
        };
      }, FONT),
    )
    .toEqual({ check: true, faces: expect.arrayContaining(['loaded']) });
  await expect(page.getByText('Update ready')).toHaveCount(0);

  // Pages keep loading offline (campaign routes need a campaign; M10 extends this).
  for (const [path, h1] of [
    ['/campaigns/new', 'Create a campaign'],
    ['/kit', 'Kit'],
    ['/forge-preview', 'Forge preview'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: h1, exact: true })).toBeVisible();
  }
});
