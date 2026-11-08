import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentError } from '../src/errors';
import {
  applySafety,
  cardFromShare,
  cardToShare,
  generate,
  parseCard,
  reroll,
  serializeCard,
} from '../src/index';
import type { Card, Context } from '../src/index';
import { loadPacks } from '../src/library';
import { createRng } from '../src/rng';
import { cultureTag, decodeShare, encodeShare, shareCheck } from '../src/share';
import type { CompiledCulture, CompiledPack } from '../src/schema';
import { lib, npcPack } from './fixtures/npc-pack';
import { lib as starter } from './fixtures/starter-packs';

const marsh: Context = { cultureId: 'test.culture.marsh' };
const peak: Context = { cultureId: 'test.culture.peak' };
const SEED = 'K7Q2-M9XD';
const values = (card: Card): Record<string, string> =>
  Object.fromEntries(Object.entries(card.fields).map(([k, f]) => [k, f.value]));

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('culture tags in the library', () => {
  const culture = (id: string): CompiledCulture => ({
    ...(npcPack.cultures['test.culture.marsh'] as CompiledCulture),
    id,
  });
  const packWith = (id: string, cultures: CompiledCulture[]): CompiledPack => ({
    id,
    version: '1',
    tables: {},
    cultures: Object.fromEntries(cultures.map((c) => [c.id, c])),
    generators: {},
    oracles: {},
    decks: {},
    vocabulary: [],
  });

  it('rejects two cultures that share a tag, naming both', () => {
    const seen = new Map<string, string>();
    let pair: [string, string] | null = null;
    for (let i = 0; pair === null; i++) {
      const id = `user.culture.c${i}`;
      const tag = cultureTag(id);
      const prior = seen.get(tag);
      if (prior) pair = [prior, id];
      else seen.set(tag, id);
    }
    const [a, b] = pair;
    const load = () => loadPacks([packWith('x', [culture(a)]), packWith('y', [culture(b)])]);
    expect(load).toThrow(ContentError);
    expect(load).toThrow(
      `cultures "${a}" and "${b}" share the share-code tag "${cultureTag(a)}"; rename one of them`,
    );
  });

  it('a user culture overriding the same id is not a clash', () => {
    const c = culture('user.culture.same');
    expect(() => loadPacks([packWith('x', [c]), packWith('y', [c])])).not.toThrow();
  });
});

