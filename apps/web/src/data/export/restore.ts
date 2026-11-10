import { parseCard, serializeCard } from '@prepdesk/engine';
import { CULTURES, lib } from '../../content/lib';
import { CAMPAIGN_STORES } from '../db';
import { RepoError } from '../deps';
import type { RepoDeps } from '../deps';
import type { Campaign, Entity, Link } from '../schema';
import { entityTokens } from '../text';
import { deriveWikiLinksInMemory } from './wikiLinks';
import { wikiTargets } from '../wiki';
import { BACKUP_FORMAT, BackupSchema, CURRENT_FORMAT, CURRENT_SCHEMA } from './schema';
import type { Backup } from './schema';
import { shapeOk } from './shape';
import { upgradeBackup } from './upgrade';

export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
/** Entities are re-derived this many at a time, then the page gets a turn. */
export const YIELD_EVERY = 200;

export type DroppedCard = {
  store: 'entities' | 'shortlist' | 'pocket' | 'drafts';
  id: string;
  title: string;
  /** 'card-removed': the text stays. 'record-dropped': the record had nothing but the card. */
  action: 'card-removed' | 'record-dropped';
};

declare const checked: unique symbol;
/**
 * A backup that `readBackup` has validated, cleaned and recomputed. `restoreBackup` accepts only
 * this type, so a hand-built or `buildBackup` object can't reach the device unchecked (m6).
 */
export type CheckedBackup = Backup & { readonly [checked]: true };

export type ReadResult =
  | {
      ok: true;
      backup: CheckedBackup;
      exists: boolean;
      /** The campaign's name on this device when `exists`, for the replace Dialog (m5). */
      existingName?: string;
      /** Unreadable cards, whether or not the record survived. Equals `droppedCards.length`. */
      dropped: number;
      droppedCards: DroppedCard[];
      /** Culture ids in the file this build doesn't have; they were removed from the campaign (I2). */
      droppedCultures: string[];
    }
  | { ok: false; error: 'too-big' | 'newer' | 'not-backup' };

export const RESTORE_MESSAGES: Record<'too-big' | 'newer' | 'not-backup', string> = {
  'too-big':
    'That file is too big to be a Prep Desk backup. Choose a .json file exported from Prep Desk.',
  newer: 'This backup was made by a newer Prep Desk. Update the app, then try again.',
  'not-backup': "That file isn't a Prep Desk backup. Choose a .json file exported from Prep Desk.",
};

/**
 * The status sentences that follow a restore when cards were left out (D63 step 9). Cards whose
 * record kept its text and records that held nothing but the card are told apart, so each sentence
 * is true. Empty when nothing was dropped.
 */
export function droppedMessage(list: readonly DroppedCard[]): string {
  const kept = list.filter((x) => x.action === 'card-removed').length;
  const lost = list.length - kept;
  const out: string[] = [];
  if (kept === 1) out.push("1 saved card couldn't be read and was left out. Your text is kept.");
  else if (kept > 1) {
    out.push(`${kept} saved cards couldn't be read and were left out. Your text is kept.`);
  }
  if (lost === 1) out.push('1 saved item had only an unreadable card, so it was left out.');
  else if (lost > 1) {
    out.push(`${lost} saved items had only an unreadable card, so they were left out.`);
  }
  return out.join(' ');
}

