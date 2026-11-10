/**
 * The single table every content task edits (Content Task Protocol, plan Tasks 5-20): which
 * tables the gates cover, how many entries each needs, and what kind of text it holds. Raising a
 * family's `full` to true, or growing a `target`, is the only change a content task makes here.
 */
export type TableKind = 'line' | 'word' | 'pattern' | 'fixed';

export type TableSpec = {
  family: string;
  target: number;
  full: boolean;
  kind: TableKind;
  /** Threshold while !full (default Math.min(8, target)). */
  stub?: number;
  /** Pocket-feeding: at least 12 eligible under STRICT_LINES once full. */
  pocket?: true;
  /** Each TERRAIN tag on at least 3 entries once full. */
  terrain?: true;
  /** Word tables in Title Case (default lower case); ignored for family `oracle`, which is /^[a-z]+$/. */
  caps?: true;
  /** Every entry ends with '?'. */
  end?: '?';
};

/** Entry-count threshold of a table, the deck or the situations: target once full, else the stub. */
export const threshold = (s: Pick<TableSpec, 'full' | 'target' | 'stub'>): number =>
  s.full ? s.target : (s.stub ?? Math.min(8, s.target));

const npc = (name: string): [string, TableSpec] => [
  `fantasy.npc.${name}`,
  { family: 'npc', target: 20, full: true, kind: 'line', pocket: true },
];
const meaning = (name: string): [string, TableSpec] => [
  `fantasy.meaning.${name}`,
  { family: 'oracle', target: 50, stub: 30, full: false, kind: 'word' },
];

const row = (id: string, spec: TableSpec): [string, TableSpec] => [`fantasy.${id}`, spec];
const line = (family: string, name: string, target: number, extra?: Partial<TableSpec>) =>
  row(`${family}.${name}`, { family, target, full: false, kind: 'line', ...extra });
const placeLine = (name: string, target: number, full = false): [string, TableSpec] =>
  line('place', name, target, { pocket: true, terrain: true, full });
const pocketLine = (
  family: string,
  name: string,
  target: number,
  full = false,
): [string, TableSpec] => line(family, name, target, { pocket: true, full });

export const TABLE_SPEC: Record<string, TableSpec> = Object.fromEntries([
  ...['role', 'look', 'want', 'secret', 'tell'].map(npc),
  ...['action', 'theme'].map(meaning),
  row('place.word-a', { family: 'place', target: 30, full: true, kind: 'word', caps: true }),
  row('place.word-b', { family: 'place', target: 30, full: true, kind: 'word' }),
  row('place.name', { family: 'place', target: 10, full: true, kind: 'pattern' }),
  placeLine('kind', 30, true),
  placeLine('sight', 40, true),
  placeLine('sound', 40, true),
  placeLine('smell', 40, true),
  placeLine('happening', 30, true),
  row('settlement.name', { family: 'settlement', target: 10, full: true, kind: 'pattern' }),
  row('settlement.size', { family: 'settlement', target: 6, full: true, kind: 'fixed' }),
  line('settlement', 'known-for', 30, { full: true }),
  line('settlement', 'trouble', 30, { full: true }),
  line('settlement', 'power', 24, { full: true }),
  row('tavern.name', { family: 'tavern', target: 8, full: true, kind: 'pattern' }),
  row('tavern.adj', { family: 'tavern', target: 30, full: true, kind: 'word', caps: true }),
  row('tavern.noun', { family: 'tavern', target: 30, full: true, kind: 'word', caps: true }),
  line('tavern', 'keeper-way', 24, { pocket: true, full: true }),
  line('tavern', 'menu', 30, { pocket: true, full: true }),
  line('tavern', 'regular', 30, { pocket: true, full: true }),
  row('shop.name', { family: 'shop', target: 8, full: true, kind: 'pattern' }),
  row('shop.adj', { family: 'shop', target: 24, full: true, kind: 'word', caps: true }),
  row('shop.noun', { family: 'shop', target: 20, full: true, kind: 'word', caps: true }),
  line('shop', 'kind', 24, { pocket: true, full: true }),
  line('shop', 'ware', 60, { pocket: true, full: true }),
  line('shop', 'oddity', 24, { pocket: true, full: true }),
  line('shop', 'haggle', 20, { pocket: true, full: true }),
  line('rumor', 'text', 40, { pocket: true, full: true }),
  row('rumor.truth', { family: 'rumor', target: 3, full: false, kind: 'fixed' }),
  line('rumor', 'source', 24, { pocket: true, full: true }),
  line('secret', 'text', 40, { full: true }),
  line('clue', 'delivery', 24, { full: true }),
  line('clue', 'trace', 40, { full: true }),
  line('clue', 'where', 24, { full: true }),
  pocketLine('complication', 'trouble', 40, true),
  pocketLine('complication', 'twist', 30, true),
  pocketLine('trinket', 'item', 50, true),
  pocketLine('trinket', 'detail', 30, true),
  pocketLine('treasure', 'item', 40, true),
  line('treasure', 'worth', 12, { full: true }),
  pocketLine('treasure', 'hook', 24, true),
  line('encounter', 'question', 30, { end: '?', full: true }),
  line('encounter', 'opposition', 30, { full: true }),
  line('encounter', 'goal', 24, { full: true }),
  line('encounter', 'terrain', 30, { terrain: true, full: true }),
  line('encounter', 'turn', 24, { full: true }),
  line('encounter', 'fail', 24, { full: true }),
  line('prep', 'spotlight-hook', 24),
  line('prep', 'return', 16),
  line('prep', 'villain-move', 30),
  line('prep', 'pressure-rumor', 24),
]);

