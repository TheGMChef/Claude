import type { IdPrefix } from './schema';

// Crockford base32: no I, L, O or U. 32 symbols, so a masked byte (& 31) is unbiased.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A prefix plus 16 Crockford characters (D45). getRandomValues only: no secure-context need (M4). */
export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = `${prefix}_`;
  for (const b of bytes) out += ALPHABET[b & 31];
  return out;
}

export const ID_PATTERNS: Record<IdPrefix, RegExp> = {
  cmp: /^cmp_[0-9A-HJKMNP-TV-Z]{16}$/,
  ses: /^ses_[0-9A-HJKMNP-TV-Z]{16}$/,
  ent: /^ent_[0-9A-HJKMNP-TV-Z]{16}$/,
  lnk: /^lnk_[0-9A-HJKMNP-TV-Z]{16}$/,
  evt: /^evt_[0-9A-HJKMNP-TV-Z]{16}$/,
  sho: /^sho_[0-9A-HJKMNP-TV-Z]{16}$/,
  poc: /^poc_[0-9A-HJKMNP-TV-Z]{16}$/,
  drf: /^drf_[0-9A-HJKMNP-TV-Z]{16}$/,
};
