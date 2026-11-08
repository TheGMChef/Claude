declare const crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T };

export type Rng = { next(): number; int(maxExclusive: number): number };

export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** cyrb128 hash of the parts, joined unambiguously. */
export function hashSeed(...parts: (string | number)[]): [number, number, number, number] {
  const str = parts.map((p) => String(p)).join('\u0000');
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** sfc32 seeded from hashSeed(parts). */
export function createRng(...parts: (string | number)[]): Rng {
  let [a, b, c, d] = hashSeed(...parts);
  const nextU32 = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  const next = (): number => nextU32() / 4294967296;
  return { next, int: (maxExclusive) => Math.floor(next() * maxExclusive) };
}

/** New random seed code, `XXXX-XXXX`. */
export function newSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = '';
  for (let i = 0; i < 8; i++) {
    s += CROCKFORD.charAt((bytes[i] ?? 0) & 31);
    if (i === 3) s += '-';
  }
  return s;
}

/**
 * Random RFC 4122 version 4 id from getRandomValues. Not crypto.randomUUID: that exists only on
 * secure origins, and a tablet testing over http://<LAN-IP> is not one (M4).
 */
export function randomId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Normalizes user-typed seed text; null unless 8 valid Crockford chars. */
export function normalizeSeed(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/**
 * R21: a valid code is normalised (`test0001` -> `TEST-0001`); other text maps to a stable code
 * derived from its hash; no seed -> a fresh random code.
 */
export function toSeed(input: string | undefined): string {
  if (input === undefined) return newSeed();
  const valid = normalizeSeed(input);
  if (valid !== null) return valid;
  const [h1, h2] = hashSeed('seed', input);
  const bits = (BigInt(h1) << 32n) | BigInt(h2);
  let s = '';
  for (let i = 0; i < 8; i++) {
    s += CROCKFORD.charAt(Number((bits >> BigInt(5 * i)) & 31n));
    if (i === 3) s += '-';
  }
  return s;
}
