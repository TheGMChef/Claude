import { describe, expect, it } from 'vitest';
import { compileDocs } from '../src/compile';
import { loadPacks } from '../src/library';
import {
  BLOCKED_DISPLAY,
  BLOCKED_VALUE,
  applySafety,
  cardFromShare,
  cardToShare,
  generate,
  reroll,
  rollTable,
} from '../src/generate';
import type { Card, CardField } from '../src/generate';
import type { SafetySettings } from '../src/safety';
import { validateUserPack } from '../src/userPack';
import { FACETS } from '../src/schema';
import type { CompiledGenerator, CompiledPack } from '../src/schema';
import { fieldDeps, fieldOrder } from '../src/situations';
import {
  asDocs,
  seedGeneratorDoc,
  situationManifest,
  situationOnlyDocs,
} from './fixtures/situation-pack';

type Doc = Record<string, unknown>;
const ember = situationOnlyDocs[1] as Doc;
const compileErrors = (docs: unknown[]): Array<[string, string]> =>
  compileDocs(situationManifest, asDocs(docs)).errors.map((e) => [e.code, e.path]);
const withFacets = (over: Record<string, unknown>): Doc => ({
  ...ember,
  facets: { ...(ember.facets as Doc), ...over },
});
const replaceEmber = (doc: Doc): unknown[] => [
  situationOnlyDocs[0],
  doc,
  ...situationOnlyDocs.slice(2),
];

