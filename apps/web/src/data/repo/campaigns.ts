import { SAFETY_VOCABULARY, DEFAULT_LINES } from '@prepdesk/engine';
import { CULTURES } from '../../content/lib';
import { CAMPAIGN_STORES } from '../db';
import { RepoError } from '../deps';
import type { RepoDeps } from '../deps';
import type { Campaign, Safety } from '../schema';

const MAX_NAME = 120;

function cleanName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > MAX_NAME) {
    throw new RepoError('invalid', `A campaign name is 1 to ${MAX_NAME} characters.`);
  }
  return name;
}

function unique(list: readonly string[]): string[] {
  return [...new Set(list)];
}

/** Validates topics against the vocabulary, removes duplicates and moves a line out of the veils. */
export function normalizeSafety(safety: Safety): Safety {
  for (const topic of [...safety.lines, ...safety.veils]) {
    if (!SAFETY_VOCABULARY.includes(topic)) {
      throw new RepoError('invalid', `"${topic}" is not a safety topic.`);
    }
  }
  const lines = unique(safety.lines);
  const veils = unique(safety.veils).filter((t) => !lines.includes(t));
  return { lines, veils };
}

function cleanCultures(ids: readonly string[]): string[] {
  const known = new Set(CULTURES.map((c) => c.id));
  const list = unique(ids);
  if (list.length < 1) throw new RepoError('invalid', 'Pick at least one culture.');
  for (const id of list) {
    if (!known.has(id)) throw new RepoError('invalid', `"${id}" is not a culture.`);
  }
  return list;
}

export async function createCampaign(
  d: RepoDeps,
  input: { name: string; safety?: Safety; cultureIds?: string[] },
): Promise<Campaign> {
  const name = cleanName(input.name);
  const safety = normalizeSafety(input.safety ?? { lines: [...DEFAULT_LINES], veils: [] });
  const cultureIds = cleanCultures(input.cultureIds ?? CULTURES.map((c) => c.id));
  return d.db.transaction('rw', d.db.campaigns, d.db.settings, async () => {
    const now = d.now();
    const campaign: Campaign = {
      id: d.newId('cmp'),
      name,
      genre: 'fantasy',
      safety,
      cultureIds,
      createdAt: now,
      updatedAt: now,
    };
    await d.db.campaigns.add(campaign);
    await d.db.settings.put({ key: 'currentCampaignId', value: campaign.id });
    return campaign;
  });
}

async function change(
  d: RepoDeps,
  cid: string,
  patch: (c: Campaign) => Partial<Campaign>,
  touch = true,
): Promise<Campaign> {
  return d.db.transaction('rw', d.db.campaigns, async () => {
    const current = await d.db.campaigns.get(cid);
    if (!current) throw new RepoError('not-found', 'That campaign is gone.');
    const next: Campaign = {
      ...current,
      ...patch(current),
      ...(touch ? { updatedAt: d.now() } : {}),
    };
    await d.db.campaigns.put(next);
    return next;
  });
}

export async function renameCampaign(d: RepoDeps, cid: string, name: string): Promise<Campaign> {
  const clean = cleanName(name);
  return change(d, cid, () => ({ name: clean }));
}

export async function setSafety(d: RepoDeps, cid: string, safety: Safety): Promise<Campaign> {
  const clean = normalizeSafety(safety);
  return change(d, cid, () => ({ safety: clean }));
}

export async function setCultures(d: RepoDeps, cid: string, ids: string[]): Promise<Campaign> {
  const clean = cleanCultures(ids);
  return change(d, cid, () => ({ cultureIds: clean }));
}

/** Stamps `lastExportedAt` only: an export is not an edit, so `updatedAt` stays. */
export async function markExported(d: RepoDeps, cid: string): Promise<Campaign> {
  return change(d, cid, () => ({ lastExportedAt: d.now() }), false);
}

/** One transaction: the campaign row plus every row of that campaign in every data store. */
export async function deleteCampaign(d: RepoDeps, cid: string): Promise<void> {
  const tables = CAMPAIGN_STORES.map((s) => d.db.table(s));
  await d.db.transaction('rw', [d.db.campaigns, d.db.settings, ...tables], async () => {
    if (!(await d.db.campaigns.get(cid)))
      throw new RepoError('not-found', 'That campaign is gone.');
    for (const t of tables) await t.where('campaignId').equals(cid).delete();
    await d.db.campaigns.delete(cid);
    const current = await d.db.settings.get('currentCampaignId');
    if (current?.value === cid) {
      const next = await d.db.campaigns.orderBy('updatedAt').last();
      if (next) await d.db.settings.put({ key: 'currentCampaignId', value: next.id });
      else await d.db.settings.delete('currentCampaignId');
    }
  });
}

export async function campaignCounts(
  d: RepoDeps,
  cid: string,
): Promise<{ sessions: number; entities: number }> {
  const [sessions, entities] = await Promise.all([
    d.db.sessions.where('campaignId').equals(cid).count(),
    d.db.entities.where('campaignId').equals(cid).count(),
  ]);
  return { sessions, entities };
}
