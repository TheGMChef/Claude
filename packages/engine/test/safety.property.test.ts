import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseCard, serializeCard } from '../src/cardJson';
import { compileDocs } from '../src/compile';
import {
  BLOCKED_DISPLAY,
  BLOCKED_VALUE,
  applySafety,
  batch,
  cardFromShare,
  cardToShare,
  generate,
  reroll,
} from '../src/generate';
import type { Card, CardField, RollResult } from '../src/generate';
import { loadPacks } from '../src/library';
import { createRng } from '../src/rng';
import type { Rng } from '../src/rng';
import type { SafetySettings } from '../src/safety';
import { FACETS } from '../src/schema';

/**
 * Spec §6 / I3: lines never appear across 15,000 generations, through every path: nested table
 * slots, `{gen:}` slots, gen fields (sub-generators), pick fields, template fields, situation and
 * facet fields (with `distinctFrom`), locked fields (reroll), share rebuilds, batch and
 * applySafety. Every tagged entry's text carries a `~tag~` marker per tag, so a leak shows in the
 * visible text even if its provenance were dropped.
 *
 * Each `it` is self-contained: it makes its own probe (counters and reach) and asserts its own
 * counts and non-vacuity, so no test depends on another having run.
 */
const TAGS = ['violence', 'fire', 'religion', 'drowning', 'gore', 'rats'] as const;
const marker = (t: string) => `~${t}~`;
const e = (text: string, ...safety: string[]) => ({
  text: `${safety.map(marker).join('')}${text}`,
  safety,
});

/**
 * Six facets of three entries each. Entry 0 nests table slots (and a `{gen:}` slot for
 * `nestGen`), entry 1 is plain, entry 2 carries one tag from TAGS, rotating per facet.
 */
const facetsFor = (slug: string, shift: number, nestGen: boolean) =>
  Object.fromEntries(
    FACETS.map((f, i) => [
      f,
      [
        e(nestGen ? `${slug} ${f} who {gen:p.sub.deed}` : `${slug} ${f} by {p.leaf} and {p.mid}`),
        e(`${slug} ${f}, quiet`),
        e(`${slug} ${f} gone wrong`, TAGS[(i + shift) % TAGS.length] as string),
      ],
    ]),
  );