const fail = (error: 'too-big' | 'newer' | 'not-backup'): ReadResult => ({ ok: false, error });
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file);
  });
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Every id this file refers to must be in the file when the plan says so (D63 step 7). */
function relationsOk(b: Backup): boolean {
  const cid = b.campaign.id;
  const sessions = new Set(b.sessions.map((s) => s.id));
  const entities = new Set(b.entities.map((e) => e.id));
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  const rows = [
    b.sessions,
    b.entities,
    b.links,
    b.ledger,
    b.shortlist,
    b.usedNames,
    b.pocket,
    b.drafts,
    b.prepAnswers,
  ];
  if (!rows.every((list) => list.every((r) => r.campaignId === cid))) return false;
  if (!unique(b.sessions.map((r) => r.id)) || !unique(b.entities.map((r) => r.id))) return false;
  if (!unique(b.links.map((r) => r.id)) || !unique(b.ledger.map((r) => r.id))) return false;
  if (!unique(b.shortlist.map((r) => r.id)) || !unique(b.pocket.map((r) => r.id))) return false;
  if (!unique(b.drafts.map((r) => r.id))) return false;
  if (!unique(b.usedNames.map((r) => r.nameKey))) return false;
  if (!unique(b.prepAnswers.map((r) => `${r.sessionId}|${r.step}`))) return false;
  const inSessions = (id: string | undefined) => id === undefined || sessions.has(id);
  return (
    b.entities.every((e) => inSessions(e.firstSessionId) && inSessions(e.lastSessionId)) &&
    b.ledger.every((r) => sessions.has(r.sessionId)) &&
    b.shortlist.every((r) => sessions.has(r.fromSessionId)) &&
    b.usedNames.every((r) => sessions.has(r.sessionId)) &&
    b.pocket.every((r) => sessions.has(r.sessionId)) &&
    b.drafts.every((r) => sessions.has(r.sessionId)) &&
    b.prepAnswers.every((r) => sessions.has(r.sessionId)) &&
    b.links.every((l) => entities.has(l.fromId) && entities.has(l.toId))
  );
}

/** Ids the file mentions that a later undo, History or link lookup would follow, per store. */
function referencedIds(b: Backup) {
  const ent = new Set<string>();
  const lnk = new Set<string>();
  const sho = new Set<string>();
  const poc = new Set<string>();
  const add = (s: Set<string>, ...ids: (string | undefined)[]) =>
    ids.forEach((i) => i !== undefined && s.add(i));
  for (const e of b.entities) add(ent, e.id);
  for (const l of b.links) add(lnk, l.id);
  for (const r of b.shortlist) {
    add(sho, r.id);
    add(ent, r.entityId);
  }
  for (const r of b.pocket) {
    add(poc, r.id);
    add(ent, r.entityId);
  }
  for (const r of b.drafts) add(ent, r.entityId);
  for (const r of b.usedNames) add(ent, r.entityId);
  for (const s of b.sessions) {
    add(
      ent,
      ...s.presentPcIds,
      ...s.spotlightPcIds,
      ...s.sceneOrder,
      s.currentSceneId,
      s.focusEntityId,
    );
    add(ent, ...Object.keys(s.plannedTicks));
  }
  for (const r of b.ledger) {
    add(
      ent,
      r.entityId,
      ...(r.undo.createdEntityIds ?? []),
      r.undo.clock?.entityId,
      r.undo.state?.entityId,
    );
    add(lnk, ...(r.undo.createdLinkIds ?? []));
    add(sho, ...(r.undo.createdShortlistIds ?? []));
    add(poc, ...(r.undo.usedPocketIds ?? []));
  }
  return { ent, lnk, sho, poc };
}

/**
 * D63 step 8, and what keeps a dangling reference from reaching another campaign: no record id, and
 * no id the file merely refers to, may belong to a different campaign on this device. Read-only.
 */
export async function findCollision(d: RepoDeps, b: Backup): Promise<string | undefined> {
  const cid = b.campaign.id;
  const refs = referencedIds(b);
  const other = (r: { campaignId: string } | undefined) => r !== undefined && r.campaignId !== cid;
  const checks: [string, Promise<({ campaignId: string } | undefined)[]>][] = [
    ['sessions', d.db.sessions.bulkGet(b.sessions.map((r) => r.id))],
    ['entities', d.db.entities.bulkGet([...refs.ent])],
    ['links', d.db.links.bulkGet([...refs.lnk])],
    ['ledger', d.db.ledger.bulkGet(b.ledger.map((r) => r.id))],
    ['shortlist', d.db.shortlist.bulkGet([...refs.sho])],
    ['pocket', d.db.pocket.bulkGet([...refs.poc])],
    ['drafts', d.db.drafts.bulkGet(b.drafts.map((r) => r.id))],
    [
      'prepAnswers',
      d.db.prepAnswers.bulkGet(b.prepAnswers.map((r) => [r.sessionId, r.step] as [string, number])),
    ],
  ];
  for (const [store, p] of checks) if ((await p).some(other)) return store;
  return undefined;
}

/**
 * The card to store, or undefined when it can't be read. Hidden text (what a line kept off the
 * screen) is never stored (R65), so it is stripped from restored cards too; an untouched card keeps
 * its original string.
 */
