import { z } from 'zod';
import { packVersion } from './generate';
import type { Card } from './generate';
import type { Library } from './library';

const Hidden = z.strictObject({
  value: z.string(),
  sources: z.array(z.string()),
  relaxed: z.boolean().optional(),
});

const CardFieldSchema = z.strictObject({
  value: z.string(),
  locked: z.boolean(),
  nonce: z.number().int().nonnegative(),
  sources: z.array(z.string()),
  blocked: z.boolean().optional(),
  relaxed: z.boolean().optional(),
  hidden: Hidden.optional(),
});

const CardSchema = z.strictObject({
  id: z.string().min(1),
  generatorId: z.string().min(1),
  packVersion: z.string(),
  seed: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/),
  fields: z.record(z.string(), CardFieldSchema),
  display: z.string(),
  context: z.record(z.string(), z.unknown()),
  flags: z.strictObject({ veiled: z.array(z.string()), relaxed: z.boolean() }),
});

export type ParsedCard =
  { ok: true; card: Card; stale: boolean } | { ok: false; error: 'json' | 'schema' };

/** A card as JSON: how the Codex stores cards (C1). Field order is kept. */
export function serializeCard(card: Card): string {
  return JSON.stringify(card);
}

/**
 * Reads card JSON back, validated. `stale` is true when the card was made with another version of
 * its generator's pack (or the generator is no longer loaded): the stored text is kept as is.
 */
export function parseCard(lib: Library, json: string): ParsedCard {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'json' };
  }
  const parsed = CardSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: 'schema' };
  const card = parsed.data as Card;
  return { ok: true, card, stale: card.packVersion !== packVersion(lib, card.generatorId) };
}
