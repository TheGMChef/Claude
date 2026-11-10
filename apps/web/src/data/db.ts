import Dexie from 'dexie';
import type { DexieOptions, EntityTable, Table } from 'dexie';
import type {
  Campaign,
  Draft,
  Entity,
  LedgerEvent,
  Link,
  PocketItem,
  PrepAnswer,
  SettingRow,
  Session,
  ShortlistItem,
  UsedName,
} from './schema';

/**
 * Schema version 1 (spec 5.1 with the D53 changes). FROZEN at the S2 merge: never edit this
 * object. A change is a new `STORES_V2` plus `version(2).stores(...).upgrade(...)` and a test in
 * `__tests__/migrations.test.ts` (spec 5.8).
 */
export const STORES_V1 = {
  campaigns: 'id, updatedAt',
  sessions: 'id, campaignId, [campaignId+number], [campaignId+status], status',
  entities: 'id, campaignId, [campaignId+kind], [campaignId+updatedAt], *tokens, *wikiTargets',
  links: 'id, campaignId, fromId, toId, [fromId+rel]',
  ledger: 'id, sessionId, campaignId, [sessionId+at], entityId',
  shortlist: 'id, campaignId, [campaignId+status], entityId',
  usedNames: '[campaignId+nameKey], campaignId, [campaignId+at]',
  pocket: 'id, sessionId, campaignId, [sessionId+section]',
  drafts: 'id, sessionId, campaignId, [sessionId+step], status',
  prepAnswers: '[sessionId+step], sessionId, campaignId',
  settings: 'key',
} as const;

export class PrepDeskDB extends Dexie {
  campaigns!: EntityTable<Campaign, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  entities!: EntityTable<Entity, 'id'>;
  links!: EntityTable<Link, 'id'>;
  ledger!: EntityTable<LedgerEvent, 'id'>;
  shortlist!: EntityTable<ShortlistItem, 'id'>;
  usedNames!: Table<UsedName, [string, string]>;
  pocket!: EntityTable<PocketItem, 'id'>;
  drafts!: EntityTable<Draft, 'id'>;
  prepAnswers!: Table<PrepAnswer, [string, number]>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name: string, opts?: DexieOptions) {
    super(name, opts);
    this.version(1).stores(STORES_V1);
  }
}

/** `opts` carries `indexedDB` / `IDBKeyRange` for S5's in-memory fallback (D26). */
export function createDb(name = 'prepdesk', opts?: DexieOptions): PrepDeskDB {
  return new PrepDeskDB(name, opts);
}

/** The stores that hold a campaign's data, each indexed by `campaignId` (delete and replace). */
export const CAMPAIGN_STORES = [
  'sessions',
  'entities',
  'links',
  'ledger',
  'shortlist',
  'usedNames',
  'pocket',
  'drafts',
  'prepAnswers',
] as const;

/**
 * Closes the connection when another tab upgrades the schema (`versionchange`), and reports
 * `blocked` once when this connection's open is still pending after `blockedAfterMs` because an
 * older tab keeps its connection. Returns a detach function.
 */
export function attachLifecycle(
  db: Dexie,
  on: { versionChange(): void; blocked(): void },
  blockedAfterMs = 3000,
): () => void {
  let blockedSeen = false;
  let elapsed = false;
  let reported = false;

  const check = () => {
    if (reported || !blockedSeen || !elapsed || db.isOpen()) return;
    reported = true;
    on.blocked();
  };
  const onVersionChange = () => {
    db.close();
    on.versionChange();
    return false; // we closed it ourselves; skip Dexie's default handler
  };
  const onBlocked = () => {
    blockedSeen = true;
    check();
  };
  const timer = setTimeout(() => {
    elapsed = true;
    check();
  }, blockedAfterMs);

  db.on('versionchange', onVersionChange);
  db.on('blocked', onBlocked);
  return () => {
    clearTimeout(timer);
    db.on('versionchange').unsubscribe(onVersionChange);
    db.on('blocked').unsubscribe(onBlocked);
  };
}