const docs = [
  {
    kind: 'culture',
    id: 'p.culture.fen',
    name: 'Fen-folk',
    voice: { summary: 'soft', tips: ['Speak softly.'] },
    names: {
      given: {
        pattern: ['a', 'b'],
        parts: { a: ['Bel', 'Cor', 'Dun', 'Fen', 'Har'], b: ['in', 'a', 'os', 'eth'] },
      },
      family: { pattern: ['a'], parts: { a: ['Reed', 'Marsh', 'Sallow', 'Brack'] } },
      format: '{given} {family}',
    },
  },
  {
    kind: 'table',
    id: 'p.leaf',
    entries: [
      e('stone'),
      e('river'),
      e('lantern'),
      e('bell'),
      e('coal', 'fire'),
      e('bone', 'gore'),
      e('nest', 'rats'),
      e('steam', 'fire', 'drowning'),
    ],
  },
  {
    kind: 'table',
    id: 'p.mid',
    entries: [
      e('the {p.leaf} gate'),
      e('quiet {p.leaf}'),
      e('a fight over {p.leaf}', 'violence'),
      e('a shrine of {p.leaf}', 'religion'),
      e('old {p.leaf} and {p.leaf}'),
    ],
  },
  {
    kind: 'table',
    id: 'p.deep',
    entries: [
      e('{p.mid} beyond {p.leaf}'),
      e('a flood near {p.mid}', 'drowning'),
      e('calm water'),
      e('{p.leaf} under {p.mid}'),
      e('a riot by {p.leaf}', 'violence', 'gore'),
    ],
  },
  {
    kind: 'table',
    id: 'p.trait',
    entries: [
      e('patient'),
      e('fond of {p.leaf}'),
      e('scarred', 'violence'),
      e('devout', 'religion'),
      e('soot-stained', 'fire'),
      e('jumpy'),
      e('wary of {p.mid}'),
      e('plague-marked', 'rats'),
      e('kind'),
      e('blunt'),
    ],
  },
  {
    kind: 'table',
    id: 'p.spark',
    entries: [e('a sky on fire', 'fire'), e('sparks', 'fire')],
  },
  {
    kind: 'generator',
    id: 'p.sub',
    title: 'Sub',
    fields: {
      who: { table: 'p.mid' },
      deed: { template: '{p.deep}' },
      spark: { table: 'p.spark' },
    },
    display: '{who} who {deed}',
  },
  {
    kind: 'generator',
    id: 'p.main',
    title: 'Main',
    fields: {
      name: { name: 'full' },
      role: { table: 'p.mid' },
      look: { template: '{p.deep|cap} and {gen:p.sub.deed}' },
      friend: { gen: 'p.sub' },
      traits: { pick: { table: 'p.trait', count: 3 } },
      // A {gen:} slot whose sub-field (all fire-tagged) blocks whenever fire is lined.
      omen: { template: 'an omen of {gen:p.sub.spark}' },
    },
    // Display-only content too (I3): a nested table slot and a {gen:} slot rendered only here.
    display: '{name}, {role}: {look}; {friend}; {traits} | {p.deep} | {gen:p.sub.who}',
  },
  { kind: 'vocabulary', tags: ['situation'] },
  // The index entry carries the situation's safety; its title carries the matching marker.
  {
    kind: 'situation',
    id: 'p.situation.ember-toll',
    title: `${marker('fire')}Ember toll`,
    summary: 'A toll paid in coal.',
    tags: ['situation'],
    safety: ['fire'],
    facets: facetsFor('ember', 0, false),
  },
  {
    kind: 'situation',
    id: 'p.situation.reed-vow',
    title: 'Reed vow',
    summary: 'A promise made on the water.',
    tags: ['situation'],
    facets: facetsFor('reed', 2, true),
  },
  {
    kind: 'situation',
    id: 'p.situation.bell-debt',
    title: `${marker('religion')}Bell debt`,
    summary: 'The chapel bell is pawned.',
    tags: ['situation'],
    safety: ['religion'],
    facets: facetsFor('bell', 4, false),
  },
  {
    kind: 'generator',
    id: 'p.seed',
    title: 'Seed',
    // Declared out of dependency order on purpose: `enemy` needs `a`, which comes after it.
    fields: {
      enemy: { facet: { of: 'a', name: 'enemy' } },
      a: { situation: { table: 'p.situations' } },
      b: { situation: { table: 'p.situations', distinctFrom: 'a' } },
      thing: { facet: { of: 'b', name: 'thing' } },
      pressure: { facet: { of: 'a', name: 'pressure' } },
    },
    display: '{a} meets {b}',
  },
];

const compiled = compileDocs(
  { id: 'p', version: '1', title: 'Property pack' },
  docs.map((data, i) => ({ file: `d${i}`, data })),
);
const lib = loadPacks([compiled.pack]);
const GEN = 'p.main';
const SEED = 'p.seed';
const FIELDS: Record<string, string[]> = {
  [GEN]: ['name', 'role', 'look', 'friend', 'traits', 'omen'],
  [SEED]: ['enemy', 'a', 'b', 'thing', 'pressure'],
};
const LOCKABLE = ['role', 'look', 'friend', 'traits', 'omen'];
const SEED_LOCKABLE = ['enemy', 'thing', 'pressure', 'a', 'b'];
const FACET_OF: Record<string, string> = { enemy: 'a', thing: 'b', pressure: 'a' };
const INDEX = 'p.situations#';
const culture = 'p.culture.fen';
const ctx = (safety: SafetySettings) => ({ cultureId: culture, safety });

