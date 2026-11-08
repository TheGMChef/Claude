import { describe, expect, it } from 'vitest';
import { ContentError } from '../src/errors';
import { loadPacks } from '../src/library';
import { generateName, nameWithRng, normalizeName } from '../src/names';
import { createRng } from '../src/rng';
import type { CompiledCulture, CompiledPack } from '../src/schema';
import marshJson from './fixtures/marsh.culture.json';

const marsh = marshJson as CompiledCulture;
const packOf = (c: CompiledCulture): CompiledPack => ({
  id: 'fx',
  version: '1',
  tables: {},
  cultures: { [c.id]: c },
  generators: {},
  oracles: {},
  decks: {},
  vocabulary: [],
});
const lib = loadPacks([packOf(marsh)]);

function lev(a: string, b: string): number {
  const d = Array.from(
    { length: a.length + 1 },
    (_, i) => [i, ...Array(b.length).fill(0)] as number[],
  );
  for (let j = 0; j <= b.length; j++) (d[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      (d[i] as number[])[j] = Math.min(
        (d[i - 1] as number[])[j]! + 1,
        (d[i] as number[])[j - 1]! + 1,
        (d[i - 1] as number[])[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return (d[a.length] as number[])[b.length] as number;
}

describe('normalizeName', () => {
  it('strips diacritics, lowercases, trims', () => {
    expect(normalizeName('  ÖDRIN ')).toBe('odrin');
  });
});

describe('generateName', () => {
  it('is deterministic for a seed', () => {
    expect(generateName(lib, marsh.id, { seed: 'AAAA-BBBB' })).toEqual(
      generateName(lib, marsh.id, { seed: 'AAAA-BBBB' }),
    );
  });

  it('normalises the seed like the other entry points (M3, R21)', () => {
    const name = (seed: string) => generateName(lib, marsh.id, { seed }).name;
    const spellings = ['k7q2-m9xd', 'K7Q2M9XD', ' k7q2 m9xd ', 'K7Q2-M9XD'];
    for (let i = 0; i < 20; i++) {
      const variants = spellings.map((s) => name(s.replace(/2/, String(i % 10))));
      expect(new Set(variants).size).toBe(1);
    }
  });

  it('throws missing-source for an unknown culture', () => {
    expect(() => generateName(lib, 'nope')).toThrow(ContentError);
  });

  it('returns voice from the culture and splits given/family', () => {
    const r = generateName(lib, marsh.id, { seed: 'X' });
    expect(r.voice).toEqual(marsh.voice);
    expect(r.cultureId).toBe(marsh.id);
    expect(r.name).toBe(`${r.given} ${r.family}`.trim());
    expect(r.name.startsWith(r.given)).toBe(true);
    expect(r.name).not.toMatch(/ {2}/);
  });

  it('never produces banned names', () => {
    const rng = createRng('banned');
    for (let i = 0; i < 2000; i++) {
      const { name } = nameWithRng(marsh, rng, {});
      expect(name).not.toMatch(/^kor/i);
      expect(name).not.toMatch(/ith/i);
    }
  });

  it('mixes examples at exampleChance ± 0.04', () => {
    const rng = createRng('mix');
    let ex = 0;
    for (let i = 0; i < 2000; i++) if (nameWithRng(marsh, rng, {}).fromExamples) ex++;
    expect(Math.abs(ex / 2000 - 0.25)).toBeLessThanOrEqual(0.04);
  });

  it('excludes exact repeats', () => {
    const rng = createRng('excl');
    const exclude = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { name } = nameWithRng(marsh, rng, { exclude });
      expect(exclude.has(normalizeName(name))).toBe(false);
      exclude.add(normalizeName(name));
    }
  });

  it('guards against avoidNames (first letter and edit distance)', () => {
    const rng = createRng('guard');
    for (let i = 0; i < 2000; i++) {
      const { given } = nameWithRng(marsh, rng, { avoidNames: ['Odrin Vey'] });
      const g = normalizeName(given);
      expect(g.startsWith('o')).toBe(false);
      expect(lev(g, 'odrin')).toBeGreaterThan(2);
    }
  });

  it('Review Focus 3: diacritic/case-variant avoid name blocks Odrin/Odran/Odrinn', () => {
    const rng = createRng('focus3');
    for (let i = 0; i < 2000; i++) {
      const r = nameWithRng(marsh, rng, { avoidNames: ['ÖDRIN vey'] });
      expect(r.relaxed).toBe(false);
      const g = normalizeName(r.given);
      expect(g.startsWith('o')).toBe(false);
      expect(['odrin', 'odran', 'odrinn']).not.toContain(g);
    }
  });

  it('relaxes when no name can satisfy the guard', () => {
    const onlyO: CompiledCulture = {
      ...marsh,
      id: 'fx.o',
      exampleChance: 0,
      banned: [],
      names: {
        given: { pattern: ['a', 'b'], parts: { a: ['Os', 'Or'], b: ['wen', 'ric', 'mund'] } },
      },
    };
    const r = nameWithRng(onlyO, createRng('relax'), { avoidNames: ['Oswin'] });
    expect(r.relaxed).toBe(true);
    expect(r.name.startsWith('O')).toBe(true);
  });

  it('uses format "{given}" when there are no family rules', () => {
    const solo: CompiledCulture = {
      ...marsh,
      exampleChance: 0,
      names: { given: marsh.names.given },
    };
    const r = nameWithRng(solo, createRng('solo'), {});
    expect(r.family).toBeUndefined();
    expect(r.name).toBe(r.given);
  });

  const tiny = (over: Partial<CompiledCulture> & { given?: string[] }): CompiledCulture => ({
    id: 'fx.tiny',
    name: 'Tiny',
    voice: { summary: 's', tips: [] },
    names: { given: { pattern: ['a'], parts: { a: over.given ?? ['X'] } } },
    examples: [],
    exampleChance: 0,
    banned: [],
    ...(over.banned ? { banned: over.banned } : {}),
  });

  it('banned patterns match case-insensitively (R16)', () => {
    const c = tiny({ given: ['Aaral', 'aaron', 'Bela', 'Cora', 'Dran'], banned: ['aa'] });
    const rng = createRng('ci');
    for (let i = 0; i < 500; i++) {
      expect(nameWithRng(c, rng, {}).name.toLowerCase()).not.toContain('aa');
    }
  });

  it('never returns an excluded name while a non-excluded valid one exists', () => {
    const all = ['Ann', 'Bob', 'Cal', 'Dov', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivo', 'Jan'];
    const c = tiny({ given: all });
    const exclude = new Set(all.slice(0, 6).map(normalizeName));
    const rng = createRng('exh');
    for (let i = 0; i < 100; i++) {
      const r = nameWithRng(c, rng, { exclude });
      expect(exclude.has(normalizeName(r.name))).toBe(false);
    }
  });

  it('never returns a banned name under exhaustion', () => {
    const c = tiny({ given: ['Foo', 'Bar'], banned: ['foo'] });
    const rng = createRng('exh-banned');
    for (let i = 0; i < 100; i++) {
      const r = nameWithRng(c, rng, { exclude: new Set(['bar']) });
      expect(r.name).toBe('Bar');
      expect(r.relaxed).toBe(true);
    }
  });

  it('relaxes first-letter (a) before edit distance (b) and prefix (c)', () => {
    const c = tiny({ given: ['Osmar', 'Oswen', 'Oswald'] });
    const rng = createRng('order');
    for (let i = 0; i < 100; i++) {
      const r = nameWithRng(c, rng, { avoidNames: ['Oswin'] });
      expect(r.given).toBe('Osmar');
      expect(r.relaxed).toBe(true);
    }
  });

  it('rule (c) alone rejects a shared three-letter prefix outside the last-8 window', () => {
    // 'odrxyzq' is 4 edits from 'odrin' (so (b) accepts it) and starts with 'o' only via the
    // out-of-window 'Odrin', so (a) does not apply: only (c) can reject it.
    const c = tiny({ given: ['Odrxyzq', 'Pellow'] });
    const avoid = ['Odrin', 'Aaa', 'Bbb', 'Ccc', 'Ddd', 'Eee', 'Fff', 'Ggg', 'Hhh'];
    const rng = createRng('c-only');
    for (let i = 0; i < 100; i++) {
      const r = nameWithRng(c, rng, { avoidNames: avoid });
      expect(r.given).toBe('Pellow');
      expect(r.relaxed).toBe(false);
    }
  });

  it('relaxes (c) before (b): the prefix-sharing name wins over the close one', () => {
    // Odrxyzq fails only (c); Ozrin fails only (b) (and (a)). Stage 1 (b+c) rejects both;
    // stage 2 (only b) accepts Odrxyzq. Dropping (b) first would let Ozrin win instead.
    const c = tiny({ given: ['Odrxyzq', 'Ozrin'] });
    const rng = createRng('c-before-b');
    for (let i = 0; i < 100; i++) {
      const r = nameWithRng(c, rng, { avoidNames: ['Odrin'] });
      expect(r.given).toBe('Odrxyzq');
      expect(r.given.toLowerCase().slice(0, 3)).toBe('odr');
      expect(r.relaxed).toBe(true);
    }
  });

  it('prefers a valid-but-guard-failing name over a clean-but-excluded one', () => {
    const c = tiny({ given: ['Oswin', 'Bxx'] });
    const rng = createRng('valid-over-clean');
    for (let i = 0; i < 100; i++) {
      const r = nameWithRng(c, rng, { avoidNames: ['Oswin'], exclude: new Set(['bxx']) });
      expect(r.given).toBe('Oswin');
      expect(r.relaxed).toBe(true);
    }
  });

  it('final stage prefers a given name not identical to an avoided one', () => {
    const c = tiny({ given: ['Oswin', 'Oswen'] });
    const rng = createRng('final');
    for (let i = 0; i < 200; i++) {
      const r = nameWithRng(c, rng, { avoidNames: ['Oswin'] });
      expect(r.given).toBe('Oswen');
      expect(r.relaxed).toBe(true);
    }
  });
});
