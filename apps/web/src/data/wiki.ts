import type { RepoDeps } from './deps';
import type { Entity, Link } from './schema';
import { MAX_TITLE_LENGTH, fold } from './text';

export type WikiPart = { text: string } | { target: string; shown: string; raw: string };

/** Most distinct targets one entity can carry; bounds the index row and the work per save. */
export const MAX_WIKI_TARGETS = 200;

const OPEN = 91; // [
const CLOSE = 93; // ]

/**
 * Splits text into plain parts and `[[Target]]` / `[[Target|shown]]` links in ONE forward pass: it
 * remembers only the latest `[[` and, at a `]]`, closes that one. So nested and unclosed input is
 * linear (no rescans, no regex). A link whose target is empty or longer than a title stays text.
 * Joining every part's `text` or `raw` gives the input back exactly.
 */
export function parseWiki(s: string): WikiPart[] {
  const parts: WikiPart[] = [];
  const n = s.length;
  let textStart = 0;
  let open = -1;
  let i = 0;
  while (i < n - 1) {
    const c = s.charCodeAt(i);
    if (c === OPEN && s.charCodeAt(i + 1) === OPEN) {
      open = i;
      i += 1;
    } else if (c === CLOSE && s.charCodeAt(i + 1) === CLOSE && open >= 0) {
      const inner = s.slice(open + 2, i);
      const pipe = inner.indexOf('|');
      const target = (pipe < 0 ? inner : inner.slice(0, pipe)).trim();
      if (target !== '' && target.length <= MAX_TITLE_LENGTH) {
        const shown = pipe < 0 ? '' : inner.slice(pipe + 1).trim();
        if (open > textStart) parts.push({ text: s.slice(textStart, open) });
        parts.push({ target, shown: shown === '' ? target : shown, raw: s.slice(open, i + 2) });
        textStart = i + 2;
      }
      open = -1;
      i += 2;
    } else {
      i += 1;
    }
  }
  if (textStart < n) parts.push({ text: s.slice(textStart) });
  return parts;
}

/** The text the parser reads (D56): body, summary and every field value, each parsed on its own. */
function wikiStrings(e: Pick<Entity, 'body' | 'fields' | 'summary'>): string[] {
  return [e.body, e.summary, ...Object.values(e.fields)];
}

/** Folded, distinct targets in an entity's text, in first-seen order, resolved or not. */
export function wikiTargets(e: Pick<Entity, 'body' | 'fields' | 'summary'>): string[] {
  const seen = new Set<string>();
  for (const s of wikiStrings(e)) {
    for (const p of parseWiki(s)) {
      if (!('target' in p)) continue;
      seen.add(fold(p.target));
      if (seen.size >= MAX_WIKI_TARGETS) return [...seen];
    }
  }
  return [...seen];
}

/** `[[Old]]` and `[[Old|shown]]` become `[[New]]` and `[[New|shown]]`; Old matches by folded text. */
export function rewriteTargets(s: string, oldTitle: string, newTitle: string): string {
  const key = fold(oldTitle);
  let changed = false;
  const out = parseWiki(s).map((p) => {
    if ('text' in p) return p.text;
    if (fold(p.target) !== key) return p.raw;
    changed = true;
    const pipe = p.raw.indexOf('|');
    return pipe < 0 ? `[[${newTitle}]]` : `[[${newTitle}${p.raw.slice(pipe)}`;
  });
  return changed ? out.join('') : s;
}

export type Resolver = (target: string, selfId?: string) => Entity | undefined;

const oldest = (a: Entity, b: Entity) =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Resolution (D56) over one campaign's entities: the oldest entity whose folded title equals the
 * folded target, else the oldest whose folded alias does; the entity itself is skipped.
 */
export function makeResolver(entities: readonly Entity[]): Resolver {
  const titles = new Map<string, Entity[]>();
  const aliases = new Map<string, Entity[]>();
  const push = (m: Map<string, Entity[]>, key: string, e: Entity) => {
    const list = m.get(key);
    if (list) list.push(e);
    else m.set(key, [e]);
  };
  for (const e of [...entities].sort(oldest)) {
    push(titles, fold(e.title), e);
    for (const a of new Set(e.aliases.map(fold))) push(aliases, a, e);
  }
  return (target, selfId) => {
    const key = fold(target);
    return (
      titles.get(key)?.find((e) => e.id !== selfId) ??
      aliases.get(key)?.find((e) => e.id !== selfId)
    );
  };
}

export function resolveTarget(
  entities: readonly Entity[],
  target: string,
  selfId?: string,
): Entity | undefined {
  return makeResolver(entities)(target, selfId);
}

/** The folded title and aliases an entity answers to. */
export function nameKeys(e: Pick<Entity, 'title' | 'aliases'>): string[] {
  return [...new Set([fold(e.title), ...e.aliases.map(fold)])];
}

/**
 * Inside a transaction (entities and links): makes this entity's `origin: 'wiki'` mentions links
 * match its stored `wikiTargets`. Links to unchanged targets keep their ids.
 */
export async function deriveWikiLinks(
  d: RepoDeps,
  entity: Entity,
  resolve: Resolver,
): Promise<void> {
  const want = new Set<string>();
  for (const t of entity.wikiTargets) {
    const hit = resolve(t, entity.id);
    if (hit) want.add(hit.id);
  }
  const existing: Link[] = (
    await d.db.links.where('[fromId+rel]').equals([entity.id, 'mentions']).toArray()
  ).filter((l) => l.origin === 'wiki');
  const have = new Set<string>();
  const drop: string[] = [];
  for (const l of existing) {
    if (want.has(l.toId) && !have.has(l.toId)) have.add(l.toId);
    else drop.push(l.id);
  }
  if (drop.length > 0) await d.db.links.bulkDelete(drop);
  const now = d.now();
  const add: Link[] = [];
  for (const toId of want) {
    if (have.has(toId)) continue;
    add.push({
      id: d.newId('lnk'),
      campaignId: entity.campaignId,
      fromId: entity.id,
      toId,
      rel: 'mentions',
      origin: 'wiki',
      createdAt: now,
    });
  }
  if (add.length > 0) await d.db.links.bulkAdd(add);
}

/**
 * Re-derives the links of every entity in the campaign whose text targets one of `keys`, without
 * rewriting the entity row (D56: create, rename, alias change and delete of the entity they name).
 */
export async function reresolveIncoming(
  d: RepoDeps,
  campaignId: string,
  keys: readonly string[],
  resolve: Resolver,
  skipId?: string,
): Promise<void> {
  if (keys.length === 0) return;
  const rows = await d.db.entities
    .where('wikiTargets')
    .anyOf([...keys])
    .toArray();
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.campaignId !== campaignId || r.id === skipId || seen.has(r.id)) continue;
    seen.add(r.id);
    await deriveWikiLinks(d, r, resolve);
  }
}