const entryOf = (id: string) => {
  const m = /^(.+)#(\d+)$/.exec(id);
  return m ? lib.table(m[1] as string)?.entries[Number(m[2])] : undefined;
};

function settings(rng: Rng, base: SafetySettings = { lines: [], veils: [] }): SafetySettings {
  const lines = [...base.lines];
  const veils: string[] = [];
  for (const t of TAGS) {
    if (lines.includes(t)) continue;
    const r = rng.next();
    if (r < 0.3) lines.push(t);
    else if (r < 0.6) veils.push(t);
  }
  return { lines, veils };
}

/** Plain checks in the hot loop (expect() per string is slow); a violation throws its label. */
function must(ok: boolean, message: string): void {
  if (!ok) throw new Error(`I3: ${message}`);
}

/** Counters and reach for one `it`. Reach: per path and field, the tags seen visible while unlined. */
function probe() {
  const reach: Record<string, Record<string, Set<string>>> = {};
  const stats = {
    checked: 0,
    seedChecked: 0,
    fieldsOk: 0,
    fieldsBlocked: 0,
    displays: 0,
    rolls: 0,
    omenBlocked: 0,
    toggles: 0,
    hidden: 0,
    restored: 0,
    refilled: 0,
    applied: 0,
    distinct: 0,
    facetByOf: 0,
    enemyVisible: 0,
    exact: 0,
    inexact: 0,
  };
  const tagsAt = (path: string, field: string) => reach[path]?.[field]?.size ?? 0;

  function noteReach(path: string, where: string, text: string, safety: SafetySettings): void {
    const byField = (reach[path] ??= {});
    const seen = (byField[where] ??= new Set());
    for (const t of TAGS) if (!safety.lines.includes(t) && text.includes(marker(t))) seen.add(t);
  }

  /** The safety property for one visible text and its provenance. */
  function checkText(
    label: string,
    text: string,
    sources: string[] | null,
    safety: SafetySettings,
    veiled: string[],
  ): void {
    for (const t of safety.lines)
      must(!text.includes(marker(t)), `${label}: lined "${t}" visible in "${text}"`);
    for (const t of safety.veils) {
      if (text.includes(marker(t))) must(veiled.includes(t), `${label}: veil "${t}" not flagged`);
    }
    for (const id of sources ?? []) {
      const entry = entryOf(id);
      if (!entry) {
        must(id === culture, `${label}: unknown source ${id}`);
        continue;
      }
      // R39: a facet entry stands under its situation's safety, whatever the entry itself says.
      const m = /^(p\.situation\.[a-z-]+)\.[a-z]+#\d+$/.exec(id);
      const inherited = m ? (lib.situation(m[1] as string)?.safety ?? []) : [];
      if (m) must(lib.situation(m[1] as string) !== undefined, `${label}: no situation for ${id}`);
      for (const t of [...entry.safety, ...inherited]) {
        must(!safety.lines.includes(t), `${label}: source ${id} carries lined "${t}"`);
        if (safety.veils.includes(t))
          must(veiled.includes(t), `${label}: source ${id} veil "${t}"`);
      }
    }
  }

  /** Situation and facet invariants of one p.seed card (S1-1, S1-2). */
  function checkSeed(path: string, card: Card): void {
    const f = (name: string) => card.fields[name] as CardField;
    const label = `${path} ${card.seed}`;
    const [a, b] = [f('a'), f('b')];
    if (!a.blocked && !b.blocked) {
      // R39: distinctness is symmetric under locks (a kept `b` keeps a rerolled `a` away too).
      must(a.sources[0] !== b.sources[0], `${label}: a and b are both ${a.value}`);
      must(a.value !== b.value, `${label}: a and b both read "${a.value}"`);
      stats.distinct++;
    }
    for (const [facet, ofName] of Object.entries(FACET_OF)) {
      const field = f(facet);
      const of = f(ofName);
      if (!field.locked && of.blocked) {
        must(
          field.blocked === true,
          `${label}: ${facet} shows "${field.value}" but ${ofName} is blocked`,
        );
        stats.facetByOf++;
      }
      if (field.blocked) continue;
      const head = field.sources[0] ?? '';
      must(head.startsWith(INDEX), `${label}: ${facet} sources start with "${head}"`);
      if (!field.locked)
        must(
          head === of.sources[0],
          `${label}: ${facet} is from ${head}, ${ofName} is ${of.sources[0]}`,
        );
    }
    if (path === 'generate' && !f('enemy').blocked) stats.enemyVisible++;
  }

  function checkCard(path: string, card: Card, safety: SafetySettings): void {
    stats.checked++;
    for (const name of FIELDS[card.generatorId] as string[]) {
      const f = card.fields[name];
      const label = `${path} ${card.seed} ${name}`;
      if (!f) throw new Error(`I3: ${label}: missing field`);
      if (f.blocked) {
        // R22: a locked field blocked by a new line keeps its old sources; only the value matters.
        must(f.value === BLOCKED_VALUE, `${label}: blocked field shows "${f.value}"`);
        stats.fieldsBlocked++;
        if (name === 'omen') stats.omenBlocked++;
        continue;
      }
      stats.fieldsOk++;
      must(f.hidden === undefined, `${label}: visible field carries hidden content`);
      // Blocked content anywhere inside a field must block the field, never show up as text.
      must(!f.value.includes(BLOCKED_VALUE), `${label}: unflagged block in "${f.value}"`);
      checkText(label, f.value, f.sources, safety, card.flags.veiled);
      noteReach(path, name, f.value, safety);
    }
    if (card.generatorId === SEED) {
      stats.seedChecked++;
      checkSeed(path, card);
    }
    if (card.display !== BLOCKED_DISPLAY) {
      stats.displays++;
      must(
        !card.display.includes(BLOCKED_VALUE),
        `${path} ${card.seed}: unflagged block in display`,
      );
      checkText(`${path} ${card.seed} display`, card.display, null, safety, card.flags.veiled);
      noteReach(path, card.generatorId === SEED ? 'seed-display' : 'display', card.display, safety);
    }
  }

  function checkRoll(path: string, r: RollResult, safety: SafetySettings): void {
    stats.rolls++;
    if (r.blocked) {
      must(r.text === BLOCKED_VALUE, `${path} roll: blocked roll shows "${r.text}"`);
      return;
    }
    checkText(`${path} roll`, r.text, r.sources, safety, r.veiled);
    noteReach(path, 'roll', r.text, safety);
  }

  /** Non-vacuity for one path: tagged content reached every main field and every facet. */
  function expectReach(path: string, opts: { main: boolean; seed: boolean }): void {
    if (opts.main) {
      expect(tagsAt(path, 'display'), `${path}.display`).toBe(TAGS.length);
      for (const field of ['role', 'look', 'friend', 'traits'])
        expect(tagsAt(path, field), `${path}.${field}`).toBeGreaterThanOrEqual(4);
    }
    if (opts.seed) {
      for (const field of ['enemy', 'thing', 'pressure'])
        expect(tagsAt(path, field), `${path}.${field}`).toBeGreaterThanOrEqual(3);
      expect(reach[path]?.['seed-display']?.has('fire'), `${path}.seed-display fire`).toBe(true);
      expect(reach[path]?.['seed-display']?.has('religion'), `${path}.seed-display religion`).toBe(
        true,
      );
    }
  }

  return { stats, reach, checkCard, checkRoll, expectReach };
}

