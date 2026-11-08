import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, newSeed, normalizeSeed } from '../src/index';

describe('createRng', () => {
  it('is deterministic for the same parts', () => {
    const a = createRng('a');
    const b = createRng('a');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs for different parts', () => {
    const a = createRng('a');
    const b = createRng('b');
    const xs = Array.from({ length: 10 }, () => a.next());
    const ys = Array.from({ length: 10 }, () => b.next());
    expect(xs).not.toEqual(ys);
  });

  it('int stays an integer in [0, max)', () => {
    const r = createRng('x');
    for (let i = 0; i < 10000; i++) {
      const n = r.int(10);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
    }
  });

  it('next stays in [0, 1)', () => {
    const r = createRng('y', 3);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashSeed', () => {
  it('returns four uint32 values and depends on part boundaries', () => {
    const h = hashSeed('a', 1);
    expect(h).toHaveLength(4);
    for (const n of h) expect(Number.isInteger(n) && n >= 0 && n <= 0xffffffff).toBe(true);
    expect(hashSeed('ab', 'c')).not.toEqual(hashSeed('a', 'bc'));
  });
});

describe('golden vectors (reference cyrb128 + sfc32)', () => {
  it('hashSeed matches cyrb128', () => {
    expect(hashSeed('prepdesk')).toEqual([3409227079, 2809142955, 88454268, 1479625219]);
  });

  it('createRng matches sfc32 seeded from cyrb128', () => {
    const r = createRng('prepdesk');
    expect([r.next(), r.next(), r.next()]).toEqual([
      0.792329189600423, 0.18274360988289118, 0.7056102734059095,
    ]);
  });
});

describe('newSeed / normalizeSeed', () => {
  it('newSeed matches the seed format', () => {
    for (let i = 0; i < 50; i++) {
      expect(newSeed()).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    }
  });

  it('normalizes input', () => {
    expect(normalizeSeed(' k7q2m9xd ')).toBe('K7Q2-M9XD');
    expect(normalizeSeed('k7q2-m9xo')).toBe('K7Q2-M9X0');
    expect(normalizeSeed('k7q2-m9xi')).toBe('K7Q2-M9X1');
    expect(normalizeSeed('hello')).toBeNull();
    expect(normalizeSeed('K7Q2-M9XU')).toBeNull();
  });
});
