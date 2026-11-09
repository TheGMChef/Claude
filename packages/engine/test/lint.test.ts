import { describe, expect, it } from 'vitest';
import { lintPack } from '../src/lint';
import type { CompiledPack, CompiledEntry, CompiledCulture } from '../src/schema';
import marshJson from './fixtures/marsh.culture.json';
import type { TemplateAst } from '../src/template';
import { compileDocs } from '../src/compile';
import { situationManifest, situationOnlyDocs } from './fixtures/situation-pack';

const entry = (
  id: string,
  ast: TemplateAst,
  extra: Partial<CompiledEntry> = {},
): CompiledEntry => ({
  id,
  ast,
  weight: 1,
  tags: [],
  safety: [],
  ...extra,
});
const ref = (r: string): TemplateAst[number] => ({ slot: { kind: 'table', ref: r }, mods: [] });

function pack(over: Partial<CompiledPack> = {}): CompiledPack {
  return {
    id: 'p',
    version: '1',
    tables: {},
    cultures: {},
    generators: {},
    oracles: {},
    decks: {},
    situations: {},
    vocabulary: [],
    ...over,
  };
}
const table = (id: string, entries: CompiledEntry[]): CompiledPack['tables'] => ({
  [id]: { id, tags: [], entries },
});

describe('lintPack', () => {
  it('passes a clean pack', () => {
    const p = pack({ tables: table('p.a.b', [entry('p.a.b#0', ['x'])]) });
    expect(lintPack(p)).toEqual([]);
  });

  it('flags empty tables', () => {
    const errs = lintPack(pack({ tables: table('p.a.b', []) }));
    expect(errs.map((e) => e.code)).toEqual(['empty-table']);
    expect(errs[0]).toMatchObject({ packId: 'p', path: 'p.a.b' });
  });

  it('flags unknown safety tags and tags outside the vocabulary (incl. deps)', () => {
    const dep = pack({ id: 'core', vocabulary: ['shared'] });
    const p = pack({
      vocabulary: ['mine'],
      tables: table('p.a.b', [
        entry('p.a.b#0', ['x'], { tags: ['mine', 'shared'], safety: ['violence'] }),
        entry('p.a.b#1', ['y'], { tags: ['other'], safety: ['wibble'] }),
      ]),
    });
    const errs = lintPack(p, [dep]);
    expect(errs.map((e) => [e.code, e.path])).toEqual([
      ['unknown-safety-tag', 'p.a.b#entries[1]'],
      ['unknown-tag', 'p.a.b#entries[1]'],
    ]);
  });

  it('flags unresolved table refs, but accepts refs into deps', () => {
    const dep = pack({ id: 'core', tables: table('core.x.y', [entry('core.x.y#0', ['z'])]) });
    const p = pack({
      tables: table('p.a.b', [
        entry('p.a.b#0', [ref('core.x.y')]),
        entry('p.a.b#1', [ref('missing.ref')]),
      ]),
    });
    const errs = lintPack(p, [dep]);
    expect(errs.map((e) => [e.code, e.path])).toEqual([['unresolved-ref', 'p.a.b#entries[1]']]);
  });

  it('flags cycles across tables and generators', () => {
    const tables = {
      ...table('p.a.one', [entry('p.a.one#0', [ref('p.a.two')])]),
      ...table('p.a.two', [entry('p.a.two#0', [ref('p.a.one')])]),
    };
    expect(lintPack(pack({ tables })).map((e) => e.code)).toEqual(['cycle']);

    const gens = pack({
      tables: table('p.a.t', [
        entry('p.a.t#0', [{ slot: { kind: 'gen', generator: 'p.g', field: 'f' }, mods: [] }]),
      ]),
      generators: {
        'p.g': { id: 'p.g', title: 'G', fields: { f: { table: 'p.a.t' } }, display: ['x'] },
      },
    });
    expect(lintPack(gens).map((e) => e.code)).toEqual(['cycle']);
  });

  it('flags generator fields pointing at missing sources', () => {
    const p = pack({
      tables: table('p.a.t', [entry('p.a.t#0', ['x'])]),
      generators: {
        'p.g': {
          id: 'p.g',
          title: 'G',
          fields: {
            ok: { table: 'p.a.t' },
            bad: { table: 'p.a.nope' },
            pick: { pick: { table: 'p.a.nope2', count: 2 } },
            sub: { gen: 'p.nope' },
          },
          display: ['x'],
        },
      },
    });
    const errs = lintPack(p);
    expect(errs.map((e) => [e.code, e.path])).toEqual([
      ['missing-source', 'p.g#fields.bad'],
      ['missing-source', 'p.g#fields.pick'],
      ['missing-source', 'p.g#fields.sub'],
    ]);
  });

  it("flags a template field that references its own generator's field (R23)", () => {
    const p = pack({
      tables: table('p.a.b', [entry('p.a.b#0', ['x'])]),
      generators: {
        'p.g': {
          id: 'p.g',
          title: 'G',
          fields: { role: { table: 'p.a.b' }, line: { template: ['a ', ref('role')] } },
          display: [ref('role'), ref('line')],
        },
      },
    });
    const errors = lintPack(p);
    expect(errors.map((e) => e.code)).toEqual(['unresolved-ref']);
    expect(errors[0]?.message).toMatch(/field "role".*display/);
  });

  it('flags a gen slot whose field does not exist', () => {
    const p = pack({
      generators: {
        'p.g': {
          id: 'p.g',
          title: 'G',
          fields: { a: { name: 'full' } },
          display: [{ slot: { kind: 'gen', generator: 'p.g', field: 'zzz' }, mods: [] }],
        },
      },
    });
    // display self-reference is also a cycle only via fields; here just missing-source
    expect(lintPack(p).map((e) => e.code)).toContain('missing-source');
  });

  it('flags unresolved oracle meaning tables', () => {
    const odds = { yes: 1, extreme: 1 };
    const p = pack({
      oracles: {
        'p.o': {
          id: 'p.o',
          odds: { certain: odds, likely: odds, even: odds, unlikely: odds, remote: odds },
          meaning: ['p.nope'],
        },
      },
    });
    expect(lintPack(p).map((e) => e.code)).toEqual(['unresolved-ref']);
  });

  it('flags a culture that cannot produce 20 distinct valid names in 500 tries', () => {
    const weak = {
      ...(marshJson as CompiledCulture),
      exampleChance: 0,
      examples: [],
      banned: [],
      names: { given: { pattern: ['a'], parts: { a: ['X', 'Y'] } } },
    };
    const errs = lintPack(pack({ cultures: { [weak.id]: weak } }));
    expect(errs.map((e) => e.code)).toEqual(['weak-culture']);
  });

  it('passes a healthy culture', () => {
    const c = marshJson as CompiledCulture;
    expect(lintPack(pack({ cultures: { [c.id]: c } }))).toEqual([]);
  });

  it('flags culture examples and voice tips that match a safety stem (culture-safety)', () => {
    const c = {
      ...(marshJson as CompiledCulture),
      examples: ['Corpsewick Vey'],
      voice: { summary: 's', tips: ['Pray before you lie.'] },
    };
    const errs = lintPack(pack({ cultures: { [c.id]: c } }), []);
    expect(errs.map((e) => [e.code, e.path])).toEqual([
      ['culture-safety', `${c.id}#names.examples[0]`],
      ['culture-safety', `${c.id}#voice.tips[0]`],
    ]);
  });

  it('flags a {gen:} self-reference through a facet entry as a cycle (R37)', () => {
    const docs = situationOnlyDocs.map((d) =>
      'id' in d && d.id === 's.situation.reed-vow'
        ? {
            ...d,
            facets: {
              ...(d as { facets: Record<string, unknown[]> }).facets,
              enemy: [{ text: 'again {gen:s.seed.b}' }, { text: 'enemy 2' }, { text: 'enemy 3' }],
            },
          }
        : d,
    );
    const { errors } = compileDocs(situationManifest, [
      ...docs.map((d, i) => ({ file: `d${i}.yaml`, data: d })),
      {
        file: 'g.yaml',
        data: {
          kind: 'generator',
          id: 's.seed',
          title: 'Seed',
          fields: {
            a: { situation: { table: 's.situations' } },
            b: { facet: { of: 'a', name: 'enemy' } },
          },
          display: '{b}',
        },
      },
    ]);
    expect(errors.map((e) => e.code)).toEqual(['cycle']);
  });
});
