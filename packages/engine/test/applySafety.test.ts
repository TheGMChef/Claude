import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileDocs } from '../src/compile';
import {
  BLOCKED_DISPLAY,
  BLOCKED_VALUE,
  applySafety,
  cardFromShare,
  cardToShare,
  generate,
  reroll,
} from '../src/generate';
import type { Card } from '../src/generate';
import { loadPacks } from '../src/library';
import { createRng } from '../src/rng';
import type { SafetySettings } from '../src/safety';

/**
 * M2 / R28: applySafety re-evaluates safety on an existing card without rerolling anything. A
 * field newly behind a line is blocked but keeps its value in `hidden`; removing the line restores
 * it. Unaffected fields keep value, sources and nonce.
 */
const docs = [
  {
    kind: 'table',
    id: 'a.t.role',
    entries: [
      { text: 'smith', safety: ['fire'] },
      { text: 'baker' },
      { text: 'miller' },
      { text: 'monk', safety: ['religion'] },
    ],
  },
  {
    kind: 'table',
    id: 'a.t.look',
    entries: [
      { text: 'scarred', safety: ['violence'] },
      { text: 'tall' },
      { text: 'soot-black', safety: ['fire'] },
      { text: 'plain' },
    ],
  },
  {
    kind: 'table',
    id: 'a.t.secret',
    entries: [
      { text: 'hid a body', safety: ['violence'] },
      { text: 'owes money' },
      { text: 'broke a jaw', safety: ['violence'] },
      { text: 'loves the miller' },
    ],
  },
  {
    kind: 'table',
    id: 'a.t.omen',
    entries: [
      { text: 'a burning sky', safety: ['fire'] },
      { text: 'sparks', safety: ['fire'] },
    ],
  },
  {
    kind: 'table',
    id: 'a.t.mood',
    entries: [{ text: 'calm' }, { text: 'tense', safety: ['violence'] }, { text: 'bright' }],
  },
  {
    // A nested path: under a fire line, picking the first entry blocks; a violence line shrinks the
    // pool so the same roll could land on the plain entry instead.
    kind: 'table',
    id: 'a.t.path',
    entries: [
      { text: 'a dark path', safety: ['violence'] },
      { text: 'towards {a.t.omen}' },
      { text: 'a plain path' },
    ],
  },
  {
    kind: 'generator',
    id: 'a.npc',
    title: 'NPC',
    fields: {
      role: { table: 'a.t.role' },
      look: { table: 'a.t.look' },
      secret: { table: 'a.t.secret' },
      omen: { table: 'a.t.omen' },
      path: { table: 'a.t.path' },
    },
    display: '{role|cap}, {look}, {a.t.mood}',
  },
];

const compiled = compileDocs(
  { id: 'a', version: '1', title: 'applySafety pack' },
  docs.map((data, i) => ({ file: `d${i}`, data })),
);
const lib = loadPacks([compiled.pack]);
const GEN = 'a.npc';
const ctx = (lines: string[] = [], veils: string[] = []) => ({ safety: { lines, veils } });
const tagged = (card: Card, field: string, tag: string): boolean =>
  (card.fields[field]?.sources ?? []).some((s) => {
    const [t, i] = s.split('#');
    return lib.table(t ?? '')?.entries[Number(i)]?.safety.includes(tag) ?? false;
  });