function cleanCard(card: string): string | undefined {
  try {
    return cleanCardUnsafe(card);
  } catch {
    // A card that makes the engine throw (a 30,000-deep context, say) is an unreadable card.
    return undefined;
  }
}

function cleanCardUnsafe(card: string): string | undefined {
  const parsed = parseCard(lib, card);
  if (!parsed.ok) return undefined;
  const fields = Object.values(parsed.card.fields);
  if (!fields.some((f) => f.hidden !== undefined)) return card;
  const stripped: typeof parsed.card.fields = {};
  for (const [key, f] of Object.entries(parsed.card.fields)) {
    const copy = { ...f };
    delete copy.hidden;
    stripped[key] = copy;
  }
  return serializeCard({ ...parsed.card, fields: stripped });
}

/** D63 step 9. Returns a new backup; the text of every record stays. */
function sanitizeCards(b: Backup): { backup: Backup; dropped: DroppedCard[] } {
  const dropped: DroppedCard[] = [];
  const strip = <T extends { card?: string | undefined }>(r: T): T => {
    const rest: Record<string, unknown> = { ...r };
    delete rest['card'];
    return rest as T;
  };
  /** The row with its card cleaned, or undefined when the card is unreadable. */
  const clean = <T extends { card?: string | undefined }>(r: T): T | undefined => {
    if (r.card === undefined) return r;
    const c = cleanCard(r.card);
    if (c === undefined) return undefined;
    return c === r.card ? r : { ...r, card: c };
  };
  const entities = b.entities.map((e) => {
    const ok = clean(e);
    if (ok) return ok;
    dropped.push({ store: 'entities', id: e.id, title: e.title, action: 'card-removed' });
    return strip(e);
  });
  const shortlist: Backup['shortlist'] = [];
  for (const s of b.shortlist) {
    const ok = clean(s);
    if (ok) shortlist.push(ok);
    else if (s.entityId !== undefined) {
      dropped.push({ store: 'shortlist', id: s.id, title: s.title, action: 'card-removed' });
      shortlist.push(strip(s));
    } else dropped.push({ store: 'shortlist', id: s.id, title: s.title, action: 'record-dropped' });
  }
  const pocket: Backup['pocket'] = [];
  for (const p of b.pocket) {
    const ok = clean(p);
    if (ok) {
      pocket.push(ok);
      continue;
    }
    const title = p.name?.name ?? p.section;
    const stripped = strip(p);
    if (p.section === 'names' && p.name !== undefined) {
      dropped.push({ store: 'pocket', id: p.id, title, action: 'card-removed' });
      pocket.push(stripped);
    } else dropped.push({ store: 'pocket', id: p.id, title, action: 'record-dropped' });
  }
  const drafts = b.drafts.map((r) => {
    const ok = clean(r);
    if (ok) return ok;
    dropped.push({ store: 'drafts', id: r.id, title: r.line.slice(0, 80), action: 'card-removed' });
    return strip(r);
  });
  // A pocket names item with no name and a good card is fine; one with neither was dropped above.
  const keptPocket = pocket.filter(
    (p) => p.section !== 'names' || p.name !== undefined || p.card !== undefined,
  );
  return { backup: { ...b, entities, shortlist, pocket: keptPocket, drafts }, dropped };
}

