import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Kit checks run on the primary (tablet-landscape) project only.
test.skip(({ viewport }) => viewport?.width !== 1194, 'kit checks run on tablet-landscape');

const PAPER_LIGHT = 'rgb(243, 237, 225)';
const PAPER_DARK = 'rgb(25, 23, 20)';

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) }));
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`colorScheme ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('/kit has no serious or critical axe violations', async ({ page }) => {
      await page.goto('/kit');
      await expect(page.getByRole('heading', { level: 1, name: 'Kit' })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });

    test('/kit sections render with their own theme and are screenshotted', async ({
      page,
    }, testInfo) => {
      await page.goto('/kit');
      const light = page.locator('.kit-theme[data-theme="light"]');
      const dark = page.locator('.kit-theme[data-theme="dark"]');
      // R26: the forced-light column stays light even when the OS prefers dark.
      await expect(light).toHaveCSS('background-color', PAPER_LIGHT);
      await expect(dark).toHaveCSS('background-color', PAPER_DARK);
      await light.screenshot({ path: testInfo.outputPath(`kit-light-section-${scheme}.png`) });
      await dark.screenshot({ path: testInfo.outputPath(`kit-dark-section-${scheme}.png`) });
    });
  });
}

test('/kit and /forge-preview: every button and link has an accessible name', async ({ page }) => {
  for (const path of ['/kit', '/forge-preview']) {
    await page.goto(path);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('button, a[href]')]
        .filter((el) => {
          const label = el.getAttribute('aria-label')?.trim();
          const text = el.textContent?.trim();
          const labelledBy = el.getAttribute('aria-labelledby');
          return !label && !text && !labelledBy;
        })
        .map((el) => el.outerHTML.slice(0, 120)),
    );
    expect(unnamed, path).toEqual([]);
  }
});

test('interactive targets are at least 44x44 CSS px', async ({ page }) => {
  for (const path of ['/kit', '/forge-preview', '/']) {
    await page.goto(path);
    const { checked, small } = await page.evaluate(() => {
      const sel = 'button, a[href], input, select, textarea, [role="tab"]';
      const all = [...document.querySelectorAll<HTMLElement>(sel)];
      const small = all
        .map((el) => {
          // A checkbox/radio is sized by its 44px label; judge the label instead.
          const box =
            el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
              ? (el.closest('label') ?? el)
              : el;
          const r = box.getBoundingClientRect();
          return { el: el.outerHTML.slice(0, 100), w: r.width, h: r.height, hidden: r.width === 0 };
        })
        .filter((x) => !x.hidden && (x.w < 43.5 || x.h < 43.5));
      return { checked: all.length, small };
    });
    expect(checked, `${path} has interactive elements`).toBeGreaterThan(3);
    expect(small, path).toEqual([]);
  }
});
