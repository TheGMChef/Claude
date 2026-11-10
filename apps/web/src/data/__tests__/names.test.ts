import { describe, expect, it } from 'vitest';
import { seedCampaign, testDeps } from '../../test/fixtures';
import { avoidNamesFor } from '../repo/names';
import type { RepoDeps } from '../deps';
import type { PrepDeskDB } from '../db';

async function used(d: RepoDeps, cid: string, name: string, at: number) {
  await d.db.usedNames.put({
    campaignId: cid,
    nameKey: name.toLowerCase(),
    name,
    cultureId: 'fantasy.culture.marsh',
    sessionId: 'ses_1',
    at,
  });
}

async function npc(d: RepoDeps & { db: PrepDeskDB }, cid: string, title: string, updatedAt = 1) {
  await d.db.entities.add({
    id: d.newId('ent'),
    campaignId: cid,
    kind: 'npc',
    title,
    aliases: [],
    summary: '',
    fields: {},
    body: '',
    canon: 'kept',
    veiled: [],
    origin: 'manual',
    tokens: [],
    wikiTargets: [],
    createdAt: 1,
    updatedAt,
  });
}

describe('avoidNamesFor', () => {
  it('returns the given names of the 200 newest used names, newest first', async () => {
    const d = testDeps();
    const c = await seedCampaign(d);
    for (let i = 0; i < 205; i++) await used(d, c.id, `Given${i} Family${i}`, 1000 + i);
    const names = await avoidNamesFor(d, c.id);
    expect(names).toHaveLength(200);
    expect(names[0]).toBe('Given204');
    expect(names[199]).toBe('Given5');
    expect(names).not.toContain('Given4');
  });

  it('keeps a repeated given name once, at its newest position', async () => {
    const d = testDeps();
    const c = await seedCampaign(d);
    await used(d, c.id, 'Odrin Vey', 1);
    await used(d, c.id, 'Maren Holt', 2);
    await used(d, c.id, 'Odrin Brask', 3);
    await used(d, c.id, 'ODRIN', 4);
    expect(await avoidNamesFor(d, c.id)).toEqual(['ODRIN', 'Maren']);
  });

  it('ignores other campaigns’ names', async () => {
    const d = testDeps();
    const a = await seedCampaign(d, { name: 'A' });
    const b = await seedCampaign(d, { name: 'B' });
    await used(d, a.id, 'Alder Fenn', 1);
    await used(d, b.id, 'Bram Cole', 2);
    expect(await avoidNamesFor(d, a.id)).toEqual(['Alder']);
  });

  it('appends NPC titles not already listed, compared with normalizeName (case and accents folded)', async () => {
    const d = testDeps();
    const c = await seedCampaign(d);
    await used(d, c.id, 'Odrin Vey', 1);
    await used(d, c.id, 'Maren Holt', 2);
    await npc(d, c.id, 'ODRIN', 10); // same as the listed given name once folded: skipped
    await npc(d, c.id, 'Márén', 11); // same as 'Maren' once accents fold: skipped
    await npc(d, c.id, 'Tamsin Rook', 12);
    await npc(d, c.id, 'tamsin rook', 9); // an older repeat of another title: skipped
    expect(await avoidNamesFor(d, c.id)).toEqual(['Maren', 'Odrin', 'Tamsin Rook']);
  });

  it('only reads NPC titles, and only from that campaign', async () => {
    const d = testDeps();
    const a = await seedCampaign(d, { name: 'A' });
    const b = await seedCampaign(d, { name: 'B' });
    await npc(d, b.id, 'Other Campaign Person');
    await d.db.entities.add({
      id: d.newId('ent'),
      campaignId: a.id,
      kind: 'place',
      title: 'Hollow Mill',
      aliases: [],
      summary: '',
      fields: {},
      body: '',
      canon: 'kept',
      veiled: [],
      origin: 'manual',
      tokens: [],
      wikiTargets: [],
      createdAt: 1,
      updatedAt: 1,
    });
    expect(await avoidNamesFor(d, a.id)).toEqual([]);
  });
});
