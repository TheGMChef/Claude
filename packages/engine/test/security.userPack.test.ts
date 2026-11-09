import { describe, expect, it } from 'vitest';
import { cardFromShare, cardToShare, generate, reroll, rollTable } from '../src/generate';
import { loadPacks } from '../src/library';
import {
  MAX_BANNED_PATTERNS,
  MAX_DOCUMENTS,
  MAX_ENTRIES_PER_TABLE,
  MAX_EXPANSION,
  MAX_FIELDS,
  MAX_NAME_LENGTH,
  MAX_NAME_PART_OPTIONS,
  MAX_PICK_COUNT,
  MAX_TABLES,
  MAX_TEXT_LENGTH,
  MAX_USER_PACK_BYTES,
  expansionCost,
} from '../src/limits';
import { validateUserPack } from '../src/userPack';
import { corePack, fantasyPack } from './fixtures/starter-packs';

const TO_STRING: string = 'toString';
type Res = ReturnType<typeof validateUserPack>;
const messages = (res: Res): string[] => (res.ok ? [] : res.errors.map((e) => e.message));
const table = (id: string, texts: string[]) => ({
  kind: 'table',
  id,
  entries: texts.map((text) => ({ text })),
});
const culture = (names: Record<string, unknown>) => ({
  kind: 'culture',
  id: 'user.c.one',
  name: 'One',
  voice: { summary: 's', tips: [] },
  names,
});

