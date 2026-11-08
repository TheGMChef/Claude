import { CROCKFORD, normalizeSeed } from './rng';

export type ShareState = { seed: string; nonces: number[]; locks: boolean[] };

export type DecodeResult =
  { ok: true; state: ShareState } | { ok: false; error: 'malformed' | 'field-count' };

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
  const t = s.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]+$/.test(t)) return null;
  let n = 0n;
  for (const ch of t) n = n * 32n + BigInt(CROCKFORD.indexOf(ch));
  return n;
}

export function encodeShare(state: ShareState): string {
  const pristine = state.nonces.every((n) => n === 0) && state.locks.every((l) => !l);
  if (pristine) return state.seed;
  let mask = 0n;
  state.locks.forEach((locked, i) => {
    if (locked) mask |= 1n << BigInt(i);
  });
  const nonces = state.nonces.map((n) => toBase32(BigInt(n))).join('_');
  return `${state.seed}.L${toBase32(mask)}.N${nonces}`;
}

export function decodeShare(code: string, fieldCount: number): DecodeResult {
  const parts = code.split('.').map((p) => p.replace(/\s+/g, ''));
  const seed = normalizeSeed(parts[0] ?? '');
  if (seed === null) return { ok: false, error: 'malformed' };

  if (parts.length === 1) {
    return {
      ok: true,
      state: {
        seed,
        nonces: Array<number>(fieldCount).fill(0),
        locks: Array<boolean>(fieldCount).fill(false),
      },
    };
  }
  if (parts.length !== 3) return { ok: false, error: 'malformed' };

  const lockPart = parts[1] ?? '';
  const noncePart = parts[2] ?? '';
  if (!/^[Ll]/.test(lockPart) || !/^[Nn]/.test(noncePart)) return { ok: false, error: 'malformed' };

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
  return { ok: true, state: { seed, nonces, locks } };
}
