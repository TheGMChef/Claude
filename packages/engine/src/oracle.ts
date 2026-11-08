import { ContentError } from './errors';
import { BLOCKED_VALUE } from './generate';
import type { Library } from './library';
import { renderTemplate } from './render';
import type { RenderEnv } from './render';
import { createRng, toSeed } from './rng';
import type { SafetySettings } from './safety';
import type { Likelihood } from './schema';
import { selectEntry } from './select';

export type OracleResult = {
  roll: number;
  likelihood: Likelihood;
  answer: 'yes' | 'no';
  modifier?: 'and' | 'but';
  /** A word that safety lines block is BLOCKED_VALUE ('—'). */
  meaning: [string, string];
  /** True when either meaning word is blocked. */
  blocked: boolean;
  /** Veiled safety tags carried by the two words (union, first-seen order). */
  veiled: string[];
};

/** A drawn move. When safety lines exclude every card: `{ id: '', text: '—', prompt: '', blocked: true }`. */
export type MoveCard = {
  id: string;
  text: string;
  prompt: string;
  blocked: boolean;
  /** Veiled safety tags the card carries. */
  veiled: string[];
};

function missing(kind: string, id: string): never {
  throw new ContentError('missing-source', `${kind} "${id}" not found`, id, '');
}

/**
 * Spec §4.5: `and` (extreme result) wins over `but` (a near miss of the yes threshold).
 * R24: extremes are gated on the answer and symmetric: yes+and iff roll <= extreme, no+and iff
 * roll > 100 - extreme (extreme rolls at each end). So 88 at yes=90/extreme=15 is `yes but`.
 */
export function oracleOutcome(
  roll: number,
  yes: number,
  extreme: number,
): Pick<OracleResult, 'answer' | 'modifier'> {
  const answer = roll <= yes ? 'yes' : 'no';
  if (answer === 'yes' ? roll <= extreme : roll > 100 - extreme) return { answer, modifier: 'and' };
  if (Math.abs(roll - yes) <= 5) return { answer, modifier: 'but' };
  return { answer };
}

export function askOracle(
  lib: Library,
  oracleId: string,
  likelihood: Likelihood,
  opts: { seed?: string; safety?: SafetySettings } = {},
): OracleResult {
  const oracle = lib.oracle(oracleId);
  if (!oracle) missing('oracle', oracleId);
  const [idA, idB] = oracle.meaning;
  if (idA === undefined || idB === undefined) {
    const message = `oracle "${oracleId}" needs exactly 2 meaning tables`;
    throw new ContentError('missing-source', message, oracleId, '');
  }
  const seed = toSeed(opts.seed);

  const roll = createRng(seed, 'oracle', oracleId).int(100) + 1;
  const { yes, extreme } = oracle.odds[likelihood];
  const outcome = oracleOutcome(roll, yes, extreme);

  const veiled: string[] = [];
  const addVeils = (tags: string[]): void => {
    for (const t of tags) if (!veiled.includes(t)) veiled.push(t);
  };
  // I7: a word that safety lines block (top-level or nested) is BLOCKED_VALUE, never ''.
  const word = (tableId: string, index: number): { text: string; blocked: boolean } => {
    const table = lib.table(tableId);
    if (!table) missing('table', tableId);
    const rng = createRng(seed, 'meaning', index);
    const sel = selectEntry(table, rng, opts.safety ? { safety: opts.safety } : {});
    if (sel.blocked) return { text: BLOCKED_VALUE, blocked: true };
    if (!sel.entry) return { text: '', blocked: false };
    const env: RenderEnv = {
      lib,
      ctx: opts.safety ? { safety: opts.safety } : {},
      rng,
      resolveName: () => '',
      resolveGen: () => '',
      mode: 'prod',
    };
    const r = renderTemplate(sel.entry.ast, env);
    if (r.blocked) return { text: BLOCKED_VALUE, blocked: true };
    addVeils(sel.veiled);
    addVeils(r.veiled);
    return { text: r.text, blocked: false };
  };

  const a = word(idA, 0);
  const b = word(idB, 1);
  return {
    roll,
    likelihood,
    ...outcome,
    meaning: [a.text, b.text],
    blocked: a.blocked || b.blocked,
    veiled,
  };
}

/**
 * I6: lines are applied first and never relaxed (R22); `exclude` is relaxed when it would empty
 * the safe cards, falling back to the safe cards only.
 */
export function drawMove(
  lib: Library,
  deckId: string,
  opts: { seed?: string; exclude?: string[]; safety?: SafetySettings } = {},
): MoveCard {
  const deck = lib.deck(deckId);
  if (!deck) missing('deck', deckId);
  if (deck.cards.length === 0) {
    throw new ContentError('missing-source', `deck "${deckId}" has no cards`, deckId, '');
  }
  const lines = opts.safety?.lines ?? [];
  const safe = deck.cards.filter((c) => !(c.safety ?? []).some((t) => lines.includes(t)));
  if (safe.length === 0) {
    return { id: '', text: BLOCKED_VALUE, prompt: '', blocked: true, veiled: [] };
  }
  const excluded = new Set(opts.exclude ?? []);
  const eligible = safe.filter((c) => !excluded.has(c.id));
  const pool = eligible.length > 0 ? eligible : safe;
  const rng = createRng(toSeed(opts.seed), 'move', deckId);
  const card = pool[rng.int(pool.length)] as (typeof pool)[number];
  const veils = opts.safety?.veils ?? [];
  return {
    id: card.id,
    text: card.text,
    prompt: card.prompt ?? '',
    blocked: false,
    veiled: veils.filter((v) => (card.safety ?? []).includes(v)),
  };
}
