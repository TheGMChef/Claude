/**
 * The only place that calls the engine's safety-taking functions (Security B). Every wrapper takes a
 * required `Safety` and always puts it in the context, over anything a stored or imported card
 * carries. ESLint bans importing the raw functions anywhere else in apps/web/src.
 */
import { applySafety, generate, reroll } from '@prepdesk/engine';
import type { Card, Context } from '@prepdesk/engine';
import type { Safety } from '../data/schema';
import { lib } from './lib';

export type ContextExtras = {
  avoidNames?: string[];
  cultureId?: string;
  /** Other context keys (for example `tags`). They can never replace the keys set below. */
  ctx?: Record<string, unknown>;
};

/** The engine context for a campaign: its safety is copied, so callers can't change the campaign. */
export function contextFor(campaign: { safety: Safety }, extras: ContextExtras = {}): Context {
  return {
    ...extras.ctx,
    genre: 'fantasy',
    ...(extras.cultureId !== undefined ? { cultureId: extras.cultureId } : {}),
    avoidNames: [...(extras.avoidNames ?? [])],
    safety: { lines: [...campaign.safety.lines], veils: [...campaign.safety.veils] },
  };
}

export function rollGenerator(
  generatorId: string,
  safety: Safety,
  opts: { seed?: string; extras?: ContextExtras } = {},
): Card {
  return generate(lib, generatorId, {
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
    context: contextFor({ safety }, opts.extras),
  });
}

/** The card's own context is kept (culture, tags) except for what `contextFor` sets: the safety. */
export function rerollCard(
  card: Card,
  safety: Safety,
  opts: { locks?: string[]; extras?: ContextExtras } = {},
): Card {
  return reroll(lib, card, {
    ...(opts.locks !== undefined ? { locks: opts.locks } : {}),
    context: { ...(card.context as Context), ...contextFor({ safety }, opts.extras) },
  });
}

export function recheckCard(card: Card, safety: Safety): Card {
  return applySafety(lib, card, { context: contextFor({ safety }) });
}

/**
 * D64: the campaign's current lines that a stored card's table entries touch, or 'unreadable'.
 * Stub until Task 6; it never reads the card's own context.safety.
 */
export function linedTopics(cardJson: string, safety: Safety): string[] | 'unreadable' {
  void cardJson;
  void safety;
  return [];
}
