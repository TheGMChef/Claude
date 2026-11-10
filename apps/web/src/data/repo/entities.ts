import { SAFETY_VOCABULARY } from '@prepdesk/engine';
import type { Card } from '@prepdesk/engine';
import { serializeCard } from '@prepdesk/engine';
import { RepoError } from '../deps';
import type { RepoDeps } from '../deps';
import { ENTITY_KINDS, STATES_BY_KIND, SUBTYPES_BY_KIND } from '../schema';
import type { Canon, Entity, EntityKind } from '../schema';
import { entityTokens, fold, validTitle } from '../text';
import {
  deriveWikiLinks,
  makeResolver,
  nameKeys,
  reresolveIncoming,
  rewriteTargets,
  wikiTargets,
} from '../wiki';

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
    wikiTargets: [],
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
  entity.wikiTargets = wikiTargets(entity);
  return entity;
}

const campaignEntities = (d: RepoDeps, cid: string) =>
  d.db.entities.where('campaignId').equals(cid).toArray();

/**
 * Inside the write transaction, after the row is stored: derives this entity's wiki links and, when
 * it is new or its title or aliases changed, re-derives every entity whose text names it (D56).
 */
async function afterWrite(d: RepoDeps, entity: Entity, before?: Entity): Promise<void> {
  const resolve = makeResolver(await campaignEntities(d, entity.campaignId));
  await deriveWikiLinks(d, entity, resolve);
  const keys = nameKeys(entity);
  const old = before ? nameKeys(before) : [];
  const same = before && keys.length === old.length && keys.every((k) => old.includes(k));
  if (!same) {
    await reresolveIncoming(
      d,
      entity.campaignId,
      [...new Set([...keys, ...old])],
      resolve,
      entity.id,
    );
  }
}

/**
 * D47 and D56. Inside a transaction: rewrites `[[Old]]` in every entity that mentions this one
 * from text and resolves the old title to it, stores the new title (old one added as an alias, plus
 * any other `rest` of the patch), then re-derives links.
 */
async function renameCore(
  d: RepoDeps,
  before: Entity,
  newTitle: string,
  rest: Partial<Omit<EntityInput, 'kind' | 'title'>>,
): Promise<Entity> {
  const title = cleanTitle(newTitle);
  const now = d.now();
  const oldKey = fold(before.title);
  const retitled = oldKey !== fold(title);
  const list = await campaignEntities(d, before.campaignId);
  const byId = new Map(list.map((e) => [e.id, e]));
  const resolveBefore = makeResolver(list);

  const rewritten: string[] = [];
  if (retitled) {
    const inbound = await d.db.links.where('toId').equals(before.id).toArray();
    const referrers = new Set(
      inbound.filter((l) => l.origin === 'wiki' && l.rel === 'mentions').map((l) => l.fromId),
    );
    for (const rid of referrers) {
      const r = byId.get(rid);
      // The old title must mean THIS entity from the referrer's side, not an older duplicate.
      if (!r || r.id === before.id || resolveBefore(oldKey, r.id)?.id !== before.id) continue;
      const body = rewriteTargets(r.body, before.title, title);
      const summary = rewriteTargets(r.summary, before.title, title);
      const fields = Object.fromEntries(
        Object.entries(r.fields).map(([k, v]) => [k, rewriteTargets(v, before.title, title)]),
      );
      const changed =
        body !== r.body ||
        summary !== r.summary ||
        Object.keys(fields).some((k) => fields[k] !== r.fields[k]);
      if (!changed) continue;
      await d.db.entities.put({ ...build(r.kind, { body, summary, fields }, r), updatedAt: now });
      rewritten.push(r.id);
    }
  }

  const aliases = [...(rest.aliases ?? before.aliases), ...(retitled ? [before.title] : [])];
  const next = { ...build(before.kind, { ...rest, title, aliases }, before), updatedAt: now };
  await d.db.entities.put(next);

  const resolve = makeResolver(await campaignEntities(d, before.campaignId));
  for (const rid of rewritten) {
    const r = await d.db.entities.get(rid);
    if (r) await deriveWikiLinks(d, r, resolve);
  }
  await deriveWikiLinks(d, next, resolve);
  const keys = [...new Set([...nameKeys(before), ...nameKeys(next)])];
  await reresolveIncoming(d, before.campaignId, keys, resolve, next.id);
  await d.db.campaigns.update(before.campaignId, { updatedAt: now });
  return (await d.db.entities.get(next.id)) as Entity;
}

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
    await afterWrite(d, entity);
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
    if (patch.title !== undefined && cleanTitle(patch.title) !== before.title) {
      const { title, ...rest } = patch;
      return renameCore(d, before, title, rest);
    }
    const now = d.now();
    const next = { ...build(before.kind, patch, before), updatedAt: now };
    await d.db.entities.put(next);
    await afterWrite(d, next, before);
    await touchCampaign(d, next.campaignId, now);
    return (await d.db.entities.get(id)) as Entity;
  });
}

