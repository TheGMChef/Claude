import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// A fixed seed whose marsh-culture NPC "role" entry carries the `religion` safety tag (found by
// scanning probe seeds with the engine; content is fixed, so it stays valid until that table changes).
const RELIGION_SEED = 'YSFV-53MC';
// NB: share codes don't carry the culture (R27), so this seed assumes the page's first culture tab
// (Marsh-folk), which is what /forge-preview selects on load.

const FIELDS = ['name', 'role', 'look', 'want', 'secret', 'voice', 'tell'];
const snapshot = (page: Page) =>
  Promise.all(FIELDS.map((f) => page.getByTestId(`field-value-${f}`).innerText()));
const shareCode = (page: Page) => page.getByTestId('share-code').innerText();

test('lock -> reroll -> copy -> paste -> identical card', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/forge-preview');

  await page.getByRole('button', { name: 'Create NPC' }).click();
  const first = await snapshot(page);

  await page.getByRole('button', { name: 'Lock name' }).click();
  await expect(page.getByRole('button', { name: 'Unlock name' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Reroll' }).click();
  const second = await snapshot(page);
  expect(second[0]).toBe(first[0]); // the locked name survives
  expect(second.slice(1)).not.toEqual(first.slice(1)); // everything else is rerolled

  const code = await shareCode(page);
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}\./);
  // The code is SEED.L<locks>.N<nonces>: the clipboard read below is mandatory.
  await page.getByRole('button', { name: 'Copy share code' }).click();
  await expect(page.getByRole('status')).toHaveText('Copied');
  const pasted = await page.evaluate(() => navigator.clipboard.readText());
  expect(pasted).toBe(code);

  // Start a different card, then load the copied code: it must be identical to the rerolled one.
  await page.getByRole('button', { name: 'Create NPC' }).click();
  expect(await snapshot(page)).not.toEqual(second);
  await page.getByLabel('Paste a code').fill(pasted);
  await page.getByRole('button', { name: 'Load' }).click();
  expect(await snapshot(page)).toEqual(second);
  expect(await shareCode(page)).toBe(code);
});

test('a bad code shows the error and keeps the card', async ({ page }) => {
  await page.goto('/forge-preview');
  await page.getByRole('button', { name: 'Create NPC' }).click();
  const before = await snapshot(page);
  await page.getByLabel('Paste a code').fill('nonsense code');
  await page.getByRole('button', { name: 'Load' }).click();
  await expect(page.getByRole('alert')).toContainText("That code doesn't look right");
  expect(await snapshot(page)).toEqual(before);
});

test('a Line blocks a locked field whose entry carries the tag (safety beats locks)', async ({
  page,
}) => {
  await page.goto('/forge-preview');
  await page.getByLabel('Paste a code').fill(RELIGION_SEED);
  await page.getByRole('button', { name: 'Load' }).click();
  const role = await page.getByTestId('field-value-role').innerText();
  expect(role).not.toBe('—');
  await expect(page.getByText('BLOCKED')).toHaveCount(0);

  await page.getByRole('button', { name: 'Lock role' }).click();
  await page.getByRole('checkbox', { name: 'Line religion' }).check();
  await expect(page.getByTestId('field-value-role')).toHaveText('—');
  await expect(page.getByText('BLOCKED')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlock role' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('/forge-preview has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/forge-preview');
  await page.getByRole('button', { name: 'Create NPC' }).click();
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) })),
  ).toEqual([]);
});

test.describe('Menu at phone width', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'the Menu button only shows at phone width');

  test('opens, closes on Escape and returns focus to the button', async ({ page }) => {
    await page.goto('/forge-preview');
    const menu = page.getByRole('button', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#topbar-modes')).toBeHidden();

    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#topbar-modes')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forge', exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Codex', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#topbar-modes')).toBeHidden();
    await expect(menu).toBeFocused();
  });
});
