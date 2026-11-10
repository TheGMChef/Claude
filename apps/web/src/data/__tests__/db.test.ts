import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_STORES, STORES_V1, attachLifecycle, createDb } from '../db';

// fake-indexeddb delivers events on real macrotasks; keep a real timer to let them arrive.
const realSetTimeout = globalThis.setTimeout;
const realTick = (ms: number) => new Promise<void>((r) => realSetTimeout(r, ms));

let n = 0;
const uniq = (p: string) => `${p}-${++n}-${Math.random().toString(36).slice(2)}`;

describe('createDb', () => {
  it('opens schema version 1 with exactly the eleven declared stores', async () => {
    const db = createDb(uniq('t1'));
    await db.open();
    expect(db.verno).toBe(1);
    expect(db.tables.map((t) => t.name).sort()).toEqual(Object.keys(STORES_V1).sort());
    expect(Object.keys(STORES_V1)).toHaveLength(11);
    db.close();
  });

  it('defaults the database name to prepdesk (D52)', async () => {
    const db = createDb();
    expect(db.name).toBe('prepdesk');
    db.close();
  });

  it('answers compound queries on entities', async () => {
    const db = createDb(uniq('t1'));
    const base = { aliases: [], summary: '', fields: {}, body: '', canon: 'kept', veiled: [] };
    await db.entities.bulkAdd([
      {
        ...base,
        id: 'ent_1',
        campaignId: 'cmp_x',
        kind: 'npc',
        title: 'A',
        tokens: ['a'],
        wikiTargets: [],
        origin: 'manual',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        ...base,
        id: 'ent_2',
        campaignId: 'cmp_x',
        kind: 'place',
        title: 'B',
        tokens: ['b'],
        wikiTargets: [],
        origin: 'manual',
        createdAt: 1,
        updatedAt: 2,
      },
      {
        ...base,
        id: 'ent_3',
        campaignId: 'cmp_y',
        kind: 'npc',
        title: 'C',
        tokens: ['a'],
        wikiTargets: [],
        origin: 'manual',
        createdAt: 1,
        updatedAt: 3,
      },
    ] as never);
    const hits = await db.entities.where('[campaignId+kind]').equals(['cmp_x', 'npc']).toArray();
    expect(hits.map((e) => e.id)).toEqual(['ent_1']);
    const tok = await db.entities.where('tokens').equals('a').toArray();
    expect(tok.map((e) => e.id).sort()).toEqual(['ent_1', 'ent_3']);
    db.close();
  });

  it('answers multi-entry wikiTargets queries (D56)', async () => {
    const db = createDb(uniq('t1'));
    const base = {
      aliases: [],
      summary: '',
      fields: {},
      body: '',
      canon: 'kept',
      veiled: [],
      tokens: [],
      origin: 'manual',
      createdAt: 1,
      updatedAt: 1,
      kind: 'npc',
    };
    await db.entities.bulkAdd([
      {
        ...base,
        id: 'ent_1',
        campaignId: 'cmp_x',
        title: 'A',
        wikiTargets: ['odrin', 'salt marsh'],
      },
      { ...base, id: 'ent_2', campaignId: 'cmp_x', title: 'B', wikiTargets: ['odrin'] },
      { ...base, id: 'ent_3', campaignId: 'cmp_x', title: 'C', wikiTargets: [] },
    ] as never);
    const hits = await db.entities.where('wikiTargets').equals('odrin').toArray();
    expect(hits.map((e) => e.id).sort()).toEqual(['ent_1', 'ent_2']);
    db.close();
  });

  it('indexes pocket, drafts and prepAnswers by campaignId (D53a)', async () => {
    const db = createDb(uniq('t1'));
    await db.pocket.bulkAdd([
      {
        id: 'poc_1',
        sessionId: 'ses_1',
        campaignId: 'cmp_x',
        section: 'names',
        order: 0,
        locked: false,
      },
      {
        id: 'poc_2',
        sessionId: 'ses_2',
        campaignId: 'cmp_y',
        section: 'names',
        order: 0,
        locked: false,
      },
    ]);
    await db.drafts.bulkAdd([
      {
        id: 'drf_1',
        sessionId: 'ses_1',
        campaignId: 'cmp_x',
        step: 1,
        kind: 'rumor',
        line: '',
        status: 'draft',
        order: 0,
      },
      {
        id: 'drf_2',
        sessionId: 'ses_2',
        campaignId: 'cmp_y',
        step: 1,
        kind: 'rumor',
        line: '',
        status: 'draft',
        order: 0,
      },
    ]);
    await db.prepAnswers.bulkAdd([
      { sessionId: 'ses_1', campaignId: 'cmp_x', step: 1, answers: {}, updatedAt: 1 },
      { sessionId: 'ses_2', campaignId: 'cmp_y', step: 1, answers: {}, updatedAt: 1 },
    ]);
    expect(
      (await db.pocket.where('campaignId').equals('cmp_x').toArray()).map((r) => r.id),
    ).toEqual(['poc_1']);
    expect(
      (await db.drafts.where('campaignId').equals('cmp_x').toArray()).map((r) => r.id),
    ).toEqual(['drf_1']);
    expect(
      (await db.prepAnswers.where('campaignId').equals('cmp_x').toArray()).map((r) => r.sessionId),
    ).toEqual(['ses_1']);
    db.close();
  });

  it('answers [campaignId+status] on sessions (D53c)', async () => {
    const db = createDb(uniq('t1'));
    const s = {
      prepStep: 1,
      stepsVisited: [],
      stepsSkipped: [],
      prepElapsedMs: 0,
      presentPcIds: [],
      spotlightPcIds: [],
      plannedTicks: {},
      sceneOrder: [],
      pocketSeed: 'x',
      pausedMs: 0,
      recap: '',
      createdAt: 1,
      updatedAt: 1,
    };
    await db.sessions.bulkAdd([
      { ...s, id: 'ses_1', campaignId: 'cmp_x', number: 1, status: 'done' },
      { ...s, id: 'ses_2', campaignId: 'cmp_x', number: 2, status: 'live' },
      { ...s, id: 'ses_3', campaignId: 'cmp_y', number: 1, status: 'live' },
    ] as never);
    const live = await db.sessions.where('[campaignId+status]').equals(['cmp_x', 'live']).toArray();
    expect(live.map((r) => r.id)).toEqual(['ses_2']);
    db.close();
  });

  it('CAMPAIGN_STORES is every store except campaigns and settings, each indexed by campaignId', () => {
    const all = Object.keys(STORES_V1).filter((s) => s !== 'campaigns' && s !== 'settings');
    expect([...CAMPAIGN_STORES].sort()).toEqual(all.sort());
    for (const s of CAMPAIGN_STORES) {
      expect(STORES_V1[s].split(',').map((x) => x.trim())).toContain('campaignId');
    }
  });
});

