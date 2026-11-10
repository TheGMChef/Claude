import { SAFETY_VOCABULARY } from '@prepdesk/engine';
import { RepoError } from '../deps';
import type { RepoDeps } from '../deps';
import { ENTITY_KINDS, STATES_BY_KIND, SUBTYPES_BY_KIND } from '../schema';
import type { Canon, Entity, EntityKind } from '../schema';
import { entityTokens, fold, validTitle } from '../text';

export type EntityInput = {
  kind: EntityKind;
  subtype?: string;
  title: string;
  summary?: string;
  aliases?: string[];
  fields?: Record<string, string>;
  body?: string;
  canon?: Canon;
  state?: string;
  clock?: Entity['clock'];
  origin?: Entity['origin'];
  card?: string;
  veiled?: string[];
  firstSessionId?: string;
};

/** Caps shared with the backup schema (D63). */
export const LIMITS = {
  title: 200,
  text: 20_000,
  body: 200_000,
  aliases: 50,
  fields: 100,
  card: 200_000,
} as const;

const FIELD_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CLOCK_SIZES = [4, 6, 8] as const;
const ORIGINS = ['prep', 'table', 'manual', 'import'] as const;

const invalid = (message: string) => new RepoError('invalid', message);

function cleanText(value: unknown, max: number, what: string): string {
  if (typeof value !== 'string') throw invalid(`${what} has to be text.`);
  if (value.length > max) throw invalid(`${what} is too long.`);
  return value;
}

function cleanTitle(raw: unknown): string {
  const title = typeof raw === 'string' ? validTitle(raw) : null;
  if (title === null) {
    throw invalid("Titles can't be empty, can't contain [[, ]] or |, and stop at 200 characters.");
  }
  return title;
}

function cleanAliases(raw: unknown, title: string): string[] {
  if (!Array.isArray(raw)) throw invalid('Aliases have to be a list.');
  if (raw.length > LIMITS.aliases) throw invalid(`An entry has at most ${LIMITS.aliases} aliases.`);
  const seen = new Set([fold(title)]);
  const out: string[] = [];
  for (const a of raw) {
    const alias = cleanTitle(a);
    const key = fold(alias);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out;
}

function cleanFields(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw invalid('Fields have to be an object.');
  }
  const keys = Object.keys(raw);
  if (keys.length > LIMITS.fields) throw invalid('Too many fields on one entry.');
  const out: Record<string, string> = {};
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key) || !FIELD_KEY.test(key)) {
      throw invalid(`"${key}" is not a usable field name.`);
    }
    out[key] = cleanText((raw as Record<string, unknown>)[key], LIMITS.text, `Field ${key}`);
  }
  return out;
}

function cleanClock(raw: Entity['clock']): NonNullable<Entity['clock']> {
  if (!raw || !(CLOCK_SIZES as readonly number[]).includes(raw.size)) {
    throw invalid('A clock has 4, 6 or 8 segments.');
  }
  if (!Number.isInteger(raw.filled)) throw invalid('A clock fills in whole segments.');
  return {
    size: raw.size,
    filled: Math.min(raw.size, Math.max(0, raw.filled)),
    doom: cleanText(raw.doom, LIMITS.text, 'The clock text'),
  };
}

function cleanVeiled(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw invalid('Veils have to be a list.');
  for (const t of raw) {
    if (typeof t !== 'string' || !SAFETY_VOCABULARY.includes(t)) {
      throw invalid('That is not a safety topic.');
    }
  }
  return [...new Set(raw as string[])];
}

/** Checks everything that depends on the kind and returns the parts of `Entity` the input decides. */
function build(kind: EntityKind, input: Partial<Omit<EntityInput, 'kind'>>, base?: Entity): Entity {
  const title = cleanTitle(input.title ?? base?.title);
  const subtype = input.subtype ?? base?.subtype;
  if (subtype !== undefined && !SUBTYPES_BY_KIND[kind]?.includes(subtype)) {
    throw invalid(`A ${kind} can't be a "${subtype}".`);
  }
  const states = STATES_BY_KIND[kind];
  const state = input.state ?? base?.state ?? states?.[0];
  if (state !== undefined && !states?.includes(state)) {
    throw invalid(`A ${kind} can't be "${state}".`);
  }
  if (input.clock !== undefined && kind !== 'front') throw invalid('Only fronts have a clock.');
  const clock =
    kind === 'front'
      ? cleanClock(input.clock ?? base?.clock ?? { size: 6, filled: 0, doom: '' })
      : undefined;
  const origin = input.origin ?? base?.origin ?? 'manual';
  if (!ORIGINS.includes(origin)) throw invalid('That origin is not known.');
  const canon = input.canon ?? base?.canon ?? 'kept';
  if (canon !== 'kept' && canon !== 'provisional') throw invalid('Canon is kept or provisional.');
  const card = input.card ?? base?.card;
  const firstSessionId = input.firstSessionId ?? base?.firstSessionId;

  const entity: Entity = {
    id: base?.id ?? '',
    campaignId: base?.campaignId ?? '',
    kind,
    title,
    aliases: cleanAliases(input.aliases ?? base?.aliases ?? [], title),
    summary: cleanText(input.summary ?? base?.summary ?? '', LIMITS.text, 'The summary'),
    fields: cleanFields(input.fields ?? base?.fields ?? {}),
    body: cleanText(input.body ?? base?.body ?? '', LIMITS.body, 'The body'),
    canon,
    veiled: cleanVeiled(input.veiled ?? base?.veiled ?? []),
    origin,
    tokens: [],
    wikiTargets: base?.wikiTargets ?? [],
    createdAt: base?.createdAt ?? 0,
    updatedAt: 0,
  };
  if (subtype !== undefined) entity.subtype = subtype;
  if (state !== undefined) entity.state = state;
  if (clock !== undefined) entity.clock = clock;
  if (card !== undefined) entity.card = cleanText(card, LIMITS.card, 'The saved card');
  if (firstSessionId !== undefined) entity.firstSessionId = firstSessionId;
  if (base?.lastSessionId !== undefined) entity.lastSessionId = base.lastSessionId;
  entity.tokens = entityTokens(entity);
  return entity;
}

