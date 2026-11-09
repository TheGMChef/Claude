import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BLOCKED_DISPLAY, generate, reroll } from '../src/generate';
import type { Card } from '../src/generate';
import { createRng } from '../src/rng';
import type { Rng } from '../src/rng';
import { SAFETY_VOCABULARY } from '../src/safety';
import type { SafetySettings } from '../src/safety';
import { GENERATORS } from './fixtures/content-spec';
import { entryOfSource, reachesTagged } from './fixtures/content-helpers';
import { lib } from './fixtures/starter-packs';

const n = GENERATORS.length;
const NONVACUOUS_SEEDS = 2_000;
const NONVACUOUS_FLOOR = 20;
const NO_LINES: SafetySettings = { lines: [], veils: [] };
const BAD_PARTS = ['{', '}', '[missing', 'undefined', 'null', '  ', ' ,', ' .', '..'];

const sourceTags = (card: Card, field: string): string[] =>
  (card.fields[field]?.sources ?? []).flatMap((id) => entryOfSource(lib, id)?.safety ?? []);

function randomSafety(rng: Rng): SafetySettings {
  const lines: string[] = [];
  const veils: string[] = [];
  for (const tag of SAFETY_VOCABULARY) {
    if (rng.next() < 0.2) lines.push(tag);
    if (rng.next() < 0.2 && !lines.includes(tag)) veils.push(tag);
  }
  return { lines, veils };
}

/** I3 on a finished card: no visible source carries a line; every veil is flagged. */
function checkCard(label: string, card: Card, safety: SafetySettings): void {
  for (const [name, field] of Object.entries(card.fields)) {
    if (field.blocked) continue;
    for (const tag of sourceTags(card, name)) {
      if (safety.lines.includes(tag)) throw new Error(`I3: ${label}: ${name} carries lined ${tag}`);
      if (safety.veils.includes(tag) && !card.flags.veiled.includes(tag))
        throw new Error(`I3: ${label}: ${name} veil ${tag} not flagged`);
    }
  }
}