describe('validateUserPack size and count limits', () => {
  it('rejects YAML text over MAX_USER_PACK_BYTES before parsing it', () => {
    const big = `kind: table\nid: user.t.big\nentries:\n  - text: "${'x'.repeat(MAX_USER_PACK_BYTES)}"\n`;
    const start = performance.now();
    const res = validateUserPack(big);
    expect(performance.now() - start).toBeLessThan(500);
    expect(messages(res)).toEqual([expect.stringMatching(/larger than 1000000 bytes/)]);
  });

  it('counts UTF-8 bytes, not UTF-16 units', () => {
    const n = Math.ceil(MAX_USER_PACK_BYTES / 3) + 10; // each "€" is 3 bytes
    const res = validateUserPack(
      `kind: table\nid: user.t.e\nentries:\n  - text: "${'€'.repeat(n)}"\n`,
    );
    expect(messages(res)).toEqual([expect.stringMatching(/larger than/)]);
  });

  it('rejects an object pack over the byte cap too', () => {
    const res = validateUserPack({
      docs: [table('user.t.big', ['x'.repeat(MAX_USER_PACK_BYTES)])],
    });
    expect(messages(res)).toEqual([expect.stringMatching(/larger than/)]);
  });

  it('rejects a YAML alias bomb with a readable error', () => {
    const levels = ['a: &a [x, x, x, x, x, x, x, x, x]'];
    for (const n of 'bcdefg') {
      const prev = levels.length === 1 ? 'a' : String.fromCharCode(n.charCodeAt(0) - 1);
      levels.push(`${n}: &${n} [${Array(9).fill(`*${prev}`).join(', ')}]`);
    }
    const start = performance.now();
    const res = validateUserPack(levels.join('\n'));
    expect(performance.now() - start).toBeLessThan(500);
    expect(messages(res).join(' ')).toMatch(/alias/i);
  });

  it('returns errors (never throws) for deeply nested YAML and JSON', () => {
    expect(validateUserPack('['.repeat(100_000)).ok).toBe(false);
    let deep: unknown = 'x';
    for (let i = 0; i < 10_000; i++) deep = [deep];
    expect(validateUserPack({ docs: [deep] }).ok).toBe(false);
  });

  it(`rejects more than ${MAX_DOCUMENTS} documents`, () => {
    const docs = Array.from({ length: MAX_DOCUMENTS + 1 }, (_, i) => ({
      kind: 'vocabulary',
      tags: [`t${i}`],
    }));
    expect(messages(validateUserPack({ docs }))).toEqual([
      expect.stringMatching(/more than 500 documents/),
    ]);
  });

  it(`rejects more than ${MAX_TABLES} tables`, () => {
    // Each situation defines six facet tables; the count runs before the schema check.
    const docs = Array.from({ length: Math.ceil((MAX_TABLES + 1) / 6) }, () => ({
      kind: 'situation',
    }));
    expect(messages(validateUserPack({ docs }))).toEqual([
      expect.stringMatching(/more than 500 tables/),
    ]);
  });

  it(`rejects a table with more than ${MAX_ENTRIES_PER_TABLE} entries`, () => {
    const res = validateUserPack({
      docs: [table('user.t.long', Array(MAX_ENTRIES_PER_TABLE + 1).fill('x'))],
    });
    expect(messages(res)).toEqual([expect.stringMatching(/more than 1000 entries/)]);
    if (!res.ok) expect(res.errors[0]?.path).toBe('user-pack[0]#entries');
  });

  it(`rejects a string longer than ${MAX_TEXT_LENGTH} characters, with its path`, () => {
    const res = validateUserPack({
      docs: [table('user.t.x', ['ok', 'y'.repeat(MAX_TEXT_LENGTH + 1)])],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors[0]?.path).toBe('user-pack[0]#entries[1].text');
      expect(res.errors[0]?.code).toBe('schema');
    }
  });

  it(`rejects pick.count over ${MAX_PICK_COUNT} and more than ${MAX_FIELDS} fields`, () => {
    const pick = validateUserPack({
      docs: [
        table('user.t.a', ['x']),
        {
          kind: 'generator',
          id: 'user.g.p',
          title: 'P',
          fields: { p: { pick: { table: 'user.t.a', count: 1e9 } } },
          display: '{p}',
        },
      ],
    });
    expect(messages(pick)).toContainEqual(expect.stringMatching(/pick.count .* at most 20/));
    const fields = Object.fromEntries(
      Array.from({ length: MAX_FIELDS + 1 }, (_, i) => [`f${i}`, { template: 'x' }]),
    );
    const many = validateUserPack({
      docs: [{ kind: 'generator', id: 'user.g.f', title: 'F', fields, display: 'x' }],
    });
    expect(messages(many)).toContainEqual(expect.stringMatching(/more than 64 fields/));
  });

  it('rejects culture rules that can make names longer than MAX_NAME_LENGTH', () => {
    const res = validateUserPack({
      docs: [
        culture({
          given: { pattern: ['a', 'a', 'a?'], parts: { a: ['x'.repeat(17), 'bo'] } },
        }),
      ],
    });
    expect(messages(res)).toContainEqual(
      expect.stringMatching(new RegExp(`names up to 51 characters .* at most ${MAX_NAME_LENGTH}`)),
    );
  });

  it(`rejects more than ${MAX_BANNED_PATTERNS} banned patterns and over-long part lists`, () => {
    const res = validateUserPack({
      docs: [
        culture({
          given: {
            pattern: ['a'],
            parts: { a: Array.from({ length: MAX_NAME_PART_OPTIONS + 1 }, (_, i) => `n${i}`) },
          },
          banned: Array(MAX_BANNED_PATTERNS + 1).fill('zz'),
        }),
      ],
    });
    const all = messages(res).join('\n');
    expect(all).toMatch(/more than 24 banned patterns/);
    expect(all).toMatch(/more than 500 options/);
  });
});

