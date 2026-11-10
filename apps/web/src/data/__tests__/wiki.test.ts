import { describe, expect, it, vi } from 'vitest';
import { seedCampaign, testDeps } from '../../test/fixtures';
import { RepoError } from '../deps';
import { addLink } from '../repo/links';
import {
  createEntity,
  deleteEntity,
  findDuplicateTitle,
  getEntity,
  renameEntity,
  updateEntity,
} from '../repo/entities';
import type { EntityInput } from '../repo/entities';
import type { Entity, Link } from '../schema';
import { parseWiki, resolveTarget, rewriteTargets, wikiTargets } from '../wiki';

const link = (target: string, shown = target, raw = `[[${target}]]`) => ({ target, shown, raw });
const rejoin = (s: string) =>
  parseWiki(s)
    .map((p) => ('text' in p ? p.text : p.raw))
    .join('');

describe('parseWiki', () => {
  it('reads plain text, links, shown text and trimmed targets', () => {
    expect(parseWiki('hello')).toEqual([{ text: 'hello' }]);
    expect(parseWiki('')).toEqual([]);
    expect(parseWiki('[[A]]')).toEqual([link('A')]);
    expect(parseWiki('see [[A|the ferryman]] now')).toEqual([
      { text: 'see ' },
      link('A', 'the ferryman', '[[A|the ferryman]]'),
      { text: ' now' },
    ]);
    expect(parseWiki('[[ A ]]')).toEqual([link('A', 'A', '[[ A ]]')]);
    expect(parseWiki('[[A|x|y]]')).toEqual([link('A', 'x|y', '[[A|x|y]]')]);
  });

  it('treats an empty target, an unclosed link and a lone ]] as text', () => {
    expect(parseWiki('[[]]')).toEqual([{ text: '[[]]' }]);
    expect(parseWiki('[[|x]]')).toEqual([{ text: '[[|x]]' }]);
    expect(parseWiki('[[   ]]')).toEqual([{ text: '[[   ]]' }]);
    expect(parseWiki('[[A')).toEqual([{ text: '[[A' }]);
    expect(parseWiki('x ]] y')).toEqual([{ text: 'x ]] y' }]);
  });

  it('takes the innermost opening for a nested link', () => {
    expect(parseWiki('[[A [[B]]')).toEqual([{ text: '[[A ' }, link('B')]);
    expect(parseWiki('[[[A]]')).toEqual([{ text: '[' }, link('A')]);
  });

  it('treats a target over 200 characters as text', () => {
    const long = `[[${'x'.repeat(201)}]]`;
    expect(parseWiki(long)).toEqual([{ text: long }]);
    expect(parseWiki(`[[${'x'.repeat(200)}]]`)).toHaveLength(1);
    expect('target' in parseWiki(`[[${'x'.repeat(200)}]]`)[0]!).toBe(true);
  });

  it('round-trips: text and raw join back to the input', () => {
    for (const s of [
      'a [[B]] c [[D|e]] f',
      '[[A [[B]] ]] ]]',
      '[[]]|[[|]][[x]]]]',
      'plain',
      '[[a]][[b]]',
      '[[[[[x]]]]]',
    ]) {
      expect(rejoin(s)).toBe(s);
    }
  });

  it('is linear on hostile input: no per-opening rescans (counted, not timed)', () => {
    const indexOf = vi.spyOn(String.prototype, 'indexOf');
    try {
      for (const input of [
        '['.repeat(100_000),
        '[['.repeat(50_000),
        '[[a'.repeat(33_000),
        ']]'.repeat(50_000),
        '[[|'.repeat(33_000),
      ]) {
        indexOf.mockClear();
        parseWiki(input);
        expect(indexOf.mock.calls.length).toBeLessThanOrEqual(10);
      }
    } finally {
      indexOf.mockRestore();
    }
  });

  it('smoke: hostile inputs finish well inside half a second', () => {
    const start = performance.now();
    for (const input of [
      '[['.repeat(50_000),
      '[[a]'.repeat(25_000) + ']]',
      `[[${'x'.repeat(100_000)}`,
    ]) {
      parseWiki(input);
    }
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('wikiTargets', () => {
  const none = { body: '', summary: '', fields: {} };

  it('is folded and distinct over body, summary and every field value', () => {
    expect(
      wikiTargets({
        body: 'a [[Ödrin Vey]] b [[odrin  vey|x]]',
        summary: '[[Mara]]',
        fields: { secret: '[[Tide Weir]]', want: '[[MARA]]' },
      }),
    ).toEqual(['odrin vey', 'mara', 'tide weir']);
  });

  it('parses each string on its own: brackets never join across strings', () => {
    expect(wikiTargets({ body: 'ends [[Odrin', summary: 'Vey]] starts', fields: {} })).toEqual([]);
    expect(wikiTargets({ ...none, body: 'ends [[', fields: { a: 'Odrin]]' } })).toEqual([]);
  });

  it('is capped at 200 targets', () => {
    const body = Array.from({ length: 500 }, (_, i) => `[[t${i}]]`).join(' ');
    expect(wikiTargets({ ...none, body })).toHaveLength(200);
  });
});

describe('rewriteTargets', () => {
  it('rewrites by folded comparison and keeps the shown text', () => {
    expect(
      rewriteTargets(
        '[[Odrin Vey]] and [[ ödrin  VEY |the ferryman]] and [[Odrin Veyron]]',
        'Odrin Vey',
        'Odrin Hale',
      ),
    ).toBe('[[Odrin Hale]] and [[Odrin Hale|the ferryman]] and [[Odrin Veyron]]');
  });

  it('leaves plain text alone and returns the same string when nothing matches', () => {
    expect(rewriteTargets('Odrin Vey rides', 'Odrin Vey', 'X')).toBe('Odrin Vey rides');
    expect(rewriteTargets('[[Mara]]', 'Odrin Vey', 'X')).toBe('[[Mara]]');
  });
});

describe('resolveTarget', () => {
  const ent = (id: string, title: string, createdAt: number, aliases: string[] = []) =>
    ({ id, title, aliases, createdAt, campaignId: 'c' }) as Entity;

  it('prefers a title over an alias, even when the alias holder is older', () => {
    const list = [ent('ent_1', 'Ferry', 1, ['The Ferryman']), ent('ent_2', 'The Ferryman', 9)];
    expect(resolveTarget(list, 'the ferryman')?.id).toBe('ent_2');
  });

  it('matches folded titles and aliases', () => {
    const list = [ent('ent_1', 'Ödrin Vey', 1, ['Weir Man'])];
    expect(resolveTarget(list, 'odrin vey')?.id).toBe('ent_1');
    expect(resolveTarget(list, 'ÖDRIN VEY')?.id).toBe('ent_1');
    expect(resolveTarget(list, ' weir  man ')?.id).toBe('ent_1');
    expect(resolveTarget(list, 'nobody')).toBeUndefined();
  });

  it('takes the oldest createdAt, whatever the id or list order', () => {
    const list = [ent('ent_1', 'Guard', 5), ent('ent_2', 'Guard', 2), ent('ent_3', 'Guard', 9)];
    expect(resolveTarget(list, 'guard')?.id).toBe('ent_2');
    expect(resolveTarget([...list].reverse(), 'guard')?.id).toBe('ent_2');
  });

  it('breaks a createdAt tie with the smallest id', () => {
    const list = [ent('ent_b', 'Guard', 5), ent('ent_a', 'Guard', 5)];
    expect(resolveTarget(list, 'guard')?.id).toBe('ent_a');
  });

  it('excludes the entity itself', () => {
    const list = [ent('ent_1', 'Guard', 1), ent('ent_2', 'Guard', 2)];
    expect(resolveTarget(list, 'guard', 'ent_1')?.id).toBe('ent_2');
    expect(resolveTarget([ent('ent_1', 'Solo', 1)], 'solo', 'ent_1')).toBeUndefined();
  });
});

async function world() {
  const d = testDeps();
  const c = await seedCampaign(d);
  const make = (title: string, extra: Partial<EntityInput> = {}) =>
    createEntity(d, c.id, { kind: 'npc', title, ...extra });
  const wikiLinks = async (): Promise<Link[]> =>
    (await d.db.links.toArray()).filter((l) => l.origin === 'wiki');
  const pairs = async () => {
    const all = await d.db.entities.toArray();
    const name = (id: string) => all.find((e) => e.id === id)?.title ?? id;
    return (await wikiLinks()).map((l) => `${name(l.fromId)}>${name(l.toId)}`).sort();
  };
  return { d, c, make, wikiLinks, pairs };
}

describe('deriveWikiLinks (on every create and update)', () => {
  it('creates one wiki mentions link per distinct resolved target from body, summary and fields', async () => {
    const { d, make, wikiLinks, pairs } = await world();
    const b = await make('B');
    const c = await make('C');
    const a = await make('A', { body: '[[B]] and [[b|again]]', fields: { secret: '[[C]]' } });
    expect(await pairs()).toEqual(['A>B', 'A>C']);
    for (const l of await wikiLinks()) {
      expect(l.rel).toBe('mentions');
      expect(l.origin).toBe('wiki');
      expect(l.fromId).toBe(a.id);
      expect([b.id, c.id]).toContain(l.toId);
    }
    await updateEntity(d, a.id, { summary: '[[B]]' });
    expect(await pairs()).toEqual(['A>B', 'A>C']);
  });

  it('removes a link when its text goes, keeps ids of the others, and spares explicit links', async () => {
    const { d, make, wikiLinks, pairs } = await world();
    const b = await make('B');
    await make('C');
    const a = await make('A', { body: '[[B]]', fields: { secret: '[[C]]' } });
    await addLink(d, { campaignId: a.campaignId, fromId: a.id, toId: b.id, rel: 'points-to' });
    const before = (await wikiLinks()).find((l) => l.toId === b.id)!;
    await updateEntity(d, a.id, { fields: { secret: 'gone' } });
    expect(await pairs()).toEqual(['A>B']);
    expect((await wikiLinks())[0]!.id).toBe(before.id);
    const explicit = (await d.db.links.toArray()).filter((l) => l.origin === 'explicit');
    expect(explicit).toHaveLength(1);
    await updateEntity(d, a.id, { body: 'no links now' });
    expect(await pairs()).toEqual([]);
    expect((await d.db.links.toArray()).filter((l) => l.origin === 'explicit')).toHaveLength(1);
  });

  it('keeps an explicit mentions link through re-derivation (M6)', async () => {
    const { d, make, wikiLinks } = await world();
    const b = await make('B');
    await make('C');
    const a = await make('A', { body: '[[C]]' });
    const explicit = await addLink(d, {
      campaignId: a.campaignId,
      fromId: a.id,
      toId: b.id,
      rel: 'mentions',
    });
    await updateEntity(d, a.id, { body: '[[C]] and more' });
    await updateEntity(d, a.id, { body: 'no links' });
    expect((await d.db.links.get(explicit.id))?.origin).toBe('explicit');
    expect(await wikiLinks()).toHaveLength(0);
  });

  it('stores wikiTargets folded, with unresolved targets kept', async () => {
    const { make } = await world();
    const a = await make('A', { body: '[[Ödrin Vey]] [[Nobody]]' });
    expect(a.wikiTargets).toEqual(['odrin vey', 'nobody']);
  });

  it('ignores a link to itself but keeps the target in wikiTargets', async () => {
    const { make, pairs } = await world();
    const a = await make('A', { body: 'I am [[A]]' });
    expect(await pairs()).toEqual([]);
    expect(a.wikiTargets).toEqual(['a']);
  });

  it('never resolves to another campaign, on create or on a later create there', async () => {
    const { d, c, make, pairs } = await world();
    const other = await seedCampaign(d, { name: 'Other' });
    const q = await createEntity(d, other.id, { kind: 'npc', title: 'Q', body: '[[Odrin]]' });
    await createEntity(d, other.id, { kind: 'npc', title: 'Odrin' });
    await make('A', { body: '[[Odrin]]' });
    // Q (other campaign) links to its own Odrin; A (this campaign) has no Odrin to link to.
    expect(await pairs()).toEqual(['Q>Odrin']);
    await make('Odrin');
    expect(await pairs()).toEqual(['A>Odrin', 'Q>Odrin']);
    const odrinHere = (await d.db.entities.where('campaignId').equals(c.id).toArray()).find(
      (e) => e.title === 'Odrin',
    )!;
    const links = await d.db.links.toArray();
    expect(links.find((l) => l.fromId === q.id)?.toId).not.toBe(odrinHere.id);
  });
});

describe('incoming re-resolution (Review Focus 2)', () => {
  it('links earlier text to a newly created entry in the same transaction, without saving the referrer again', async () => {
    const { d, make, pairs } = await world();
    const a = await make('A', { body: 'We owe [[Odrin]].' });
    expect(await pairs()).toEqual([]);
    const spy: string[] = [];
    const onUpdate = (_m: unknown, key: unknown) => void spy.push(String(key));
    d.db.entities.hook('updating', onUpdate);
    const odrin = await make('Odrin');
    d.db.entities.hook('updating').unsubscribe(onUpdate);
    expect(await pairs()).toEqual(['A>Odrin']);
    const after = await getEntity(d, a.id);
    expect(after?.updatedAt).toBe(a.updatedAt);
    expect(spy).not.toContain(a.id);
    expect(odrin.id).not.toBe(a.id);
  });

  it('links when an alias is added, and unlinks when it is removed', async () => {
    const { d, make, pairs } = await world();
    await make('A', { body: '[[the ferryman]]' });
    const b = await make('B');
    expect(await pairs()).toEqual([]);
    await updateEntity(d, b.id, { aliases: ['The Ferryman'] });
    expect(await pairs()).toEqual(['A>B']);
    await updateEntity(d, b.id, { aliases: [] });
    expect(await pairs()).toEqual([]);
  });

  it('moves a link to the older duplicate when a title is freed up', async () => {
    const { d, make, pairs } = await world();
    const g1 = await make('Guard');
    const g2 = await make('Guard');
    await make('F', { body: '[[Guard]]' });
    expect(await pairs()).toEqual(['F>Guard']);
    expect((await d.db.links.toArray())[0]!.toId).toBe(g1.id);
    await deleteEntity(d, g1.id);
    expect((await d.db.links.toArray()).map((l) => l.toId)).toEqual([g2.id]);
  });
});

describe('renameEntity (D47, D56, Review Focus 3)', () => {
  it('rewrites only the text that resolves to the entity and keeps every link pointing at it', async () => {
    const { d, make, pairs } = await world();
    const x = await make('Odrin Vey');
    const dd = await make('Odrin of the Marsh', { aliases: ['the other Odrin'] });
    const a = await make('A', { body: 'see [[Odrin Vey]].' });
    const b = await make('B', { body: '[[odrin vey|the ferryman]]' });
    const cc = await make('C', { fields: { want: 'to find [[Odrin Vey]]' } });
    const e = await make('E', { body: '[[the other Odrin]]', summary: 'Odrin Vey is not here' });
    expect(await pairs()).toEqual([
      'A>Odrin Vey',
      'B>Odrin Vey',
      'C>Odrin Vey',
      'E>Odrin of the Marsh',
    ]);

    const renamed = await renameEntity(d, x.id, 'Odrin Hale');

    expect(renamed.title).toBe('Odrin Hale');
    expect(renamed.aliases).toContain('Odrin Vey');
    expect((await getEntity(d, a.id))?.body).toBe('see [[Odrin Hale]].');
    expect((await getEntity(d, b.id))?.body).toBe('[[Odrin Hale|the ferryman]]');
    const c2 = await getEntity(d, cc.id);
    expect(c2?.fields['want']).toBe('to find [[Odrin Hale]]');
    expect(c2?.tokens).toContain('hale');
    expect(c2?.tokens).not.toContain('vey');
    expect(c2!.updatedAt).toBeGreaterThan(cc.updatedAt);
    const e2 = await getEntity(d, e.id);
    expect(e2?.body).toBe('[[the other Odrin]]');
    expect(e2?.summary).toBe('Odrin Vey is not here');
    expect(e2?.updatedAt).toBe(e.updatedAt);
    expect(await pairs()).toEqual([
      'A>Odrin Hale',
      'B>Odrin Hale',
      'C>Odrin Hale',
      'E>Odrin of the Marsh',
    ]);
    const toX = (await d.db.links.toArray()).filter((l) => l.toId === x.id);
    expect(toX).toHaveLength(3);
    expect((await d.db.links.toArray()).find((l) => l.fromId === e.id)?.toId).toBe(dd.id);
  });

  it('does not touch an entity that writes the old title but resolves it to an older duplicate', async () => {
    const { d, make, pairs } = await world();
    const g1 = await make('Guard');
    const g2 = await make('Guard', { aliases: ['Watch'] });
    const f = await make('F', { body: '[[Guard]] and [[Watch]]' });
    const h = await make('H', { body: '[[Guard]]' });
    expect(await pairs()).toEqual(['F>Guard', 'F>Guard', 'H>Guard']);
    await renameEntity(d, g2.id, 'Sentry');
    expect((await getEntity(d, f.id))?.body).toBe('[[Guard]] and [[Watch]]');
    expect((await getEntity(d, h.id))?.body).toBe('[[Guard]]');
    const toG1 = (await d.db.links.toArray()).filter((l) => l.toId === g1.id).map((l) => l.fromId);
    expect(toG1.sort()).toEqual([f.id, h.id].sort());
    const toG2 = (await d.db.links.toArray()).filter((l) => l.toId === g2.id).map((l) => l.fromId);
    expect(toG2).toEqual([f.id]);
  });

  it('does not redirect a link when the new title already belongs to an older entry (I1)', async () => {
    const { d, make, pairs } = await world();
    const y = await make('Odrin');
    const x = await make('Odrin Vey');
    const a = await make('A', { body: 'owes [[Odrin Vey]]' });
    expect(await findDuplicateTitle(d, x.campaignId, 'Odrin', x.id)).toMatchObject({ id: y.id });
    expect(await findDuplicateTitle(d, x.campaignId, 'Nobody', x.id)).toBeUndefined();
    await renameEntity(d, x.id, 'Odrin');
    expect((await getEntity(d, a.id))?.body).toBe('owes [[Odrin Vey]]');
    const link = (await d.db.links.toArray()).find((l) => l.fromId === a.id)!;
    expect(link.toId).toBe(x.id);
    expect(await pairs()).toEqual(['A>Odrin']);
    expect((await getEntity(d, x.id))?.aliases).toContain('Odrin Vey');
  });

  it('is not blocked by a referrer at its field cap: that text is left to resolve through the alias (I2)', async () => {
    const { d, make } = await world();
    const x = await make('Odrin Vey');
    const big = await make('Big', { fields: { note: `${'x'.repeat(19_977)}[[Odrin Vey]]` } });
    const small = await make('Small', { body: '[[Odrin Vey]]' });
    const renamed = await renameEntity(d, x.id, 'Odrin Vey of the Salt Marsh');
    expect(renamed.title).toBe('Odrin Vey of the Salt Marsh');
    expect((await getEntity(d, big.id))?.fields['note']).toBe(big.fields['note']);
    expect((await getEntity(d, small.id))?.body).toBe('[[Odrin Vey of the Salt Marsh]]');
    const toX = (await d.db.links.toArray()).filter((l) => l.toId === x.id).map((l) => l.fromId);
    expect(toX.sort()).toEqual([big.id, small.id].sort());
  });

  it('is not blocked by a full alias list: the oldest alias goes, the old title stays (I2)', async () => {
    const { d, make } = await world();
    const aliases = Array.from({ length: 50 }, (_, i) => `Alias ${i}`);
    const x = await make('Odrin Vey', { aliases });
    const renamed = await renameEntity(d, x.id, 'Odrin Hale');
    expect(renamed.aliases).toHaveLength(50);
    expect(renamed.aliases).toContain('Odrin Vey');
    expect(renamed.aliases).not.toContain('Alias 0');
    expect(renamed.aliases).toContain('Alias 49');
    const viaUpdate = await updateEntity(d, x.id, { title: 'Odrin Fenn' });
    expect(viaUpdate.aliases).toHaveLength(50);
    expect(viaUpdate.aliases).toContain('Odrin Hale');
  });

  it('resolves earlier unresolved text for the new title', async () => {
    const { d, make, pairs } = await world();
    const x = await make('Odrin Vey');
    await make('A', { body: '[[Odrin Hale]]' });
    expect(await pairs()).toEqual([]);
    await renameEntity(d, x.id, 'Odrin Hale');
    expect(await pairs()).toEqual(['A>Odrin Hale']);
  });

  it('changes only the case without adding an alias', async () => {
    const { d, make } = await world();
    const x = await make('odrin');
    const r = await renameEntity(d, x.id, 'Odrin');
    expect(r.title).toBe('Odrin');
    expect(r.aliases).toEqual([]);
  });

  it('refuses a bad title and an unknown id', async () => {
    const { d, make } = await world();
    const x = await make('Odrin');
    await expect(renameEntity(d, x.id, 'a|b')).rejects.toMatchObject({ code: 'invalid' });
    await expect(renameEntity(d, 'ent_0000000000009999', 'B')).rejects.toBeInstanceOf(RepoError);
    expect((await getEntity(d, x.id))?.title).toBe('Odrin');
  });

  it("is what updateEntity does for a title change, and keeps the caller's aliases too", async () => {
    const { d, make } = await world();
    const x = await make('Odrin Vey');
    const a = await make('A', { body: '[[Odrin Vey]]' });
    const next = await updateEntity(d, x.id, {
      title: 'Odrin Hale',
      aliases: ['Weir Man'],
      summary: 'new',
    });
    expect(next.aliases).toEqual(['Weir Man', 'Odrin Vey']);
    expect(next.summary).toBe('new');
    expect((await getEntity(d, a.id))?.body).toBe('[[Odrin Hale]]');
  });
});

describe('deleteEntity and wiki text', () => {
  it('removes links to the entry and never rewrites text', async () => {
    const { d, make, pairs } = await world();
    const x = await make('X');
    const a = await make('A', { body: 'see [[X]]' });
    expect(await pairs()).toEqual(['A>X']);
    await deleteEntity(d, x.id);
    expect(await pairs()).toEqual([]);
    expect((await getEntity(d, a.id))?.body).toBe('see [[X]]');
    expect((await getEntity(d, a.id))?.wikiTargets).toEqual(['x']);
  });
});
