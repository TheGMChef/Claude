import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Dialog, EmptyState and Pagination on /kit (M1). Light and dark, axe, hit-test, overflow.
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`colorScheme ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('page has no horizontal overflow and Pagination/EmptyState keys are 44px and hit-testable', async ({
      page,
    }) => {
      await page.goto('/kit');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const keys = page.locator('.pagination button, .empty-state .btn').first().locator('..');
      await expect(keys).toBeVisible();
      for (const loc of await page.locator('.pagination button, .empty-state .btn').all()) {
        await loc.scrollIntoViewIfNeeded();
        const box = (await loc.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        const hit = await loc.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!top && el.contains(top);
        });
        expect(hit).toBe(true);
      }
    });

    test('an open Dialog is accessible, traps focus, and Escape returns focus', async ({
      page,
    }, testInfo) => {
      await page.goto('/kit');
      const opener = page.getByRole('button', { name: 'Delete entry (demo)' }).first();
      await opener.scrollIntoViewIfNeeded();
      await opener.click();
      const dlg = page.getByRole('dialog', { name: "Delete entry 'Captain Vell'?" });
      await expect(dlg).toBeVisible();
      await expect(dlg.getByRole('button', { name: 'Cancel' })).toBeFocused();
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(
        violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => v.id),
      ).toEqual([]);
      for (const name of ['Cancel', 'Delete entry']) {
        const box = (await dlg.getByRole('button', { name }).boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath(`dialog-${scheme}.png`) });
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dlg).toBeHidden();
      await expect(opener).toBeFocused();
    });
  });
}
