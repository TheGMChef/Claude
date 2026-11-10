import { afterEach, describe, expect, it, vi } from 'vitest';
import { ID_PATTERNS, newId } from '../ids';
import type { IdPrefix } from '../schema';

const PREFIXES: IdPrefix[] = ['cmp', 'ses', 'ent', 'lnk', 'evt', 'sho', 'poc', 'drf'];

afterEach(() => vi.unstubAllGlobals());

describe('newId', () => {
  it('is the prefix, an underscore and 16 Crockford characters', () => {
    expect(newId('ent')).toMatch(/^ent_[0-9A-HJKMNP-TV-Z]{16}$/);
  });

  it('matches its own ID_PATTERNS entry for every prefix, and only that one', () => {
    for (const p of PREFIXES) {
      const id = newId(p);
      expect(id).toMatch(ID_PATTERNS[p]);
      for (const other of PREFIXES.filter((o) => o !== p)) {
        expect(id).not.toMatch(ID_PATTERNS[other]);
      }
    }
  });

  it('rejects characters outside the alphabet (I, L, O, U) and wrong lengths', () => {
    expect('ent_ILOU000000000000').not.toMatch(ID_PATTERNS.ent);
    expect('ent_000000000000000').not.toMatch(ID_PATTERNS.ent);
    expect('ent_00000000000000000').not.toMatch(ID_PATTERNS.ent);
    expect('ent_000000000000000a').not.toMatch(ID_PATTERNS.ent);
  });

  it('gives 10,000 distinct ids', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(newId('ent'));
    expect(seen.size).toBe(10_000);
  });

  it('works without crypto.randomUUID (no secure-context dependency, M4)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect(globalThis.crypto.randomUUID).toBeUndefined();
    expect(newId('cmp')).toMatch(ID_PATTERNS.cmp);
  });

  it('uses every character of the alphabet over many draws (no biased or dropped bits)', () => {
    const chars = new Set<string>();
    for (let i = 0; i < 400; i++) for (const c of newId('ent').slice(4)) chars.add(c);
    expect(chars.size).toBe(32);
  });
});
