/**
 * Strict zod schemas for a backup file (D63 step 6). Every record is a `strictObject` with caps that
 * mirror the repository's own (`LIMITS`, title and field rules), so a restored entity can be edited
 * afterwards. `shape.ts` rejects prototype keys, deep nesting and huge arrays before zod sees them.
 */
import { SAFETY_VOCABULARY } from '@prepdesk/engine';
import { CULTURES } from '../../content/lib';
import { ID_PATTERNS } from '../ids';
import { LIMITS } from '../repo/entities';
import { ENTITY_KINDS, LINK_RELS, STATES_BY_KIND, SUBTYPES_BY_KIND } from '../schema';
import type {
  Campaign,
  Draft,
  Entity,
  LedgerEvent,
  Link,
  PocketItem,
  PrepAnswer,
  Session,
  ShortlistItem,
  UsedName,
} from '../schema';
import { MAX_TITLE_LENGTH, validTitle } from '../text';
import { MAX_WIKI_TARGETS } from '../wiki';
import { z } from '../zod';

export const BACKUP_FORMAT = 'prepdesk-export';
export const CURRENT_FORMAT = 1;
export const CURRENT_SCHEMA = 1;

/** Copies of the repo's private field-key rules (entities.ts); a test pins them to createEntity. */
export const FIELD_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;
export const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ANSWER_KEY = /^[A-Za-z0-9_.-]{1,60}$/;

const id = (p: keyof typeof ID_PATTERNS) => z.string().regex(ID_PATTERNS[p]);
const ts = z.number().int().min(0).max(8.64e15);
const smallInt = z.number().int().min(0).max(1_000_000);
const text = (max: number) => z.string().max(max);
const topic = z
  .string()
  .max(40)
  .refine((t) => SAFETY_VOCABULARY.includes(t), 'not a safety topic');
const topics = z.array(topic).max(SAFETY_VOCABULARY.length);
const entIds = z.array(id('ent')).max(5000);
const noForbidden = (keys: string[]) => !keys.some((k) => FORBIDDEN_KEYS.has(k));

const CultureIds = new Set(CULTURES.map((c) => c.id));

const SafetySchema = z
  .strictObject({ lines: topics, veils: topics })
  .refine(
    (s) =>
      new Set(s.lines).size === s.lines.length &&
      new Set(s.veils).size === s.veils.length &&
      !s.veils.some((v) => s.lines.includes(v)),
    'duplicate or overlapping topics',
  );

export const CampaignSchema = z.strictObject({
  id: id('cmp'),
  name: z.string().trim().min(1).max(120),
  genre: z.literal('fantasy'),
  safety: SafetySchema,
  cultureIds: z
    .array(z.string().max(100))
    .min(1)
    .max(50)
    .refine((l) => l.every((c) => CultureIds.has(c)) && new Set(l).size === l.length),
  createdAt: ts,
  updatedAt: ts,
  lastExportedAt: ts.optional(),
});

const step = z.number().int().min(1).max(6);
export const SessionSchema = z.strictObject({
  id: id('ses'),
  campaignId: id('cmp'),
  number: z.number().int().min(1).max(1_000_000),
  status: z.enum(['prepping', 'ready', 'live', 'wrapping', 'done']),
  prepStep: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  stepsVisited: z.array(step).max(6),
  stepsSkipped: z.array(step).max(6),
  prepElapsedMs: ts,
  presentPcIds: entIds,
  spotlightPcIds: entIds,
  plannedTicks: z
    .record(id('ent'), z.number().int().min(0).max(100))
    .refine((r) => Object.keys(r).length <= 100),
  sceneOrder: entIds,
  currentSceneId: id('ent').optional(),
  focusEntityId: id('ent').optional(),
  pocketSeed: text(100),
  pocketRolledAt: ts.optional(),
  startedAt: ts.optional(),
  pausedAt: ts.optional(),
  pausedMs: ts,
  endedAt: ts.optional(),
  recap: text(LIMITS.body),
  recapSavedAt: ts.optional(),
  createdAt: ts,
  updatedAt: ts,
});

