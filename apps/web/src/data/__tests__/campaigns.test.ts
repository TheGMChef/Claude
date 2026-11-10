import { SAFETY_VOCABULARY } from '@prepdesk/engine';
import { describe, expect, it } from 'vitest';
import { CULTURES } from '../../content/lib';
import { seedCampaign, testDeps } from '../../test/fixtures';
import { CAMPAIGN_STORES } from '../db';
import { RepoError } from '../deps';
import {
  campaignCounts,
  createCampaign,
  deleteCampaign,
  markExported,
  renameCampaign,
  setCultures,
  setSafety,
} from '../repo/campaigns';
import { getSetting } from '../repo/settings';
import V1 from '../__fixtures__/v1.json';

type Rows = Record<string, Record<string, unknown>[]>;

async function code(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof RepoError ? e.code : `other:${String(e)}`;
  }
}

describe('createCampaign', () => {
  it("stores exactly { lines: ['child-harm'], veils: [] } when no safety is given (spec 9)", async () => {
    const d = testDeps();
    const c = await createCampaign(d, { name: 'Salt' });
    expect(c.safety).toEqual({ lines: ['child-harm'], veils: [] });
    expect((await d.db.campaigns.get(c.id))?.safety).toEqual({ lines: ['child-harm'], veils: [] });
  });

  it('does not share the default lines array between campaigns', async () => {
    const d = testDeps();
    const a = await createCampaign(d, { name: 'A' });
    const b = await createCampaign(d, { name: 'B' });
    a.safety.lines.push('war');
    expect(b.safety.lines).toEqual(['child-harm']);
  });

  it('defaults to every culture, trims the name and stamps genre and times', async () => {
    const d = testDeps();
    const c = await createCampaign(d, { name: '  The Salt Marsh Debts  ' });
    expect(c.name).toBe('The Salt Marsh Debts');
    expect(c.genre).toBe('fantasy');
    expect(c.cultureIds).toEqual(CULTURES.map((x) => x.id));
    expect(c.createdAt).toBe(c.updatedAt);
    expect(c.id).toMatch(/^cmp_/);
  });

  it.each(['', '   ', 'x'.repeat(121)])('rejects the name %j as invalid', async (name) => {
    const d = testDeps();
    expect(await code(createCampaign(d, { name }))).toBe('invalid');
    expect(await d.db.campaigns.count()).toBe(0);
  });

  it('accepts a 120-character name', async () => {
    const d = testDeps();
    expect((await createCampaign(d, { name: 'x'.repeat(120) })).name).toHaveLength(120);
  });

  it('sets currentCampaignId', async () => {
    const d = testDeps();
    const c = await createCampaign(d, { name: 'A' });
    expect(await getSetting(d, 'currentCampaignId')).toBe(c.id);
    const b = await createCampaign(d, { name: 'B' });
    expect(await getSetting(d, 'currentCampaignId')).toBe(b.id);
  });

  it('rejects unknown topics and unknown cultures at create, writing nothing', async () => {
    const d = testDeps();
    expect(
      await code(createCampaign(d, { name: 'A', safety: { lines: ['spooky'], veils: [] } })),
    ).toBe('invalid');
    expect(await code(createCampaign(d, { name: 'A', cultureIds: [] }))).toBe('invalid');
    expect(await code(createCampaign(d, { name: 'A', cultureIds: ['fantasy.culture.nope'] }))).toBe(
      'invalid',
    );
    expect(await d.db.campaigns.count()).toBe(0);
    expect(await getSetting(d, 'currentCampaignId')).toBeUndefined();
  });
});

