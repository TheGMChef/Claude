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
  /** Word tables in Title Case (default lower case). */
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

export const TABLE_SPEC: Record<string, TableSpec> = Object.fromEntries([
  ...['role', 'look', 'want', 'secret', 'tell'].map(npc),
  ...['action', 'theme'].map(meaning),
]);

/** Every generator under test. */
export const GENERATORS: string[] = ['fantasy.npc'];

/** Family to the tag its tables carry. */
export const FAMILY_TAG: Record<string, string> = { npc: 'npc', oracle: 'oracle' };

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
  required: false,
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
