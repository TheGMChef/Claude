/**
 * Migration harness (spec 5.8). Schema v1 is frozen at the S2 merge: never edit STORES_V1.
 *
 * To add a migration (S3 onward), add `STORES_V2` and `.version(2).stores(...).upgrade(...)` in
 * db.ts, then add a test below:
 *
 *   it('v1 -> v2', async () => {
 *     const name = uniq();
 *     await seedRaw(name, 1, STORES_V1, V1_ROWS);   // a database exactly as v1 users have it
 *     const db = await openCurrent(name);           // the app opens it and the upgrade runs
 *     expect(await db.entities.toArray()).toEqual(...the migrated rows...);
 *   });
 *
 * The v1 fixture stays as it is. Every later version adds a fixture of its own.
 */
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { STORES_V1, createDb } from '../db';
import V1 from '../__fixtures__/v1.json';

type Rows = Record<string, Record<string, unknown>[]>;
const V1_ROWS = V1 as unknown as Rows;

let n = 0;
const uniq = () => `mig-${++n}-${Math.random().toString(36).slice(2)}`;

/** Writes `rows` into a database at `version` with a raw Dexie, the way an older build left it. */
export async function seedRaw(
  name: string,
  version: number,
  stores: Record<string, string>,
  rows: Rows,
): Promise<void> {
  const raw = new Dexie(name);
  raw.version(version).stores(stores);
  await raw.open();
  for (const [store, list] of Object.entries(rows)) await raw.table(store).bulkAdd(list);
  raw.close();
}

export async function openCurrent(name: string) {
  const db = createDb(name);
  await db.open();
  return db;
}

const keyOf = (row: Record<string, unknown>) =>
  JSON.stringify(row.id ?? row.key ?? [row.campaignId ?? row.sessionId, row.nameKey ?? row.step]);

describe('migration harness', () => {
  it('the fixture covers all eleven stores with every field filled', () => {
    expect(Object.keys(V1_ROWS).sort()).toEqual(Object.keys(STORES_V1).sort());
    expect(V1_ROWS.entities).toHaveLength(3);
    expect(V1_ROWS.links).toHaveLength(2);
    for (const [store, list] of Object.entries(V1_ROWS)) {
      if (store !== 'entities' && store !== 'links') expect(list).toHaveLength(1);
    }
    expect(V1_ROWS.entities?.map((e) => e.kind).sort()).toEqual(['clue', 'npc', 'place']);
    for (const list of Object.values(V1_ROWS)) {
      for (const row of list) {
        for (const [k, v] of Object.entries(row)) {
          expect(v, `${k} is filled`).not.toBeUndefined();
          expect(v, `${k} is not null`).not.toBeNull();
        }
      }
    }
  });

  it('opens a database seeded at v1 with the current code and reads every row back deep-equal', async () => {
    const name = uniq();
    await seedRaw(name, 1, STORES_V1, V1_ROWS);
    const db = await openCurrent(name);
    expect(db.verno).toBe(1);
    for (const [store, rows] of Object.entries(V1_ROWS)) {
      const back = await db.table(store).toArray();
      const sort = (a: Record<string, unknown>[]) =>
        [...a].sort((x, y) => keyOf(x).localeCompare(keyOf(y)));
      expect(sort(back), store).toEqual(sort(rows));
    }
    db.close();
  });
});
