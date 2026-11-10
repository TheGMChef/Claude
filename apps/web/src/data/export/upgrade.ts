import { CURRENT_FORMAT } from './schema';

export { CURRENT_FORMAT };

/**
 * D63 step 5: brings an older backup to the current format, in code. Format 1 is current, so this is
 * the identity; the first format change adds its step here. Input is untrusted JSON, validated after.
 */
export function upgradeBackup(raw: Record<string, unknown>): Record<string, unknown> {
  let doc = raw;
  // for (v = formatVersion; v < CURRENT_FORMAT; v++) doc = STEPS[v](doc);
  if (doc['formatVersion'] !== CURRENT_FORMAT) doc = { ...doc, formatVersion: CURRENT_FORMAT };
  return doc;
}
