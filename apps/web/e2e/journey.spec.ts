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

test('write an entry with a wiki link, create the missing page from the link, and edit', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/campaigns/new');
  await page.getByLabel('Campaign name').fill('Links');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByRole('heading', { name: 'Forge', level: 1 })).toBeVisible();
  await page.goto(page.url().replace(/forge$/, 'codex/new'));

  await page.getByLabel('Title').fill('Odrin Vey');
  await page.getByLabel('Notes').fill('Owes a debt to [[Marl Hollow]].');
  await page.getByRole('button', { name: 'Create entry' }).click();
  await expect(page.getByRole('heading', { name: 'Odrin Vey', level: 1 })).toBeVisible();

  // The target doesn't exist yet: the page offers to create it, and returns here afterwards.
  await page.getByRole('link', { name: 'Create “Marl Hollow”' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('Marl Hollow');
  await page.getByRole('button', { name: 'Create entry' }).click();
  await expect(page.getByRole('heading', { name: 'Odrin Vey', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Marl Hollow', exact: true })).toBeVisible();

  // Edit: change the summary, keep everything else.
  await page.getByRole('link', { name: 'Edit entry' }).click();
  await page.getByLabel('Summary').fill('A ferryman in debt');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('A ferryman in debt')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Marl Hollow', exact: true })).toBeVisible();

  expect(errors).toEqual([]);
});

test('back up a campaign, delete it, restore it from the first-run screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/campaigns/new');
  await page.getByLabel('Campaign name').fill('Restore me');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByRole('heading', { name: 'Forge', level: 1 })).toBeVisible();
  const codexUrl = page.url().replace(/forge$/, 'codex');
  await page.goto(page.url().replace(/forge$/, 'codex/new'));
  await page.getByLabel('Title').fill('Keep this');
  await page.getByRole('button', { name: 'Create entry' }).click();
  await expect(page.getByRole('heading', { name: 'Keep this', level: 1 })).toBeVisible();

  // Back up from Settings.
  await page.goto(page.url().replace(/codex\/.*$/, 'settings'));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const file = await download;
  const path = await file.path();

  // Delete the campaign: the desk is back to the first-run screen.
  await page.getByRole('button', { name: 'Delete this campaign' }).click();
  await page.getByRole('button', { name: 'Delete campaign' }).click();
  await expect(page.getByText('Start your first campaign')).toBeVisible();

  // Restore from the first-run screen.
  await page.locator('input[type=file]').setInputFiles(path);
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await expect(page.getByRole('heading', { name: 'Codex', level: 1 })).toBeVisible();
  await expect(page.locator('.entry-list a', { hasText: 'Keep this' })).toBeVisible();
  expect(page.url()).toBe(codexUrl);

  expect(errors).toEqual([]);
});

