import { describe, expect, it } from 'vitest';
import type { Entity } from '../schema';
import { entityTokens } from '../text';
import { COMMANDS, MAX_QUERY_LENGTH, buildIndex, matchCommands, search } from '../search';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 10, 12);
const OLD = NOW - 30 * DAY;

let n = 0;
function ent(over: Partial<Entity> & { title: string }): Entity {
  const e: Entity = {
    id: `ent_${String(++n).padStart(16, '0')}`,
    campaignId: 'cmp_0000000000000001',
    kind: 'npc',
    aliases: [],
    summary: '',
    fields: {},
    body: '',
    canon: 'kept',
    veiled: [],
    origin: 'manual',
    tokens: [],
    wikiTargets: [],
    createdAt: OLD,
    updatedAt: OLD,
    ...over,
  };
  e.tokens = entityTokens(e);
  return e;
}
const titles = (r: { entity: Entity }[]) => r.map((x) => x.entity.title);

describe('search ranking (D58)', () => {
  const exact = ent({ title: 'Odrin' });
  const prefix = ent({ title: "Odrin's Boat", kind: 'item' });
  const alias = ent({ title: 'The Ferryman', aliases: ['Odrin the Ferryman'] });
  const token = ent({ title: 'Old Odrin' });
  const fieldOnly = ent({ title: 'Salt Reeve', fields: { secret: 'owes Odrin a favour' } });
  const unrelated = ent({ title: 'Marsh Gate', summary: 'a gate' });
  const index = buildIndex([unrelated, fieldOnly, token, alias, prefix, exact]);

  it('scores exact title 100, title prefix 60, alias 50, title token 40, field token 10', () => {
    const r = search(index, 'odrin', { now: NOW });
    expect(r.map((x) => [x.entity.title, x.score])).toEqual([
      ['Odrin', 100],
      ["Odrin's Boat", 60],
      ['The Ferryman', 50],
      ['Old Odrin', 40],
      ['Salt Reeve', 10],
    ]);
  });

  it('scores an alias token 30 when no title or whole-alias rule applies', () => {
    const e = ent({ title: 'Ferry Master', aliases: ['Captain Odrin'] });
    expect(search(buildIndex([e]), 'odrin', { now: NOW })[0]?.score).toBe(30);
  });

  it('folds diacritics and case both ways', () => {
    const o = ent({ title: 'Ödrin' });
    const idx = buildIndex([o]);
    expect(titles(search(idx, 'odr', { now: NOW }))).toEqual(['Ödrin']);
    expect(titles(search(idx, 'ÖDR', { now: NOW }))).toEqual(['Ödrin']);
    expect(search(idx, 'Ödrin', { now: NOW })[0]?.score).toBe(100);
  });

  it('needs every query token (AND) and sums the best score of each', () => {
    const both = ent({ title: 'Salt Reeve' });
    const one = ent({ title: 'Salt Office' });
    const idx = buildIndex([one, both]);
    const r = search(idx, 'salt reeve', { now: NOW });
    expect(titles(r)).toEqual(['Salt Reeve']);
    expect(r[0]?.score).toBe(100);
    const mixed = ent({ title: 'Reeve of the Salt Road', summary: 'collects' });
    // "salt" and "reeve" both hit title tokens: 40 + 40
    expect(search(buildIndex([mixed]), 'salt reeve', { now: NOW })[0]?.score).toBe(80);
    const split = ent({ title: 'Reeve Marsh', fields: { want: 'salt' } });
    // title token 40 + field token 10
    expect(search(buildIndex([split]), 'reeve salt', { now: NOW })[0]?.score).toBe(50);
  });

  it('adds 5 for an entry updated within 7 days, and that breaks a tie', () => {
    const fresh = ent({ title: 'Marsh Light', updatedAt: NOW - 6 * DAY });
    const stale = ent({ title: 'Marsh Lamp', updatedAt: NOW - 8 * DAY });
    const r = search(buildIndex([stale, fresh]), 'marsh', { now: NOW });
    expect(r.map((x) => [x.entity.title, x.score])).toEqual([
      ['Marsh Light', 65],
      ['Marsh Lamp', 60],
    ]);
  });

  it('breaks equal scores by newer update, then title A to Z', () => {
    const a = ent({ title: 'Zed Marsh', updatedAt: OLD + 10 });
    const b = ent({ title: 'Amy Marsh', updatedAt: OLD });
    const c = ent({ title: 'Bea Marsh', updatedAt: OLD });
    expect(titles(search(buildIndex([c, b, a]), 'marsh', { now: NOW }))).toEqual([
      'Zed Marsh',
      'Amy Marsh',
      'Bea Marsh',
    ]);
  });

  it('returns at most 20 by default and honours a smaller limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => ent({ title: `Marsh ${i}` }));
    const idx = buildIndex(many);
    expect(search(idx, 'marsh', { now: NOW })).toHaveLength(20);
    expect(search(idx, 'marsh', { now: NOW, limit: 5 })).toHaveLength(5);
    expect(search(idx, 'marsh', { now: NOW, limit: 500 })).toHaveLength(20);
  });

  it('filters by kind', () => {
    const r = search(index, 'odrin', { now: NOW, kinds: ['item'] });
    expect(titles(r)).toEqual(["Odrin's Boat"]);
    expect(search(index, 'odrin', { now: NOW, kinds: [] })).toEqual([]);
  });

  it('finds an entry by its kind label', () => {
    const idx = buildIndex([ent({ title: 'Marsh Gate', kind: 'place' })]);
    expect(search(idx, 'plac', { now: NOW })[0]?.score).toBe(10);
  });

  it('returns nothing for an empty or punctuation-only query, or a missing word', () => {
    expect(search(index, '', { now: NOW })).toEqual([]);
    expect(search(index, '   ', { now: NOW })).toEqual([]);
    expect(search(index, '!!!', { now: NOW })).toEqual([]);
    expect(search(index, 'odrin zzz', { now: NOW })).toEqual([]);
  });

  it('does not index the body', () => {
    const e = ent({ title: 'Plain', body: 'secretword inside the body' });
    expect(search(buildIndex([e]), 'secretword', { now: NOW })).toEqual([]);
  });

  it('caps a pasted paragraph: only the first characters and words count', () => {
    const e = ent({ title: 'Odrin' });
    const idx = buildIndex([e]);
    expect(MAX_QUERY_LENGTH).toBe(200);
    const long = `odrin ${'x'.repeat(5000)}`;
    // the long word is cut at 64 characters like indexed tokens, so it still misses: no crash, no hit
    expect(search(idx, long, { now: NOW })).toEqual([]);
    const words = `odrin ${'odrin '.repeat(100)}`;
    expect(search(idx, words, { now: NOW })).toHaveLength(1);
    const tail = `${' '.repeat(MAX_QUERY_LENGTH)}odrin`;
    expect(search(idx, tail, { now: NOW })).toEqual([]);
  });
});

