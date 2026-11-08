import { describe, expect, it } from 'vitest';
import { compileDocs } from '../src/compile';
import { loadPacks } from '../src/library';
import { validateUserPack } from '../src/userPack';
import { FACETS } from '../src/schema';
import type { CompiledPack } from '../src/schema';
import { asDocs, situationManifest, situationOnlyDocs } from './fixtures/situation-pack';

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