const title = z
  .string()
  .max(MAX_TITLE_LENGTH)
  .refine((t) => validTitle(t) === t, 'bad title');

export const EntitySchema = z
  .strictObject({
    id: id('ent'),
    campaignId: id('cmp'),
    kind: z.enum(ENTITY_KINDS),
    subtype: text(40).optional(),
    title,
    aliases: z.array(title).max(LIMITS.aliases),
    summary: text(LIMITS.text),
    fields: z
      .record(z.string().regex(FIELD_KEY), text(LIMITS.text))
      .refine((r) => Object.keys(r).length <= LIMITS.fields && noForbidden(Object.keys(r))),
    body: text(LIMITS.body),
    canon: z.enum(['provisional', 'kept']),
    state: text(40).optional(),
    clock: z
      .strictObject({
        size: z.union([z.literal(4), z.literal(6), z.literal(8)]),
        filled: z.number().int().min(0).max(8),
        doom: text(LIMITS.text),
      })
      .refine((c) => c.filled <= c.size)
      .optional(),
    card: text(LIMITS.card).optional(),
    veiled: topics,
    origin: z.enum(['prep', 'table', 'manual', 'import']),
    firstSessionId: id('ses').optional(),
    lastSessionId: id('ses').optional(),
    // Accepted but never trusted: restore recomputes both from the text.
    tokens: z.array(text(200)).max(10_000),
    wikiTargets: z.array(text(2 * MAX_TITLE_LENGTH)).max(2 * MAX_WIKI_TARGETS),
    createdAt: ts,
    updatedAt: ts,
  })
  .superRefine((e, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (e.subtype !== undefined && !SUBTYPES_BY_KIND[e.kind]?.includes(e.subtype)) bad('subtype');
    if (e.state !== undefined && !STATES_BY_KIND[e.kind]?.includes(e.state)) bad('state');
    if (e.state === undefined && STATES_BY_KIND[e.kind] !== undefined) bad('state missing');
    if ((e.clock !== undefined) !== (e.kind === 'front')) bad('clock');
    if (new Set(e.aliases).size !== e.aliases.length) bad('aliases');
  });

export const LinkSchema = z.strictObject({
  id: id('lnk'),
  campaignId: id('cmp'),
  fromId: id('ent'),
  toId: id('ent'),
  rel: z.enum(LINK_RELS),
  origin: z.enum(['wiki', 'explicit']),
  createdAt: ts,
});

const LEDGER_KINDS = [
  'session-start',
  'strong-start',
  'scene',
  'npc-improvised',
  'npc-used',
  'place-improvised',
  'place-used',
  'rumor',
  'clue-found',
  'complication',
  'item-given',
  'encounter',
  'oracle',
  'move',
  'stuck',
  'clock',
  'note',
  'session-end',
] as const;

const UndoSchema = z.strictObject({
  createdEntityIds: entIds.optional(),
  createdLinkIds: z.array(id('lnk')).max(5000).optional(),
  createdShortlistIds: z.array(id('sho')).max(5000).optional(),
  usedNameKeys: z.array(text(200)).max(5000).optional(),
  usedPocketIds: z.array(id('poc')).max(5000).optional(),
  clock: z.strictObject({ entityId: id('ent'), from: smallInt }).optional(),
  state: z.strictObject({ entityId: id('ent'), from: text(40) }).optional(),
  scene: z.strictObject({ from: text(200).optional() }).optional(),
});

export const LedgerSchema = z.strictObject({
  id: id('evt'),
  campaignId: id('cmp'),
  sessionId: id('ses'),
  at: ts,
  t: ts,
  kind: z.enum(LEDGER_KINDS),
  text: text(LIMITS.text),
  entityId: id('ent').optional(),
  review: z.enum(['none', 'ask', 'done']),
  undo: UndoSchema,
});

