import { expect, test } from '@playwright/test';

// The minimum journey: create a campaign, roll, hold, roll again, save, find it, open it, delete it.
test('create campaign, roll, save to the Codex, search, open and delete', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByRole('link', { name: 'Create campaign' }).click();
  await page.getByLabel('Campaign name').fill('The Marrow Coast');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByRole('heading', { name: 'Forge', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: /^Roll/ }).click();
  const display = page.getByTestId('forge-display');
  await expect(display).not.toBeEmpty();
  const name = await page.getByTestId('forge-field-name').innerText();

  // Hold the name, roll again: the held name stays.
  await page.getByRole('button', { name: 'Hold Name' }).click();
  await page.getByRole('button', { name: 'Roll again' }).click();
  await expect(page.getByTestId('forge-field-name')).toHaveText(name);

  await page.getByRole('button', { name: 'Save to Codex' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

  await page.goto(page.url().replace(/forge$/, 'codex'));
  await expect(page.getByRole('heading', { name: 'Codex', level: 1 })).toBeVisible();
  await expect(page.locator('.entry-list a', { hasText: name })).toBeVisible();

  const word = name.split(' ')[0] ?? name;
  await page.getByLabel('Search your Codex').fill(word);
  await expect(page.locator('.entry-list a', { hasText: name })).toBeVisible();
  await page.getByLabel('Search your Codex').fill('zzzzqqqq');
  await expect(page.getByText('Nothing matches that')).toBeVisible();
  await page.getByRole('button', { name: 'Clear the search' }).click();

  await page.locator('.entry-list a', { hasText: name }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Delete this entry' }).click();
  await page.getByRole('button', { name: 'Delete entry' }).click();
  await expect(page.getByText('Your Codex is empty')).toBeVisible();

  expect(errors).toEqual([]);
});
