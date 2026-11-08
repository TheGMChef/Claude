import { describe, expect, it } from 'vitest';
import { drawMove, askOracle, oracleOutcome } from '../src/oracle';
import { loadPacks } from '../src/library';
import { ContentError } from '../src/errors';
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
    [92, 'no', 'and'],
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
});
