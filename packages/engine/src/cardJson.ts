import { z } from 'zod';
import { packVersion } from './generate';
import type { Card } from './generate';
import type { Library } from './library';
import { MAX_CARD_JSON_LENGTH } from './limits';

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

const Strings = z.array(z.string());

/**
 * The context keys the engine reads back (reroll, applySafety) must have their types: a pasted card
 * with `safety.lines: 5` would otherwise throw later. Other keys pass through (ctx slots).
 */
const ContextSchema = z
  .object({
    genre: z.string().optional(),
    cultureId: z.string().optional(),
    tags: z
      .strictObject({
        require: Strings.optional(),
        prefer: Strings.optional(),
        exclude: Strings.optional(),
      })
      .optional(),
    safety: z.strictObject({ lines: Strings, veils: Strings }).optional(),
    avoidNames: Strings.optional(),
  })
  .catchall(z.unknown());

const CardSchema = z.strictObject({
  id: z.string().min(1),
  generatorId: z.string().min(1),
  packVersion: z.string(),
  seed: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/),
  fields: z.record(z.string(), CardFieldSchema),
  display: z.string(),
  context: ContextSchema,
  flags: z.strictObject({ veiled: z.array(z.string()), relaxed: z.boolean() }),
});

export type ParsedCard =
  { ok: true; card: Card; stale: boolean } | { ok: false; error: 'json' | 'schema' | 'too-large' };

/** A card as JSON: how the Codex stores cards (C1). Field order is kept. */
export function serializeCard(card: Card): string {
  return JSON.stringify(card);
}

/**
 * Reads card JSON back, validated. `stale` is true when the card was made with another version of
 * its generator's pack (or the generator is no longer loaded): the stored text is kept as is.
 */
export function parseCard(lib: Library, json: string): ParsedCard {
  if (json.length > MAX_CARD_JSON_LENGTH) return { ok: false, error: 'too-large' };
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