export const ShortlistSchema = z
  .strictObject({
    id: id('sho'),
    campaignId: id('cmp'),
    fromSessionId: id('ses'),
    entityId: id('ent').optional(),
    card: text(LIMITS.card).optional(),
    label: text(200),
    title: text(200),
    question: text(2000),
    yesLabel: text(200),
    status: z.enum(['open', 'fleshed', 'let-go']),
    deferrals: smallInt,
    createdAt: ts,
    decidedAt: ts.optional(),
  })
  .refine((s) => s.entityId !== undefined || s.card !== undefined, 'needs an entry or a card');

export const UsedNameSchema = z.strictObject({
  campaignId: id('cmp'),
  nameKey: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  cultureId: text(100),
  sessionId: id('ses'),
  entityId: id('ent').optional(),
  at: ts,
});

export const PocketSchema = z.strictObject({
  id: id('poc'),
  sessionId: id('ses'),
  campaignId: id('cmp'),
  section: z.enum(['names', 'npcs', 'places', 'rumors', 'loot', 'twists']),
  order: smallInt,
  locked: z.boolean(),
  card: text(LIMITS.card).optional(),
  name: z.strictObject({ name: text(200), cultureId: text(100) }).optional(),
  usedAt: ts.optional(),
  usedNote: text(2000).optional(),
  entityId: id('ent').optional(),
});

export const DraftSchema = z.strictObject({
  id: id('drf'),
  sessionId: id('ses'),
  campaignId: id('cmp'),
  step: z.number().int().min(0).max(20),
  kind: text(40),
  line: text(LIMITS.text),
  card: text(LIMITS.card).optional(),
  status: z.enum(['draft', 'kept', 'tossed']),
  entityId: id('ent').optional(),
  order: smallInt,
});

export const PrepAnswerSchema = z.strictObject({
  sessionId: id('ses'),
  campaignId: id('cmp'),
  step: z.number().int().min(0).max(20),
  answers: z
    .record(z.string().regex(ANSWER_KEY), text(LIMITS.text))
    .refine((r) => Object.keys(r).length <= 100 && noForbidden(Object.keys(r))),
  updatedAt: ts,
});

/** Max rows per store (D63); `shape.ts` enforces them before zod runs. */
export const ROW_CAPS = {
  sessions: 10_000,
  entities: 50_000,
  links: 200_000,
  ledger: 200_000,
  shortlist: 50_000,
  usedNames: 50_000,
  pocket: 50_000,
  drafts: 50_000,
  prepAnswers: 10_000,
} as const;

const ver = z.string().min(1).max(40);
export const BackupSchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(CURRENT_FORMAT),
  schemaVersion: z.literal(CURRENT_SCHEMA),
  appVersion: ver,
  packs: z.strictObject({ core: ver, fantasy: ver }),
  exportedAt: ts,
  campaign: CampaignSchema,
  sessions: z.array(SessionSchema).max(ROW_CAPS.sessions),
  entities: z.array(EntitySchema).max(ROW_CAPS.entities),
  links: z.array(LinkSchema).max(ROW_CAPS.links),
  ledger: z.array(LedgerSchema).max(ROW_CAPS.ledger),
  shortlist: z.array(ShortlistSchema).max(ROW_CAPS.shortlist),
  usedNames: z.array(UsedNameSchema).max(ROW_CAPS.usedNames),
  pocket: z.array(PocketSchema).max(ROW_CAPS.pocket),
  drafts: z.array(DraftSchema).max(ROW_CAPS.drafts),
  prepAnswers: z.array(PrepAnswerSchema).max(ROW_CAPS.prepAnswers),
});

export type Backup = {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  packs: { core: string; fantasy: string };
  exportedAt: number;
  campaign: Campaign;
  sessions: Session[];
  entities: Entity[];
  links: Link[];
  ledger: LedgerEvent[];
  shortlist: ShortlistItem[];
  usedNames: UsedName[];
  pocket: PocketItem[];
  drafts: Draft[];
  prepAnswers: PrepAnswer[];
};