describe('validateUserPack prototype keys', () => {
  it('rejects a __proto__ key anywhere with a readable schema error (YAML and JSON)', () => {
    const yaml = `kind: generator
id: user.g
title: G
fields:
  __proto__: { template: "x" }
display: "x"
`;
    for (const src of [
      yaml,
      JSON.parse(
        '{"docs":[{"kind":"generator","id":"user.g","title":"G","fields":{"__proto__":{"template":"x"}},"display":"x"}]}',
      ) as object,
    ]) {
      const res = validateUserPack(src);
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.errors[0]?.code).toBe('schema');
      expect(res.errors[0]?.message).toMatch(/"__proto__" is not allowed/);
      expect(res.errors[0]?.path).toBe('user-pack[0]#fields');
    }
    expect(({} as Record<string, unknown>).template).toBeUndefined();
  });

  it('a generator whose fields are named constructor, toString and hasOwnProperty works', () => {
    const res = validateUserPack({
      docs: [
        table('user.t.a', ['alpha', 'beta', 'gamma', 'delta']),
        {
          kind: 'generator',
          id: 'user.g.proto',
          title: 'Proto',
          fields: {
            constructor: { table: 'user.t.a' },
            toString: { table: 'user.t.a' },
            hasOwnProperty: { template: '{user.t.a}' },
          },
          display: '{constructor} {toString} {hasOwnProperty}',
        },
      ],
    });
    expect(messages(res)).toEqual([]);
    if (!res.ok) return;
    const lib = loadPacks([res.pack]);
    const card = generate(lib, 'user.g.proto', { seed: 'AAAA-AAAA' });
    expect(Object.keys(card.fields)).toEqual(['constructor', 'toString', 'hasOwnProperty']);
    expect(card.display.split(' ')).toHaveLength(3);
    const again = reroll(lib, card, { locks: ['toString'] });
    expect(again.fields[TO_STRING]?.value).toBe(card.fields[TO_STRING]?.value);
    const { code, exact } = cardToShare(lib, card);
    expect(exact).toBe(true);
    const back = cardFromShare(lib, 'user.g.proto', code);
    expect(back.ok && back.card.display).toBe(card.display);
  });
});

describe('static expansion bound (template explosion)', () => {
  const fanout = (levels: number, width: number) =>
    Array.from({ length: levels }, (_, i) =>
      table(`user.x.t${i}`, [i + 1 < levels ? `{user.x.t${i + 1}}`.repeat(width) : 'leaf']),
    );

  it('rejects a table that fans out 10 ways 5 deep, quickly, naming its cost', () => {
    const start = performance.now();
    const res = validateUserPack({ docs: fanout(5, 10) });
    expect(performance.now() - start).toBeLessThan(500);
    expect(messages(res)).toContainEqual(
      expect.stringMatching(
        new RegExp(`table "user.x.t0" can expand to 11111 steps; the limit is ${MAX_EXPANSION}`),
      ),
    );
  });

  it('accepts a modest fan-out', () => {
    const res = validateUserPack({ docs: fanout(3, 10) });
    expect(messages(res)).toEqual([]);
  });

  it('rejects generator fan-out through gen fields (no table slots at all)', () => {
    const docs = Array.from({ length: 6 }, (_, i) => ({
      kind: 'generator',
      id: `user.g.l${i}`,
      title: 'L',
      fields:
        i < 5
          ? Object.fromEntries(
              Array.from({ length: 8 }, (_, f) => [`f${f}`, { gen: `user.g.l${i + 1}` }]),
            )
          : { n: { template: 'x' } },
      display: 'x',
    }));
    const res = validateUserPack({ docs });
    expect(messages(res)).toContainEqual(expect.stringMatching(/generator "user.g.l0" can expand/));
  });

  it('pick counts multiply', () => {
    const res = validateUserPack({
      docs: [
        ...fanout(3, 10),
        {
          kind: 'generator',
          id: 'user.g.pick',
          title: 'P',
          fields: { p: { pick: { table: 'user.x.t0', count: 20 } } },
          display: '{p}',
        },
      ],
    });
    // t0 has one entry, so pick can only draw it once: cost stays small.
    expect(messages(res)).toEqual([]);
    const cost = expansionCost(res.ok ? res.pack : fantasyPack, []);
    expect(cost.get('generator:user.g.pick')).toBeLessThan(MAX_EXPANSION);
  });

  it('every shipped table and generator is well under the bound', () => {
    const cost = expansionCost(fantasyPack, [corePack]);
    const worst = Math.max(...cost.values());
    expect(worst).toBeLessThan(MAX_EXPANSION / 10);
    expect(cost.get('generator:fantasy.npc')).toBeGreaterThan(5);
  });

  it('the shipped NPC still rolls after the checks', () => {
    const lib = loadPacks([corePack, fantasyPack]);
    expect(rollTable(lib, 'fantasy.npc.role', { seed: 'AAAA-AAAA' }).text).not.toBe('');
  });
});
