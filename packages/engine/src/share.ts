import { CROCKFORD, hashSeed, normalizeSeed } from './rng';

/**
 * Decoded share code (spec §4.4, v2). `culture` is the 4-character tag of the card's culture
 * (`cultureTag`), present when the card had one.
 */
export type ShareState = { seed: string; nonces: number[]; locks: boolean[]; culture?: string };

export type ShareError = 'malformed' | 'field-count' | 'checksum';

export type DecodeResult = { ok: true; state: ShareState } | { ok: false; error: ShareError };

/** Crockford check symbols: the 32 digits, then `*~$=U` for 32..36. */
const CHECK_SYMBOLS = `${CROCKFORD}*~$=U`;
const DOT = 32;
const UNDERSCORE = 33;
const LOCK_MARKER = 34;
const HYPHEN = 35;

/** A stable 4-character Crockford tag for a culture id (20 bits of its hash). */
export function cultureTag(cultureId: string): string {
  let bits = hashSeed('culture-tag', cultureId)[0] >>> 12;
  let out = '';
  for (let i = 0; i < 4; i++) {
    out = CROCKFORD.charAt(bits & 31) + out;
    bits >>>= 5;
  }
  return out;
}

/** Crockford digit value after O/I/L forgiveness, or -1. */
function digit(ch: string): number {
  const c = ch === 'O' ? '0' : ch === 'I' || ch === 'L' ? '1' : ch;
  return CROCKFORD.indexOf(c);
}

/**
 * Symbol values of a code body (uppercased, whitespace removed), or null when a character can
 * never appear there. Every symbol that can appear has its own value below 37, and the check is
 * a base-32 polynomial mod 37 (prime), so any single substitution changes the check.
 * The seed's hyphens are skipped (the seed has a fixed length, so they can't hide a typo); `L`
 * opening a segment is the lock marker (its own value), elsewhere it reads as 1.
 */
function bodyValues(body: string): number[] | null {
  const out: number[] = [];
  const segments = body.split('.');
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) out.push(DOT);
    const seg = segments[i] as string;
    for (let j = 0; j < seg.length; j++) {
      const ch = seg.charAt(j);
      if (ch === '-') {
        if (i > 0) out.push(HYPHEN);
        continue;
      }
      if (i > 0 && j === 0 && ch === 'L') out.push(LOCK_MARKER);
      else if (ch === '_') out.push(UNDERSCORE);
      else {
        const v = digit(ch);
        if (v < 0) return null;
        out.push(v);
      }
    }
  }
  return out;
}

function checkOf(values: number[]): string {
  let sum = 0;
  for (const v of values) sum = (sum * 32 + v) % 37;
  return CHECK_SYMBOLS.charAt(sum);
}

/** The check symbol for a code body (exported for tests). */
export function shareCheck(body: string): string {
  const values = bodyValues(body.toUpperCase().replace(/\s+/g, ''));
  if (!values) throw new Error(`not a share code body: ${body}`);
  return checkOf(values);
}

function toBase32(n: bigint): string {
  if (n === 0n) return '0';
  let out = '';
  while (n > 0n) {
    out = CROCKFORD.charAt(Number(n & 31n)) + out;
    n >>= 5n;
  }
  return out;
}

function fromBase32(s: string): bigint | null {
  if (s === '') return null;
  let n = 0n;
  for (const ch of s) {
    const v = digit(ch);
    if (v < 0) return null;
    n = n * 32n + BigInt(v);
  }
  return n;
}

/**
 * `SEED[.C<tag>][.L<lock mask>.N<nonces joined by _>]` plus one check symbol. Locks and nonces
 * are left out when nothing is locked and every nonce is 0.
 */
export function encodeShare(state: ShareState): string {
  let body = state.seed;
  if (state.culture !== undefined) body += `.C${state.culture}`;
  const pristine = state.nonces.every((n) => n === 0) && state.locks.every((l) => !l);
  if (!pristine) {
    let mask = 0n;
    state.locks.forEach((locked, i) => {
      if (locked) mask |= 1n << BigInt(i);
    });
    const nonces = state.nonces.map((n) => toBase32(BigInt(n))).join('_');
    body += `.L${toBase32(mask)}.N${nonces}`;
  }
  return body + shareCheck(body);
}

/**
 * Case, whitespace and O/I/L are forgiven before the check symbol is verified; then the body is
 * parsed. Errors: `checksum` (typo), `malformed`, `field-count` (code for another generator).
 */
export function decodeShare(code: string, fieldCount: number): DecodeResult {
  const raw = code.toUpperCase().replace(/\s+/g, '');
  if (raw.length < 2) return { ok: false, error: 'malformed' };
  const body = raw.slice(0, -1);
  const values = bodyValues(body);
  const check = raw.slice(-1);
  const given = CHECK_SYMBOLS.indexOf(digit(check) >= 0 ? CROCKFORD.charAt(digit(check)) : check);
  if (!values || given < 0) return { ok: false, error: 'malformed' };
  if (checkOf(values) !== CHECK_SYMBOLS.charAt(given)) return { ok: false, error: 'checksum' };

  const parts = body.split('.');
  const seed = normalizeSeed(parts[0] ?? '');
  if (seed === null) return { ok: false, error: 'malformed' };
  let rest = parts.slice(1);

  let culture: string | undefined;
  if (rest.length === 1 || rest.length === 3) {
    const tag = rest[0] ?? '';
    if (!/^C.{4}$/.test(tag)) return { ok: false, error: 'malformed' };
    const digits = [...tag.slice(1)].map(digit);
    if (digits.some((d) => d < 0)) return { ok: false, error: 'malformed' };
    culture = digits.map((d) => CROCKFORD.charAt(d)).join('');
    rest = rest.slice(1);
  }
  const withCulture = (s: ShareState): ShareState =>
    culture === undefined ? s : { ...s, culture };

  if (rest.length === 0) {
    return {
      ok: true,
      state: withCulture({
        seed,
        nonces: Array<number>(fieldCount).fill(0),
        locks: Array<boolean>(fieldCount).fill(false),
      }),
    };
  }
  if (rest.length !== 2) return { ok: false, error: 'malformed' };

  const lockPart = rest[0] ?? '';
  const noncePart = rest[1] ?? '';
  if (!lockPart.startsWith('L') || !noncePart.startsWith('N')) {
    return { ok: false, error: 'malformed' };
  }

  const mask = fromBase32(lockPart.slice(1));
  if (mask === null) return { ok: false, error: 'malformed' };
  const nonces: number[] = [];
  for (const piece of noncePart.slice(1).split('_')) {
    const n = fromBase32(piece);
    if (n === null || n > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, error: 'malformed' };
    nonces.push(Number(n));
  }

  if (nonces.length !== fieldCount || mask >> BigInt(fieldCount) !== 0n) {
    return { ok: false, error: 'field-count' };
  }
  const locks = Array.from({ length: fieldCount }, (_, i) => ((mask >> BigInt(i)) & 1n) === 1n);
  return { ok: true, state: withCulture({ seed, nonces, locks }) };
}