/** Changes the title: rewrites `[[Old]]` links elsewhere and keeps the old title as an alias. */
export function renameEntity(d: RepoDeps, id: string, newTitle: string): Promise<Entity> {
  return d.db.transaction('rw', [d.db.entities, d.db.links, d.db.campaigns], async () => {
    const before = await d.db.entities.get(id);
    if (!before) throw new RepoError('not-found', 'That entry is gone.');
    return renameCore(d, before, newTitle, {});
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
      // Text is never rewritten, but a duplicate title elsewhere may now be what a link means.
      const resolve = makeResolver(await campaignEntities(d, e.campaignId));
      await reresolveIncoming(d, e.campaignId, nameKeys(e), resolve);
      await touchCampaign(d, e.campaignId, d.now());
    },
  );
}

export type CardOpts = {
  campaignId: string;
  subtype?: string;
  canon?: Canon;
  origin: Entity['origin'];
  /** The DM's own words, used as the title of a truth or scene. */
  text?: string;
  sessionId?: string;
};

/** A title the repository accepts: no brackets or bars, at most 200 characters, never empty. */
function titleFrom(raw: string): string {
  const t = raw
    .slice(0, 1000)
    .replace(/\[\[|\]\]/g, ' ')
    .replace(/\|/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '')
    .join(' ')
    .slice(0, LIMITS.title)
    .trim();
  return t === '' ? 'Untitled' : t;
}

/**
 * Spec 5.4: the pure mapping from a rolled card to an entity. Fields are copied one to one (a blocked
 * field is not), and from then on the entity's fields are the record (D4).
 */
export function entityFromCard(card: Card, kind: EntityKind, opts: CardOpts): EntityInput {
  const fields: Record<string, string> = {};
  for (const [key, f] of Object.entries(card.fields)) {
    if (f.blocked || FORBIDDEN_KEYS.has(key) || !FIELD_KEY.test(key)) continue;
    fields[key] = f.value.slice(0, LIMITS.text);
  }
  const display = card.display;
  const name = fields['name'];
  let title = display;
  let summary = display;
  if (kind === 'npc') {
    title = name ?? display;
    summary = fields['role'] ?? display;
  } else if (kind === 'place') {
    title = name ?? display;
    const tail = name !== undefined && display.startsWith(`${name}, `) ? name.length + 2 : -1;
    const cut = tail >= 0 ? tail : display.indexOf(', ') >= 0 ? display.indexOf(', ') + 2 : -1;
    summary = fields['kind'] ?? fields['size'] ?? (cut >= 0 ? display.slice(cut) : display);
  } else if (kind === 'truth' || kind === 'scene') {
    title = opts.text !== undefined && opts.text.trim() !== '' ? opts.text : display;
  }
  const input: EntityInput = {
    kind,
    title: titleFrom(title),
    summary: summary.slice(0, LIMITS.text),
    fields,
    card: serializeCard(card),
    veiled: [...card.flags.veiled],
    origin: opts.origin,
  };
  if (opts.subtype !== undefined) input.subtype = opts.subtype;
  if (opts.canon !== undefined) input.canon = opts.canon;
  if (opts.sessionId !== undefined) input.firstSessionId = opts.sessionId;
  return input;
}
