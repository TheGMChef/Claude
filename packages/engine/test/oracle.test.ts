import { describe, expect, it } from 'vitest';
import { drawMove, askOracle, oracleOutcome } from '../src/oracle';
import { loadPacks } from '../src/library';
import { ContentError } from '../src/errors';
import { BLOCKED_VALUE } from '../src/generate';
import { parseTemplate } from '../src/template';
import type { CompiledPack } from '../src/schema';

const lit = (text: string) => [text];
const table = (id: string, words: string[]) => ({
  id,
  title: id,
  entries: words.map((w, i) => ({
    id: `${id}#${i}`,
    ast: lit(w),
    weight: 1,
    tags: [],
    safety: [],
  })),
});
const odds = { yes: 50, extreme: 8 };
const pack = {
  id: 't',
  version: '1',
  tables: {
    't.act': table('t.act', ['betray', 'guard', 'seek']),
    't.sub': table('t.sub', ['secret', 'gold', 'oath']),
  },
  cultures: {},
  generators: {},
  oracles: {
    't.oracle': {
      id: 't.oracle',
      odds: { certain: odds, likely: odds, even: odds, unlikely: odds, remote: odds },
      meaning: ['t.act', 't.sub'],
    },
    't.bad': {
      id: 't.bad',
      odds: { certain: odds, likely: odds, even: odds, unlikely: odds, remote: odds },
      meaning: ['t.act', 't.nope'],
    },
  },
  decks: {
    't.deck': {
      id: 't.deck',
      title: 'Moves',
      cards: [
        { id: 'a', text: 'A', prompt: 'pa' },
        { id: 'b', text: 'B' },
        { id: 'c', text: 'C', prompt: 'pc' },
      ],
    },
    't.dark': {
      id: 't.dark',
      title: 'Dark moves',
      cards: [
        { id: 'fight', text: 'Start a fight', safety: ['violence'] },
        { id: 'pyre', text: 'Light the pyre', safety: ['fire', 'death'] },
        { id: 'calm', text: 'Let it rest' },
        { id: 'smoke', text: 'Smoke on the hill', safety: ['fire'] },
      ],
    },
  },
  vocabulary: [],
} as unknown as CompiledPack;
const lib = loadPacks([pack]);

describe('oracleOutcome', () => {
  const rows: Array<[number, string, string | undefined]> = [
    [1, 'yes', 'and'],
    [8, 'yes', 'and'],
    [9, 'yes', undefined],
    [45, 'yes', 'but'],
    [50, 'yes', 'but'],
    [51, 'no', 'but'],
    [55, 'no', 'but'],
    [56, 'no', undefined],
    [92, 'no', undefined],
    [93, 'no', 'and'],
    [100, 'no', 'and'],
  ];
  it.each(rows)('yes=50 extreme=8 roll %i -> %s %s', (roll, answer, modifier) => {
    const r = oracleOutcome(roll, 50, 8);
    expect(r.answer).toBe(answer);
    expect(r.modifier).toBe(modifier);
  });
  it('yes=90 extreme=15', () => {
    expect(oracleOutcome(88, 90, 15)).toEqual({ answer: 'yes', modifier: 'but' });
    expect(oracleOutcome(10, 90, 15)).toEqual({ answer: 'yes', modifier: 'and' });
  });
});

