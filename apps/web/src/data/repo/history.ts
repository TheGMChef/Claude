import type { RepoDeps } from '../deps';
import type { LedgerEvent } from '../schema';

export type HistoryPage = {
  events: LedgerEvent[];
  hasMore: boolean;
  /** Pass as `before` to get the next page. */
  next?: number;
};

/**
 * The Ledger events that name an entity (spec 5.7), newest first. `before` is the `at` of the last
 * event of the previous page. A page never ends inside a run of equal timestamps (it runs a little
 * long instead), so no event is skipped between pages. Reads by `entityId` and sorts in memory,
 * because schema v1 has no `[entityId+at]` index.
 */
export async function historyFor(
  d: RepoDeps,
  entityId: string,
  opts: { limit?: number; before?: number } = {},
): Promise<HistoryPage> {
  const limit = Math.max(1, Math.floor(opts.limit ?? 50));
  const rows = await d.db.ledger.where('entityId').equals(entityId).toArray();
  const all = rows
    .filter((e) => opts.before === undefined || e.at < opts.before)
    .sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  let end = Math.min(limit, all.length);
  while (end < all.length && all[end]!.at === all[end - 1]!.at) end += 1;
  const events = all.slice(0, end);
  if (events.length === 0) return { events, hasMore: false };
  return { events, hasMore: end < all.length, next: events[events.length - 1]!.at };
}
