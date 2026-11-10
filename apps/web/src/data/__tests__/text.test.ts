import { describe, expect, it } from 'vitest';
import {
  MAX_FOLD_LENGTH,
  MAX_INDEXED_CHARS,
  entityTokens,
  fold,
  tokenize,
  validTitle,
} from '../text';

describe('fold', () => {
  it('removes diacritics, lowercases and collapses whitespace', () => {
    expect(fold('Ödrin  VEY')).toBe('odrin vey');
    expect(fold('  Crème\tbrûlée \n Café ')).toBe('creme brulee cafe');
  });

  it('folds compatibility forms (NFKD)', () => {
    expect(fold('ﬁsh ① İstanbul')).toBe('fish 1 istanbul');
  });

  it('is bounded: a hostile 5 MB input is cut and returns fast', () => {
    const hostile = 'á'.repeat(2_500_000);
    const start = performance.now();
    const out = fold(hostile);
    expect(performance.now() - start).toBeLessThan(500);
    expect(out.length).toBeLessThanOrEqual(200_000);
  });

  it('does not backtrack on long whitespace runs', () => {
    const start = performance.now();
    fold(' '.repeat(150_000) + 'x' + ' '.repeat(40_000));
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('tokenize', () => {
  it('splits on anything that is not a letter or digit', () => {
    expect(tokenize("Odrin's ferry-boat")).toEqual(['odrin', 's', 'ferry', 'boat']);
    expect(tokenize('  --  ')).toEqual([]);
    expect(tokenize('Ödrin 42')).toEqual(['odrin', '42']);
  });

  it('caps token length and count on hostile input', () => {
    const long = tokenize('x'.repeat(10_000));
    expect(long).toHaveLength(1);
    expect(long[0]!.length).toBeLessThanOrEqual(64);
    const many = tokenize(Array.from({ length: 100_000 }, (_, i) => `w${i}`).join(' '));
    expect(many.length).toBeLessThanOrEqual(5_000);
  });
});

describe('entityTokens', () => {
  it('includes title, aliases, summary, field values and the kind label, distinct', () => {
    const tokens = entityTokens({
      kind: 'npc',
      title: 'Odrin Vey',
      aliases: ['The Ferryman'],
      summary: 'ferryman at the weir',
      fields: { want: 'Clear the debt', secret: 'Odrin owes a smuggler' },
    });
    for (const t of [
      'odrin',
      'vey',
      'the',
      'ferryman',
      'weir',
      'clear',
      'debt',
      'smuggler',
      'npc',
    ]) {
      expect(tokens).toContain(t);
    }
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('does not index field keys', () => {
    const tokens = entityTokens({
      kind: 'note',
      title: 'x',
      aliases: [],
      summary: '',
      fields: { zzkey: 'plain' },
    });
    expect(tokens).not.toContain('zzkey');
    expect(tokens).toContain('plain');
  });
});

describe('validTitle', () => {
  it('returns the trimmed title when it is allowed', () => {
    expect(validTitle('  Odrin Vey ')).toBe('Odrin Vey');
  });

  it('refuses [[, ]] and |', () => {
    expect(validTitle('A|B')).toBeNull();
    expect(validTitle('[[x]]')).toBeNull();
    expect(validTitle('x]]')).toBeNull();
    expect(validTitle('a [ b ] c')).toBe('a [ b ] c');
  });

  it('refuses empty and over-long titles', () => {
    expect(validTitle('   ')).toBeNull();
    expect(validTitle('x'.repeat(200))).toBe('x'.repeat(200));
    expect(validTitle('x'.repeat(201))).toBeNull();
  });
});

describe('bounds on expanding text', () => {
  it('keeps folded output within the cap even when NFKD expands a character (U+FDFA)', () => {
    expect(fold('\uFDFA'.repeat(200_000)).length).toBeLessThanOrEqual(MAX_FOLD_LENGTH);
    expect(fold('\uFDFA')).toHaveLength(18);
  });

  it('stops indexing after MAX_INDEXED_CHARS of text per entity, keeping title and kind label', () => {
    const fields: Record<string, string> = {};
    for (let i = 0; i < 11; i++) fields[`f${i}`] = 'aaa '.repeat(5000);
    fields['late'] = 'zzlate';
    const tokens = entityTokens({ kind: 'npc', title: 'Odrin', aliases: [], summary: '', fields });
    expect(MAX_INDEXED_CHARS).toBe(200_000);
    expect(tokens).toContain('aaa');
    expect(tokens).toContain('odrin');
    expect(tokens).toContain('npc');
    expect(tokens).not.toContain('zzlate');
  });

  it('indexes an entity of 100 expanding fields quickly', () => {
    const fields: Record<string, string> = {};
    for (let i = 0; i < 100; i++) fields[`f${i}`] = '\uFDFA'.repeat(20_000);
    const start = performance.now();
    entityTokens({ kind: 'note', title: 'x', aliases: [], summary: '', fields });
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it('refuses a title that folds to nothing', () => {
    expect(validTitle('\u0301\u0301')).toBeNull();
    expect(validTitle('e\u0301')).toBe('e\u0301');
  });
});