describe('commands (spec 5.6)', () => {
  it('has the fourteen labels verbatim', () => {
    expect(COMMANDS.map((c) => c.label)).toEqual([
      'Roll a name',
      'Roll an NPC',
      'Roll a place',
      'Roll a tavern',
      'Roll a shop',
      'Roll a settlement',
      'Roll a twist',
      'Roll treasure',
      'Roll a trinket',
      'Roll an encounter',
      'Roll a seed',
      'Ask the oracle',
      'Draw a move',
      "I'm stuck",
    ]);
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(14);
  });

  const labels = (q: string) => matchCommands(q).map((c) => c.label);

  it('"roll" matches all eleven Roll commands', () => {
    const l = labels('roll');
    expect(l).toHaveLength(11);
    expect(l.every((x) => x.startsWith('Roll'))).toBe(true);
  });

  it('matches by noun prefix', () => {
    expect(labels('npc')).toEqual(['Roll an NPC']);
    expect(labels('ora')).toEqual(['Ask the oracle']);
    expect(labels('stuck')).toEqual(["I'm stuck"]);
    expect(labels('tav')).toEqual(['Roll a tavern']);
  });

  it('matches verb plus noun, ignoring a, an and the', () => {
    expect(labels('roll npc')).toEqual(['Roll an NPC']);
    expect(labels('roll an npc')).toEqual(['Roll an NPC']);
    expect(labels("i'm stuck")).toEqual(["I'm stuck"]);
    expect(labels('draw')).toEqual(['Draw a move']);
  });

  it('a lone article matches nothing, and so does nonsense', () => {
    expect(labels('a')).toEqual([]);
    expect(labels('the')).toEqual([]);
    expect(labels('zzz')).toEqual([]);
    expect(labels('')).toEqual([]);
    expect(labels('roll zzz')).toEqual([]);
  });
});
