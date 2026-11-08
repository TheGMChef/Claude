import { describe, expect, it, vi } from 'vitest';
import { compileDocs } from '../src/compile';
import { generate, rollTable } from '../src/generate';
import { loadPacks } from '../src/library';
import { askOracle, drawMove } from '../src/oracle';
import { SAFETY_VOCABULARY } from '../src/safety';
import { validateUserPack } from '../src/userPack';
import { npcPack } from './fixtures/npc-pack';

const userYaml = `
kind: table
id: user.npc.quirk
entries:
  - text: hums sea shanties
  - text: collects buttons
---
kind: generator
id: user.npc
title: My NPC
fields:
  role: { table: test.npc.role }
  quirk: { table: quirk }
display: '{role|cap}, {quirk}'
`;

describe('validateUserPack', () => {
  it('validates a YAML string in the user namespace', () => {
    const res = validateUserPack(userYaml, [npcPack]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pack.id).toBe('user');
    expect(res.pack.version).toBe('0');
    expect(Object.keys(res.pack.tables)).toEqual(['user.npc.quirk']);
    expect(res.pack.generators['user.npc']?.fields).toEqual({
      role: { table: 'test.npc.role' },
      quirk: { table: 'user.npc.quirk' },
    });
  });

  it('rejects ids outside the user namespace with one namespace error naming the id', () => {
    const res = validateUserPack(`
kind: table
id: fantasy.npc.want
entries:
  - text: to steal the crown
`);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]?.code).toBe('namespace');
    expect(res.errors[0]?.message).toContain('fantasy.npc.want');
  });

  it('returns a schema error for malformed YAML and never throws', () => {
    const run = () => validateUserPack('kind: table\nid: [unclosed\n  entries: {');
    expect(run).not.toThrow();
    const res = run();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors.every((e) => e.code === 'schema')).toBe(true);
  });

  it('returns compile errors (schema, unresolved refs) instead of throwing', () => {
    const res = validateUserPack({
      kind: 'table',
      id: 'user.t.x',
      entries: [{ text: '{user.t.missing}' }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.map((e) => e.code)).toEqual(['unresolved-ref']);
    for (const bad of [null, 42, 'just a string', [1, 2]]) {
      const r = validateUserPack(bad as unknown as object);
      expect(r.ok).toBe(false);
    }
  });

  it('accepts a single document object, an array of documents, and { manifest, docs }', () => {
    const table = { kind: 'table', id: 'user.t.a', entries: [{ text: 'a' }] };
    expect(validateUserPack(table).ok).toBe(true);
    expect(validateUserPack([table]).ok).toBe(true);
    const res = validateUserPack({
      manifest: { id: 'user', version: '3', title: 'Mine' },
      docs: [table],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.pack.version).toBe('3');
  });

  describe('oracles and decks the runtime can always use (I1)', () => {
    const odds = { yes: 50, extreme: 10 };
    const allOdds = { certain: odds, likely: odds, even: odds, unlikely: odds, remote: odds };
    const tables = [
      { kind: 'table', id: 'user.m.verb', entries: [{ text: 'hide' }, { text: 'seek' }] },
      { kind: 'table', id: 'user.m.noun', entries: [{ text: 'key' }, { text: 'door' }] },
    ];
    const oracle = (meaning: string[]) => ({
      kind: 'oracle',
      id: 'user.oracle',
      odds: allOdds,
      meaning,
    });
    const deck = (cards: unknown[]) => ({ kind: 'deck', id: 'user.moves', title: 'Moves', cards });

    it('rejects an oracle without exactly two meaning tables, naming the problem', () => {
      for (const meaning of [['user.m.verb'], ['user.m.verb', 'user.m.noun', 'user.m.verb'], []]) {
        const res = validateUserPack([...tables, oracle(meaning)]);
        expect(res.ok).toBe(false);
        if (res.ok) continue;
        const err = res.errors.find((e) => e.code === 'schema');
        expect(err?.path).toMatch(/meaning/);
        expect(err?.message).toMatch(/exactly 2 meaning tables/);
      }
    });

    it('rejects a deck with no cards, naming the problem', () => {
      const res = validateUserPack([deck([])]);
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.errors.map((e) => e.code)).toEqual(['schema']);
      expect(res.errors[0]?.path).toMatch(/cards/);
      expect(res.errors[0]?.message).toMatch(/at least 1 card/);
    });

    it('accepts safety tags on deck cards and rejects unknown ones', () => {
      const ok = validateUserPack([deck([{ id: 'burn', text: 'Burn it', safety: ['fire'] }])]);
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.pack.decks['user.moves']?.cards[0]?.safety).toEqual(['fire']);
      const bad = validateUserPack([deck([{ id: 'burn', text: 'Burn it', safety: ['flames'] }])]);
      expect(bad.ok).toBe(false);
      if (bad.ok) return;
      expect(bad.errors.map((e) => [e.code, e.message, e.path])).toEqual([
        ['unknown-safety-tag', 'unknown safety tag "flames"', 'user-pack[0]#cards[0]'],
      ]);
    });

    it('a valid pack never makes askOracle or drawMove throw, even with every tag lined', () => {
      const res = validateUserPack([
        ...tables,
        oracle(['user.m.verb', 'user.m.noun']),
        deck([{ id: 'only', text: 'Something shifts' }]),
      ]);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const lib = loadPacks([res.pack]);
      const safety = { lines: [...SAFETY_VOCABULARY], veils: [] };
      for (let i = 0; i < 200; i++) {
        for (const likelihood of ['certain', 'likely', 'even', 'unlikely', 'remote'] as const) {
          const r = askOracle(lib, 'user.oracle', likelihood, { seed: `s${i}`, safety });
          expect(r.meaning.every((w) => w !== '')).toBe(true);
        }
        expect(drawMove(lib, 'user.moves', { seed: `s${i}`, exclude: ['only'], safety }).id).toBe(
          'only',
        );
      }
    });
  });

  it('a user entry cannot read the context prototype chain (I2)', () => {
    const res = validateUserPack({
      kind: 'table',
      id: 'user.t.probe',
      entries: [{ text: 'x {ctx.constructor}{ctx.toString}{ctx.settlement.constructor} y' }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = rollTable(loadPacks([res.pack]), 'user.t.probe', {
      seed: 'AAAA-0000',
      context: { settlement: { name: 'Saltmere' } },
    });
    warn.mockRestore();
    expect(r.text).toBe('x  y');
  });

  it('refs named like Object.prototype members are unresolved, and never throw (I2)', () => {
    const g = {
      kind: 'generator',
      id: 'user.g',
      title: 'g',
      fields: { a: { template: 'hi' } },
      display: '{a}',
    };
    const withRef = (text: string) => [
      g,
      {
        kind: 'generator',
        id: 'user.h',
        title: 'h',
        fields: { b: { template: text } },
        display: '{b}',
      },
    ];
    const cases: Array<[string, string]> = [
      ['{gen:user.g.constructor}', 'missing-source'],
      ['{gen:user.g.__proto__}', 'missing-source'],
      ['{gen:constructor.x}', 'unresolved-ref'],
      ['{constructor}', 'unresolved-ref'],
      ['{toString}', 'unresolved-ref'],
    ];
    for (const [text, code] of cases) {
      const res = validateUserPack(withRef(text));
      expect(res.ok, text).toBe(false);
      if (res.ok) continue;
      expect(
        res.errors.map((e) => e.code),
        text,
      ).toEqual([code]);
      // Even past lint (a pack loaded without validation), generation must not throw.
      const pack = compileDocs(
        { id: 'user', version: '0', title: 'u' },
        withRef(text).map((data, i) => ({ file: `d${i}`, data })),
      ).pack;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(
        () => generate(loadPacks([pack]), 'user.h', { seed: 'AAAA-0000' }),
        text,
      ).not.toThrow();
      warn.mockRestore();
    }
  });

  it('rejects a table with no entries as a schema error (never reaches the runtime)', () => {
    const res = validateUserPack('kind: table\nid: user.npc.nothing\nentries: []\n');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.map((e) => [e.code, e.message, e.path])).toEqual([
      ['schema', 'a table needs at least 1 entry', 'user-pack[0]#entries'],
    ]);
  });

  it('rejects an empty pack with a schema error', () => {
    for (const src of ['', '---\n', []]) {
      const res = validateUserPack(src);
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.errors.map((e) => e.code)).toEqual(['schema']);
      expect(res.errors[0]?.message).toMatch(/empty/);
    }
  });
});
