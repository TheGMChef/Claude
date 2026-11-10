/**
 * The one data module that may import React (D51): the provider and the live-query hooks. Pages
 * read through these and write through the repository functions with `useDeps()`.
 */
import { createContext, createElement, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { PrepDeskDB } from './db';
import { liveDeps } from './deps';
import type { RepoDeps } from './deps';
import { getSetting, resolveCurrentCampaign, SETTING_DEFAULTS } from './repo/settings';
import type { SettingsMap } from './repo/settings';
import type { Campaign } from './schema';

const DbContext = createContext<PrepDeskDB | null>(null);

export function DbProvider({ db, children }: { db: PrepDeskDB; children: ReactNode }) {
  return createElement(DbContext.Provider, { value: db }, children);
}

export function useDb(): PrepDeskDB {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb must be used inside DbProvider');
  return db;
}

export function useDeps(): RepoDeps {
  const db = useDb();
  return useMemo(() => liveDeps(db), [db]);
}

/** `undefined` while the query is loading. Re-runs when the tables it read change. */
export function useLive<T>(
  fn: (db: PrepDeskDB) => Promise<T>,
  deps: readonly unknown[],
): T | undefined {
  const db = useDb();
  // The caller lists what `fn` closes over in `deps`.
  return useLiveQuery(() => fn(db), [db, ...deps]);
}

export function useCurrentCampaign(): { campaign?: Campaign; loading: boolean } {
  const deps = useDeps();
  // Wrapped so "no campaign" (undefined) is distinguishable from "still loading".
  const found = useLiveQuery(
    async () => ({ campaign: await resolveCurrentCampaign(deps) }),
    [deps],
  );
  if (!found) return { loading: true };
  return found.campaign ? { campaign: found.campaign, loading: false } : { loading: false };
}

export function useCampaign(cid: string): {
  campaign?: Campaign;
  loading: boolean;
  missing: boolean;
} {
  const db = useDb();
  const found = useLiveQuery(async () => ({ campaign: await db.campaigns.get(cid) }), [db, cid]);
  if (!found) return { loading: true, missing: false };
  return found.campaign
    ? { campaign: found.campaign, loading: false, missing: false }
    : { loading: false, missing: true };
}

type SettingValue<K extends keyof SettingsMap> = K extends keyof typeof SETTING_DEFAULTS
  ? SettingsMap[K]
  : SettingsMap[K] | undefined;

export function useSetting<K extends keyof SettingsMap>(
  key: K,
): { value: SettingValue<K> | undefined; loading: boolean } {
  const deps = useDeps();
  const found = useLiveQuery(async () => ({ value: await getSetting(deps, key) }), [deps, key]);
  return found
    ? { value: found.value as SettingValue<K>, loading: false }
    : { value: undefined, loading: true };
}
