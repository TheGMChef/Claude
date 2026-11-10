import Dexie from 'dexie';
import { normalizeName } from '@prepdesk/engine';
import type { RepoDeps } from '../deps';

const RECENT_USED = 200;

/**
 * The names the engine should steer away from (spec 5.2): the given names of the campaign's 200
 * newest used names, newest first, then every NPC title not already listed. The given name is the
 * first whitespace token. Repeats are compared with `normalizeName`.
 */
export async function avoidNamesFor(d: RepoDeps, cid: string): Promise<string[]> {
  const used = await d.db.usedNames
    .where('[campaignId+at]')
    .between([cid, Dexie.minKey], [cid, Dexie.maxKey])
    .reverse()
    .limit(RECENT_USED)
    .toArray();
  const npcs = await d.db.entities.where('[campaignId+kind]').equals([cid, 'npc']).toArray();
  npcs.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));

  const seen = new Set<string>();
  const out: string[] = [];
  const add = (name: string) => {
    const key = normalizeName(name);
    if (key === '' || seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };
  for (const u of used) add(u.name.trim().split(/\s+/)[0] ?? '');
  for (const n of npcs) add(n.title.trim());
  return out;
}
