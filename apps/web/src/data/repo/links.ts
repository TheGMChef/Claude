import { RepoError } from '../deps';
import type { RepoDeps } from '../deps';
import { LINK_RELS } from '../schema';
import type { Entity, Link, LinkRel } from '../schema';
import { fold } from '../text';

export async function addLink(
  d: RepoDeps,
  input: { campaignId: string; fromId: string; toId: string; rel: LinkRel },
): Promise<Link> {
  const { campaignId, fromId, toId, rel } = input;
  if (!LINK_RELS.includes(rel)) throw new RepoError('invalid', 'That is not a kind of link.');
  if (fromId === toId) throw new RepoError('invalid', "An entry can't link to itself.");
  return d.db.transaction('rw', [d.db.entities, d.db.links], async () => {
    const [from, to] = await Promise.all([d.db.entities.get(fromId), d.db.entities.get(toId)]);
    if (!from || !to) throw new RepoError('not-found', 'One of those entries is gone.');
    if (from.campaignId !== campaignId || to.campaignId !== campaignId) {
      throw new RepoError('invalid', 'Those entries belong to different campaigns.');
    }
    const dup = async (a: string, b: string) =>
      (await d.db.links.where('[fromId+rel]').equals([a, rel]).toArray()).some((l) => l.toId === b);
    if ((await dup(fromId, toId)) || (rel === 'knows' && (await dup(toId, fromId)))) {
      throw new RepoError('conflict', 'Those are already linked that way.');
    }
    const link: Link = {
      id: d.newId('lnk'),
      campaignId,
      fromId,
      toId,
      rel,
      origin: 'explicit',
      createdAt: d.now(),
    };
    await d.db.links.add(link);
    return link;
  });
}

/** Only explicit links: a wiki link would come back on the next save (D57). */
export async function removeLink(d: RepoDeps, id: string): Promise<void> {
  await d.db.transaction('rw', d.db.links, async () => {
    const l = await d.db.links.get(id);
    if (!l) throw new RepoError('not-found', 'That link is gone.');
    if (l.origin === 'wiki') {
      throw new RepoError('invalid', 'That link comes from the text. Edit the text to remove it.');
    }
    await d.db.links.delete(id);
  });
}

export type LinkGroup = {
  label: string;
  rel: LinkRel;
  dir: 'out' | 'in';
  items: { link: Link; entity: Entity; fromText: boolean }[];
};

// D57: the order the groups appear in, with the label each end reads.
const GROUPS: { rel: LinkRel; dir: 'out' | 'in'; label: string }[] = [
  { rel: 'points-to', dir: 'out', label: 'Points to' },
  { rel: 'points-to', dir: 'in', label: 'Pointed to by' },
  { rel: 'at', dir: 'out', label: 'At' },
  { rel: 'at', dir: 'in', label: 'Here' },
  { rel: 'part-of', dir: 'out', label: 'Part of' },
  { rel: 'part-of', dir: 'in', label: 'Has part' },
  { rel: 'knows', dir: 'out', label: 'Knows' },
  { rel: 'mentions', dir: 'out', label: 'Mentions' },
  { rel: 'mentions', dir: 'in', label: 'Mentioned by' },
];

export async function linkGroups(d: RepoDeps, entityId: string): Promise<LinkGroup[]> {
  const [out, inn] = await Promise.all([
    d.db.links.where('fromId').equals(entityId).toArray(),
    d.db.links.where('toId').equals(entityId).toArray(),
  ]);
  const ids = new Set([...out.map((l) => l.toId), ...inn.map((l) => l.fromId)]);
  const found = await d.db.entities.bulkGet([...ids]);
  const byId = new Map(found.filter((e): e is Entity => !!e).map((e) => [e.id, e]));

  const groups: LinkGroup[] = [];
  for (const g of GROUPS) {
    const picks: { link: Link; other: string }[] = [
      ...(g.dir === 'out' || g.rel === 'knows'
        ? out.filter((l) => l.rel === g.rel).map((l) => ({ link: l, other: l.toId }))
        : []),
      ...(g.dir === 'in' || g.rel === 'knows'
        ? inn.filter((l) => l.rel === g.rel).map((l) => ({ link: l, other: l.fromId }))
        : []),
    ];
    const seen = new Set<string>();
    const items: LinkGroup['items'] = [];
    for (const p of picks) {
      const entity = byId.get(p.other);
      if (!entity || seen.has(entity.id)) continue; // a missing end, or a symmetric repeat
      seen.add(entity.id);
      items.push({ link: p.link, entity, fromText: p.link.origin === 'wiki' });
    }
    items.sort(
      (a, b) =>
        fold(a.entity.title).localeCompare(fold(b.entity.title)) ||
        a.entity.id.localeCompare(b.entity.id),
    );
    if (items.length > 0) groups.push({ label: g.label, rel: g.rel, dir: g.dir, items });
  }
  return groups;
}
