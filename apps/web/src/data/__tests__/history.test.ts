import { describe, expect, it } from 'vitest';
import { seedCampaign, testDeps } from '../../test/fixtures';
import { historyFor } from '../repo/history';
import type { LedgerEvent } from '../schema';

const event = (n: number, entityId: string, at: number): LedgerEvent => ({
  id: `evt_${String(n).padStart(16, '0')}`,
  campaignId: 'cmp_1',
  sessionId: 'ses_1',
  at,
  t: 0,
  kind: 'note',
  text: `event ${n}`,
  entityId,
  review: 'none',
  undo: {},
});

describe('historyFor', () => {
  it('pages one entity newest first, 50 at a time, never including another entity', async () => {
    const d = testDeps();
    await seedCampaign(d);
    const rows: LedgerEvent[] = [];
    for (let i = 0; i < 100; i++) rows.push(event(i, 'ent_a', 1000 + i * 10));
    for (let i = 0; i < 20; i++) rows.push(event(200 + i, 'ent_b', 1005 + i * 50));
    await d.db.ledger.bulkAdd(rows);

    const p1 = await historyFor(d, 'ent_a');
    expect(p1.events).toHaveLength(50);
    expect(p1.hasMore).toBe(true);
    expect(p1.events[0]!.at).toBe(1990);
    expect(p1.events.every((e) => e.entityId === 'ent_a')).toBe(true);
    expect(p1.events.map((e) => e.at)).toEqual(
      [...p1.events.map((e) => e.at)].sort((a, b) => b - a),
    );

    const p2 = await historyFor(d, 'ent_a', { before: p1.next });
    expect(p2.events).toHaveLength(50);
    expect(p2.hasMore).toBe(false);
    expect(p2.events[0]!.at).toBeLessThan(p1.events.at(-1)!.at);
    expect(p2.events.at(-1)!.at).toBe(1000);

    const b = await historyFor(d, 'ent_b', { limit: 8 });
    expect(b.events).toHaveLength(8);
    const b2 = await historyFor(d, 'ent_b', { limit: 8, before: b.next });
    const b3 = await historyFor(d, 'ent_b', { limit: 8, before: b2.next });
    expect(b3.events).toHaveLength(4);
    expect(b3.hasMore).toBe(false);
    const all = [...b.events, ...b2.events, ...b3.events];
    expect(new Set(all.map((e) => e.id)).size).toBe(20);
  });

  it('keeps events that share a timestamp across a page boundary', async () => {
    const d = testDeps();
    await seedCampaign(d);
    await d.db.ledger.bulkAdd(Array.from({ length: 7 }, (_, i) => event(i, 'ent_a', 500)));
    await d.db.ledger.bulkAdd([event(50, 'ent_a', 400), event(51, 'ent_a', 300)]);
    const seen: string[] = [];
    let before: number | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = await historyFor(
        d,
        'ent_a',
        before === undefined ? { limit: 3 } : { limit: 3, before },
      );
      seen.push(...page.events.map((e) => e.id));
      if (!page.hasMore) break;
      before = page.next;
    }
    expect(new Set(seen).size).toBe(9);
    expect(seen).toHaveLength(9);
  });

  it('is empty for an entity with no events', async () => {
    const d = testDeps();
    expect(await historyFor(d, 'ent_none')).toEqual({ events: [], hasMore: false });
  });
});
