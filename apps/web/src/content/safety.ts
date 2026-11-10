/**
 * The only place that calls the engine's safety-taking functions (Security B). Every wrapper takes a
 * required `Safety` and always puts it in the context, over anything a stored or imported card
 * carries. ESLint bans importing the raw functions anywhere else in apps/web/src.
 */
import { applySafety, generate, parseCard, reroll } from '@prepdesk/engine';
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
 * D64: the campaign's CURRENT lines that a stored card's table entries touch (sorted), or
 * 'unreadable'. It reads the sources of every field, hidden ones included, and never the card's own
 * context.safety. A source it can't place (unknown table, bad index) counts as no hit; it never throws.
 */
export function linedTopics(cardJson: string, safety: Safety): string[] | 'unreadable' {
  try {
    const parsed = parseCard(lib, cardJson);
    if (!parsed.ok) return 'unreadable';
    const lines = new Set(safety.lines);
    const hits = new Set<string>();
    if (lines.size === 0) return [];
    for (const field of Object.values(parsed.card.fields)) {
      for (const src of [...field.sources, ...(field.hidden?.sources ?? [])]) {
        const cut = src.lastIndexOf('#');
        const index = src.slice(cut + 1);
        if (cut <= 0 || index === '' || index.length > 9 || !/^[0-9]+$/.test(index)) continue;
        const entry = lib.table(src.slice(0, cut))?.entries[Number(index)];
        for (const topic of entry?.safety ?? []) if (lines.has(topic)) hits.add(topic);
      }
    }
    return [...hits].sort();
  } catch {
    return 'unreadable';
  }
}