describe('cardToShare / cardFromShare (share v2)', () => {
  it('a pristine card shares as seed + culture tag + check', () => {
    const card = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    const tag = cultureTag('test.culture.marsh');
    expect(cardToShare(lib, card)).toEqual({
      code: `${SEED}.C${tag}${shareCheck(`${SEED}.C${tag}`)}`,
      exact: true,
    });
  });

  it('the code carries the culture: pasting under another culture rebuilds the same card', () => {
    let card = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    card = reroll(lib, card, { locks: ['name', 'want'] });
    const { code, exact } = cardToShare(lib, card);
    expect(exact).toBe(true);
    const res = cardFromShare(lib, 'test.npc', code, peak);
    if (!res.ok) throw new Error(res.error);
    expect(res.card.fields).toStrictEqual(card.fields);
    expect(res.card.display).toBe(card.display);
    expect(res.card.context.cultureId).toBe('test.culture.marsh');
  });

  it('reports checksum, malformed, field-count and unknown-culture', () => {
    const { code } = cardToShare(lib, generate(lib, 'test.npc', { seed: SEED, context: marsh }));
    const typo = code.slice(0, 2) + (code[2] === 'Z' ? 'Y' : 'Z') + code.slice(3);
    expect(cardFromShare(lib, 'test.npc', typo, marsh)).toEqual({ ok: false, error: 'checksum' });
    expect(cardFromShare(lib, 'test.npc', 'nope', marsh)).toEqual({ ok: false, error: 'checksum' });
    expect(cardFromShare(lib, 'test.npc', 'K7Q2-M9XD!', marsh)).toEqual({
      ok: false,
      error: 'malformed',
    });
    const two = `${SEED}.L0.N1_2`;
    expect(cardFromShare(lib, 'test.npc', two + shareCheck(two), marsh)).toEqual({
      ok: false,
      error: 'field-count',
    });
    const stranger = encodeShare({ seed: SEED, nonces: [], locks: [], culture: 'ZZZZ' });
    expect(decodeShare(stranger, 7).ok).toBe(true);
    expect(cardFromShare(lib, 'test.npc', stranger, marsh)).toEqual({
      ok: false,
      error: 'unknown-culture',
    });
  });

  it('round-trips 300 seeds with random locks and contexts (exact, any pasting culture)', () => {
    const cultures = [
      'fantasy.culture.marsh',
      'fantasy.culture.highland',
      'fantasy.culture.imperial',
    ];
    const tags = ['violence', 'death', 'religion', 'fire', 'animal-harm', 'war'];
    for (let i = 0; i < 300; i++) {
      const rng = createRng('rt300', i);
      const context: Context = {
        cultureId: cultures[rng.int(3)],
        safety: {
          lines: tags.filter(() => rng.next() < 0.2),
          veils: tags.filter(() => rng.next() < 0.2),
        },
        avoidNames: rng.next() < 0.5 ? ['Ilsa Moss', 'Bran Hale'] : [],
      };
      let card = generate(starter, 'fantasy.npc', { seed: `rt${i}`, context });
      for (let r = rng.int(3); r > 0; r--) {
        const locks = Object.keys(card.fields).filter(() => rng.next() < 0.4);
        card = reroll(starter, card, { locks });
      }
      const { code, exact } = cardToShare(starter, card);
      expect(exact, `seed ${i}`).toBe(true);
      const elsewhere = {
        ...context,
        cultureId: cultures[(cultures.indexOf(String(context.cultureId)) + 1) % 3],
      };
      const res = cardFromShare(starter, 'fantasy.npc', code, elsewhere);
      if (!res.ok) throw new Error(`${i}: ${res.error}`);
      expect(values(res.card), `seed ${i}`).toEqual(values(card));
    }
  });

  it.each(['fantasy.culture.marsh', 'fantasy.culture.highland', 'fantasy.culture.imperial'])(
    'carries the shipped culture %s',
    (cultureId) => {
      const card = generate(starter, 'fantasy.npc', { seed: SEED, context: { cultureId } });
      const { code } = cardToShare(starter, card);
      expect(code).toContain(`.C${cultureTag(cultureId)}`);
      const res = cardFromShare(starter, 'fantasy.npc', code, {});
      if (!res.ok) throw new Error(res.error);
      expect(res.card.context.cultureId).toBe(cultureId);
      expect(values(res.card)).toEqual(values(card));
    },
  );
});

describe('exact flag truth table', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => `EXACT-${i}`);
  const lined = { ...marsh, safety: { lines: ['violence'], veils: [] } };

  it('true: fresh cards, rerolls under one context, unlocked rerolls after a context change, veil-only changes', () => {
    for (const seed of seeds) {
      const card = generate(lib, 'test.npc', { seed, context: marsh });
      expect(cardToShare(lib, card).exact).toBe(true);
      const kept = reroll(lib, card, { locks: ['name', 'secret'] });
      expect(cardToShare(lib, kept).exact).toBe(true);
      const moved = reroll(lib, card, { locks: [], context: peak });
      expect(cardToShare(lib, moved).exact).toBe(true);
      const veiled = reroll(lib, kept, {
        context: { ...marsh, safety: { lines: [], veils: ['violence'] } },
      });
      expect(cardToShare(lib, veiled).exact).toBe(true);
    }
  });

  it('false: a locked name made under another culture', () => {
    for (const seed of seeds) {
      const card = generate(lib, 'test.npc', { seed, context: marsh });
      const moved = reroll(lib, card, { locks: ['name'], context: peak });
      expect(moved.fields.name?.value).toBe(card.fields.name?.value);
      expect(cardToShare(lib, moved).exact, seed).toBe(false);
    }
  });

  it('false: a locked field a new line now hides (it rebuilds as a different, safe value)', () => {
    let n = 0;
    for (let i = 0; i < 300 && n < 10; i++) {
      const context = { cultureId: 'fantasy.culture.marsh' };
      const card = generate(starter, 'fantasy.npc', { seed: `HID${i}`, context });
      const tag = card.fields.role?.sources
        .map((s) => s.split('#'))
        .flatMap(([t, x]) => starter.table(t ?? '')?.entries[Number(x)]?.safety ?? [])[0];
      if (!tag) continue;
      const hidden = reroll(starter, card, {
        locks: ['role'],
        context: { ...context, safety: { lines: [tag], veils: [] } },
      });
      expect(hidden.fields.role?.hidden?.value).toBe(card.fields.role?.value);
      expect(cardToShare(starter, hidden).exact, `HID${i}`).toBe(false);
      n++;
    }
    expect(n).toBe(10);
  });

  it('applySafety leaves the card as it was, so its code may stop being exact; restoring makes it exact again', () => {
    const card = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    const on = applySafety(lib, card, { context: lined });
    const off = applySafety(lib, on, { context: marsh });
    expect(cardToShare(lib, off)).toEqual(cardToShare(lib, card));
  });
});

