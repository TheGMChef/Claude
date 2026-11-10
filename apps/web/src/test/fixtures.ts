import { parseCard, serializeCard, type Card } from '@prepdesk/engine';
import { lib } from '../content/lib';
import { rollGenerator } from '../content/safety';
import { createDb } from '../data/db';
import type { PrepDeskDB } from '../data/db';
import type { RepoDeps } from '../data/deps';
import { createCampaign } from '../data/repo/campaigns';
import type { Campaign } from '../data/schema';

let dbCount = 0;

/** A fresh fake-indexeddb database, a clock at 2026-11-10 UTC plus 1 ms per call, counter ids (D54). */
export function testDeps(): RepoDeps & { db: PrepDeskDB } {
  let clock = Date.UTC(2026, 10, 10);
  let counter = 0;
  const db = createDb(`test-${++dbCount}-${Math.random().toString(36).slice(2)}`);
  return {
    db,
    now: () => clock++,
    newId: (prefix) => `${prefix}_${String(++counter).padStart(16, '0')}`,
  };
}

export function seedCampaign(
  deps: RepoDeps,
  overrides: Partial<Parameters<typeof createCampaign>[1]> = {},
): Promise<Campaign> {
  return createCampaign(deps, { name: 'The Salt Marsh Debts', ...overrides });
}

/** A real `fantasy.npc` card, rolled with no lines and no veils, so every table entry is possible. */
export function npcCard(seed = 'TEST-0001'): Card {
  return rollGenerator('fantasy.npc', { lines: [], veils: [] }, { seed });
}

/** The card as the Codex stores it, read back through the same validation a restore uses. */
export function npcCardJson(seed = 'TEST-0001'): string {
  const json = serializeCard(npcCard(seed));
  if (!parseCard(lib, json).ok) throw new Error('fixture card does not parse');
  return json;
}
