import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Puts one campaign (and the current-campaign setting) straight into the app's IndexedDB, then
 * reloads. For specs that need the campaign-scoped TopBar before the create-campaign form exists
 * (M3 adds the UI helper). The app has opened the database by the time `/` renders, so the stores
 * exist. Returns the campaign id.
 */
export async function seedCampaignRaw(page: Page, name = 'The Salt Marsh Debts'): Promise<string> {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Prep Desk' })).toBeVisible();
  const id = 'cmp_E2E0000000000000';
  await page.evaluate(
    ({ id, name }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('prepdesk');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['campaigns', 'settings'], 'readwrite');
          const now = Date.now();
          tx.objectStore('campaigns').put({
            id,
            name,
            genre: 'fantasy',
            safety: { lines: ['child-harm'], veils: [] },
            cultureIds: [
              'fantasy.culture.highland',
              'fantasy.culture.imperial',
              'fantasy.culture.marsh',
            ],
            createdAt: now,
            updatedAt: now,
          });
          tx.objectStore('settings').put({ key: 'currentCampaignId', value: id });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { id, name },
  );
  await page.reload();
  // Attached, not visible: below 768px the keys sit in the collapsed (display: none) Menu.
  await expect(page.locator('#topbar-modes')).toBeAttached();
  return id;
}