/**
 * The seam Task 5 fills: runs inside the write transaction after the entity row is stored, to derive
 * wiki links and re-resolve incoming ones.
 */
export type WriteChange = { created: boolean; titlesChanged: boolean };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function afterWrite(_d: RepoDeps, _entity: Entity, _change: WriteChange): Promise<void> {}

async function touchCampaign(d: RepoDeps, cid: string, now: number): Promise<void> {
  await d.db.campaigns.update(cid, { updatedAt: now });
}

export function createEntity(d: RepoDeps, cid: string, input: EntityInput): Promise<Entity> {
  if (!(ENTITY_KINDS as readonly string[]).includes(input.kind)) {
    return Promise.reject(invalid(`"${String(input.kind)}" is not a kind of entry.`));
  }
  return d.db.transaction('rw', [d.db.entities, d.db.links, d.db.campaigns], async () => {
    if (!(await d.db.campaigns.get(cid)))
      throw new RepoError('not-found', 'That campaign is gone.');
    const { kind, ...rest } = input;
    const now = d.now();
    const entity = {
      ...build(kind, rest),
      id: d.newId('ent'),
      campaignId: cid,
      createdAt: now,
      updatedAt: now,
    };
    await d.db.entities.add(entity);
    await afterWrite(d, entity, { created: true, titlesChanged: true });
    await touchCampaign(d, cid, now);
    return (await d.db.entities.get(entity.id)) as Entity;
  });
}

export function updateEntity(
  d: RepoDeps,
  id: string,
  patch: Partial<Omit<EntityInput, 'kind'>>,
): Promise<Entity> {
  return d.db.transaction('rw', [d.db.entities, d.db.links, d.db.campaigns], async () => {
    const before = await d.db.entities.get(id);
    if (!before) throw new RepoError('not-found', 'That entry is gone.');
    const now = d.now();
    const next = { ...build(before.kind, patch, before), updatedAt: now };
    await d.db.entities.put(next);
    const titlesChanged =
      next.title !== before.title || next.aliases.join('\u0000') !== before.aliases.join('\u0000');
    await afterWrite(d, next, { created: false, titlesChanged });
    await touchCampaign(d, next.campaignId, now);
    return (await d.db.entities.get(id)) as Entity;
  });
}

export function getEntity(d: RepoDeps, id: string): Promise<Entity | undefined> {
  return d.db.entities.get(id);
}

export function listEntities(d: RepoDeps, cid: string): Promise<Entity[]> {
  return d.db.entities.where('campaignId').equals(cid).toArray();
}

/** Sets the filled segments, clamped to 0..size. Not an edit worth a Ledger line (spec 5.7). */
export function setClock(d: RepoDeps, id: string, filled: number): Promise<void> {
  return d.db.transaction('rw', [d.db.entities, d.db.campaigns], async () => {
    const e = await d.db.entities.get(id);
    if (!e) throw new RepoError('not-found', 'That entry is gone.');
    if (!e.clock) throw invalid('Only fronts have a clock.');
    if (!Number.isInteger(filled)) throw invalid('A clock fills in whole segments.');
    const now = d.now();
    const clock = { ...e.clock, filled: Math.min(e.clock.size, Math.max(0, filled)) };
    await d.db.entities.put({ ...e, clock, updatedAt: now });
    await touchCampaign(d, e.campaignId, now);
  });
}

/** One transaction: the entry's links, shortlist rows and the entry. The Ledger is kept (D8). */
export function deleteEntity(d: RepoDeps, id: string): Promise<void> {
  return d.db.transaction(
    'rw',
    [d.db.entities, d.db.links, d.db.shortlist, d.db.campaigns],
    async () => {
      const e = await d.db.entities.get(id);
      if (!e) throw new RepoError('not-found', 'That entry is gone.');
      await d.db.links.where('fromId').equals(id).delete();
      await d.db.links.where('toId').equals(id).delete();
      await d.db.shortlist.where('entityId').equals(id).delete();
      await d.db.entities.delete(id);
      await touchCampaign(d, e.campaignId, d.now());
    },
  );
}