/** Every generator under test. */
export const GENERATORS: string[] = [
  'fantasy.npc',
  'fantasy.place',
  'fantasy.settlement',
  'fantasy.tavern',
  'fantasy.shop',
  'fantasy.rumor',
  'fantasy.secret',
  'fantasy.clue',
  'fantasy.complication',
  'fantasy.trinket',
  'fantasy.treasure',
  'fantasy.encounter',
  'fantasy.seed',
  'fantasy.prep.spotlight',
  'fantasy.prep.pressure',
];

/** Family to the tag its tables carry. */
export const FAMILY_TAG: Record<string, string> = {
  npc: 'npc',
  oracle: 'oracle',
  place: 'place',
  settlement: 'settlement',
  tavern: 'tavern',
  shop: 'shop',
  rumor: 'rumor',
  secret: 'secret',
  clue: 'clue',
  complication: 'complication',
  trinket: 'loot',
  treasure: 'loot',
  encounter: 'encounter',
};

/** Tables whose first-3-words check pools their entries (spec §4.5: no duplicates in spirit). */
export const POOLS: string[][] = [['fantasy.rumor.text', 'fantasy.secret.text']];

export const STRICT_LINES = [
  'violence',
  'death',
  'fire',
  'drowning',
  'religion',
  'spiders',
  'insects',
  'rats',
  'war',
];

export const TERRAIN = [
  'urban',
  'rural',
  'coastal',
  'wilderness',
  'river',
  'forest',
  'mountain',
  'underground',
  'ruin',
  'road',
];

/** Context paths content may read. */
export const CTX_KEYS = [
  'settlement.name',
  'front.name',
  'place.name',
  'mention.name',
  'pc.name',
  'pc.want',
  'truth.text',
];

/** Keys whose value is a free-text sentence: allowed only as the last element of an entry (S1-9). */
export const FREE_TEXT_KEYS = ['pc.want', 'truth.text'];

/**
 * Situations. `required` is false until the pack ships its first situation (plan Task 7 sets it
 * true); once any situation exists the gates apply whatever its value. `full` flips to true in
 * Task 18.
 */
export const SITUATIONS = {
  required: true,
  target: 20,
  stub: 4,
  facetTarget: 4,
  facetStub: 3,
  full: false,
};

export const CULTURES_SPEC = { examples: 16, tips: 4, full: false };

export const DECK_SPEC = { id: 'core.gm-moves', target: 24, stub: 12, full: false };

/**
 * Stem hits that are not real safety content (a true false positive). "A cosy fireplace" is NOT
 * one: tag or reword it. Each row needs a reason, and a row that no longer matches an entry fails.
 */
export const AUDIT_EXCEPTIONS: Array<{
  table: string;
  text: string;
  topic: string;
  reason: string;
}> = [
  {
    table: 'fantasy.npc.role',
    text: 'stablehand at a coaching inn',
    topic: 'violence',
    reason: '"stab" is the start of "stablehand", a stable worker; nothing violent is implied',
  },
  {
    table: 'fantasy.npc.secret',
    text: 'the relic they guard is a painted copy; they sold the real one',
    topic: 'police',
    reason: '"guard" is a verb about keeping a relic; no watch, guard post or arrest is involved',
  },
];

/**
 * Tables deliberately outside TABLE_SPEC (id to reason). Situation facet and index tables are
 * covered structurally and need no row. A table added without a row, or an entry here, fails the
 * "every table is gated" test.
 */
export const UNGATED_TABLES: Record<string, string> = {};
