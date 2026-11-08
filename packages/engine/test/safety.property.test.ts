import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { compileDocs } from '../src/compile';
import {
  BLOCKED_DISPLAY,
  BLOCKED_VALUE,
  batch,
  cardFromShare,
  cardToShare,
  generate,
  reroll,
} from '../src/generate';
import type { Card, RollResult } from '../src/generate';
import { loadPacks } from '../src/library';
import { createRng } from '../src/rng';
import type { Rng } from '../src/rng';
import type { SafetySettings } from '../src/safety';

/**
 * Spec §6 / I3: lines never appear across 10,000 generations, through every path: nested table
 * slots, `{gen:}` slots, gen fields (sub-generators), pick fields, template fields, locked fields
 * (reroll), share rebuilds and batch. Every tagged entry's text carries a `~tag~` marker per tag,
 * so a leak shows in the visible text even if its provenance were dropped.
 */
const TAGS = ['violence', 'fire', 'religion', 'drowning', 'gore', 'rats'] as const;
const marker = (t: string) => `~${t}~`;
const e = (text: string, ...safety: string[]) => ({
  text: `${safety.map(marker).join('')}${text}`,
  safety,
});

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
    display: '{name}, {role}: {look}; {friend}; {traits}',
  },
];

const compiled = compileDocs(
  { id: 'p', version: '1', title: 'Property pack' },
  docs.map((data, i) => ({ file: `d${i}`, data })),
);
const lib = loadPacks([compiled.pack]);
const GEN = 'p.main';
const FIELDS = ['name', 'role', 'look', 'friend', 'traits', 'omen'];
const LOCKABLE = ['role', 'look', 'friend', 'traits', 'omen'];
const culture = 'p.culture.fen';

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

/** Per path: which tags were seen (visible) in each field while not lined; proves reachability. */
const reach: Record<string, Record<string, Set<string>>> = {};
const stats = { checked: 0, fieldsOk: 0, fieldsBlocked: 0, displays: 0, rolls: 0, omenBlocked: 0 };

function noteReach(path: string, where: string, text: string, safety: SafetySettings): void {
  const byField = (reach[path] ??= {});
  const seen = (byField[where] ??= new Set());
  for (const t of TAGS) if (!safety.lines.includes(t) && text.includes(marker(t))) seen.add(t);
}

/** Plain checks in the hot loop (expect() per string is slow); a violation throws its label. */
function must(ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
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
    for (const t of entry.safety) {
      must(!safety.lines.includes(t), `${label}: source ${id} carries lined "${t}"`);
      if (safety.veils.includes(t)) must(veiled.includes(t), `${label}: source ${id} veil "${t}"`);
    }
  }
}

function checkCard(path: string, card: Card, safety: SafetySettings): void {
  stats.checked++;
  for (const name of FIELDS) {
    const f = card.fields[name];
    const label = `${path} ${card.seed} ${name}`;
    if (!f) throw new Error(`${label}: missing field`);
    if (f.blocked) {
      // R22: a locked field blocked by a new line keeps its old sources; only the value matters.
      must(f.value === BLOCKED_VALUE, `${label}: blocked field shows "${f.value}"`);
      stats.fieldsBlocked++;
      if (name === 'omen') stats.omenBlocked++;
      continue;
    }
    stats.fieldsOk++;
    // Blocked content anywhere inside a field must block the field, never show up as text.
    must(!f.value.includes(BLOCKED_VALUE), `${label}: unflagged block in "${f.value}"`);
    checkText(label, f.value, f.sources, safety, card.flags.veiled);
    noteReach(path, name, f.value, safety);
  }
  if (card.display !== BLOCKED_DISPLAY) {
    stats.displays++;
    checkText(`${path} ${card.seed} display`, card.display, null, safety, card.flags.veiled);
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

describe('generation-level safety property (I3)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => warn.mockRestore());

  it('the fixture compiles and uses every path', () => {
    expect(compiled.errors).toEqual([]);
  });

  it('generate: 4,000 cards', () => {
    for (let i = 0; i < 4000; i++) {
      const safety = settings(createRng('gen', i));
      const card = generate(lib, GEN, { seed: `g${i}`, context: { cultureId: culture, safety } });
      checkCard('generate', card, safety);
    }
  });

  it('reroll with locks under new lines: 2,000 cards', () => {
    for (let i = 0; i < 2000; i++) {
      const rng = createRng('reroll', i);
      const before = settings(rng);
      const card = generate(lib, GEN, {
        seed: `r${i}`,
        context: { cultureId: culture, safety: before },
      });
      const locks = LOCKABLE.filter(() => rng.next() < 0.5);
      const after = settings(rng, before);
      const next = reroll(lib, card, { locks, context: { cultureId: culture, safety: after } });
      for (const name of locks) must(next.fields[name]?.locked === true, `lock ${name} lost`);
      checkCard('reroll', next, after);
    }
  });

  it('cardFromShare rebuilds under the pasting context: 2,000 cards', () => {
    for (let i = 0; i < 2000; i++) {
      const rng = createRng('share', i);
      const before = settings(rng);
      let card = generate(lib, GEN, {
        seed: `s${i}`,
        context: { cultureId: culture, safety: before },
      });
      const locks = LOCKABLE.filter(() => rng.next() < 0.5);
      card = reroll(lib, card, { locks });
      const after = settings(createRng('share-after', i));
      const res = cardFromShare(lib, GEN, cardToShare(lib, card), {
        cultureId: culture,
        safety: after,
      });
      if (!res.ok) throw new Error(`share ${i}: ${res.error}`);
      checkCard('share', res.card, after);
    }
  });

  it('batch: 2,000 cards plus table rolls', () => {
    for (let i = 0; i < 400; i++) {
      const safety = settings(createRng('batch', i));
      const out = batch(
        lib,
        [
          { generatorId: GEN, count: 5 },
          { tableId: 'p.deep', count: 3 },
          { tableId: 'p.trait', count: 2 },
        ],
        { seed: `b${i}`, context: { cultureId: culture, safety } },
      );
      for (const item of out) {
        if ('fields' in item) checkCard('batch', item, safety);
        else checkRoll('batch', item as RollResult, safety);
      }
    }
  });

  it('is not vacuous: every path reached tagged content in every field, and fields often survive', () => {
    expect(stats.checked).toBe(10_000);
    expect(stats.rolls).toBe(2_000);
    expect(stats.fieldsOk).toBeGreaterThan(stats.fieldsBlocked);
    expect(stats.displays).toBeGreaterThan(2_000);
    for (const path of ['generate', 'reroll', 'share', 'batch']) {
      for (const field of ['role', 'look', 'friend', 'traits']) {
        expect(reach[path]?.[field]?.size ?? 0, `${path}.${field}`).toBeGreaterThanOrEqual(4);
      }
    }
    expect(reach.batch?.roll?.size).toBe(TAGS.length);
    expect(stats.omenBlocked).toBeGreaterThan(1_000);
    for (const path of ['generate', 'reroll', 'share', 'batch']) {
      expect(reach[path]?.omen?.has('fire'), `${path}.omen`).toBe(true);
    }
  });
});
