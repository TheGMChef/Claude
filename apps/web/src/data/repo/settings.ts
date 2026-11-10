import type { RepoDeps } from '../deps';
import type { Campaign } from '../schema';

/** Device settings (D55). Never exported in a backup; the theme lives in localStorage instead. */
export type SettingsMap = {
  currentCampaignId: string;
  singleKeyShortcuts: boolean;
  persistRequestedAt: number;
  tableHintSeen: boolean;
  e2eSeed: string;
};

export const SETTING_DEFAULTS = { singleKeyShortcuts: true } as const;
type Defaults = typeof SETTING_DEFAULTS;

export async function getSetting<K extends keyof SettingsMap>(
  d: RepoDeps,
  key: K,
): Promise<K extends keyof Defaults ? SettingsMap[K] : SettingsMap[K] | undefined> {
  const row = await d.db.settings.get(key);
  const value = row ? row.value : (SETTING_DEFAULTS as Partial<SettingsMap>)[key];
  return value as K extends keyof Defaults ? SettingsMap[K] : SettingsMap[K] | undefined;
}

export async function setSetting<K extends keyof SettingsMap>(
  d: RepoDeps,
  key: K,
  value: SettingsMap[K],
): Promise<void> {
  await d.db.settings.put({ key, value });
}

export async function deleteSetting(d: RepoDeps, key: keyof SettingsMap): Promise<void> {
  await d.db.settings.delete(key);
}

/**
 * The campaign `currentCampaignId` names, else (stale or missing id) the most recently updated one.
 * Read-only: callers that want the fallback remembered write it themselves.
 */
export async function resolveCurrentCampaign(d: RepoDeps): Promise<Campaign | undefined> {
  const id = await getSetting(d, 'currentCampaignId');
  if (id !== undefined) {
    const found = await d.db.campaigns.get(id);
    if (found) return found;
  }
  return d.db.campaigns.orderBy('updatedAt').last();
}
