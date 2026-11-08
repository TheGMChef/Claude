import { describe, expect, it } from 'vitest';
import { loadPacks } from '../src/library';
import { selectEntry } from '../src/select';
import { createRng } from '../src/rng';
import { ContentError } from '../src/errors';
import type { CompiledPack, CompiledTable } from '../src/schema';
import fixture from './fixtures/select-pack.json';

const pack = fixture as unknown as CompiledPack;
const lib = loadPacks([pack]);
const tbl = (id: string): CompiledTable => {
  const t = lib.table(id);
  if (!t) throw new Error(`missing ${id}`);
  return t;
};
const N = 10000;
const tally = (
  table: CompiledTable,
  opts: Parameters<typeof selectEntry>[2],
  seed = 'tally',
): Map<string, number> => {
  const rng = createRng(seed);
  const m = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const r = selectEntry(table, rng, opts);
    const k = r.entry?.id ?? 'null';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};

describe('selectEntry', () => {
  it('respects weights 1/2/7 within 2%', () => {
    const m = tally(tbl('sel.t.weights'), {});
    expect((m.get('sel.t.weights#0') ?? 0) / N).toBeCloseTo(0.1, 1);
    for (const [id, p] of [
      ['sel.t.weights#0', 0.1],
      ['sel.t.weights#1', 0.2],
      ['sel.t.weights#2', 0.7],
    ] as const) {
      expect(Math.abs((m.get(id) ?? 0) / N - p)).toBeLessThan(0.02);
    }
  });

  it('is deterministic per seed', () => {
    const a = selectEntry(tbl('sel.t.weights'), createRng('s'), {});
    const b = selectEntry(tbl('sel.t.weights'), createRng('s'), {});
    expect(a).toEqual(b);
  });

  it('require returns only matching entries', () => {
    const m = tally(tbl('sel.t.tags'), { tags: { require: ['urban'] } });
    expect(m.has('sel.t.tags#2')).toBe(false);
    expect(m.size).toBeGreaterThan(0);
  });

  it('exclude never returns excluded entries', () => {
    const m = tally(tbl('sel.t.tags'), { tags: { exclude: ['debt'] } });
    expect(m.has('sel.t.tags#0')).toBe(false);
  });

  it('prefer raises share roughly 3x without relaxing', () => {
    const base = (tally(tbl('sel.t.tags'), {}).get('sel.t.tags#1') ?? 0) / N;
    const pref =
      (tally(tbl('sel.t.tags'), { tags: { prefer: ['family'] } }).get('sel.t.tags#1') ?? 0) / N;
    expect(Math.abs(base - 0.25)).toBeLessThan(0.02);
    expect(Math.abs(pref - 0.5)).toBeLessThan(0.02); // 3/(3+1+1+1)
    const r = selectEntry(tbl('sel.t.tags'), createRng('p'), { tags: { prefer: ['family'] } });
    expect(r.relaxed).toBe(false);
  });

  it('prefer does not compound across several matching prefer tags', () => {
    const pref =
      (tally(tbl('sel.t.tags'), { tags: { prefer: ['family', 'urban'] } }).get('sel.t.tags#1') ??
        0) / N;
    // urban entries (0,1,3) weigh 3 each, rural 1: 3/10
    expect(Math.abs(pref - 0.3)).toBeLessThan(0.02);
  });

  it('relaxes an unsatisfiable require', () => {
    const r = selectEntry(tbl('sel.t.tags'), createRng('x'), {
      tags: { require: ['nonexistent'] },
    });
    expect(r.entry).not.toBeNull();
    expect(r.relaxed).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('relaxes exclude last, after require', () => {
    const r = selectEntry(tbl('sel.t.tags'), createRng('x'), {
      tags: { require: ['nonexistent'], exclude: ['urban', 'rural', 'scifi'] },
    });
    expect(r.entry).not.toBeNull();
    expect(r.relaxed).toBe(true);
  });

  it('genre excludes only entries tagged with a different known genre', () => {
    const m = tally(tbl('sel.t.tags'), { genre: 'fantasy' });
    expect(m.has('sel.t.tags#3')).toBe(false);
    expect(m.has('sel.t.tags#2')).toBe(true);
    const s = tally(tbl('sel.t.tags'), { genre: 'scifi' });
    expect(s.has('sel.t.tags#3')).toBe(true);
  });

  it('a line-tagged entry never appears in 10,000 picks', () => {
    const m = tally(tbl('sel.t.safety'), { safety: { lines: ['violence'], veils: [] } });
    expect(m.has('sel.t.safety#0')).toBe(false);
    expect(m.size).toBe(2);
  });

  it('lines are never relaxed, even with a require that matches nothing', () => {
    const m = tally(tbl('sel.t.safety'), {
      tags: { require: ['nonexistent'] },
      safety: { lines: ['violence'], veils: [] },
    });
    expect(m.has('sel.t.safety#0')).toBe(false);
  });

  it('reports veiled tags for the chosen entry', () => {
    const rng = createRng('veil');
    let sawFire = false;
    for (let i = 0; i < 200; i++) {
      const r = selectEntry(tbl('sel.t.safety'), rng, { safety: { lines: [], veils: ['fire'] } });
      if (r.entry?.id === 'sel.t.safety#1') {
        sawFire = true;
        expect(r.veiled).toEqual(['fire']);
      } else {
        expect(r.veiled).toEqual([]);
      }
    }
    expect(sawFire).toBe(true);
  });

  it('veiled follows safety.veils order', () => {
    const t: CompiledTable = {
      id: 'sel.t.multi',
      tags: [],
      entries: [
        { id: 'sel.t.multi#0', ast: ['z'], weight: 1, tags: [], safety: ['gore', 'fire', 'death'] },
      ],
    };
    const r = selectEntry(t, createRng('m'), {
      safety: { lines: [], veils: ['fire', 'gore', 'war'] },
    });
    expect(r.veiled).toEqual(['fire', 'gore']);
  });

  it('Review Focus 2: all-violence table with violence line is blocked', () => {
    const r = selectEntry(tbl('sel.t.allviolent'), createRng('b'), {
      safety: { lines: ['violence'], veils: [] },
    });
    expect(r).toEqual({ entry: null, blocked: true, relaxed: false, veiled: [] });
  });

  it('blocked even when tag filters would also need relaxing', () => {
    const r = selectEntry(tbl('sel.t.allviolent'), createRng('b'), {
      tags: { require: ['nonexistent'] },
      safety: { lines: ['violence'], veils: [] },
    });
    expect(r.entry).toBeNull();
    expect(r.blocked).toBe(true);
  });

  it('an empty table is not blocked', () => {
    const r = selectEntry(tbl('sel.t.empty'), createRng('e'), {
      safety: { lines: ['violence'], veils: [] },
    });
    expect(r).toEqual({ entry: null, blocked: false, relaxed: false, veiled: [] });
  });
});

describe('selectEntry genre and relaxation order', () => {
  const scifi: CompiledTable = {
    id: 'sel.t.scifi',
    tags: [],
    entries: [
      { id: 'sel.t.scifi#0', ast: ['a'], weight: 1, tags: ['scifi'], safety: [] },
      { id: 'sel.t.scifi#1', ast: ['b'], weight: 1, tags: ['scifi'], safety: ['violence'] },
    ],
  };

  it('relaxes genre last when it alone empties the pool', () => {
    const r = selectEntry(scifi, createRng('g'), { genre: 'fantasy' });
    expect(r.entry).not.toBeNull();
    expect(r.relaxed).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('genre relaxation still honours lines', () => {
    const rng = createRng('g2');
    for (let i = 0; i < 200; i++) {
      const r = selectEntry(scifi, rng, {
        genre: 'fantasy',
        safety: { lines: ['violence'], veils: [] },
      });
      expect(r.entry?.id).toBe('sel.t.scifi#0');
    }
  });

  it('blocked when lines exclude every entry, regardless of genre', () => {
    const all: CompiledTable = {
      ...scifi,
      entries: scifi.entries.map((e) => ({ ...e, safety: ['violence'] })),
    };
    const b = selectEntry(all, createRng('g3'), {
      genre: 'fantasy',
      safety: { lines: ['violence'], veils: [] },
    });
    expect(b).toEqual({ entry: null, blocked: true, relaxed: false, veiled: [] });
  });

  it('relaxes require before exclude: exclude holds over 1,000 picks', () => {
    const rng = createRng('order');
    for (let i = 0; i < 1000; i++) {
      const r = selectEntry(tbl('sel.t.tags'), rng, {
        tags: { require: ['nonexistent'], exclude: ['debt'] },
      });
      expect(r.relaxed).toBe(true);
      expect(r.entry?.id).not.toBe('sel.t.tags#0');
    }
  });
});

describe('loadPacks', () => {
  const mk = (id: string, tableId: string): CompiledPack => ({
    ...pack,
    id,
    tables: { [tableId]: { id: tableId, tags: [], entries: [] } },
    cultures: {},
    generators: {},
    oracles: {},
    decks: {},
  });

  it('looks up by absolute id', () => {
    expect(lib.table('sel.t.weights')?.id).toBe('sel.t.weights');
    expect(lib.table('nope')).toBeUndefined();
    expect(lib.table('__proto__')).toBeUndefined();
    expect(lib.table('constructor')).toBeUndefined();
  });

  it('throws duplicate-id for the same table id in two non-user packs', () => {
    expect(() => loadPacks([mk('a', 'x.t.one'), mk('b', 'x.t.one')])).toThrow(ContentError);
    try {
      loadPacks([mk('a', 'x.t.one'), mk('b', 'x.t.one')]);
    } catch (e) {
      expect((e as ContentError).code).toBe('duplicate-id');
    }
  });

  it('throws duplicate-id across kinds of the same id', () => {
    const a = mk('a', 'x.t.one');
    const b: CompiledPack = {
      ...mk('b', 'x.t.two'),
      decks: { 'x.t.one': { id: 'x.t.one', title: 't', cards: [] } },
    };
    expect(() => loadPacks([a, b])).toThrow(/duplicate/);
  });

  it('lets later packs replace user.* ids', () => {
    const a = mk('u1', 'user.t.one');
    const b = mk('u2', 'user.t.one');
    b.tables['user.t.one'] = {
      id: 'user.t.one',
      tags: [],
      entries: [{ id: 'user.t.one#0', ast: ['new'], weight: 1, tags: [], safety: [] }],
    };
    expect(loadPacks([a, b]).table('user.t.one')?.entries).toHaveLength(1);
  });
});