/** Display sanity (spec §4.6.4): returns the first problem found, or ''. */
function sanity(text: string, opts: { display: boolean; finalDot?: boolean }): string {
  const t = opts.finalDot && text.endsWith('.') ? text.slice(0, -1) : text;
  if (text === '') return 'empty';
  if (text.length > 160) return 'longer than 160 characters';
  if (opts.display && !/^[\p{Lu}\d"'‘“]/u.test(text)) return 'bad first character';
  for (const bad of BAD_PARTS) if (t.includes(bad)) return `contains "${bad}"`;
  if (/\b(a|an) (a|an|the)\b/i.test(t)) return 'double article';
  return '';
}

function checkSanity(label: string, card: Card, finalDot = false): void {
  if (card.display === BLOCKED_DISPLAY) return;
  const bad = sanity(card.display, { display: true, finalDot });
  if (bad) throw new Error(`${label}: display "${card.display}" ${bad}`);
  for (const [name, field] of Object.entries(card.fields)) {
    if (field.blocked) continue;
    const problem = sanity(field.value, { display: false, finalDot });
    if (problem) throw new Error(`${label}: field ${name} "${field.value}" ${problem}`);
  }
}

describe('determinism', () => {
  it('50 seeds per generator give deep-equal fields and display', () => {
    for (const id of GENERATORS)
      for (let i = 0; i < 50; i++) {
        const opts = { seed: `det-${i}`, context: {} };
        const a = generate(lib, id, opts);
        const b = generate(lib, id, opts);
        expect(b.fields, `${id} ${i} fields`).toEqual(a.fields);
        expect(b.display, `${id} ${i} display`).toBe(a.display);
      }
  });
});

describe('lines over 10,000 generations', () => {
  it('never show a lined source and flag every veil, rerolls included', () => {
    let rerolled = 0;
    for (let i = 0; i < 10_000; i++) {
      const id = GENERATORS[i % n] as string;
      const rng = createRng('content', i);
      const safety = randomSafety(rng);
      const card = generate(lib, id, { seed: `p${i}`, context: { safety } });
      checkCard(`${id} ${i}`, card, safety);
      if (i % 5 === 0) {
        const names = Object.keys(card.fields);
        const locks = names.filter(() => rng.next() < 0.5);
        const next = randomSafety(rng);
        checkCard(
          `${id} ${i} reroll`,
          reroll(lib, card, { locks, context: { safety: next } }),
          next,
        );
        rerolled++;
      }
    }
    expect(rerolled, 'I3: rerolled cards').toBe(2_000);
  });

  /**
   * Non-vacuity, per generator (Ruling R47). A global floor over the rotation is diluted by every
   * new generator, so each generator that can reach a safety-tagged entry gets its own run: in
   * NONVACUOUS_SEEDS seeds, the same seed rolled with no lines must show a source the random lines
   * cover at least NONVACUOUS_FLOOR times, and every such lined card is checked. The floor is 1% of
   * the seeds: at S1a the sparsest tagged generator (fantasy.shop) shows 47 in 2,000, so 20 leaves
   * room for reshuffles; with blocking skipped, the lined cards fail checkCard on the first hit.
   * A generator that reaches no tagged entry must never show one (it has nothing to prove).
   */
  it.each(GENERATORS)('%s exercises lines when it can reach a tagged entry', (id) => {
    const canReach = reachesTagged(lib, id);
    let lined = 0;
    for (let i = 0; i < NONVACUOUS_SEEDS; i++) {
      const safety = randomSafety(createRng(`vac-${id}`, i));
      const free = generate(lib, id, { seed: `v${i}`, context: { safety: NO_LINES } });
      const tags = Object.keys(free.fields).flatMap((f) => sourceTags(free, f));
      if (!canReach) {
        expect(tags, `${id} ${i}: reached a tagged entry the walk missed`).toEqual([]);
        continue;
      }
      if (!tags.some((t) => safety.lines.includes(t))) continue;
      lined++;
      checkCard(`${id} ${i}`, generate(lib, id, { seed: `v${i}`, context: { safety } }), safety);
    }
    if (canReach)
      expect(lined, `I3: ${id} seeds with a lined source`).toBeGreaterThanOrEqual(NONVACUOUS_FLOOR);
  });

  it('with all 25 lines every field is blocked or clean', () => {
    const all: SafetySettings = { lines: [...SAFETY_VOCABULARY], veils: [] };
    for (const id of GENERATORS)
      for (let i = 0; i < 50; i++) {
        const card = generate(lib, id, { seed: `all-${i}`, context: { safety: all } });
        checkCard(`${id} ${i}`, card, all);
        for (const [name, field] of Object.entries(card.fields))
          if (!field.blocked) expect(sourceTags(card, name), `${id}.${name}`).toEqual([]);
      }
  });
});

describe('context shapes', () => {
  const dm = {
    settlement: { name: 'Gallowmere' },
    front: { name: 'the Ash Court' },
    mention: { name: 'Odrin Vey' },
    pc: { name: 'Mara', want: 'to find her brother.' },
    truth: { text: 'The mayor poisoned the well.' },
  };
  const blank = Object.fromEntries(
    Object.entries(dm).map(([k, v]) => [
      k,
      Object.fromEntries(Object.keys(v).map((f) => [f, '   '])),
    ]),
  );
  const run = (label: string, context: Record<string, unknown>): void => {
    for (let i = 0; i < 1_000; i++) {
      const id = GENERATORS[i % n] as string;
      const card = generate(lib, id, { seed: `${label}-${i}`, context });
      checkSanity(`${label} ${id} ${i}`, card, true);
      if (card.display !== BLOCKED_DISPLAY && /\.\s+[a-z]/.test(card.display))
        throw new Error(
          `${label} ${id} ${i}: sentence break before lower case in "${card.display}"`,
        );
    }
  };

  it('DM-shaped context reads cleanly', () => run('dm', dm));
  it('blank context falls back cleanly', () => run('blank', blank));
});

describe('display sanity', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => warn.mockRestore());

  it('holds for every non-blocked display under random lines', () => {
    for (let i = 0; i < 2_000; i++) {
      const id = GENERATORS[i % n] as string;
      const safety = randomSafety(createRng('sanity', i));
      checkSanity(`${id} ${i}`, generate(lib, id, { seed: `s${i}`, context: { safety } }));
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