describe('askOracle', () => {
  it('returns two non-empty meaning words and is deterministic per seed', () => {
    const a = askOracle(lib, 't.oracle', 'even', { seed: 'ABCD-1234' });
    expect(a.meaning[0]).not.toBe('');
    expect(a.meaning[1]).not.toBe('');
    expect(a.roll).toBeGreaterThanOrEqual(1);
    expect(a.roll).toBeLessThanOrEqual(100);
    expect(a.likelihood).toBe('even');
    expect(askOracle(lib, 't.oracle', 'even', { seed: 'ABCD-1234' })).toEqual(a);
    expect(askOracle(lib, 't.oracle', 'even', { seed: 'dragon' })).toEqual(
      askOracle(lib, 't.oracle', 'even', { seed: 'dragon' }),
    );
  });
  it('covers both answers across seeds', () => {
    const answers = new Set<string>();
    for (let i = 0; i < 40; i++)
      answers.add(askOracle(lib, 't.oracle', 'even', { seed: `s${i}` }).answer);
    expect(answers).toEqual(new Set(['yes', 'no']));
  });
  it('throws missing-source for unknown oracle or meaning table', () => {
    expect(() => askOracle(lib, 'nope', 'even')).toThrow(ContentError);
    try {
      askOracle(lib, 't.bad', 'even', { seed: 'x' });
      expect.unreachable();
    } catch (e) {
      expect((e as ContentError).code).toBe('missing-source');
    }
  });
  describe('safety on meaning words (I7)', () => {
    const tagged = (id: string, entries: Array<[string, string[]]>) => ({
      id,
      title: id,
      tags: [],
      entries: entries.map(([text, safety], i) => ({
        id: `${id}#${i}`,
        ast: parseTemplate(text),
        weight: 1,
        tags: [],
        safety,
      })),
    });
    const safe = loadPacks([
      {
        ...pack,
        tables: {
          ...pack.tables,
          'u.gore': tagged('u.gore', [
            ['grim', ['gore']],
            ['grislier', ['gore']],
          ]),
          'u.wrap': tagged('u.wrap', [['a {u.gore} omen', []]]),
          'u.fire': tagged('u.fire', [['ember', ['fire']]]),
          'u.deep': tagged('u.deep', [['ash and {u.fire}', ['drowning']]]),
        },
        oracles: {
          'u.top': { ...pack.oracles['t.oracle'], id: 'u.top', meaning: ['u.gore', 't.sub'] },
          'u.nest': { ...pack.oracles['t.oracle'], id: 'u.nest', meaning: ['t.act', 'u.wrap'] },
          'u.veil': { ...pack.oracles['t.oracle'], id: 'u.veil', meaning: ['u.fire', 'u.deep'] },
        },
      } as CompiledPack,
    ]);
    const lines = { lines: ['gore'], veils: [] };

    it('a fully lined meaning table gives the blocked marker and blocked: true', () => {
      for (let i = 0; i < 30; i++) {
        const r = askOracle(safe, 'u.top', 'even', { seed: `s${i}`, safety: lines });
        expect(r.meaning[0]).toBe(BLOCKED_VALUE);
        expect(r.meaning[1]).not.toBe('');
        expect(r.blocked).toBe(true);
      }
    });

    it('a nested slot that lines block blocks its word too', () => {
      const r = askOracle(safe, 'u.nest', 'even', { seed: 'x', safety: lines });
      expect(r.meaning).toEqual([expect.not.stringMatching(/^$/), BLOCKED_VALUE]);
      expect(r.blocked).toBe(true);
    });

    it('unblocked results report blocked: false and no veils', () => {
      const r = askOracle(safe, 'u.top', 'even', { seed: 'x' });
      expect(r.meaning[0]).toMatch(/^gri/);
      expect(r).toMatchObject({ blocked: false, veiled: [] });
    });

    it('veiled is the union across both words, top-level and nested entries', () => {
      const r = askOracle(safe, 'u.veil', 'even', {
        seed: 'x',
        safety: { lines: [], veils: ['fire', 'drowning'] },
      });
      expect(r.meaning).toEqual(['ember', 'ash and ember']);
      expect(r.blocked).toBe(false);
      expect([...r.veiled].sort()).toEqual(['drowning', 'fire']);
    });
  });

  it('names the real problem when a hand-built oracle lacks two meaning tables (I1)', () => {
    const one = loadPacks([
      {
        ...pack,
        oracles: { 't.one': { ...pack.oracles['t.oracle'], id: 't.one', meaning: ['t.act'] } },
      } as CompiledPack,
    ]);
    expect(() => askOracle(one, 't.one', 'even', { seed: 'x' })).toThrow(
      'oracle "t.one" needs exactly 2 meaning tables',
    );
  });
});

describe('drawMove', () => {
  it('is deterministic and fills a missing prompt with empty string', () => {
    expect(drawMove(lib, 't.deck', { seed: 'k' })).toEqual(drawMove(lib, 't.deck', { seed: 'k' }));
    const seen = new Map<string, string>();
    for (let i = 0; i < 60; i++) {
      const c = drawMove(lib, 't.deck', { seed: `s${i}` });
      seen.set(c.id, c.prompt);
    }
    expect(seen.get('b')).toBe('');
    expect(seen.get('a')).toBe('pa');
  });
  it('never returns an excluded id', () => {
    for (let i = 0; i < 60; i++) {
      expect(drawMove(lib, 't.deck', { seed: `s${i}`, exclude: ['a', 'b'] }).id).toBe('c');
    }
  });
  it('ignores exclude when everything is excluded', () => {
    const c = drawMove(lib, 't.deck', { seed: 'z', exclude: ['a', 'b', 'c'] });
    expect(['a', 'b', 'c']).toContain(c.id);
  });
  it('throws missing-source for unknown deck', () => {
    expect(() => drawMove(lib, 'nope')).toThrow(ContentError);
  });
  it('returns an ordinary card with blocked false and no veils', () => {
    expect(drawMove(lib, 't.deck', { seed: 'k' })).toMatchObject({ blocked: false, veiled: [] });
  });
});

describe('drawMove safety (I6)', () => {
  const lined = (...lines: string[]) => ({ lines, veils: [] });

  it('never returns a lined card', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = drawMove(lib, 't.dark', { seed: `d${i}`, safety: lined('fire') });
      expect(['fight', 'calm']).toContain(c.id);
      seen.add(c.id);
    }
    expect(seen).toEqual(new Set(['fight', 'calm']));
  });

  it('exclude falls back to the safe cards, never to lined ones', () => {
    for (let i = 0; i < 100; i++) {
      const c = drawMove(lib, 't.dark', {
        seed: `e${i}`,
        safety: lined('fire', 'violence'),
        exclude: ['calm'],
      });
      expect(c.id).toBe('calm');
    }
  });

  it('when every card is lined, returns the blocked card', () => {
    const dark = loadPacks([
      {
        ...pack,
        decks: {
          'u.d': { id: 'u.d', title: 'D', cards: [{ id: 'x', text: 'X', safety: ['fire'] }] },
        },
      },
    ]);
    expect(
      drawMove(dark, 'u.d', { seed: 'b', safety: lined('fire'), exclude: ['x'] }),
    ).toStrictEqual({ id: '', text: '—', prompt: '', blocked: true, veiled: [] });
  });

  it('reports the veiled tags a drawn card carries', () => {
    const veils = { lines: [], veils: ['fire', 'war'] };
    const byId = new Map<string, string[]>();
    for (let i = 0; i < 200; i++) {
      const c = drawMove(lib, 't.dark', { seed: `v${i}`, safety: veils });
      byId.set(c.id, c.veiled);
    }
    expect(byId.get('pyre')).toEqual(['fire']);
    expect(byId.get('smoke')).toEqual(['fire']);
    expect(byId.get('fight')).toEqual([]);
    expect(byId.get('calm')).toEqual([]);
  });
});