/** R36: an exact code rebuilds the card's fields; otherwise the card JSON round trip does. */
function checkShare(path: string, card: Card, stats: ReturnType<typeof probe>['stats']): string {
  const { code, exact } = cardToShare(lib, card);
  if (exact) {
    stats.exact++;
    const res = cardFromShare(lib, card.generatorId, code, card.context);
    if (!res.ok) throw new Error(`I3: ${path} ${card.seed}: ${res.error}`);
    for (const name of FIELDS[card.generatorId] as string[]) {
      const [was, now] = [card.fields[name], res.card.fields[name]];
      must(now?.value === was?.value, `${path} ${card.seed} ${name}: exact code changed the value`);
      must(
        now?.sources.join() === was?.sources.join(),
        `${path} ${card.seed} ${name}: exact code changed the sources`,
      );
    }
  } else {
    stats.inexact++;
    const parsed = parseCard(lib, serializeCard(card));
    must(
      parsed.ok && JSON.stringify(parsed.card) === JSON.stringify(card),
      `${path} ${card.seed}: inexact code and the card JSON does not round trip`,
    );
  }
  return code;
}

describe('generation-level safety property (I3)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => warn.mockRestore());

  it('the fixture compiles and has the situation index', () => {
    expect(compiled.errors).toEqual([]);
    expect(lib.table('p.situations')?.entries.map((x) => x.ref)).toEqual([
      'p.situation.ember-toll',
      'p.situation.reed-vow',
      'p.situation.bell-debt',
    ]);
  });

  it('generate: 4,000 main cards and 2,000 seed cards', () => {
    const p = probe();
    for (let i = 0; i < 4000; i++) {
      const safety = settings(createRng('gen', i));
      p.checkCard('generate', generate(lib, GEN, { seed: `g${i}`, context: ctx(safety) }), safety);
    }
    for (let i = 0; i < 2000; i++) {
      const safety = settings(createRng('gen-seed', i));
      p.checkCard(
        'generate',
        generate(lib, SEED, { seed: `gs${i}`, context: ctx(safety) }),
        safety,
      );
    }
    expect(p.stats.checked).toBe(6_000);
    expect(p.stats.seedChecked).toBe(2_000);
    p.expectReach('generate', { main: true, seed: true });
    expect(p.stats.fieldsOk).toBeGreaterThan(p.stats.fieldsBlocked);
    expect(p.stats.omenBlocked).toBeGreaterThan(500);
    expect(p.reach.generate?.omen?.has('fire'), 'generate.omen').toBe(true);
    // Per-path floors sum to the brief's totals: distinct > 3,000 and facetByOf > 100.
    expect(p.stats.distinct).toBeGreaterThan(1_500);
    expect(p.stats.facetByOf).toBeGreaterThan(150);
    // Fails if fields generate in declared order: `enemy` would always find `a` missing.
    expect(p.stats.enemyVisible).toBeGreaterThanOrEqual(1_000);
  });

  it('reroll with locks under new lines: 2,000 main cards and 1,000 seed cards', () => {
    const p = probe();
    const run = (gen: string, lockable: string[], i: number) => {
      const rng = createRng('reroll', gen, i);
      const before = settings(rng);
      const card = generate(lib, gen, { seed: `r${gen}${i}`, context: ctx(before) });
      const locks = lockable.filter(() => rng.next() < 0.5);
      const after = settings(rng, before);
      const next = reroll(lib, card, { locks, context: ctx(after) });
      for (const name of locks) must(next.fields[name]?.locked === true, `lock ${name} lost`);
      p.checkCard('reroll', next, after);
    };
    for (let i = 0; i < 2000; i++) run(GEN, LOCKABLE, i);
    for (let i = 0; i < 1000; i++) run(SEED, SEED_LOCKABLE, i);
    expect(p.stats.checked).toBe(3_000);
    expect(p.stats.seedChecked).toBe(1_000);
    p.expectReach('reroll', { main: true, seed: true });
    expect(p.reach.reroll?.omen?.has('fire'), 'reroll.omen').toBe(true);
    expect(p.stats.distinct).toBeGreaterThan(400);
    expect(p.stats.facetByOf).toBeGreaterThan(150);
  });

  it('cardFromShare rebuilds under the pasting context: 2,000 main cards and 1,000 seed cards', () => {
    const p = probe();
    const run = (gen: string, lockable: string[], i: number) => {
      const rng = createRng('share', gen, i);
      const before = settings(rng);
      let card = generate(lib, gen, { seed: `s${gen}${i}`, context: ctx(before) });
      const locks = lockable.filter(() => rng.next() < 0.5);
      card = reroll(lib, card, { locks });
      const code = checkShare('share', card, p.stats);
      const after = settings(createRng('share-after', gen, i));
      const res = cardFromShare(lib, gen, code, ctx(after));
      if (!res.ok) throw new Error(`I3: share ${i}: ${res.error}`);
      p.checkCard('share', res.card, after);
    };
    for (let i = 0; i < 2000; i++) run(GEN, LOCKABLE, i);
    for (let i = 0; i < 1000; i++) run(SEED, SEED_LOCKABLE, i);
    expect(p.stats.checked).toBe(3_000);
    expect(p.stats.seedChecked).toBe(1_000);
    p.expectReach('share', { main: true, seed: true });
    expect(p.reach.share?.omen?.has('fire'), 'share.omen').toBe(true);
    expect(p.stats.distinct).toBeGreaterThan(500);
    expect(p.stats.facetByOf).toBeGreaterThan(30);
    // Both R36 branches run: exact codes rebuild, inexact ones fall back to the card JSON.
    expect(p.stats.exact).toBeGreaterThan(2_000);
    expect(p.stats.inexact).toBeGreaterThan(10);
  });

  it('batch: 2,000 main cards, 800 seed cards and 3,200 table rolls', () => {
    const p = probe();
    let facetVisible = 0;
    let facetBlocked = 0;
    for (let i = 0; i < 400; i++) {
      const safety = settings(createRng('batch', i));
      const out = batch(
        lib,
        [
          { generatorId: GEN, count: 5 },
          { tableId: 'p.deep', count: 3 },
          { tableId: 'p.trait', count: 2 },
          { generatorId: SEED, count: 2 },
          // Direct references to facet tables (R39): their entries carry the situation's safety.
          { tableId: 'p.situation.ember-toll.enemy', count: 2 },
          { tableId: 'p.situation.bell-debt.pressure', count: 1 },
        ],
        { seed: `b${i}`, context: ctx(safety) },
      );
      out.forEach((item, k) => {
        if ('fields' in item) p.checkCard('batch', item, safety);
        else p.checkRoll('batch', item as RollResult, safety);
        if (k >= 12) {
          if ((item as RollResult).blocked) facetBlocked++;
          else facetVisible++;
        }
      });
    }
    expect(p.stats.checked).toBe(2_800);
    expect(p.stats.seedChecked).toBe(800);
    expect(p.stats.rolls).toBe(3_200);
    // Direct facet rolls both show and block (the situation's line blocks every entry).
    expect(facetVisible).toBeGreaterThan(600);
    expect(facetBlocked).toBeGreaterThan(200);
    p.expectReach('batch', { main: true, seed: true });
    expect(p.reach.batch?.roll?.size).toBe(TAGS.length);
    expect(p.reach.batch?.omen?.has('fire'), 'batch.omen').toBe(true);
    expect(p.stats.distinct).toBeGreaterThan(600);
    expect(p.stats.facetByOf).toBeGreaterThan(40);
  });

  it('applySafety toggles: lines on never leak and never reroll; off restores exactly (2,000 cards)', () => {
    const p = probe();
    for (let i = 0; i < 2000; i++) {
      const rng = createRng('toggle', i);
      const base = settings(rng);
      let card = generate(lib, GEN, { seed: `t${i}`, context: ctx(base) });
      const locks = LOCKABLE.filter(() => rng.next() < 0.5);
      if (locks.length > 0) card = reroll(lib, card, { locks });

      // Lines on: nothing lined shows, nothing unaffected changes.
      const on = settings(rng, base);
      const lined = applySafety(lib, card, { context: ctx(on) });
      p.stats.toggles++;
      p.checkCard('toggle', lined, on);
      for (const name of FIELDS[GEN] as string[]) {
        const before = card.fields[name] as CardField;
        const after = lined.fields[name] as CardField;
        must(after.nonce === before.nonce, `toggle ${i} ${name}: nonce changed`);
        must(after.locked === before.locked, `toggle ${i} ${name}: lock changed`);
        if (after.hidden) p.stats.hidden++;
        if (!after.blocked) {
          must(after.value === before.value, `toggle ${i} ${name}: value rerolled`);
          must(
            after.sources.join() === before.sources.join(),
            `toggle ${i} ${name}: sources changed`,
          );
        }
      }

      // Lines off again: the card comes back exactly.
      const back = applySafety(lib, lined, { context: ctx(base) });
      must(
        JSON.stringify(back) === JSON.stringify(card),
        `toggle ${i}: restore differs\n${JSON.stringify(back)}\n${JSON.stringify(card)}`,
      );
      p.stats.restored++;

      // Some base lines removed: refilled fields are fresh and still safe.
      const fewer = { lines: base.lines.filter(() => rng.next() < 0.5), veils: base.veils };
      const freed = applySafety(lib, card, { context: ctx(fewer) });
      p.stats.toggles++;
      p.checkCard('toggle', freed, fewer);
      for (const name of FIELDS[GEN] as string[]) {
        if (card.fields[name]?.blocked && !freed.fields[name]?.blocked) p.stats.refilled++;
      }
    }
    expect(p.stats.checked).toBe(4_000);
    expect(p.stats.toggles).toBe(4_000);
    expect(p.stats.restored).toBe(2_000);
    expect(p.stats.hidden).toBeGreaterThan(500);
    expect(p.stats.refilled).toBeGreaterThan(100);
    p.expectReach('toggle', { main: true, seed: false });
  });

  it('applySafety on seed cards: added lines hide situations and facets, removing them restores exactly (1,000 cards)', () => {
    const p = probe();
    let hiddenSituations = 0;
    let hiddenFacets = 0;
    for (let i = 0; i < 1000; i++) {
      const rng = createRng('apply-seed', i);
      const before = settings(rng);
      let card = generate(lib, SEED, { seed: `as${i}`, context: ctx(before) });
      const locks = SEED_LOCKABLE.filter(() => rng.next() < 0.5);
      if (locks.length > 0) card = reroll(lib, card, { locks });

      const after = settings(rng, before);
      const lined = applySafety(lib, card, { context: ctx(after) });
      p.stats.applied++;
      p.checkCard('apply', lined, after);
      for (const name of FIELDS[SEED] as string[]) {
        const was = card.fields[name] as CardField;
        const now = lined.fields[name] as CardField;
        must(now.nonce === was.nonce, `apply ${i} ${name}: nonce changed`);
        must(now.locked === was.locked, `apply ${i} ${name}: lock changed`);
        if (!now.blocked) must(now.value === was.value, `apply ${i} ${name}: value rerolled`);
        if (now.hidden && !was.blocked) {
          if (name === 'a' || name === 'b') hiddenSituations++;
          else hiddenFacets++;
        }
      }

      const back = applySafety(lib, lined, { context: ctx(before) });
      expect(back.fields, `apply ${i}: restore differs`).toEqual(card.fields);
      must(JSON.stringify(back) === JSON.stringify(card), `apply ${i}: restored card differs`);
      p.stats.restored++;
    }
    expect(p.stats.applied).toBe(1_000);
    expect(p.stats.restored).toBe(1_000);
    expect(p.stats.seedChecked).toBe(1_000);
    p.expectReach('apply', { main: false, seed: true });
    expect(hiddenSituations).toBeGreaterThan(100);
    expect(hiddenFacets).toBeGreaterThan(100);
    expect(p.stats.distinct).toBeGreaterThan(350);
    expect(p.stats.facetByOf).toBeGreaterThan(200);
  });
});
