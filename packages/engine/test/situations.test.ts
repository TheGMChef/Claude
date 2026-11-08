import { describe, expect, it } from 'vitest';
import { compileDocs } from '../src/compile';
import { loadPacks } from '../src/library';
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