describe('compile situations', () => {
  it('compiles facet tables, the index table and the situation records', () => {
    const { pack, errors } = compileDocs(situationManifest, asDocs(situationOnlyDocs));
    expect(errors).toEqual([]);
    expect(pack.tables['s.situation.ember-toll.enemy']).toMatchObject({
      id: 's.situation.ember-toll.enemy',
      title: 'Ember toll: enemy',
      tags: ['situation', 'trade'],
    });
    expect(pack.tables['s.situation.ember-toll.enemy']?.entries.map((e) => e.id)).toEqual([
      's.situation.ember-toll.enemy#0',
      's.situation.ember-toll.enemy#1',
      's.situation.ember-toll.enemy#2',
    ]);
    expect(pack.tables['s.situations']?.entries[0]).toEqual({
      id: 's.situations#0',
      ast: ['Ember toll'],
      weight: 1,
      tags: ['situation', 'trade'],
      safety: ['fire'],
      ref: 's.situation.ember-toll',
    });
    expect(pack.tables['s.situations']?.entries.map((e) => e.ref)).toEqual([
      's.situation.ember-toll',
      's.situation.bell-debt',
      's.situation.reed-vow',
    ]);
    expect(pack.situations['s.situation.reed-vow']).toEqual({
      id: 's.situation.reed-vow',
      title: 'Reed vow',
      summary: 'A promise made on the water.',
      tags: ['situation', 'coastal'],
      safety: [],
      facets: Object.fromEntries(FACETS.map((f) => [f, `s.situation.reed-vow.${f}`])),
    });
    expect(loadPacks([pack]).situation('s.situation.bell-debt')?.title).toBe('Bell debt');
  });

  it('copies the manifest genre and the index title', () => {
    const { pack } = compileDocs(
      { ...situationManifest, genre: 'fantasy' },
      asDocs(situationOnlyDocs),
    );
    expect(pack.situations['s.situation.bell-debt']?.genre).toBe('fantasy');
    expect(pack.tables['s.situations']).toMatchObject({ title: 'Situations', tags: [] });
  });

  it('rejects an enemy facet with 2 entries', () => {
    const two = [{ text: 'a' }, { text: 'b' }];
    expect(compileErrors(replaceEmber(withFacets({ enemy: two })))).toEqual([
      ['schema', 'd1#facets.enemy'],
    ]);
  });

  it('rejects a missing facet', () => {
    const rest = { ...(ember.facets as Doc) };
    delete rest.pressure;
    expect(compileErrors(replaceEmber({ ...ember, facets: rest }))).toEqual([
      ['schema', 'd1#facets.pressure'],
    ]);
  });

  it('rejects an id outside <pack>.situation.', () => {
    expect(compileErrors(replaceEmber({ ...ember, id: 's.ember-toll' }))).toEqual([
      ['namespace', 'd1#id'],
    ]);
  });

  it('rejects the same situation twice', () => {
    expect(compileErrors([...situationOnlyDocs, ember])).toEqual([['duplicate-id', 'd4']]);
  });

  it('rejects an authored table that clashes with a derived table id', () => {
    const authored = {
      kind: 'table',
      id: 's.situation.ember-toll.enemy',
      entries: [{ text: 'x' }],
    };
    expect(compileErrors([...situationOnlyDocs, authored]).map(([c]) => c)).toEqual([
      'duplicate-id',
    ]);
    expect(compileErrors([authored, ...situationOnlyDocs]).map(([c]) => c)).toEqual([
      'duplicate-id',
    ]);
  });

  it('rejects an authored table that clashes with the index table', () => {
    const authored = { kind: 'table', id: 's.situations', entries: [{ text: 'x' }] };
    expect(compileErrors([...situationOnlyDocs, authored]).map(([c]) => c)).toEqual([
      'duplicate-id',
    ]);
  });

  it('reports an unknown safety tag on a facet entry at its own path', () => {
    const enemy = [{ text: 'a' }, { text: 'b', safety: ['spooky'] }, { text: 'c' }];
    expect(compileErrors(replaceEmber(withFacets({ enemy })))).toEqual([
      ['unknown-safety-tag', 'd1#facets.enemy[1]'],
    ]);
  });

  it('reports unknown situation tags at the file', () => {
    expect(compileErrors(replaceEmber({ ...ember, tags: ['swamp'] }))).toEqual([
      ['unknown-tag', 'd1'],
    ]);
  });

  it('reports an unknown situation safety tag at the file', () => {
    expect(compileErrors(replaceEmber({ ...ember, safety: ['spooky'] }))).toEqual([
      ['unknown-safety-tag', 'd1'],
    ]);
  });

  it('reports a template parse error on a facet entry at its path', () => {
    const enemy = [{ text: 'a' }, { text: 'b' }, { text: '{oops' }];
    expect(compileErrors(replaceEmber(withFacets({ enemy })))).toEqual([
      ['schema', 'd1#facets.enemy[2]'],
    ]);
  });

  it('a pack with no situations has no index table and situations: {}', () => {
    const { pack, errors } = compileDocs(
      situationManifest,
      asDocs([{ kind: 'table', id: 's.a.b', entries: [{ text: 'x' }] }]),
    );
    expect(errors).toEqual([]);
    expect(pack.tables['s.situations']).toBeUndefined();
    expect(pack.situations).toEqual({});
  });

  it('resolves a short ref in a facet entry from owner <situationId>.<facet>', () => {
    const enemy = [{ text: 'a' }, { text: 'b' }, { text: 'see {coin}' }];
    const coin = { kind: 'table', id: 's.situation.ember-toll.coin', entries: [{ text: 'x' }] };
    const { pack, errors } = compileDocs(
      situationManifest,
      asDocs([...replaceEmber(withFacets({ enemy })), coin]),
    );
    expect(errors).toEqual([]);
    expect(pack.tables['s.situation.ember-toll.enemy']?.entries[2]?.ast).toEqual([
      'see ',
      { slot: { kind: 'table', ref: 's.situation.ember-toll.coin' }, mods: [] },
    ]);
  });
});

