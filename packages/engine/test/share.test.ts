import { describe, expect, it } from 'vitest';
import { cultureTag, decodeShare, encodeShare, type ShareState } from '../src/index';
import { shareCheck } from '../src/share';
import { CROCKFORD, createRng } from '../src/rng';

const state: ShareState = {
  seed: 'K7Q2-M9XD',
  nonces: [0, 2, 2, 0, 1, 0, 0],
  locks: [true, true, false, false, false, false, false],
};
const withCulture: ShareState = { ...state, culture: 'MX4R' };
const pristine: ShareState = {
  seed: 'K7Q2-M9XD',
  nonces: Array<number>(7).fill(0),
  locks: Array<boolean>(7).fill(false),
};

describe('share codes v2', () => {
  it('appends one Crockford check symbol to the body', () => {
    const code = encodeShare(state);
    expect(code.slice(0, -1)).toBe('K7Q2-M9XD.L3.N0_2_2_0_1_0_0');
    expect(code.at(-1)).toBe(shareCheck('K7Q2-M9XD.L3.N0_2_2_0_1_0_0'));
    expect(`${CROCKFORD}*~$=U`).toContain(code.at(-1));
  });

  it('carries the culture tag after the seed, also in a pristine code', () => {
    expect(encodeShare(withCulture).slice(0, -1)).toBe('K7Q2-M9XD.CMX4R.L3.N0_2_2_0_1_0_0');
    const short = encodeShare({ ...pristine, culture: 'MX4R' });
    expect(short.slice(0, -1)).toBe('K7Q2-M9XD.CMX4R');
    expect(decodeShare(short, 7)).toEqual({ ok: true, state: { ...pristine, culture: 'MX4R' } });
  });

  it('a pristine code without a culture is the seed plus its check symbol', () => {
    const code = encodeShare(pristine);
    expect(code).toHaveLength(10);
    expect(code.startsWith('K7Q2-M9XD')).toBe(true);
    expect(decodeShare(code, 7)).toEqual({ ok: true, state: pristine });
  });

  it('round-trips, with and without a culture, incl. multi-digit nonces and high lock bits', () => {
    expect(decodeShare(encodeShare(state), 7)).toEqual({ ok: true, state });
    expect(decodeShare(encodeShare(withCulture), 7)).toEqual({ ok: true, state: withCulture });
    const s: ShareState = {
      seed: 'K7Q2-M9XD',
      nonces: [31, 32, 1000, 0],
      locks: [false, false, false, true],
      culture: 'ZZ00',
    };
    expect(decodeShare(encodeShare(s), 4)).toEqual({ ok: true, state: s });
  });

  it('forgives case, whitespace and O/I/L before checking', () => {
    const code = encodeShare(withCulture); // K7Q2-M9XD.CMX4R.L3.N0_2_2_0_1_0_0<check>
    const messy = ` ${code.toLowerCase().replace(/\./g, ' . ').replace(/0/g, 'o').replace('1', 'i')} `;
    expect(decodeShare(messy, 7)).toEqual({ ok: true, state: withCulture });
    const ell = encodeShare({ ...state, nonces: [1, 1, 1, 1, 1, 1, 1] }).replace(/_1/g, '_l');
    expect(decodeShare(ell, 7)).toEqual({
      ok: true,
      state: { ...state, nonces: [1, 1, 1, 1, 1, 1, 1] },
    });
  });

  it('detects every single-character substitution (300 random codes, every position)', () => {
    const subs = [...`${CROCKFORD}._-*~$=U`];
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const rng = createRng('subst', i);
      const n = 1 + rng.int(9);
      const s: ShareState = {
        seed: `${'ABCD'.charAt(rng.int(4))}${CROCKFORD.charAt(rng.int(32))}Q2-M9X${CROCKFORD.charAt(rng.int(32))}`,
        nonces: Array.from({ length: n }, () => (rng.next() < 0.5 ? 0 : rng.int(2000))),
        locks: Array.from({ length: n }, () => rng.next() < 0.3),
      };
      if (rng.next() < 0.7)
        s.culture = Array.from({ length: 4 }, () => CROCKFORD.charAt(rng.int(32))).join('');
      const code = encodeShare(s);
      expect(decodeShare(code, n)).toEqual({ ok: true, state: s });
      for (let p = 0; p < code.length; p++) {
        for (const ch of subs) {
          if (ch === code[p]) continue;
          const bad = code.slice(0, p) + ch + code.slice(p + 1);
          const res = decodeShare(bad, n);
          checked++;
          if (res.ok) throw new Error(`substitution undetected: ${code} -> ${bad}`);
          // A substitution between digits and `_` inside a segment is always caught by the check
          // symbol itself (`.` and `-` change the structure, so any error will do for them).
          const plain = (c: string) => /[0-9A-Z_]/.test(c) && !/[*~$=U]/.test(c);
          if (p < code.length - 1 && plain(code[p] as string) && plain(ch)) {
            expect(res.error, `${code} -> ${bad}`).toBe('checksum');
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100_000);
  });

  it('rejects a wrong check symbol, v1 codes and plain 8-letter words', () => {
    const code = encodeShare(state);
    const wrong = code.slice(0, -1) + (code.at(-1) === '0' ? '1' : '0');
    expect(decodeShare(wrong, 7)).toEqual({ ok: false, error: 'checksum' });
    expect(decodeShare('K7Q2-M9XD.L3.N0_2_2_0_1_0_0', 7).ok).toBe(false);
    expect(decodeShare('nonsense', 7)).toEqual({ ok: false, error: 'checksum' });
  });

  it('rejects malformed bodies that carry a valid check', () => {
    const c = (body: string) => body + shareCheck(body);
    for (const body of [
      'K7Q2-M9',
      'K7Q2-M9XD.L3',
      'K7Q2-M9XD.X3.N0_0',
      'K7Q2-M9XD.N0_0.L3',
      'K7Q2-M9XD.CMX4.L3.N0_0',
      'K7Q2-M9XD.CMX4RR',
      'K7Q2-M9XD.L3.N0_0.CMX4R',
      'K7Q2-M9XD.CMX4R.CMX4R.L3.N0_0',
    ]) {
      expect(decodeShare(c(body), 2), body).toEqual({ ok: false, error: 'malformed' });
    }
    expect(decodeShare('', 2)).toEqual({ ok: false, error: 'malformed' });
    expect(decodeShare(c('K7Q2-M9XD.L3.N0_'), 2)).toEqual({ ok: false, error: 'malformed' });
    expect(decodeShare(c('K7Q2-M9XD.L3.N0-2'), 2)).toEqual({ ok: false, error: 'malformed' });
  });

  it('rejects a wrong field count', () => {
    const c = (body: string) => body + shareCheck(body);
    expect(decodeShare(c('K7Q2-M9XD.L3.N0_1'), 7)).toEqual({ ok: false, error: 'field-count' });
    expect(decodeShare(c('K7Q2-M9XD.LZ.N0_1'), 2)).toEqual({ ok: false, error: 'field-count' });
  });
});

describe('cultureTag', () => {
  it('is a stable 4-character Crockford tag derived from the id', () => {
    const tag = cultureTag('fantasy.culture.marsh');
    expect(tag).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(cultureTag('fantasy.culture.marsh')).toBe(tag);
    const shipped = ['marsh', 'highland', 'imperial'].map((c) =>
      cultureTag(`fantasy.culture.${c}`),
    );
    expect(new Set(shipped).size).toBe(3);
  });
});