describe('serializeCard / parseCard', () => {
  it('round-trips a card exactly, incl. blocked, hidden and relaxed fields, keeping field order', () => {
    const loose = { ...marsh, tags: { require: ['no-such-tag'] } };
    let card = generate(lib, 'test.npc', { seed: SEED, context: loose });
    card = reroll(lib, card, { locks: ['secret', 'role'] });
    card = applySafety(lib, card, {
      context: { safety: { lines: ['violence'], veils: ['fire'] } },
    });
    const json = serializeCard(card);
    expect(typeof json).toBe('string');
    const res = parseCard(lib, json);
    expect(res).toStrictEqual({ ok: true, card, stale: false });
    if (!res.ok) return;
    expect(Object.keys(res.card.fields)).toEqual(Object.keys(card.fields));
    expect(serializeCard(res.card)).toBe(json);
  });

  it('round-trips a field that a line hides, and one blocked at generation', () => {
    for (let i = 0; i < 60; i++) {
      const card = generate(lib, 'test.npc', { seed: `PC${i}`, context: marsh });
      const locked = reroll(lib, card, { locks: ['secret'] });
      const hidden = applySafety(lib, locked, {
        context: { ...marsh, safety: { lines: ['violence'], veils: [] } },
      });
      const res = parseCard(lib, serializeCard(hidden));
      expect(res).toStrictEqual({ ok: true, card: hidden, stale: false });
    }
  });

  it('flags a card from another pack version as stale', () => {
    const card = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    expect(parseCard(lib, serializeCard({ ...card, packVersion: '0.9' }))).toMatchObject({
      ok: true,
      stale: true,
    });
    // A card whose generator is no longer loaded is kept (its text never changes) and stale.
    expect(parseCard(lib, serializeCard({ ...card, generatorId: 'gone.npc' }))).toMatchObject({
      ok: true,
      stale: true,
    });
  });

  it('rejects bad JSON and wrong shapes', () => {
    const card = generate(lib, 'test.npc', { seed: SEED, context: marsh });
    expect(parseCard(lib, '{nope')).toEqual({ ok: false, error: 'json' });
    expect(parseCard(lib, '42')).toEqual({ ok: false, error: 'schema' });
    const bad = (patch: object) => parseCard(lib, JSON.stringify({ ...card, ...patch }));
    expect(
      bad({ fields: { name: { value: 'x', locked: false, nonce: -1, sources: [] } } }),
    ).toEqual({ ok: false, error: 'schema' });
    expect(bad({ flags: { veiled: [] } })).toEqual({ ok: false, error: 'schema' });
    expect(bad({ extra: true })).toEqual({ ok: false, error: 'schema' });
    expect(bad({ seed: 'not a seed' })).toEqual({ ok: false, error: 'schema' });
  });
});
