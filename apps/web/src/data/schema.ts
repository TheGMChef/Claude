/**
 * Record types for the Dexie stores (spec 5.2 and 5.3, verbatim) plus the D53 additions:
 * `campaignId` on Draft and PrepAnswer, and `wikiTargets` on Entity.
 */
export type Safety = { lines: string[]; veils: string[] };

export type IdPrefix = 'cmp' | 'ses' | 'ent' | 'lnk' | 'evt' | 'sho' | 'poc' | 'drf';

export interface Campaign {
  id: string;
  name: string;
  genre: 'fantasy';
  safety: Safety; // default { lines: ['child-harm'], veils: [] }
  cultureIds: string[]; // Pocket name cultures; default all 3, min 1
  createdAt: number;
  updatedAt: number;
  lastExportedAt?: number;
}

export type SessionStatus = 'prepping' | 'ready' | 'live' | 'wrapping' | 'done';

export interface Session {
  id: string;
  campaignId: string;
  number: number;
  status: SessionStatus;
  prepStep: 1 | 2 | 3 | 4 | 5 | 6;
  stepsVisited: number[];
  stepsSkipped: number[];
  prepElapsedMs: number;
  presentPcIds: string[];
  spotlightPcIds: string[];
  plannedTicks: Record<string, number>; // frontId -> ticks to apply at start (D19)
  sceneOrder: string[];
  currentSceneId?: string;
  focusEntityId?: string;
  pocketSeed: string;
  pocketRolledAt?: number;
  startedAt?: number;
  pausedAt?: number;
  pausedMs: number;
  endedAt?: number;
  recap: string;
  recapSavedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export const ENTITY_KINDS = [
  'pc',
  'npc',
  'place',
  'front',
  'truth',
  'clue',
  'scene',
  'thread',
  'item',
  'note',
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export type Canon = 'provisional' | 'kept';

export interface Entity {
  id: string;
  campaignId: string;
  kind: EntityKind;
  /** place: settlement|tavern|shop|location; item: trinket|treasure;
   * note: rumor|complication|encounter|seed|detail; scene: strong-start|scene */
  subtype?: string;
  title: string;
  aliases: string[];
  summary: string;
  fields: Record<string, string>; // authoritative, editable (D4)
  body: string; // plain text with [[wiki links]]
  canon: Canon; // D7
  /** clue: hidden|found; truth: open|revealed; front: active|resolved;
   * scene: planned|played|skipped; thread: open|closed */
  state?: string;
  clock?: { size: 4 | 6 | 8; filled: number; doom: string }; // fronts
  card?: string; // serializeCard JSON, provenance only
  veiled: string[]; // veil tags from the origin card
  origin: 'prep' | 'table' | 'manual' | 'import';
  firstSessionId?: string;
  lastSessionId?: string;
  tokens: string[]; // search tokens, derived on every write
  wikiTargets: string[]; // folded [[targets]] in the text, derived on every write (D56)
  createdAt: number;
  updatedAt: number;
}

export const LINK_RELS = ['mentions', 'points-to', 'at', 'part-of', 'knows'] as const;
export type LinkRel = (typeof LINK_RELS)[number];

export interface Link {
  id: string;
  campaignId: string;
  fromId: string;
  toId: string;
  rel: LinkRel;
  origin: 'wiki' | 'explicit';
  createdAt: number;
}

export interface UsedName {
  campaignId: string;
  nameKey: string; // normalizeName
  name: string;
  cultureId: string;
  sessionId: string;
  entityId?: string;
  at: number;
}

export interface PocketItem {
  id: string;
  sessionId: string;
  campaignId: string;
  section: 'names' | 'npcs' | 'places' | 'rumors' | 'loot' | 'twists';
  order: number;
  locked: boolean;
  card?: string; // serialized Card
  name?: { name: string; cultureId: string }; // names section
  usedAt?: number;
  usedNote?: string;
  entityId?: string;
}

export interface Draft {
  id: string;
  sessionId: string;
  campaignId: string;
  step: number;
  kind: string; // rumor|clue|scene|...
  line: string;
  card?: string;
  status: 'draft' | 'kept' | 'tossed';
  entityId?: string;
  order: number;
}

export interface PrepAnswer {
  sessionId: string;
  campaignId: string;
  step: number;
  answers: Record<string, string>;
  updatedAt: number;
}

export interface ShortlistItem {
  id: string;
  campaignId: string;
  fromSessionId: string;
  entityId?: string;
  card?: string; // one of the two
  label: string; // "Improvised NPC", "Improvised detail", "Clue not found", ...
  title: string;
  question: string;
  yesLabel: string; // e.g. "Yes, flesh out", "Make NPC", "Move it"
  status: 'open' | 'fleshed' | 'let-go';
  deferrals: number;
  createdAt: number;
  decidedAt?: number;
}

export type LedgerKind =
  | 'session-start'
  | 'strong-start'
  | 'scene'
  | 'npc-improvised'
  | 'npc-used'
  | 'place-improvised'
  | 'place-used'
  | 'rumor'
  | 'clue-found'
  | 'complication'
  | 'item-given'
  | 'encounter'
  | 'oracle'
  | 'move'
  | 'stuck'
  | 'clock'
  | 'note'
  | 'session-end';

export interface UndoPayload {
  createdEntityIds?: string[];
  createdLinkIds?: string[];
  createdShortlistIds?: string[];
  usedNameKeys?: string[];
  usedPocketIds?: string[];
  clock?: { entityId: string; from: number };
  state?: { entityId: string; from: string };
  scene?: { from?: string };
}

export interface LedgerEvent {
  id: string;
  campaignId: string;
  sessionId: string;
  at: number; // wall clock
  t: number; // active session ms at the event (timer, D20)
  kind: LedgerKind;
  text: string; // human line
  entityId?: string;
  review: 'none' | 'ask' | 'done';
  undo: UndoPayload; // what to revert (D9)
}

/** Device settings (D55): never exported in backups. */
export interface SettingRow {
  key: string;
  value: unknown;
}

/** Per-kind states (D59); the first value is the default on create. */
export const STATES_BY_KIND: Partial<Record<EntityKind, readonly string[]>> = {
  front: ['active', 'resolved'],
  truth: ['open', 'revealed'],
  clue: ['hidden', 'found'],
  scene: ['planned', 'played', 'skipped'],
  thread: ['open', 'closed'],
};

export const SUBTYPES_BY_KIND: Partial<Record<EntityKind, readonly string[]>> = {
  place: ['location', 'settlement', 'tavern', 'shop'],
  item: ['trinket', 'treasure'],
  note: ['rumor', 'complication', 'encounter', 'seed', 'detail'],
  scene: ['strong-start', 'scene'],
};
