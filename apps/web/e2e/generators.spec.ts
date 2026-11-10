import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The 14 generators beyond the NPC (which forge.spec covers). Structure only: no generated text is
// pinned, so content edits never break this file.
const IDS = [
  'fantasy.clue',
  'fantasy.complication',
  'fantasy.encounter',
  'fantasy.place',
  'fantasy.prep.pressure',
  'fantasy.prep.spotlight',
  'fantasy.rumor',
  'fantasy.secret',
  'fantasy.seed',
  'fantasy.settlement',
  'fantasy.shop',
  'fantasy.tavern',
  'fantasy.treasure',
  'fantasy.trinket',
];

async function roll(page: Page, id: string) {
  await page.goto('/forge-preview');
  const section = page.getByRole('region', { name: 'Roll anything' });
  await section.getByLabel('Generator').selectOption(id);
  await section.getByRole('button', { name: 'Roll', exact: true }).click();
  await expect(page.getByTestId('gen-display')).toBeVisible();
  return section;
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`colorScheme ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    for (const id of IDS) {
      test(`${id} rolls a clean card`, async ({ page }) => {
        await roll(page, id);
        const display = (await page.getByTestId('gen-display').innerText()).trim();
        expect(display).not.toBe('');
        for (const bad of ['{', '[missing', 'undefined']) expect(display).not.toContain(bad);
        expect(display.toLowerCase()).not.toBe('nothing fits your safety settings');

        const values = page.locator('[data-testid^="gen-field-value-"]');
        const n = await values.count();
        expect(n).toBeGreaterThan(0);
        for (let i = 0; i < n; i++) {
          const text = (await values.nth(i).innerText()).trim();
          const name = await values.nth(i).getAttribute('data-testid');
          expect(text, name ?? '').not.toBe('');
        }

        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze();
        expect(
          violations
            .filter((v) => v.impact === 'serious' || v.impact === 'critical')
            .map((v) => ({ id: v.id, nodes: v.nodes.map((x) => x.target.join(' ')) })),
        ).toEqual([]);

        const fits = await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        );
        expect(fits, 'no horizontal page overflow').toBe(true);
      });
    }
  });
}

test('the selector offers all 15 generators', async ({ page }) => {
  await page.goto('/forge-preview');
  const select = page.getByRole('region', { name: 'Roll anything' }).getByLabel('Generator');
  await expect(select.locator('option')).toHaveCount(15);
  await expect(select).toHaveValue('fantasy.place');
});
