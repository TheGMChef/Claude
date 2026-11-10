import { describe, expect, it } from 'vitest';
import { seedCampaign, testDeps } from '../../test/fixtures';
import { createEntity } from '../repo/entities';
import { addLink, linkGroups, removeLink } from '../repo/links';
import type { EntityKind, LinkRel } from '../schema';

async function world() {
  const d = testDeps();
  const c = await seedCampaign(d);
  const make = (title: string, kind: EntityKind = 'npc', body = '') =>
    createEntity(d, c.id, { kind, title, body });
  const add = (fromId: string, toId: string, rel: LinkRel) =>
    addLink(d, { campaignId: c.id, fromId, toId, rel });
  return { d, c, make, add };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? 'other';
  }
  return undefined;
};

describe('addLink', () => {
  it('stores an explicit link', async () => {
    const { d, make, add } = await world();
    const a = await make('A');
    const b = await make('B');
    const l = await add(a.id, b.id, 'points-to');
    expect(l).toMatchObject({ fromId: a.id, toId: b.id, rel: 'points-to', origin: 'explicit' });
    expect(await d.db.links.get(l.id)).toBeDefined();
  });

  it('refuses an exact duplicate, a self-link, a missing end and an unknown relation', async () => {
    const { make, add, c } = await world();
    const a = await make('A');
    const b = await make('B');
    await add(a.id, b.id, 'at');
    expect(await code(add(a.id, b.id, 'at'))).toBe('conflict');
    expect(await code(add(a.id, a.id, 'at'))).toBe('invalid');
    expect(await code(add(a.id, 'ent_0000000000009999', 'at'))).toBe('not-found');
    expect(await code(add(a.id, b.id, 'loves' as LinkRel))).toBe('invalid');
    expect(c.id).toBeDefined();
    await add(b.id, a.id, 'at'); // the reverse of a directed relation is a different link
  });

  it('treats knows as symmetric', async () => {
    const { make, add } = await world();
    const a = await make('A');
    const b = await make('B');
    await add(a.id, b.id, 'knows');
    expect(await code(add(b.id, a.id, 'knows'))).toBe('conflict');
  });

  it('refuses a link whose ends are in different campaigns, or not in the stated campaign', async () => {
    const { d, make, c } = await world();
    const other = await seedCampaign(d, { name: 'Other' });
    const a = await make('A');
    const z = await createEntity(d, other.id, { kind: 'npc', title: 'Z' });
    expect(
      await code(addLink(d, { campaignId: c.id, fromId: a.id, toId: z.id, rel: 'knows' })),
    ).toBe('invalid');
    expect(
      await code(addLink(d, { campaignId: other.id, fromId: a.id, toId: z.id, rel: 'knows' })),
    ).toBe('invalid');
  });

  it('also refuses what a wiki link already says', async () => {
    const { make, add } = await world();
    const b = await make('B');
    const a = await make('A', 'npc', '[[B]]');
    expect(await code(add(a.id, b.id, 'mentions'))).toBe('conflict');
  });
});

describe('removeLink', () => {
  it('removes an explicit link', async () => {
    const { d, make, add } = await world();
    const a = await make('A');
    const b = await make('B');
    const l = await add(a.id, b.id, 'at');
    await removeLink(d, l.id);
    expect(await d.db.links.count()).toBe(0);
  });

  it('refuses a wiki link (it would come back on the next save) and an unknown id', async () => {
    const { d, make } = await world();
    await make('B');
    await make('A', 'npc', '[[B]]');
    const wiki = (await d.db.links.toArray())[0]!;
    expect(wiki.origin).toBe('wiki');
    expect(await code(removeLink(d, wiki.id))).toBe('invalid');
    expect(await d.db.links.count()).toBe(1);
    expect(await code(removeLink(d, 'lnk_9'))).toBe('not-found');
  });
});

describe('linkGroups', () => {
  it('labels both ends of every relation, in the D57 order', async () => {
    const { d, make, add } = await world();
    const clue = await make('Wet ledger', 'clue');
    const truth = await make('The lock is old', 'truth');
    const tavern = await make('The Gull', 'place');
    const town = await make('Saltmere', 'place');
    await add(clue.id, truth.id, 'points-to');
    await add(clue.id, tavern.id, 'at');
    await add(tavern.id, town.id, 'part-of');

    const names = (g: { label: string; items: { entity: { title: string } }[] }[]) =>
      g.map((x) => `${x.label}: ${x.items.map((i) => i.entity.title).join(',')}`);

    expect(names(await linkGroups(d, clue.id))).toEqual([
      'Points to: The lock is old',
      'At: The Gull',
    ]);
    expect(names(await linkGroups(d, truth.id))).toEqual(['Pointed to by: Wet ledger']);
    expect(names(await linkGroups(d, tavern.id))).toEqual([
      'Here: Wet ledger',
      'Part of: Saltmere',
    ]);
    expect(names(await linkGroups(d, town.id))).toEqual(['Has part: The Gull']);
    const g = await linkGroups(d, clue.id);
    expect(g[0]).toMatchObject({ rel: 'points-to', dir: 'out' });
    expect((await linkGroups(d, truth.id))[0]).toMatchObject({ rel: 'points-to', dir: 'in' });
  });

  it('shows knows once, from both ends, and mentions as Mentions and Mentioned by', async () => {
    const { d, make, add } = await world();
    const a = await make('A');
    const b = await make('B');
    const m = await make('M', 'npc', '[[A]]');
    await add(a.id, b.id, 'knows');
    const ga = await linkGroups(d, a.id);
    expect(ga.map((g) => g.label)).toEqual(['Knows', 'Mentioned by']);
    expect((await linkGroups(d, b.id)).map((g) => g.label)).toEqual(['Knows']);
    expect((await linkGroups(d, b.id))[0]!.items.map((i) => i.entity.id)).toEqual([a.id]);
    const gm = await linkGroups(d, m.id);
    expect(gm.map((g) => g.label)).toEqual(['Mentions']);
    expect(gm[0]!.items[0]).toMatchObject({ fromText: true });
    expect(ga[1]!.items[0]).toMatchObject({ fromText: true });
    expect(ga[0]!.items[0]).toMatchObject({ fromText: false });
  });

  it('omits empty groups and links whose other end is missing, and sorts each group', async () => {
    const { d, make, add } = await world();
    const a = await make('A');
    const z = await make('Zed');
    const b = await make('bee');
    const c = await make('Cat');
    await add(a.id, z.id, 'at');
    await add(a.id, b.id, 'at');
    await add(a.id, c.id, 'at');
    await d.db.entities.delete(c.id); // an orphan link row
    const groups = await linkGroups(d, a.id);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.entity.title)).toEqual(['bee', 'Zed']);
    expect(await linkGroups(d, 'ent_0000000000009999')).toEqual([]);
  });
});
