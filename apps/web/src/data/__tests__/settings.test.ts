import { describe, expect, it } from 'vitest';
import { seedCampaign, testDeps } from '../../test/fixtures';
import { getSetting, resolveCurrentCampaign, setSetting } from '../repo/settings';

describe('settings', () => {
  it('defaults singleKeyShortcuts to true and others to undefined (D55, D50)', async () => {
    const d = testDeps();
    expect(await getSetting(d, 'singleKeyShortcuts')).toBe(true);
    expect(await getSetting(d, 'persistRequestedAt')).toBeUndefined();
  });

  it('round-trips a value, including false over the true default', async () => {
    const d = testDeps();
    await setSetting(d, 'singleKeyShortcuts', false);
    expect(await getSetting(d, 'singleKeyShortcuts')).toBe(false);
    await setSetting(d, 'persistRequestedAt', 42);
    expect(await getSetting(d, 'persistRequestedAt')).toBe(42);
    expect(await d.db.settings.get('persistRequestedAt')).toEqual({
      key: 'persistRequestedAt',
      value: 42,
    });
  });
});

describe('resolveCurrentCampaign', () => {
  it('returns undefined with no campaign', async () => {
    expect(await resolveCurrentCampaign(testDeps())).toBeUndefined();
  });

  it('returns the campaign named by currentCampaignId, even when it is not the newest', async () => {
    const d = testDeps();
    const a = await seedCampaign(d, { name: 'A' });
    await seedCampaign(d, { name: 'B' });
    await setSetting(d, 'currentCampaignId', a.id);
    expect((await resolveCurrentCampaign(d))?.id).toBe(a.id);
  });

  it('falls back to the most recently updated campaign when the stored id is stale, without writing', async () => {
    const d = testDeps();
    await seedCampaign(d, { name: 'A' });
    const b = await seedCampaign(d, { name: 'B' });
    await setSetting(d, 'currentCampaignId', 'cmp_gone');
    expect((await resolveCurrentCampaign(d))?.id).toBe(b.id);
    expect(await getSetting(d, 'currentCampaignId')).toBe('cmp_gone');
  });

  it('falls back when no id is stored', async () => {
    const d = testDeps();
    const a = await seedCampaign(d, { name: 'A' });
    await d.db.settings.clear();
    expect((await resolveCurrentCampaign(d))?.id).toBe(a.id);
  });
});