/** First seed (from `prefix`0..) whose card satisfies `pred`. */
function find(pred: (c: Card) => boolean, context = ctx(), prefix = 'AS'): Card {
  for (let i = 0; i < 2000; i++) {
    const card = generate(lib, GEN, { seed: `${prefix}${i}`, context });
    if (pred(card)) return card;
  }
  throw new Error('no seed found');
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('applySafety (M2/R28)', () => {
  it('the fixture compiles', () => {
    expect(compiled.errors).toEqual([]);
  });

  it('blocks only fields whose sources carry a new line, keeping value and sources in hidden', () => {
    const card = find((c) => tagged(c, 'role', 'fire') && !tagged(c, 'look', 'fire'));
    const next = applySafety(lib, card, { context: ctx(['fire']) });
    expect(next.fields.role).toStrictEqual({
      value: BLOCKED_VALUE,
      locked: false,
      nonce: 0,
      sources: [],
      blocked: true,
      hidden: { value: card.fields.role?.value, sources: card.fields.role?.sources },
    });
    // Nothing else rerolls: same value, sources and nonce.
    expect(next.fields.look).toStrictEqual(card.fields.look);
    expect(next.fields.secret).toStrictEqual(card.fields.secret);
    expect(next.id).toBe(card.id);
    expect(next.seed).toBe(card.seed);
    expect(next.context).toEqual({ safety: { lines: ['fire'], veils: [] } });
    // The display uses role, so it blanks (I5).
    expect(next.display).toBe(BLOCKED_DISPLAY);
  });

  it('removing the line restores the card exactly (deep-equal round trip, 300 seeds)', () => {
    const tags = ['fire', 'violence', 'religion'];
    for (let i = 0; i < 300; i++) {
      const rng = createRng('rt', i);
      const base: SafetySettings = { lines: [], veils: tags.filter(() => rng.next() < 0.3) };
      let card = generate(lib, GEN, { seed: `RT${i}`, context: { safety: base } });
      const locks = ['role', 'look', 'secret'].filter(() => rng.next() < 0.5);
      card = reroll(lib, card, { locks });
      const on = tags.filter(() => rng.next() < 0.6);
      const blocked = applySafety(lib, card, {
        context: { safety: { lines: on, veils: base.veils.filter((v) => !on.includes(v)) } },
      });
      for (const [name, f] of Object.entries(blocked.fields)) {
        const before = card.fields[name];
        if (!f.blocked) expect(f, `${i} ${name}`).toStrictEqual(before);
      }
      const back = applySafety(lib, blocked, { context: { safety: base } });
      expect(back, `seed ${i}`).toStrictEqual(card);
    }
  });

  it('restores a locked field when its line is removed, also through reroll (M2)', () => {
    const card = find((c) => tagged(c, 'secret', 'violence'));
    const locked = reroll(lib, card, { locks: ['secret'] });
    const lined = applySafety(lib, locked, { context: ctx(['violence']) });
    expect(lined.fields.secret).toMatchObject({
      value: BLOCKED_VALUE,
      blocked: true,
      locked: true,
    });

    // A reroll under the line keeps it blocked and keeps what it hides.
    const rolled = reroll(lib, lined);
    expect(rolled.fields.secret).toStrictEqual(lined.fields.secret);

    // applySafety without the line restores the locked value.
    const restored = applySafety(lib, rolled, { context: ctx() });
    expect(restored.fields.secret).toStrictEqual(locked.fields.secret);

    // So does a reroll without the line (it used to stay '—').
    const viaReroll = reroll(lib, rolled, { context: ctx() });
    expect(viaReroll.fields.secret).toStrictEqual(locked.fields.secret);
  });

  it('reroll populates hidden when a line blocks a locked field (R22)', () => {
    const card = find((c) => tagged(c, 'secret', 'violence'));
    const lined = reroll(lib, card, { locks: ['secret'], context: ctx(['violence']) });
    expect(lined.fields.secret).toStrictEqual({
      value: BLOCKED_VALUE,
      locked: true,
      nonce: 0,
      sources: [],
      blocked: true,
      hidden: { value: card.fields.secret?.value, sources: card.fields.secret?.sources },
    });
  });

  it('a field blocked at generation fills in when its line is removed, and not when lines grow', () => {
    const card = generate(lib, GEN, { seed: 'GENB-0001', context: ctx(['fire']) });
    expect(card.fields.omen).toStrictEqual({
      value: BLOCKED_VALUE,
      locked: false,
      nonce: 0,
      sources: [],
      blocked: true,
    });
    const more = applySafety(lib, card, { context: ctx(['fire', 'violence']) });
    expect(more.fields.omen).toStrictEqual(card.fields.omen);
    const freed = applySafety(lib, card, { context: ctx() });
    const fresh = generate(lib, GEN, { seed: 'GENB-0001', context: ctx() });
    expect(freed.fields.omen).toStrictEqual(fresh.fields.omen);
  });

  it('adding a line never fills a field blocked at generation, even where a fresh roll would', () => {
    let n = 0;
    for (let i = 0; i < 400 && n < 5; i++) {
      const seed = `GROW${i}`;
      const card = generate(lib, GEN, { seed, context: ctx(['fire']) });
      const fresh = generate(lib, GEN, { seed, context: ctx(['fire', 'violence']) });
      if (!card.fields.path?.blocked || fresh.fields.path?.blocked) continue;
      const more = applySafety(lib, card, { context: ctx(['fire', 'violence']) });
      expect(more.fields.path, seed).toStrictEqual(card.fields.path);
      n++;
    }
    expect(n).toBe(5);
  });

  it('recomputes veils and the display without touching values', () => {
    const card = find((c) => tagged(c, 'secret', 'violence'));
    const veiled = applySafety(lib, card, { context: ctx([], ['violence']) });
    expect(veiled.flags.veiled).toContain('violence');
    for (const [name, f] of Object.entries(veiled.fields)) {
      expect(f).toStrictEqual(card.fields[name]);
    }
    const unveiled = applySafety(lib, veiled, { context: ctx() });
    expect(unveiled.flags.veiled).toEqual([]);
  });

  it('a blocked relaxed field carries its mark in hidden; flags.relaxed follows', () => {
    const loose = { safety: { lines: [], veils: [] }, tags: { require: ['nope'] } };
    const card = find((c) => tagged(c, 'role', 'fire'), loose, 'RX');
    expect(card.fields.role?.relaxed).toBe(true);
    const only = reroll(lib, card, { locks: ['role'], context: { safety: loose.safety } });
    expect(only.flags.relaxed).toBe(true);
    const lined = applySafety(lib, only, { context: ctx(['fire']) });
    expect(lined.fields.role?.hidden).toMatchObject({ relaxed: true });
    expect(Object.hasOwn(lined.fields.role ?? {}, 'relaxed')).toBe(false);
    expect(lined.flags.relaxed).toBe(false);
    expect(applySafety(lib, lined, { context: { safety: loose.safety } })).toStrictEqual(only);
  });

  it('takes only safety from the given context; the card keeps its culture and other context', () => {
    const card = generate(lib, GEN, {
      seed: 'CTX-0001',
      context: { safety: { lines: [], veils: [] }, settlement: { name: 'Saltmere' } },
    });
    const next = applySafety(lib, card, {
      context: { safety: { lines: ['religion'], veils: [] }, settlement: { name: 'Elsewhere' } },
    });
    expect(next.context).toEqual({
      safety: { lines: ['religion'], veils: [] },
      settlement: { name: 'Saltmere' },
    });
  });

  it('with no options, is the identity', () => {
    const card = generate(lib, GEN, { seed: 'IDEN-0001', context: ctx(['violence'], ['fire']) });
    expect(applySafety(lib, card)).toStrictEqual(card);
  });

  it('cardFromShare and generate never produce hidden values', () => {
    for (let i = 0; i < 100; i++) {
      const card = generate(lib, GEN, { seed: `NH${i}`, context: ctx(['fire']) });
      const shared = cardFromShare(lib, GEN, cardToShare(lib, card).code, ctx(['violence']));
      if (!shared.ok) throw new Error(shared.error);
      for (const f of [...Object.values(card.fields), ...Object.values(shared.card.fields)]) {
        expect(Object.hasOwn(f, 'hidden')).toBe(false);
      }
    }
  });
});