test('a double-click on Save to Codex saves one entry', async ({ page }) => {
  await page.goto('/campaigns/new');
  await page.getByLabel('Campaign name').fill('Once');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByRole('heading', { name: 'Forge', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /^Roll/ }).click();
  await expect(page.getByTestId('forge-display')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Save to Codex' }).dblclick();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await page.goto(page.url().replace(/forge$/, 'codex'));
  await expect(page.getByText('1 entry')).toBeVisible();
});

test("an edit in a stale tab does not overwrite another tab's change", async ({ context }) => {
  const a = await context.newPage();
  await a.goto('/campaigns/new');
  await a.getByLabel('Campaign name').fill('Two tabs');
  await a.getByRole('button', { name: 'Create campaign' }).click();
  await expect(a.getByRole('heading', { name: 'Forge', level: 1 })).toBeVisible();
  await a.goto(a.url().replace(/forge$/, 'codex/new'));
  await a.getByLabel('Title').fill('Original title');
  await a.getByRole('button', { name: 'Create entry' }).click();
  await expect(a.getByRole('heading', { name: 'Original title', level: 1 })).toBeVisible();
  const detailUrl = a.url();

  // Tab A opens the edit form and waits.
  await a.getByRole('link', { name: 'Edit entry' }).click();
  await expect(a.getByLabel('Title')).toHaveValue('Original title');

  // Tab B renames the entry.
  const b = await context.newPage();
  await b.goto(`${detailUrl}/edit`);
  await b.getByLabel('Title').fill('Renamed in tab B');
  await b.getByRole('button', { name: 'Save changes' }).click();
  await expect(b.getByRole('heading', { name: 'Renamed in tab B', level: 1 })).toBeVisible();

  // Tab A changes only the notes and saves: the new title must survive.
  await a.getByLabel('Notes').fill('Notes from tab A');
  await a.getByRole('button', { name: 'Save changes' }).click();
  await expect(a.getByRole('heading', { level: 1 })).toHaveText('Renamed in tab B');
  await expect(a.getByText('Notes from tab A')).toBeVisible();
});

test('the active top-bar tab is readable in dark mode', async ({ page, isMobile }) => {
  test.skip(isMobile === true, 'the phone collapses the bar into a Menu');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/campaigns/new');
  await page.getByLabel('Campaign name').fill('Dark');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByRole('heading', { name: 'Forge', level: 1 })).toBeVisible();
  const ratio = await page.locator('.topbar__link[aria-current="page"]').evaluate((el) => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const s = (v ?? 0) / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r ?? 0) + 0.7152 * f(g ?? 0) + 0.0722 * f(b ?? 0);
    };
    const cs = getComputedStyle(el);
    const l1 = lum(parse(cs.color));
    const l2 = lum(parse(cs.backgroundColor));
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('the Table: one-tap roll, oracle, GM move, save a roll to the Codex', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/campaigns/new');
  await page.getByLabel('Campaign name').fill('Live');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByRole('heading', { name: 'Forge', level: 1 })).toBeVisible();
  await page.goto(page.url().replace(/forge$/, 'table'));
  await expect(page.getByRole('heading', { name: 'Table', level: 1 })).toBeVisible();
  await expect(page.getByText('Nothing yet. Tap a roll above.')).toBeVisible();

  await page.getByRole('button', { name: 'NPC', exact: true }).click();
  await expect(page.getByTestId('table-roll')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Even odds' }).click();
  await expect(page.getByTestId('table-oracle')).toContainText(/Yes|No/);
  await page.getByRole('button', { name: 'Draw a GM move' }).click();
  await expect(page.getByTestId('table-move')).not.toBeEmpty();

  const roll = await page.getByTestId('table-roll').innerText();
  await page.getByRole('button', { name: 'Save to Codex' }).dblclick();
  await page.getByRole('link', { name: 'Open in Codex' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto(page.url().replace(/codex\/.*$/, 'codex'));
  await expect(page.getByText('1 entry')).toBeVisible();
  expect(roll.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Codex kind filter, quick find, Table survives leaving, Markdown export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/campaigns/new');
  await page.getByLabel('Campaign name').fill('Features');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page.getByRole('heading', { name: 'Forge', level: 1 })).toBeVisible();
  const base = page.url().replace(/\/forge$/, '');

  // Two entries of different kinds.
  await page.goto(`${base}/codex/new`);
  await page.getByLabel('Kind').selectOption('npc');
  await page.getByLabel('Title').fill('Odrin Vey');
  await page.getByLabel('Notes').fill('Drinks at [[The Otter]].');
  await page.getByRole('button', { name: 'Create entry' }).click();
  await expect(page.getByRole('heading', { name: 'Odrin Vey', level: 1 })).toBeVisible();
  await page.goto(`${base}/codex/new`);
  await page.getByLabel('Kind').selectOption('place');
  await page.getByLabel('Title').fill('The Otter');
  await page.getByRole('button', { name: 'Create entry' }).click();
  await expect(page.getByRole('heading', { name: 'The Otter', level: 1 })).toBeVisible();

  // Kind filter.
  await page.goto(`${base}/codex`);
  await expect(page.locator('.entry-list a')).toHaveCount(2);
  await page.getByLabel('Show').selectOption('npc');
  await expect(page.locator('.entry-list a')).toHaveCount(1);
  await expect(page.locator('.entry-list a', { hasText: 'Odrin Vey' })).toBeVisible();

  // Quick find with the keyboard.
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Quick find' })).toBeVisible();
  await page.keyboard.type('otter');
  await expect(
    page.getByRole('dialog', { name: 'Quick find' }).getByText('The Otter'),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'The Otter', level: 1 })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Quick find' })).toHaveCount(0);

  // The Table stack survives leaving the page.
  await page.goto(`${base}/table`);
  await page.getByRole('button', { name: 'Rumor', exact: true }).click();
  const rumor = await page.getByTestId('table-roll').innerText();
  await page.goto(`${base}/codex`);
  await page.goto(`${base}/table`);
  await expect(page.getByTestId('table-roll')).toHaveText(rumor);

  // Markdown export downloads a file with the entries and their links.
  await page.goto(`${base}/settings`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download as Markdown' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^prepdesk-features-.*\.md$/);
  const text = (await import('node:fs')).readFileSync((await file.path()) as string, 'utf8');
  expect(text).toContain('### Odrin Vey');
  expect(text).toContain('[[The Otter]]');

  expect(errors).toEqual([]);
});