describe('attachLifecycle', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('closes the connection and reports versionChange when another tab upgrades', async () => {
    const name = uniq('t2');
    const old = createDb(name);
    await old.open();
    const versionChange = vi.fn();
    const detach = attachLifecycle(old, { versionChange, blocked: vi.fn() });
    const next = new Dexie(name);
    next.version(2).stores(STORES_V1);
    await next.open();
    expect(versionChange).toHaveBeenCalledTimes(1);
    expect(old.isOpen()).toBe(false);
    detach();
    next.close();
  });

  it('reports blocked once, only after blockedAfterMs, when an old connection ignores versionchange', async () => {
    const name = uniq('t3');
    // A stand-in for an old tab that never closes: a raw connection with no versionchange handler.
    const held = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 10);
      req.onupgradeneeded = () => req.result.createObjectStore('campaigns', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const blocked = vi.fn();
    const next = new Dexie(name);
    next.version(2).stores(STORES_V1);
    const detach = attachLifecycle(next, { versionChange: vi.fn(), blocked }, 3000);
    const opening = next.open().catch(() => undefined);
    await realTick(50); // the blocked event has been delivered; the 3 s timer has not elapsed
    await vi.advanceTimersByTimeAsync(2999);
    expect(blocked).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(blocked).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(blocked).toHaveBeenCalledTimes(1);
    held.close(); // unblocks the upgrade
    await opening;
    detach();
    next.close();
  });

  it('does not report blocked when the open succeeds in time', async () => {
    const db = createDb(uniq('t4'));
    const blocked = vi.fn();
    const detach = attachLifecycle(db, { versionChange: vi.fn(), blocked }, 3000);
    await db.open();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(blocked).not.toHaveBeenCalled();
    detach();
    db.close();
  });
});