/** D63 step 10 and the wiki-link rule (R65): derived data is rebuilt, never trusted. Yields to the page. */
async function recompute(d: RepoDeps, b: Backup): Promise<CheckedBackup> {
  const entities: Entity[] = [];
  for (let i = 0; i < b.entities.length; i++) {
    const e = b.entities[i]!;
    entities.push({ ...e, tokens: entityTokens(e), wikiTargets: wikiTargets(e) });
    if ((i + 1) % YIELD_EVERY === 0) await tick();
  }
  const links: Link[] = [...b.links.filter((l) => l.origin !== 'wiki')];
  links.push(...(await deriveWikiLinksInMemory(d, entities, b.links, tick, YIELD_EVERY)));
  links.sort((a, c) => (a.id < c.id ? -1 : a.id > c.id ? 1 : 0));
  // One link per (from, to, rel): explicit ones win over derived ones, then the smaller id.
  const seen = new Set<string>();
  const unique: Link[] = [];
  for (const l of [...links].sort(
    (a, c) => Number(a.origin === 'wiki') - Number(c.origin === 'wiki'),
  )) {
    const key = `${l.fromId}|${l.toId}|${l.rel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(l);
  }
  unique.sort((a, c) => (a.id < c.id ? -1 : a.id > c.id ? 1 : 0));
  return { ...b, entities, links: unique } as CheckedBackup;
}

/** Steps 1 to 10 of D63. Reads the device (collisions) but writes nothing. */
export async function readBackup(d: RepoDeps, file: Blob): Promise<ReadResult> {
  if (file.size > MAX_BACKUP_BYTES) return fail('too-big');
  let parsed: Backup;
  try {
    const raw: unknown = JSON.parse(await readText(file));
    if (!isObject(raw) || raw['format'] !== BACKUP_FORMAT) return fail('not-backup');
    const v = raw['formatVersion'];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return fail('not-backup');
    const sv = raw['schemaVersion'];
    if (v > CURRENT_FORMAT || (typeof sv === 'number' && sv > CURRENT_SCHEMA)) return fail('newer');
    if (!shapeOk(raw)) return fail('not-backup');
    const result = BackupSchema.safeParse(upgradeBackup(raw));
    if (!result.success) return fail('not-backup');
    parsed = result.data as Backup;
    if (!relationsOk(parsed)) return fail('not-backup');
  } catch {
    return fail('not-backup');
  }
  if ((await findCollision(d, parsed)) !== undefined) return fail('not-backup');
  const existing = await d.db.campaigns.get(parsed.campaign.id);
  try {
    const { cultureIds, droppedCultures } = reconcileCultures(parsed.campaign.cultureIds);
    const campaign = { ...parsed.campaign, cultureIds };
    const { backup, dropped } = sanitizeCards({ ...parsed, campaign });
    return {
      ok: true,
      backup: await recompute(d, backup),
      exists: existing !== undefined,
      ...(existing ? { existingName: existing.name } : {}),
      dropped: dropped.length,
      droppedCards: dropped,
      droppedCultures,
    };
  } catch {
    // Never throw into the UI: anything unexpected while cleaning means the file isn't usable.
    return fail('not-backup');
  }
}

/** Cultures this build lacks are removed; if none remain the campaign gets all of them (I2). */
function reconcileCultures(ids: readonly string[]): {
  cultureIds: string[];
  droppedCultures: string[];
} {
  const known = new Set(CULTURES.map((c) => c.id));
  const kept = ids.filter((id) => known.has(id));
  const droppedCultures = ids.filter((id) => !known.has(id));
  return {
    cultureIds: kept.length > 0 ? kept : CULTURES.map((c) => c.id),
    droppedCultures,
  };
}

/**
 * One `rw` transaction over all eleven stores: re-checks collisions (another tab may have written
 * since the read), deletes the campaign's rows if it exists, bulk-adds the backup, and makes it
 * current. Any failure rolls the whole device back to how it was.
 */
export async function restoreBackup(d: RepoDeps, backup: CheckedBackup): Promise<Campaign> {
  const tables = CAMPAIGN_STORES.map((s) => d.db.table(s));
  const cid = backup.campaign.id;
  return d.db.transaction('rw', [d.db.campaigns, d.db.settings, ...tables], async () => {
    if ((await findCollision(d, backup)) !== undefined) {
      throw new RepoError('conflict', 'Some of that backup belongs to another campaign here.');
    }
    for (const t of tables) await t.where('campaignId').equals(cid).delete();
    await d.db.campaigns.delete(cid);
    await d.db.campaigns.add(backup.campaign);
    await d.db.sessions.bulkAdd(backup.sessions);
    await d.db.entities.bulkAdd(backup.entities);
    await d.db.links.bulkAdd(backup.links);
    await d.db.ledger.bulkAdd(backup.ledger);
    await d.db.shortlist.bulkAdd(backup.shortlist);
    await d.db.usedNames.bulkAdd(backup.usedNames);
    await d.db.pocket.bulkAdd(backup.pocket);
    await d.db.drafts.bulkAdd(backup.drafts);
    await d.db.prepAnswers.bulkAdd(backup.prepAnswers);
    await d.db.settings.put({ key: 'currentCampaignId', value: cid });
    return backup.campaign;
  });
}
