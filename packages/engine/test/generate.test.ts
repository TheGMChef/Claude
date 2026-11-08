import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentError } from '../src/errors';
import {
  BLOCKED_DISPLAY,
  batch,
  cardFromShare,
  cardToShare,
  generate,
  reroll,
  rollTable,
} from '../src/generate';
import type { Card, RollResult } from '../src/generate';
import { normalizeName } from '../src/names';
import type { NameResult } from '../src/names';
import { lib } from './fixtures/npc-pack';

const marsh = { cultureId: 'test.culture.marsh' };
const SEED = 'K7Q2-M9XD';

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

const values = (card: Card): Record<string, string> =>
  Object.fromEntries(Object.entries(card.fields).map(([k, f]) => [k, f.value]));

describe('generate', () => {
  it('matches the stored snapshot for a fixed seed', async () => {
    const card = generate(lib, 'test.npc', { seed: 'TEST-0001', context: marsh });
    await expect(`${JSON.stringify(card.fields, null, 2)}\n`).toMatchFileSnapshot(
      './fixtures/__snapshots__/test-npc.fields.json',
    );
  });

  it('is deterministic for a seed, in field order, with fresh nonces and ids', () => {
    const a = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    const b = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    expect(a.fields).toEqual(b.fields);
    expect(a.display).toBe(b.display);
    expect(a.id).not.toBe(b.id);
    expect(Object.keys(a.fields)).toEqual([
      'name',
      'role',
      'look',
      'want',
      'secret',
      'traits',
      'home',
    ]);
    for (const f of Object.values(a.fields)) expect(f).toMatchObject({ nonce: 0, locked: false });
    expect(a).toMatchObject({ generatorId: 'test.npc', packVersion: '1', seed: SEED });
    expect(a.display).toBe(
      `${a.fields.name?.value}, ${/^[aeiou]/i.test(a.fields.role?.value ?? '') ? 'an' : 'a'} ${a.fields.role?.value}`,
    );
  });

  it('records sources, joins pick entries with "; " and renders ctx slots', () => {
    const card = generate(lib, 'test.npc', {
      seed: SEED,
      context: { ...marsh, settlement: { name: 'Saltmere' } },
    });
    expect(card.fields.role?.sources).toHaveLength(1);
    expect(card.fields.role?.sources[0]).toMatch(/^test\.npc\.role#\d+$/);
    expect(card.fields.name?.sources).toEqual(['test.culture.marsh']);
    const traits = card.fields.traits?.value.split('; ') ?? [];
    expect(traits).toHaveLength(2);
    expect(new Set(traits).size).toBe(2);
    expect(card.fields.traits?.sources).toHaveLength(2);
    expect(card.fields.home?.value).toMatch(/ in Saltmere$/);
    expect(card.context).toEqual({ ...marsh, settlement: { name: 'Saltmere' } });
  });

  it('picks and records a culture deterministically when none is given (R19)', () => {
    const a = generate(lib, 'test.npc', { seed: SEED });
    const b = generate(lib, 'test.npc', { seed: SEED });
    expect(['test.culture.marsh', 'test.culture.peak']).toContain(a.context.cultureId);
    expect(b.context.cultureId).toBe(a.context.cultureId);
    expect(a.fields.name?.value).toBe(b.fields.name?.value);
  });

  it('stores only serialisable context (campaign hook dropped)', () => {
    const card = generate(lib, 'test.npc', {
      seed: SEED,
      context: { ...marsh, campaign: { get: () => 'x' } },
    });
    expect(card.context).toEqual(marsh);
  });

  it('throws missing-source for unknown generator or culture ids', () => {
    expect(() => generate(lib, 'test.nope')).toThrow(ContentError);
    expect(() =>
      generate(lib, 'test.npc', { context: { cultureId: 'test.culture.nope' } }),
    ).toThrow(/test\.culture\.nope/);
  });
});

describe('reroll and locks', () => {
  it('keeps locked fields byte-identical over 1,000 rerolls; unlocked fields change and step nonces', () => {
    const base = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    const locked = ['name', 'want'];
    const unlocked = Object.keys(base.fields).filter((k) => !locked.includes(k));
    const changes: Record<string, number> = Object.fromEntries(unlocked.map((k) => [k, 0]));
    let prev = base;
    for (let i = 0; i < 1000; i++) {
      const next = reroll(lib, prev, i === 0 ? { locks: locked } : undefined);
      for (const k of locked) {
        expect(next.fields[k]).toEqual({ ...base.fields[k], locked: true });
      }
      for (const k of unlocked) {
        const f = next.fields[k];
        expect(f?.locked).toBe(false);
        expect(f?.nonce).toBe((prev.fields[k]?.nonce ?? NaN) + 1);
        if (f?.value !== prev.fields[k]?.value) changes[k] = (changes[k] ?? 0) + 1;
      }
      prev = next;
    }
    for (const k of unlocked) expect(changes[k]).toBeGreaterThanOrEqual(950);
    expect(prev.id).toBe(base.id);
    expect(prev.seed).toBe(base.seed);
  });

  it('replaces the lock set when locks are given and re-renders display', () => {
    const base = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    const a = reroll(lib, base, { locks: ['role'] });
    expect(a.fields.role?.locked).toBe(true);
    const b = reroll(lib, a, { locks: ['name'] });
    expect(b.fields.role?.locked).toBe(false);
    expect(b.fields.role?.nonce).toBe(1);
    expect(b.fields.name).toEqual({ ...a.fields.name, locked: true });
    expect(b.display.startsWith(`${a.fields.name?.value}, `)).toBe(true);
    expect(b.display).toContain(b.fields.role?.value);
  });
});

describe('share codes', () => {
  it('reproduces every field of a rerolled card', () => {
    let card = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    card = reroll(lib, card, { locks: ['name', 'want'] });
    card = reroll(lib, card);
    card = reroll(lib, card, { locks: ['role'] });
    const code = cardToShare(lib, card);
    const res = cardFromShare(lib, 'test.npc', code, marsh);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(values(res.card)).toEqual(values(card));
    expect(res.card.fields).toEqual(card.fields);
    expect(res.card.display).toBe(card.display);
    expect(res.card.seed).toBe(card.seed);
  });

  it('encodes a pristine card as its bare seed and reports decode errors', () => {
    const card = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    expect(cardToShare(lib, card)).toBe(SEED);
    expect(cardFromShare(lib, 'test.npc', 'nope', marsh)).toEqual({
      ok: false,
      error: 'malformed',
    });
    expect(cardFromShare(lib, 'test.npc', `${SEED}.L0.N1_2`, marsh)).toEqual({
      ok: false,
      error: 'field-count',
    });
  });
});

describe('sub-generators and culture fields', () => {
  it('passes cultureId to the keeper and never overwrites parent context', () => {
    const ctx = { cultureId: 'test.culture.peak', settlement: { name: 'Saltmere' } };
    const tavern = generate(lib, 'test.tavern', { seed: SEED, context: ctx });
    const peakName = /^(Kv|Thr|Skr)[a-z]+ (Stonecut|Highcairn|Iceford)$/;
    expect(tavern.fields.keeper_name?.value).toMatch(peakName);
    expect(tavern.fields.keeper?.value.split(', ')[0]).toMatch(peakName);
    expect(tavern.fields.keeper_home?.value).toMatch(/ in Saltmere$/);
    expect(tavern.context).toEqual(ctx);
    expect(tavern.display).toBe(
      `${tavern.fields.sign?.value}, kept by ${tavern.fields.keeper?.value}`,
    );
  });

  it('reads culture paths, joining arrays with "; "', () => {
    const tavern = generate(lib, 'test.tavern', { seed: SEED, context: marsh });
    expect(tavern.fields.voice?.value).toBe('slow vowels, never says no');
    expect(tavern.fields.tips?.value).toBe('Stretch the vowels.; Refuse indirectly.');
  });
});

describe('safety', () => {
  it('blocks a field whose table is entirely behind a line', () => {
    const card = generate(lib, 'test.npc', {
      seed: SEED,
      context: { ...marsh, safety: { lines: ['violence'], veils: [] } },
    });
    expect(card.fields.secret).toMatchObject({ value: '—', blocked: true });
    expect(card.fields.role?.blocked).toBeUndefined();
    expect(card.display).toBe('nothing fits your safety settings');
  });

  it('lists veiled tags in flags', () => {
    const card = generate(lib, 'test.npc', {
      seed: SEED,
      context: { ...marsh, safety: { lines: [], veils: ['violence'] } },
    });
    expect(card.flags).toEqual({ veiled: ['violence'], relaxed: false });
  });
});

describe('rollTable', () => {
  it('rolls one entry deterministically with provenance', () => {
    const a = rollTable(lib, 'test.npc.role', { seed: SEED });
    const b = rollTable(lib, 'test.npc.role', { seed: SEED });
    expect(a).toEqual(b);
    expect(a.sources[0]).toMatch(/^test\.npc\.role#\d+$/);
    expect(a).toMatchObject({ relaxed: false, blocked: false, veiled: [] });
  });

  it('reports blocked when lines empty the table, and throws for unknown ids', () => {
    const r = rollTable(lib, 'test.npc.secret', {
      context: { safety: { lines: ['violence'], veils: [] } },
    });
    expect(r.blocked).toBe(true);
    expect(() => rollTable(lib, 'test.nope')).toThrow(ContentError);
  });
});

describe('batch', () => {
  it('produces 60 distinct names from one culture', () => {
    const out = batch(lib, [{ cultureId: 'test.culture.marsh', count: 60 }], {
      seed: SEED,
    }) as NameResult[];
    expect(out).toHaveLength(60);
    expect(new Set(out.map((n) => normalizeName(n.name))).size).toBe(60);
  });

  it('returns results in request order and shares name exclusion across cards and names', () => {
    const out = batch(
      lib,
      [
        { generatorId: 'test.npc', count: 5 },
        { tableId: 'test.npc.role', count: 3 },
        { cultureId: 'test.culture.marsh', count: 20 },
      ],
      { seed: SEED, context: marsh },
    );
    expect(out).toHaveLength(28);
    const cards = out.slice(0, 5) as Card[];
    const rolls = out.slice(5, 8) as RollResult[];
    const names = out.slice(8) as NameResult[];
    for (const c of cards) expect(c.generatorId).toBe('test.npc');
    for (const r of rolls) expect(r.sources[0]).toMatch(/^test\.npc\.role#/);
    for (const n of names) expect(n.cultureId).toBe('test.culture.marsh');
    const all = [...cards.map((c) => c.fields.name?.value ?? ''), ...names.map((n) => n.name)];
    expect(new Set(all.map(normalizeName)).size).toBe(25);
    expect(
      batch(lib, [{ generatorId: 'test.npc', count: 2 }], { seed: SEED, context: marsh }).map(
        (c) => (c as Card).fields,
      ),
    ).toEqual(
      batch(lib, [{ generatorId: 'test.npc', count: 2 }], { seed: SEED, context: marsh }).map(
        (c) => (c as Card).fields,
      ),
    );
  });

  it('throws missing-source for unknown ids', () => {
    expect(() => batch(lib, [{ cultureId: 'test.nope', count: 1 }])).toThrow(ContentError);
  });
});

describe('seed normalisation (R21)', () => {
  const SEED_FORMAT = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

  it('derives a valid, stable seed code from arbitrary text', () => {
    const a = generate(lib, 'test.npc', { seed: 'hello', context: marsh });
    const b = generate(lib, 'test.npc', { seed: 'hello', context: marsh });
    expect(a.seed).toMatch(SEED_FORMAT);
    expect(b.seed).toBe(a.seed);
    expect(b.fields).toEqual(a.fields);
    const rerolled = reroll(lib, a, { locks: ['name'] });
    const res = cardFromShare(lib, 'test.npc', cardToShare(lib, rerolled), marsh);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.card.fields).toEqual(rerolled.fields);
    expect(generate(lib, 'test.npc', { seed: 'other text', context: marsh }).seed).not.toBe(a.seed);
  });

  it('treats spellings of the same code identically in rollTable and batch', () => {
    expect(rollTable(lib, 'test.npc.role', { seed: 'test-0001' })).toEqual(
      rollTable(lib, 'test.npc.role', { seed: 'TEST0001' }),
    );
    const req = [{ cultureId: 'test.culture.marsh', count: 5 }];
    expect(batch(lib, req, { seed: 'test-0001' })).toEqual(batch(lib, req, { seed: 'TEST0001' }));
    expect(generate(lib, 'test.npc', { seed: 'test-0001', context: marsh }).seed).toBe('TEST-0001');
  });
});

describe('safety beats locks (R22)', () => {
  it('blocks a locked field whose kept entry is now behind a line', () => {
    const base = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    const locked = reroll(lib, base, { locks: ['secret'] });
    expect(locked.fields.secret?.value).toBe(base.fields.secret?.value);
    const lined = reroll(lib, locked, {
      context: { ...marsh, safety: { lines: ['violence'], veils: [] } },
    });
    expect(lined.fields.secret).toMatchObject({
      value: '—',
      blocked: true,
      locked: true,
      nonce: 0,
    });
    expect(lined.display).toBe(BLOCKED_DISPLAY);
    expect(lined.fields.name?.blocked).toBeUndefined();
  });

  it('recomputes veiled for kept fields under the current veils', () => {
    const base = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    expect(base.flags.veiled).toEqual([]);
    const veiled = reroll(lib, base, {
      locks: ['secret'],
      context: { ...marsh, safety: { lines: [], veils: ['violence'] } },
    });
    expect(veiled.fields.secret?.value).toBe(base.fields.secret?.value);
    expect(veiled.flags.veiled).toEqual(['violence']);
  });
});

describe('card ids without crypto.randomUUID (M4: http LAN origins are not secure contexts)', () => {
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const real = globalThis.crypto;

  beforeEach(() => {
    // Insecure context: getRandomValues exists, randomUUID does not.
    vi.stubGlobal('crypto', {
      getRandomValues: (a: Uint8Array) => real.getRandomValues(a),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generate, reroll and cardFromShare work and give RFC 4122 v4 ids', () => {
    const card = generate(lib, 'test.npc', { seed: 'M4M4-0001', context: marsh });
    const again = reroll(lib, card, { locks: ['name'] });
    const shared = cardFromShare(lib, 'test.npc', cardToShare(lib, card), marsh);
    if (!shared.ok) throw new Error('share failed');
    for (const id of [card.id, again.id, shared.card.id]) expect(id).toMatch(V4);
    expect(again.id).toBe(card.id);
    expect(shared.card.id).not.toBe(card.id);
    const ids = new Set(
      Array.from({ length: 200 }, () => generate(lib, 'test.npc', { context: marsh }).id),
    );
    expect(ids.size).toBe(200);
  });
});