describe('setSafety', () => {
  it('rejects a topic outside the vocabulary and leaves the campaign untouched', async () => {
    const d = testDeps();
    const c = await seedCampaign(d);
    expect(await code(setSafety(d, c.id, { lines: ['spooky'], veils: [] }))).toBe('invalid');
    expect(await code(setSafety(d, c.id, { lines: [], veils: ['spooky'] }))).toBe('invalid');
    expect((await d.db.campaigns.get(c.id))?.safety).toEqual({ lines: ['child-harm'], veils: [] });
  });

  it('keeps a topic that is set as both line and veil as a line only', async () => {
    const d = testDeps();
    const c = await seedCampaign(d);
    const next = await setSafety(d, c.id, { lines: ['spiders'], veils: ['spiders', 'rats'] });
    expect(next.safety).toEqual({ lines: ['spiders'], veils: ['rats'] });
    expect((await d.db.campaigns.get(c.id))?.safety).toEqual({
      lines: ['spiders'],
      veils: ['rats'],
    });
  });

  it('removes duplicates and accepts every topic in the vocabulary', async () => {
    const d = testDeps();
    const c = await seedCampaign(d);
    const next = await setSafety(d, c.id, {
      lines: ['war', 'war', 'fire'],
      veils: ['rats', 'rats'],
    });
    expect(next.safety).toEqual({ lines: ['war', 'fire'], veils: ['rats'] });
    const all = await setSafety(d, c.id, { lines: [...SAFETY_VOCABULARY], veils: [] });
    expect(all.safety.lines).toHaveLength(25);
  });

  it('stores a copy: later mutation of the argument does not change the row', async () => {
    const d = testDeps();
    const c = await seedCampaign(d);
    const input = { lines: ['war'], veils: [] as string[] };
    await setSafety(d, c.id, input);
    input.lines.push('fire');
    expect((await d.db.campaigns.get(c.id))?.safety.lines).toEqual(['war']);
  });

  it('bumps updatedAt and reports not-found for an unknown campaign', async () => {
    const d = testDeps();
    const c = await seedCampaign(d);
    const next = await setSafety(d, c.id, { lines: [], veils: [] });
    expect(next.updatedAt).toBeGreaterThan(c.updatedAt);
    expect(await code(setSafety(d, 'cmp_missing', { lines: [], veils: [] }))).toBe('not-found');
  });
});

describe('setCultures, renameCampaign and markExported', () => {
  it('rejects an empty culture list and unknown culture ids', async () => {
    const d = testDeps();
    const c = await seedCampaign(d);
    expect(await code(setCultures(d, c.id, []))).toBe('invalid');
    expect(await code(setCultures(d, c.id, ['fantasy.culture.nope']))).toBe('invalid');
    expect((await d.db.campaigns.get(c.id))?.cultureIds).toEqual(CULTURES.map((x) => x.id));
  });

  it('saves a subset of cultures without duplicates', async () => {
    const d = testDeps();
    const c = await seedCampaign(d);
    const id = (CULTURES[0] as { id: string }).id;
    const next = await setCultures(d, c.id, [id, id]);
    expect(next.cultureIds).toEqual([id]);
  });

  it('renames with the same name rules', async () => {
    const d = testDeps();
    const c = await seedCampaign(d);
    expect((await renameCampaign(d, c.id, '  New name ')).name).toBe('New name');
    expect(await code(renameCampaign(d, c.id, '  '))).toBe('invalid');
    expect((await d.db.campaigns.get(c.id))?.name).toBe('New name');
  });

  it('markExported stamps lastExportedAt without touching updatedAt', async () => {
    const d = testDeps();
    const c = await seedCampaign(d);
    const next = await markExported(d, c.id);
    expect(next.lastExportedAt).toBeGreaterThan(c.createdAt);
    expect(next.updatedAt).toBe(c.updatedAt);
  });
});

function clone(rows: Rows, from: string, to: string): Rows {
  return JSON.parse(JSON.stringify(rows).replaceAll(from, to)) as Rows;
}

async function seedAll(d: ReturnType<typeof testDeps>, rows: Rows) {
  for (const [store, list] of Object.entries(rows)) {
    if (store === 'settings') continue;
    await d.db.table(store).bulkAdd(list);
  }
}

