import { ContentError } from './errors';
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
  meaning: [string, string];
};

export type MoveCard = { id: string; text: string; prompt: string };

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

  const word = (tableId: string, index: number): string => {
    const table = lib.table(tableId);
    if (!table) missing('table', tableId);
    const rng = createRng(seed, 'meaning', index);
    const { entry } = selectEntry(table, rng, opts.safety ? { safety: opts.safety } : {});
    if (!entry) return '';
    const env: RenderEnv = {
      lib,
      ctx: opts.safety ? { safety: opts.safety } : {},
      rng,
      resolveName: () => '',
      resolveGen: () => '',
      mode: 'prod',
    };
    return renderTemplate(entry.ast, env).text;
  };

  return { roll, likelihood, ...outcome, meaning: [word(idA, 0), word(idB, 1)] };
}

export function drawMove(
  lib: Library,
  deckId: string,
  opts: { seed?: string; exclude?: string[] } = {},
): MoveCard {
  const deck = lib.deck(deckId);
  if (!deck) missing('deck', deckId);
  if (deck.cards.length === 0) {
    throw new ContentError('missing-source', `deck "${deckId}" has no cards`, deckId, '');
  }
  const excluded = new Set(opts.exclude ?? []);
  const eligible = deck.cards.filter((c) => !excluded.has(c.id));
  const pool = eligible.length > 0 ? eligible : deck.cards;
  const rng = createRng(toSeed(opts.seed), 'move', deckId);
  const card = pool[rng.int(pool.length)] as (typeof pool)[number];
  return { id: card.id, text: card.text, prompt: card.prompt ?? '' };
}
