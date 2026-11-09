import { describe, expect, it } from 'vitest';
import { parseCard, serializeCard } from '../src/cardJson';
import { generate } from '../src/generate';
import { MAX_CARD_JSON_LENGTH } from '../src/limits';
import { decodeShare, encodeShare, shareCheck } from '../src/share';
import { lib } from './fixtures/starter-packs';

const card = generate(lib, 'fantasy.npc', {
  seed: 'AAAA-AAAA',
  context: { safety: { lines: ['child-harm'], veils: [] } },
});
const withContext = (context: unknown): string =>
  JSON.stringify({ ...JSON.parse(serializeCard(card)), context });

describe('parseCard on untrusted text', () => {
  it('round-trips a real card', () => {
    const r = parseCard(lib, serializeCard(card));
    expect(r.ok).toBe(true);
  });

  it(`refuses text over ${MAX_CARD_JSON_LENGTH} characters before parsing`, () => {
    const big = withContext({ pad: 'x'.repeat(MAX_CARD_JSON_LENGTH) });
    expect(parseCard(lib, big)).toEqual({ ok: false, error: 'too-large' });
  });

  it.each([
    ['safety.lines not a list', { safety: { lines: 5, veils: [] } }],
    ['safety without veils', { safety: { lines: [] } }],
    ['avoidNames not strings', { avoidNames: [3] }],
    ['cultureId not a string', { cultureId: 7 }],
    ['genre not a string', { genre: {} }],
    ['tags.exclude not a list', { tags: { exclude: 'x' } }],
  ])('rejects a context the engine would choke on: %s', (_label, context) => {
    expect(parseCard(lib, withContext(context))).toEqual({ ok: false, error: 'schema' });
  });

  it('drops __proto__ keys and never pollutes Object.prototype', () => {
    const json = serializeCard(card).replace(
      '"context":{',
      '"context":{"__proto__":{"polluted":1},',
    );
    const r = parseCard(lib, json);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.card.context)).not.toContain('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('returns json/schema (never throws) for deep or odd input', () => {
    expect(parseCard(lib, '['.repeat(100_000)).ok).toBe(false);
    expect(parseCard(lib, 'null').ok).toBe(false);
    expect(
      parseCard(lib, withContext({ a: JSON.parse('['.repeat(3000) + ']'.repeat(3000)) })).ok,
    ).toBe(true);
  });
});

describe('decodeShare on untrusted text', () => {
  it('refuses an over-long code quickly', () => {
    const body = `AAAA-AAAA.L0.N${'Z'.repeat(200_000)}`;
    const long = body + shareCheck(body); // a valid check symbol, so parsing is reached
    const start = performance.now();
    expect(decodeShare(long, 1)).toEqual({ ok: false, error: 'malformed' });
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('still decodes a normal code', () => {
    const code = encodeShare({ seed: 'AAAA-AAAA', nonces: [3, 0], locks: [true, false] });
    expect(decodeShare(code, 2)).toEqual({
      ok: true,
      state: { seed: 'AAAA-AAAA', nonces: [3, 0], locks: [true, false] },
    });
  });
});
