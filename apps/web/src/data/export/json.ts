import { lib } from '../../content/lib';
import { CAMPAIGN_STORES } from '../db';
import { RepoError } from '../deps';
import type { RepoDeps } from '../deps';
import { markExported } from '../repo/campaigns';
import { fold } from '../text';
import { BACKUP_FORMAT, CURRENT_FORMAT, CURRENT_SCHEMA } from './schema';
import type { Backup } from './schema';

const packVersion = (id: string): string => lib.packs.find((p) => p.id === id)?.version ?? '0.0.0';

const byId = <T extends { id: string }>(rows: T[]) =>
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Every row of one campaign, read in one read transaction, sorted by key (spec 5.9). */
export async function buildBackup(d: RepoDeps, cid: string): Promise<Backup> {
  const tables = CAMPAIGN_STORES.map((s) => d.db.table(s));
  return d.db.transaction('r', [d.db.campaigns, ...tables], async () => {
    const campaign = await d.db.campaigns.get(cid);
    if (!campaign) throw new RepoError('not-found', 'That campaign is gone.');
    const rows = async <T>(store: (typeof CAMPAIGN_STORES)[number]) =>
      (await d.db.table(store).where('campaignId').equals(cid).toArray()) as T[];
    const usedNames = await rows<Backup['usedNames'][number]>('usedNames');
    const prepAnswers = await rows<Backup['prepAnswers'][number]>('prepAnswers');
    return {
      format: BACKUP_FORMAT,
      formatVersion: CURRENT_FORMAT,
      schemaVersion: CURRENT_SCHEMA,
      appVersion: __APP_VERSION__,
      packs: { core: packVersion('core'), fantasy: packVersion('fantasy') },
      exportedAt: d.now(),
      campaign,
      sessions: byId(await rows<Backup['sessions'][number]>('sessions')),
      entities: byId(await rows<Backup['entities'][number]>('entities')),
      links: byId(await rows<Backup['links'][number]>('links')),
      ledger: byId(await rows<Backup['ledger'][number]>('ledger')),
      shortlist: byId(await rows<Backup['shortlist'][number]>('shortlist')),
      usedNames: usedNames.sort((a, b) =>
        a.nameKey < b.nameKey ? -1 : a.nameKey > b.nameKey ? 1 : 0,
      ),
      pocket: byId(await rows<Backup['pocket'][number]>('pocket')),
      drafts: byId(await rows<Backup['drafts'][number]>('drafts')),
      prepAnswers: prepAnswers.sort((a, b) =>
        a.sessionId === b.sessionId ? a.step - b.step : a.sessionId < b.sessionId ? -1 : 1,
      ),
    };
  });
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `prepdesk-<slug>-<yyyy-mm-dd>.<ext>`: slug is folded ASCII words joined by "-", at most 40 (D65). */
export function exportName(campaign: { name: string }, ext: 'json' | 'zip', date: Date): string {
  const slug = fold(campaign.name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '')
    .join('-')
    .slice(0, 40)
    .replace(/-+$/, '');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `prepdesk-${slug === '' ? 'campaign' : slug}-${day}.${ext}`;
}

/** Long enough for the browser to start reading the object URL before it is revoked. */
export const REVOKE_DELAY_MS = 10_000;

/**
 * Saves a blob through an object URL and an `<a download>` click. The URL is revoked on a timer even
 * if the click throws, and the anchor is always removed. No worker, no eval, no inline code.
 */
export function downloadFile(name: string, blob: Blob): void {
  const safe = [...name]
    .map((c) => (/[/\\:*?"<>|]/.test(c) || c.charCodeAt(0) < 32 ? '-' : c))
    .join('');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe;
  a.rel = 'noopener';
  a.style.display = 'none';
  try {
    document.body.appendChild(a);
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}

/** Build, download, and only then stamp `lastExportedAt` (D65). */
export async function exportJson(d: RepoDeps, cid: string): Promise<void> {
  const backup = await buildBackup(d, cid);
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  downloadFile(exportName(backup.campaign, 'json', new Date(d.now())), blob);
  await markExported(d, cid);
}
