import { describe, expect, it } from 'vitest';
import { compileDocs } from '../src/compile';
import {
  MAX_BANNED_PATTERN_LENGTH,
  MAX_BANNED_PATTERNS,
  MAX_NAME_LENGTH,
  regexRisk,
} from '../src/limits';
import { generateName } from '../src/names';
import { loadPacks } from '../src/library';
import type { CompiledCulture } from '../src/schema';
import { validateUserPack } from '../src/userPack';
import { fantasyPack } from './fixtures/starter-packs';

const culture = (banned: string[], part = 'a'.repeat(13) + '!', pattern = ['a']) => ({
  kind: 'culture',
  id: 'user.c.evil',
  name: 'Evil',
  voice: { summary: 's', tips: [] },
  names: { given: { pattern, parts: { a: [part] } }, banned },
});

describe('regexRisk (banned-pattern ReDoS guard)', () => {
  it.each([
    '(a+)+$',
    '(.*)*x',
    '(a|aa)+',
    '(a|a?)+b',
    '(?:\\w+\\s?)*$',
    '([a-z]+)*!',
    '(x+x+)+y',
    '(a*){2,}',
  ])('rejects nested or overlapping quantifier %s', (p) => {
    expect(regexRisk(p)).toMatch(/nested|repeat/);
  });

  it.each([
    'a*a*a*a*b',
    '.*.*.*x',
    'a?a?a?a?aaaa',
    '\\w+\\w+\\w+',
    '\\w*\\w*x',
    '\\w{0,30}\\w{0,30}x',
    '.*\\s+x',
  ])('rejects more than the allowed variable quantifiers: %s', (p) => {
    expect(regexRisk(p)).toMatch(/quantifiers/);
  });

  it('rejects a pattern longer than the cap', () => {
    expect(regexRisk('a'.repeat(MAX_BANNED_PATTERN_LENGTH + 1))).toMatch(/longer/);
  });

  it.each([
    '(.)\\1\\1',
    '^.{0,2}$',
    '[aeiou]{3}',
    '(\\w{2,3})\\1',
    '^(\\w{3})\\w*\\s+\\1',
    '(\\w{3})\\s+\\w*\\1$',
    '(?:ab)+',
    '(a|b)?',
    '[(+*]',
    'a\\(+',
    'x{2}',
  ])('accepts a safe pattern %s', (p) => {
    expect(regexRisk(p)).toBeNull();
  });

  it('accepts every banned pattern in the shipped cultures', () => {
    const all = Object.values(fantasyPack.cultures).flatMap((c) => c.banned);
    expect(all.length).toBeGreaterThan(10);
    expect(all.filter((p) => regexRisk(p) !== null)).toEqual([]);
  });
});

describe('compile drops unsafe banned patterns before they run', () => {
  it('reports a readable schema error and does not hang on (a+)+$', () => {
    const start = performance.now();
    const res = validateUserPack({ docs: [culture(['(a+)+$'])] });
    expect(performance.now() - start).toBeLessThan(1000);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const err = res.errors.find((e) => e.path.endsWith('#names.banned[0]'));
    expect(err?.code).toBe('schema');
    expect(err?.message).toMatch(/banned pattern "\(a\+\)\+\$" is unsafe/);
  });

  it('compileDocs leaves unsafe patterns out of the compiled culture', () => {
    const { pack } = compileDocs({ id: 'user', version: '0', title: 'U' }, [
      { file: 'c.yaml', data: culture(['(a+)+$', 'zz']) },
    ]);
    expect(pack.cultures['user.c.evil']?.banned).toEqual(['zz']);
  });

  it('names skip an unsafe pattern even in a compiled culture that bypassed compile', () => {
    const evil: CompiledCulture = {
      id: 'user.c.evil',
      name: 'Evil',
      voice: { summary: 's', tips: [] },
      names: { given: { pattern: ['a'], parts: { a: ['a'.repeat(28) + '!'] } } },
      examples: [],
      exampleChance: 0,
      banned: ['(a+)+$'],
    };
    const lib = loadPacks([
      {
        id: 'user',
        version: '0',
        tables: {},
        cultures: { [evil.id]: evil },
        generators: {},
        oracles: {},
        decks: {},
        situations: {},
        vocabulary: [],
      },
    ]);
    const start = performance.now();
    expect(generateName(lib, evil.id, { seed: 'AAAA-AAAA' }).name).toMatch(/^Aa+!$/);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('the worst admitted patterns at the longest admitted name validate in bounded time', () => {
    // One wide plus two narrow quantifiers over overlapping atoms (the most the guard admits),
    // MAX_BANNED_PATTERNS times, against a MAX_NAME_LENGTH name that never matches: the
    // weak-culture lint runs the name generator up to 500 times. Measured ~1-2 s locally; the
    // unguarded `(a+)+$` at 18 characters took 35 s.
    const worst = Array.from(
      { length: MAX_BANNED_PATTERNS },
      (_, i) => `\\w*\\w?\\w?${String.fromCharCode(48 + (i % 10))}`,
    );
    expect(worst.every((p) => regexRisk(p) === null)).toBe(true);
    const half = 'a'.repeat(MAX_NAME_LENGTH / 2);
    const start = performance.now();
    const res = validateUserPack({ docs: [culture(worst, half, ['a', 'a'])] });
    expect(performance.now() - start).toBeLessThan(8000);
    expect(res.ok).toBe(false); // weak-culture: it only ever makes one name, but it returns
  }, 20_000);
});
