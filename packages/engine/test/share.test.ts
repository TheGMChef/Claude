import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, type ShareState } from '../src/index';

const state: ShareState = {
  seed: 'K7Q2-M9XD',
  nonces: [0, 2, 2, 0, 1, 0, 0],
  locks: [true, true, false, false, false, false, false],
};

describe('share codes', () => {
  it('encodes the documented example', () => {
    expect(encodeShare(state)).toBe('K7Q2-M9XD.L3.N0_2_2_0_1_0_0');
  });

  it('round-trips', () => {
    expect(decodeShare(encodeShare(state), 7)).toEqual({ ok: true, state });
  });

  it('encodes a pristine state as the bare seed', () => {
    const s: ShareState = {
      seed: 'K7Q2-M9XD',
      nonces: Array(7).fill(0),
      locks: Array(7).fill(false),
    };
    expect(encodeShare(s)).toBe('K7Q2-M9XD');
    expect(decodeShare('K7Q2-M9XD', 7)).toEqual({ ok: true, state: s });
  });

  it('round-trips multi-digit base32 nonces and high lock bits', () => {
    const s: ShareState = {
      seed: 'K7Q2-M9XD',
      nonces: [31, 32, 1000, 0],
      locks: [false, false, false, true],
    };
    expect(decodeShare(encodeShare(s), 4)).toEqual({ ok: true, state: s });
  });

  it('is forgiving of case and whitespace', () => {
    expect(decodeShare('k7q2-m9xd . l3 . n0_2_2_0_1_0_0', 7)).toEqual({ ok: true, state });
  });

  it('rejects malformed codes', () => {
    expect(decodeShare('K7Q2-M9', 7)).toEqual({ ok: false, error: 'malformed' });
    expect(decodeShare('K7Q2-M9XD.L3', 7)).toEqual({ ok: false, error: 'malformed' });
    expect(decodeShare('K7Q2-M9XD.X3.N0_0', 2)).toEqual({ ok: false, error: 'malformed' });
    expect(decodeShare('K7Q2-M9XD.L3.N0_U', 2)).toEqual({ ok: false, error: 'malformed' });
  });

  it('rejects a wrong field count', () => {
    expect(decodeShare('K7Q2-M9XD.L3.N0_1', 7)).toEqual({ ok: false, error: 'field-count' });
    expect(decodeShare('K7Q2-M9XD.LZ.N0_1', 2)).toEqual({ ok: false, error: 'field-count' });
  });
});