describe('situation id clashes and edge cases', () => {
  const tableDoc = (id: string): Doc => ({ kind: 'table', id, entries: [{ text: 'x' }] });
  const codes = (docs: unknown[]): string[] => compileErrors(docs).map(([c]) => c);

  it('rejects a situation whose id equals an authored table id, in both orders', () => {
    const t = tableDoc('s.situation.ember-toll');
    expect(compileErrors([t, ...situationOnlyDocs])).toEqual([['duplicate-id', 'd2']]);
    expect(compileErrors([...situationOnlyDocs, t])).toEqual([['duplicate-id', 'd4']]);
  });

  it('names both parties in the message', () => {
    const { errors } = compileDocs(
      situationManifest,
      asDocs([...situationOnlyDocs, tableDoc('s.situation.ember-toll')]),
    );
    expect(errors[0]?.message).toContain('s.situation.ember-toll');
    expect(errors[0]?.message).toContain('table');
    expect(errors[0]?.message).toContain('situation');
  });

  it('rejects a situation whose id equals another situation derived table id', () => {
    const nested = { ...ember, id: 's.situation.ember-toll.enemy' };
    expect(compileErrors([...situationOnlyDocs, nested])).toEqual([['duplicate-id', 'd4']]);
  });

  it('rejects a situation whose derived table id equals an earlier situation id', () => {
    const nested = { ...ember, id: 's.situation.ember-toll.enemy' };
    const docs = [situationOnlyDocs[0], nested, ember];
    expect(compileErrors(docs)).toEqual([['duplicate-id', 'd2']]);
  });

  it('rejects an authored table equal to a situation id in a user pack', () => {
    const user = (id: string): Doc => ({ ...ember, id });
    const docs = [
      { kind: 'vocabulary', tags: ['situation', 'trade'] },
      user('user.situation.ember-toll'),
      tableDoc('user.situation.ember-toll'),
    ];
    const r = validateUserPack(docs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toEqual(['duplicate-id']);
    const ok = validateUserPack(docs.slice(0, 2));
    expect(ok.ok).toBe(true);
  });

  it('carries a non-default weight to the index entry', () => {
    const { pack } = compileDocs(situationManifest, asDocs(replaceEmber({ ...ember, weight: 3 })));
    expect(pack.tables['s.situations']?.entries[0]?.weight).toBe(3);
  });

  it('rejects an unknown key inside facets', () => {
    expect(compileErrors(replaceEmber(withFacets({ bogus: [] }))).map(([c]) => c)).toEqual([
      'schema',
    ]);
  });

  it('rejects an empty summary', () => {
    expect(compileErrors(replaceEmber({ ...ember, summary: '' }))).toEqual([
      ['schema', 'd1#summary'],
    ]);
  });

  it('rejects uppercase, __proto__ and prefix-only ids', () => {
    for (const id of ['s.situation.Ember', '__proto__', 's.situation.']) {
      expect(codes(replaceEmber({ ...ember, id }))).toEqual(['schema']);
    }
  });

  it('lets a later situation claim the index after a rejected first one', () => {
    const bad = { ...ember, id: 's.ember-toll' };
    const { pack, errors } = compileDocs(
      situationManifest,
      asDocs([situationOnlyDocs[0], bad, situationOnlyDocs[2]]),
    );
    expect(errors.map((e) => e.code)).toEqual(['namespace']);
    expect(pack.tables['s.situations']?.entries.map((e) => e.ref)).toEqual([
      's.situation.bell-debt',
    ]);
  });

  it('reports a facet-to-facet cycle through the derived tables', () => {
    const enemy = [{ text: 'a' }, { text: 'b' }, { text: '{friend}' }];
    const friend = [{ text: 'a' }, { text: 'b' }, { text: '{enemy}' }];
    expect(codes(replaceEmber(withFacets({ enemy, friend })))).toEqual(['cycle']);
  });
});

describe('loadPacks with situations', () => {
  const base = compileDocs(situationManifest, asDocs(situationOnlyDocs)).pack;
  const other = (tableId: string): CompiledPack => ({
    id: 'o',
    version: '1',
    tables: { [tableId]: { id: tableId, tags: [], entries: [] } },
    cultures: {},
    generators: {},
    oracles: {},
    decks: {},
    situations: {},
    vocabulary: [],
  });

  it('throws duplicate-id when a table shares a situation id', () => {
    expect(() => loadPacks([base, other('s.situation.bell-debt')])).toThrowError(
      expect.objectContaining({ code: 'duplicate-id' }),
    );
  });

  it('loads a compiled pack that has no situations key', async () => {
    const legacy = (await import('./fixtures/select-pack.json')).default as unknown as CompiledPack;
    expect(legacy).not.toHaveProperty('situations');
    const lib = loadPacks([legacy]);
    expect(lib.situation('anything.at.all')).toBeUndefined();
  });
});

const NONE: SafetySettings = { lines: [], veils: [] };
const seedPack = compileDocs(situationManifest, asDocs([...situationOnlyDocs, seedGeneratorDoc]));
const lib = loadPacks([seedPack.pack]);
const roll = (seed: string, safety: SafetySettings = NONE): Card =>
  generate(lib, 's.seed', { seed, context: { safety } });
const field = (card: Card, name: string): CardField => card.fields[name] as CardField;
const firstEmber = (): Card => {
  for (let i = 0; ; i++) {
    const card = roll(`e${i}`);
    if (field(card, 'a').value === 'Ember toll') return card;
  }
};

describe('generate situations', () => {
  it('compiles the seed generator without errors', () => {
    expect(seedPack.errors).toEqual([]);
    expect(seedPack.pack.generators['s.seed']?.fields.b).toEqual({
      situation: { table: 's.situations', distinctFrom: 'a' },
    });
  });

  it('generates dependencies first and keys the card in declared order', () => {
    expect(fieldOrder(lib.generator('s.seed')!)).toEqual(['a', 'enemy', 'b', 'thing']);
    const card = generate(lib, 's.seed', { seed: 'TEST-0001' });
    expect(Object.keys(card.fields)).toEqual(['enemy', 'b', 'a', 'thing']);
    expect(field(card, 'enemy').sources[0]).toBe(field(card, 'a').sources[0]);
    expect(card.display).toBe(`${field(card, 'a').value} meets ${field(card, 'b').value}`);
  });

  it('fieldDeps names of and distinctFrom', () => {
    expect(fieldDeps({ facet: { of: 'a', name: 'enemy' } })).toEqual(['a']);
    expect(fieldDeps({ situation: { table: 't', distinctFrom: 'b' } })).toEqual(['b']);
    expect(fieldDeps({ situation: { table: 't' } })).toEqual([]);
    expect(fieldDeps({ table: 't' })).toEqual([]);
  });

  it('a dependency on a field the generator lacks keeps declared order', () => {
    const gen = {
      ...(lib.generator('s.seed') as CompiledGenerator),
      fields: {
        x: { facet: { of: 'nope', name: 'enemy' as const } },
        a: { situation: { table: 's.situations' } },
      },
    };
    expect(fieldOrder(gen)).toEqual(['x', 'a']);
  });

  it('never selects a lined situation', () => {
    let ember = 0;
    for (let i = 0; i < 10_000; i++) {
      const card = roll(`l${i}`, { lines: ['fire'], veils: [] });
      expect(field(card, 'a').value).not.toBe('Ember toll');
      expect(field(card, 'b').value).not.toBe('Ember toll');
      if (field(roll(`l${i}`), 'a').value === 'Ember toll') ember++;
    }
    expect(ember).toBeGreaterThan(2_000);
  });

  it('veils a card that shows a veiled situation', () => {
    let count = 0;
    for (let i = 0; i < 10_000; i++) {
      const card = roll(`v${i}`, { lines: [], veils: ['religion'] });
      if (field(card, 'a').value === 'Bell debt' || field(card, 'b').value === 'Bell debt') {
        expect(card.flags.veiled).toContain('religion');
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(3_000);
  });

  it('distinctFrom never repeats the other situation', () => {
    for (let i = 0; i < 10_000; i++) {
      const card = roll(`d${i}`);
      expect(field(card, 'a').value).not.toBe(field(card, 'b').value);
    }
  });

  it('blocks distinctFrom and its facets when one situation is eligible', () => {
    const card = roll('TEST-0001', { lines: ['fire', 'religion'], veils: [] });
    expect(field(card, 'a').value).toBe('Reed vow');
    expect(field(card, 'b')).toMatchObject({ value: BLOCKED_VALUE, blocked: true });
    expect(field(card, 'thing').blocked).toBe(true);
    expect(card.display).toBe(BLOCKED_DISPLAY);
    expect(field(card, 'enemy').blocked).toBeUndefined();
  });

  it('blocks distinctFrom when exclusion empties the index table', () => {
    const one = compileDocs(
      situationManifest,
      asDocs([situationOnlyDocs[0], situationOnlyDocs[3], seedGeneratorDoc]),
    );
    expect(one.errors).toEqual([]);
    const card = generate(loadPacks([one.pack]), 's.seed', { seed: 'TEST-0001' });
    expect(field(card, 'a').value).toBe('Reed vow');
    expect(field(card, 'b')).toMatchObject({ value: BLOCKED_VALUE, blocked: true, sources: [] });
    expect(field(card, 'thing')).toMatchObject({ value: BLOCKED_VALUE, blocked: true });
  });

  it('a facet follows its of field', () => {
    const index = lib.table('s.situations')!;
    for (let i = 0; i < 100; i++) {
      const card = roll(`f${i}`);
      const a = field(card, 'a').sources[0];
      const ref = index.entries.find((e) => e.id === a)?.ref as string;
      expect(ref).toMatch(/^s\.situation\./);
      expect(field(card, 'enemy').sources[1]).toMatch(
        new RegExp(`^${ref.replaceAll('.', '\\.')}\\.enemy#\\d$`),
      );
      expect(field(card, 'enemy').value.startsWith(ref.split('.')[2]!.split('-')[0]!)).toBe(true);
    }
  });

  it('a line on a situation blocks its facets and removing it restores them', () => {
    const card = firstEmber();
    const x = applySafety(lib, card, { context: { safety: { lines: ['fire'], veils: [] } } });
    expect(field(x, 'a').blocked).toBe(true);
    expect(field(x, 'enemy').blocked).toBe(true);
    expect(field(x, 'enemy').hidden?.value).toBe(field(card, 'enemy').value);
    expect(field(x, 'b')).toEqual(field(card, 'b'));
    expect(field(x, 'thing')).toEqual(field(card, 'thing'));
    expect(applySafety(lib, x, { context: { safety: NONE } }).fields).toEqual(card.fields);
  });

  it('fills fields blocked at generation once the line goes', () => {
    const card = roll('TEST-0001', { lines: ['fire', 'religion'], veils: [] });
    const y = applySafety(lib, card, { context: { safety: NONE } });
    expect(field(y, 'b').blocked).toBeUndefined();
    expect(field(y, 'b').value).not.toBe(field(y, 'a').value);
    expect(field(y, 'thing').blocked).toBeUndefined();
    expect(field(y, 'thing').sources[0]).toBe(field(y, 'b').sources[0]);
    expect(field(y, 'a')).toEqual(field(card, 'a'));
    expect(field(y, 'enemy')).toEqual(field(card, 'enemy'));
    expect(Object.keys(y.fields)).toEqual(['enemy', 'b', 'a', 'thing']);
  });

  it('a locked facet keeps its value, and a line on its situation blocks it (R22)', () => {
    const card = roll('TEST-0001');
    const kept = reroll(lib, card, { locks: ['enemy'] });
    expect(field(kept, 'enemy')).toMatchObject({
      value: field(card, 'enemy').value,
      locked: true,
    });
    const ember = firstEmber();
    const lined = reroll(lib, ember, {
      locks: ['enemy'],
      context: { safety: { lines: ['fire'], veils: [] } },
    });
    expect(field(lined, 'enemy')).toMatchObject({
      value: BLOCKED_VALUE,
      blocked: true,
      locked: true,
    });
    expect(Object.keys(lined.fields)).toEqual(['enemy', 'b', 'a', 'thing']);
  });

  it('share codes stay exact', () => {
    for (let i = 0; i < 50; i++) {
      // A locked facet whose `of` field rerolls is honestly inexact (C1), so `of` is locked too.
      const card = i % 2 ? reroll(lib, roll(`s${i}`), { locks: ['enemy', 'a'] }) : roll(`s${i}`);
      const share = cardToShare(lib, card);
      expect(share.exact).toBe(true);
      const back = cardFromShare(lib, 's.seed', share.code, card.context);
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(Object.keys(back.card.fields)).toEqual(['enemy', 'b', 'a', 'thing']);
        for (const n of Object.keys(card.fields)) {
          expect(field(back.card, n).value).toBe(field(card, n).value);
        }
      }
    }
  });

  it('a locked facet whose situation rerolled is honestly not exact (C1)', () => {
    let inexact = 0;
    for (let i = 0; i < 50; i++) {
      const card = reroll(lib, roll(`x${i}`), { locks: ['thing'] });
      const share = cardToShare(lib, card);
      const back = cardFromShare(lib, 's.seed', share.code, card.context);
      const same = back.ok && field(back.card, 'thing').value === field(card, 'thing').value;
      expect(share.exact).toBe(same);
      if (!share.exact) inexact++;
    }
    expect(inexact).toBeGreaterThan(0);
  });

  it('a runtime field cycle falls back to declared order and does not throw', () => {
    const gen = seedPack.pack.generators['s.seed'] as CompiledGenerator;
    const pack: CompiledPack = {
      ...seedPack.pack,
      generators: {
        's.seed': {
          ...gen,
          fields: {
            a: { situation: { table: 's.situations', distinctFrom: 'b' } },
            b: { situation: { table: 's.situations', distinctFrom: 'a' } },
          },
        },
      },
    };
    const card = generate(loadPacks([pack]), 's.seed', { seed: 'TEST-0001' });
    expect(Object.keys(card.fields)).toEqual(['a', 'b']);
    expect(field(card, 'a').value).not.toBe('');
    expect(field(card, 'b').value).not.toBe('');
    expect(field(card, 'a').value).not.toBe(field(card, 'b').value);
  });

  it('filters situations by the situation genre, relaxed last (R14)', () => {
    const scifi = compileDocs(
      { ...situationManifest, genre: 'scifi' },
      asDocs([...situationOnlyDocs, seedGeneratorDoc]),
    );
    const sl = loadPacks([scifi.pack]);
    const off = generate(sl, 's.seed', { seed: 'TEST-0001', context: { genre: 'fantasy' } });
    expect(field(off, 'a').relaxed).toBe(true);
    const on = generate(sl, 's.seed', { seed: 'TEST-0001', context: { genre: 'scifi' } });
    expect(field(on, 'a').relaxed).toBeUndefined();
    expect(field(on, 'a').value).toBe(field(off, 'a').value);
  });
});

describe('lint situation fields', () => {
  const gen = (fields: Record<string, unknown>, display = '{a}'): Doc => ({
    kind: 'generator',
    id: 's.g',
    title: 'G',
    fields,
    display,
  });
  const lintOf = (fields: Record<string, unknown>, display?: string) =>
    compileErrors([...situationOnlyDocs, gen(fields, display)]);
  const sit = (distinctFrom?: string) => ({
    situation: { table: 's.situations', ...(distinctFrom ? { distinctFrom } : {}) },
  });

  it('accepts a seed-like generator', () => {
    expect(lintOf({ a: sit(), b: sit('a'), f: { facet: { of: 'b', name: 'place' } } })).toEqual([]);
  });

  it('rejects a facet of a table field', () => {
    expect(
      lintOf({ x: { table: 's.situations' }, f: { facet: { of: 'x', name: 'enemy' } } }, '{x}'),
    ).toEqual([['missing-source', 'd4#fields.f']]);
  });

  it('rejects a facet of a missing field', () => {
    expect(lintOf({ a: sit(), f: { facet: { of: 'zz', name: 'enemy' } } })).toEqual([
      ['missing-source', 'd4#fields.f'],
    ]);
  });

  it('rejects distinctFrom naming a missing field', () => {
    expect(lintOf({ a: sit(), b: sit('zz') })).toEqual([['missing-source', 'd4#fields.b']]);
  });

  it('reports a field dependency cycle', () => {
    expect(lintOf({ a: sit('b'), b: sit('a') }).map(([c]) => c)).toEqual(['cycle']);
  });

  it('rejects a situation source whose table has entries without ref', () => {
    expect(lintOf({ a: { situation: { table: 's.situation.reed-vow.enemy' } } })).toEqual([
      ['missing-source', 'd4#fields.a'],
    ]);
  });

  it('rejects a situation source whose table is missing', () => {
    expect(lintOf({ a: { situation: { table: 's.nope' } } })).toEqual([
      ['missing-source', 'd4#fields.a'],
    ]);
  });

  it('rejects an unknown facet name', () => {
    expect(
      lintOf({ a: sit(), f: { facet: { of: 'a', name: 'villain' } } }).map(([c]) => c),
    ).toEqual(['schema']);
  });
});

describe('situation fix round 1 (R39)', () => {
  const withB = (title: string): Card => {
    for (let i = 0; ; i++) {
      const card = roll(`k${i}`);
      if (field(card, 'b').value === title) return card;
    }
  };

  it('a locked b makes the rerolled a exclude it, with facets from a different situation', () => {
    for (let i = 0; i < 2_000; i++) {
      const card = reroll(lib, roll(`lb${i}`), { locks: ['b'] });
      const [a, b] = [field(card, 'a'), field(card, 'b')];
      expect(a.value).not.toBe(b.value);
      expect(field(card, 'enemy').sources[0]).not.toBe(b.sources[0]);
      expect(field(card, 'thing').sources[0]).toBe(b.sources[0]);
    }
  });

  it('a locked a makes the rerolled b exclude it', () => {
    for (let i = 0; i < 2_000; i++) {
      const card = reroll(lib, roll(`la${i}`), { locks: ['a'] });
      expect(field(card, 'b').value).not.toBe(field(card, 'a').value);
      expect(field(card, 'thing').sources[0]).not.toBe(field(card, 'a').sources[0]);
    }
  });

  it('a locked b leaves a blocked when b holds the only eligible situation', () => {
    const lined = { lines: ['fire', 'religion'], veils: [] };
    const card = reroll(lib, withB('Reed vow'), { locks: ['b'], context: { safety: lined } });
    expect(field(card, 'b').value).toBe('Reed vow');
    expect(field(card, 'a')).toMatchObject({ value: BLOCKED_VALUE, blocked: true });
    expect(field(card, 'enemy').blocked).toBe(true);
  });

  it('applySafety refills a next to a locked b without repeating it', () => {
    const lined = { lines: ['fire', 'religion'], veils: [] };
    for (let i = 0; i < 200; i++) {
      const base = reroll(lib, roll(`ap${i}`), { locks: ['b'] });
      if (field(base, 'b').value !== 'Reed vow') continue;
      const card = reroll(lib, base, { locks: ['b'], context: { safety: lined } });
      expect(field(card, 'a').blocked).toBe(true);
      const back = applySafety(lib, card, { context: { safety: NONE } });
      expect(field(back, 'a').blocked).toBeUndefined();
      expect(field(back, 'a').value).not.toBe('Reed vow');
      expect(Object.keys(back.fields)).toEqual(['enemy', 'b', 'a', 'thing']);
    }
  });

  it('a line on a facet entry is never selected', () => {
    let seen = 0;
    for (let i = 0; i < 10_000; i++) {
      const card = roll(`r${i}`, { lines: ['rats'], veils: [] });
      expect(field(card, 'enemy').value).not.toBe('reed enemy 1');
      if (field(roll(`r${i}`), 'enemy').value === 'reed enemy 1') seen++;
    }
    expect(seen).toBeGreaterThan(800);
  });

  it('facet entries carry their situation safety, merged with their own', () => {
    const fireTagged = withFacets({
      enemy: [{ text: 'a', safety: ['fire'] }, { text: 'b', safety: ['rats'] }, { text: 'c' }],
    });
    const { pack, errors } = compileDocs(situationManifest, asDocs(replaceEmber(fireTagged)));
    expect(errors).toEqual([]);
    expect(pack.tables['s.situation.ember-toll.enemy']?.entries.map((e) => e.safety)).toEqual([
      ['fire'],
      ['rats', 'fire'],
      ['fire'],
    ]);
    expect(pack.tables['s.situation.reed-vow.enemy']?.entries.map((e) => e.safety)).toEqual([
      ['rats'],
      [],
      [],
    ]);
  });

  it('a facet table reached directly never shows a lined situation', () => {
    const slotDoc = {
      kind: 'table',
      id: 's.t.ref',
      entries: [{ text: 'see {s.situation.ember-toll.enemy}' }],
    };
    const direct = compileDocs(situationManifest, asDocs([...situationOnlyDocs, slotDoc]));
    expect(direct.errors).toEqual([]);
    const dl = loadPacks([direct.pack]);
    const fire = { safety: { lines: ['fire'], veils: [] } };
    for (let i = 0; i < 200; i++) {
      const t = rollTable(dl, 's.situation.ember-toll.enemy', { seed: `t${i}`, context: fire });
      expect(t).toMatchObject({ text: BLOCKED_VALUE, blocked: true });
      const s = rollTable(dl, 's.t.ref', { seed: `t${i}`, context: fire });
      expect(s.text).not.toContain('ember');
      expect(s.blocked).toBe(true);
    }
  });

  it('a facet whose of names itself is reported once', () => {
    const g = { kind: 'generator', id: 's.g', title: 'G', display: '{f}' };
    const self = { ...g, fields: { f: { facet: { of: 'f', name: 'enemy' } } } };
    expect(compileErrors([...situationOnlyDocs, self])).toEqual([
      ['missing-source', 'd4#fields.f'],
    ]);
  });
});
