import type { RepoDeps } from '../deps';
import type { Entity, Link } from '../schema';
import { makeResolver } from '../wiki';

/**
 * R65: the `origin: 'wiki'` links of a restored campaign are derived from the text, never read from
 * the file. A link the file already had for the same target keeps its id and time (so a round trip
 * is exact); the rest are new, and file links the text no longer supports are gone.
 */
export async function deriveWikiLinksInMemory(
  d: RepoDeps,
  entities: readonly Entity[],
  fileLinks: readonly Link[],
  yieldNow: () => Promise<void>,
  every: number,
): Promise<Link[]> {
  const resolve = makeResolver(entities);
  const had = new Map<string, Link>();
  for (const l of fileLinks) {
    if (l.origin === 'wiki' && l.rel === 'mentions') had.set(`${l.fromId}|${l.toId}`, l);
  }
  const out: Link[] = [];
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    const seen = new Set<string>();
    for (const t of e.wikiTargets) {
      const hit = resolve(t, e.id);
      if (!hit || seen.has(hit.id)) continue;
      seen.add(hit.id);
      const old = had.get(`${e.id}|${hit.id}`);
      out.push(
        old ?? {
          id: d.newId('lnk'),
          campaignId: e.campaignId,
          fromId: e.id,
          toId: hit.id,
          rel: 'mentions',
          origin: 'wiki',
          createdAt: d.now(),
        },
      );
    }
    if ((i + 1) % every === 0) await yieldNow();
  }
  return out;
}