describe('deleteCampaign cascade', () => {
  const A = (V1 as unknown as Rows).campaigns?.[0]?.id as string;
  const B = A.replace('A1', 'B1');
  const base = V1 as unknown as Rows;
  const rowsA = base;
  const rowsB = clone(base, '00000000000000A', '00000000000000B');

  it('deletes every row of campaign A in every store, leaves B untouched and moves current to B', async () => {
    const d = testDeps();
    await seedAll(d, rowsA);
    await seedAll(d, rowsB);
    await d.db.settings.put({ key: 'currentCampaignId', value: A });
    await d.db.settings.put({ key: 'singleKeyShortcuts', value: false });
    const stores = ['campaigns', ...CAMPAIGN_STORES];
    const before: Record<string, number> = {};
    for (const s of CAMPAIGN_STORES) {
      before[s] = await d.db.table(s).where('campaignId').equals(B).count();
      expect(before[s], `${s} has B rows`).toBeGreaterThan(0);
      expect(
        await d.db.table(s).where('campaignId').equals(A).count(),
        `${s} has A rows`,
      ).toBeGreaterThan(0);
    }

    await deleteCampaign(d, A);

    expect(await d.db.campaigns.get(A)).toBeUndefined();
    expect(await d.db.campaigns.get(B)).toBeDefined();
    for (const s of CAMPAIGN_STORES) {
      expect(await d.db.table(s).where('campaignId').equals(A).count(), `${s} orphans`).toBe(0);
      expect(await d.db.table(s).where('campaignId').equals(B).count(), `${s} B rows`).toBe(
        before[s],
      );
    }
    expect(stores).toHaveLength(10);
    expect(await getSetting(d, 'currentCampaignId')).toBe(B);
    expect(await getSetting(d, 'singleKeyShortcuts')).toBe(false);
    // B's rows are deep-equal to what was seeded.
    for (const s of CAMPAIGN_STORES) {
      const back = await d.db.table(s).where('campaignId').equals(B).toArray();
      expect(back).toHaveLength((rowsB[s] ?? []).length);
    }
  });

  it('moves current to the most recently updated remaining campaign, not the first inserted', async () => {
    const d = testDeps();
    const a = await seedCampaign(d, { name: 'A' });
    const b = await seedCampaign(d, { name: 'B' });
    const c = await seedCampaign(d, { name: 'C' });
    await renameCampaign(d, b.id, 'B (touched last)');
    await d.db.settings.put({ key: 'currentCampaignId', value: a.id });
    await deleteCampaign(d, a.id);
    expect(await getSetting(d, 'currentCampaignId')).toBe(b.id);
    expect(c.id).not.toBe(b.id);
  });

  it('leaves current alone when another campaign is deleted', async () => {
    const d = testDeps();
    const a = await seedCampaign(d, { name: 'A' });
    const b = await seedCampaign(d, { name: 'B' }); // current
    await deleteCampaign(d, a.id);
    expect(await getSetting(d, 'currentCampaignId')).toBe(b.id);
  });

  it('removes currentCampaignId when the last campaign goes', async () => {
    const d = testDeps();
    const a = await seedCampaign(d);
    await deleteCampaign(d, a.id);
    expect(await d.db.campaigns.count()).toBe(0);
    expect(await getSetting(d, 'currentCampaignId')).toBeUndefined();
  });

  it('reports not-found for an unknown campaign and deletes nothing', async () => {
    const d = testDeps();
    await seedCampaign(d);
    expect(await code(deleteCampaign(d, 'cmp_missing'))).toBe('not-found');
    expect(await d.db.campaigns.count()).toBe(1);
  });
});

describe('campaignCounts', () => {
  it('counts sessions and entities of that campaign only', async () => {
    const d = testDeps();
    const rows = V1 as unknown as Rows;
    await seedAll(d, rows);
    await seedAll(d, clone(rows, '00000000000000A', '00000000000000B'));
    const A = rows.campaigns?.[0]?.id as string;
    expect(await campaignCounts(d, A)).toEqual({ sessions: 1, entities: 3 });
    expect(await campaignCounts(d, 'cmp_none')).toEqual({ sessions: 0, entities: 0 });
  });
});
