import type { Entity, EntityKind } from './schema';
import { fold, tokenize } from './text';

/** A pasted paragraph can't blow the per-keystroke budget: only this much of a query counts. */
export const MAX_QUERY_LENGTH = 200;
export const MAX_QUERY_TOKENS = 8;
export const MAX_RESULTS = 20;
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

type IndexedEntity = {
  entity: Entity;
  title: string; // folded
  aliases: string[]; // folded
  titleTokens: string[];
  aliasTokens: string[];
  tokens: string[]; // every indexed token (title, aliases, summary, fields, kind label)
  updatedAt: number;
};

export type SearchIndex = { entries: IndexedEntity[] };

/** Precomputes the folded strings and token arrays, so a query is plain loops (D58). */
export function buildIndex(entities: readonly Entity[]): SearchIndex {
  return {
    entries: entities.map((entity) => ({
      entity,
      title: fold(entity.title),
      aliases: entity.aliases.map(fold),
      titleTokens: tokenize(entity.title),
      aliasTokens: entity.aliases.flatMap(tokenize),
      tokens: entity.tokens,
      updatedAt: entity.updatedAt,
    })),
  };
}

function prefixed(tokens: readonly string[], q: string): boolean {
  for (let i = 0; i < tokens.length; i++) if (tokens[i]!.startsWith(q)) return true;
  return false;
}

function phraseScore(e: IndexedEntity, qf: string): number {
  if (e.title === qf) return 100;
  if (e.title.startsWith(qf)) return 60;
  for (let i = 0; i < e.aliases.length; i++) if (e.aliases[i]!.startsWith(qf)) return 50;
  return 0;
}

function tokenScore(e: IndexedEntity, qt: readonly string[]): number {
  let total = 0;
  for (let i = 0; i < qt.length; i++) {
    const q = qt[i]!;
    if (prefixed(e.titleTokens, q)) total += 40;
    else if (prefixed(e.aliasTokens, q)) total += 30;
    else if (prefixed(e.tokens, q)) total += 10;
    else return 0;
  }
  return total;
}

export function search(
  index: SearchIndex,
  q: string,
  opts: { now?: number; kinds?: readonly EntityKind[]; limit?: number } = {},
): { entity: Entity; score: number }[] {
  const qf = fold(q.slice(0, MAX_QUERY_LENGTH));
  if (qf === '') return [];
  const qt = tokenize(qf).slice(0, MAX_QUERY_TOKENS);
  const now = opts.now ?? Date.now();
  const kinds = opts.kinds ? new Set<EntityKind>(opts.kinds) : undefined;
  const asked = opts.limit ?? MAX_RESULTS;
  const limit = Number.isFinite(asked)
    ? Math.min(MAX_RESULTS, Math.max(0, Math.floor(asked)))
    : MAX_RESULTS;

  const hits: { e: IndexedEntity; score: number }[] = [];
  for (const e of index.entries) {
    if (kinds && !kinds.has(e.entity.kind)) continue;
    let score = phraseScore(e, qf);
    if (score === 0 && qt.length > 0) score = tokenScore(e, qt);
    if (score === 0) continue;
    const age = now - e.updatedAt;
    if (age >= 0 && age <= RECENT_MS) score += 5; // a future timestamp earns no bonus
    hits.push({ e, score });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      b.e.updatedAt - a.e.updatedAt ||
      (a.e.title < b.e.title ? -1 : a.e.title > b.e.title ? 1 : 0) ||
      (a.e.entity.id < b.e.entity.id ? -1 : 1),
  );
  return hits.slice(0, limit).map((h) => ({ entity: h.e.entity, score: h.score }));
}

export type Command = { id: string; label: string; verbs: string[]; nouns: string[] };

const roll = (id: string, label: string, ...nouns: string[]): Command => ({
  id: `roll.${id}`,
  label,
  verbs: ['roll'],
  nouns,
});

/** The fourteen commands of spec 5.6, labels verbatim. Built in S2, rendered from S3 (D60). */
export const COMMANDS: readonly Command[] = [
  roll('name', 'Roll a name', 'name'),
  roll('npc', 'Roll an NPC', 'npc'),
  roll('place', 'Roll a place', 'place'),
  roll('tavern', 'Roll a tavern', 'tavern'),
  roll('shop', 'Roll a shop', 'shop'),
  roll('settlement', 'Roll a settlement', 'settlement'),
  roll('twist', 'Roll a twist', 'twist'),
  roll('treasure', 'Roll treasure', 'treasure'),
  roll('trinket', 'Roll a trinket', 'trinket'),
  roll('encounter', 'Roll an encounter', 'encounter'),
  roll('seed', 'Roll a seed', 'seed'),
  { id: 'oracle', label: 'Ask the oracle', verbs: ['ask'], nouns: ['oracle'] },
  { id: 'move', label: 'Draw a move', verbs: ['draw'], nouns: ['move'] },
  { id: 'stuck', label: "I'm stuck", verbs: [], nouns: ['stuck'] },
];

// Articles and the "I'm" of "I'm stuck" carry no meaning for matching.
const FILLER = new Set(['a', 'an', 'the', 'i', 'm']);

/** Every query word (articles dropped) has to prefix a verb or noun of the command. */
export function matchCommands(q: string): Command[] {
  const words = tokenize(q.slice(0, MAX_QUERY_LENGTH))
    .filter((w) => !FILLER.has(w))
    .slice(0, MAX_QUERY_TOKENS);
  if (words.length === 0) return [];
  return COMMANDS.filter((c) => {
    const keys = [...c.verbs, ...c.nouns];
    return words.every((w) => prefixed(keys, w));
  });
}
