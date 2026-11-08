import { describe, expect, it } from 'vitest';
import { compileDocs } from '../src/compile';
import type { PackManifest } from '../src/schema';

const manifest: PackManifest = { id: 'fantasy', version: '1.0.0', title: 'Fantasy' };
const doc = (file: string, data: unknown): { file: string; data: unknown } => ({ file, data });

const vocab = doc('src/vocab.yaml', { kind: 'vocabulary', tags: ['debt', 'urban'] });

const RICH = {
  pattern: ['a', 'b'],
  parts: { a: ['ba', 'de', 'fi', 'go', 'hu', 'ja'], b: ['ka', 'le', 'mi', 'no', 'pu', 'ra'] },
};

describe('compileDocs', () => {
  it('compiles a table with entry ids, parsed asts and defaults', () => {
    const { pack, errors } = compileDocs(manifest, [
      vocab,
      doc('src/tables/npc/role.yaml', {
        kind: 'table',
        id: 'fantasy.npc.role',
        entries: [{ text: 'a smith' }, { text: 'a clerk', weight: 3, tags: ['urban'] }],
      }),
    ]);
    expect(errors).toEqual([]);
    const t = pack.tables['fantasy.npc.role'];
    expect(t?.entries.map((e) => e.id)).toEqual(['fantasy.npc.role#0', 'fantasy.npc.role#1']);
    expect(t?.entries[0]).toMatchObject({ ast: ['a smith'], weight: 1, tags: [], safety: [] });
    expect(t?.entries[1]).toMatchObject({ weight: 3, tags: ['urban'] });
    expect(pack.vocabulary).toEqual(['debt', 'urban']);
    expect(pack.id).toBe('fantasy');
    expect(pack.version).toBe('1.0.0');
  });

  it('resolves short refs to absolute ids: sibling, then pack, then absolute', () => {
    const { pack, errors } = compileDocs(manifest, [
      doc('a.yaml', {
        kind: 'table',
        id: 'fantasy.npc.want',
        entries: [{ text: '{deadline} {time.late} {fantasy.time.deadline} {nowhere}' }],
      }),
      doc('b.yaml', { kind: 'table', id: 'fantasy.npc.deadline', entries: [{ text: 'x' }] }),
      doc('c.yaml', { kind: 'table', id: 'fantasy.time.late', entries: [{ text: 'x' }] }),
      doc('d.yaml', { kind: 'table', id: 'fantasy.time.deadline', entries: [{ text: 'x' }] }),
    ]);
    expect(errors.filter((e) => e.code !== 'unresolved-ref')).toEqual([]);
    const ast = pack.tables['fantasy.npc.want']?.entries[0]?.ast;
    const refs = (ast ?? []).flatMap((el) =>
      typeof el !== 'string' && el.slot.kind === 'table' ? [el.slot.ref] : [],
    );
    expect(refs).toEqual([
      'fantasy.npc.deadline',
      'fantasy.time.late',
      'fantasy.time.deadline',
      'nowhere',
    ]);
    expect(errors.map((e) => e.code)).toEqual(['unresolved-ref']);
  });

  it('resolves refs against dependency packs', () => {
    const core = compileDocs({ id: 'core', version: '1', title: 'Core' }, [
      doc('t.yaml', { kind: 'table', id: 'core.shared.thing', entries: [{ text: 'x' }] }),
    ]).pack;
    const { pack, errors } = compileDocs(
      manifest,
      [
        doc('t.yaml', {
          kind: 'table',
          id: 'fantasy.a.b',
          entries: [{ text: '{core.shared.thing}' }],
        }),
      ],
      [core],
    );
    expect(errors).toEqual([]);
    expect(pack.tables['fantasy.a.b']?.entries[0]?.ast).toEqual([
      { slot: { kind: 'table', ref: 'core.shared.thing' }, mods: [] },
    ]);
  });

  it('hoists culture examples, exampleChance and banned out of names', () => {
    const { pack, errors } = compileDocs(manifest, [
      doc('c.yaml', {
        kind: 'culture',
        id: 'fantasy.culture.marsh',
        name: 'Marsh-folk',
        voice: { summary: 's', tips: ['t'] },
        names: {
          given: RICH,
          format: '{given}',
          examples: ['Odrin'],
          exampleChance: 0.25,
          banned: ['aa'],
        },
      }),
      doc('d.yaml', {
        kind: 'culture',
        id: 'fantasy.culture.plain',
        name: 'Plain',
        voice: { summary: 's', tips: [] },
        names: { given: RICH },
      }),
    ]);
    expect(errors).toEqual([]);
    const c = pack.cultures['fantasy.culture.marsh'];
    expect(c).toMatchObject({ examples: ['Odrin'], exampleChance: 0.25, banned: ['aa'] });
    expect(c?.names).toEqual({
      given: RICH,
      format: '{given}',
    });
    const p = pack.cultures['fantasy.culture.plain'];
    expect(p).toMatchObject({ examples: [], exampleChance: 0, banned: [] });
    expect(p?.names).toEqual({ given: RICH });
  });

  it('resolves generator field sources and display, keeping field-name refs', () => {
    const { pack, errors } = compileDocs(manifest, [
      doc('t.yaml', { kind: 'table', id: 'fantasy.npc.role', entries: [{ text: 'smith' }] }),
      doc('o.yaml', {
        kind: 'generator',
        id: 'fantasy.other',
        title: 'O',
        fields: {},
        display: 'x',
      }),
      doc('g.yaml', {
        kind: 'generator',
        id: 'fantasy.npc',
        title: 'NPC',
        fields: {
          name: { name: 'full' },
          role: { table: 'role' },
          sub: { gen: 'other' },
          picks: { pick: { table: 'fantasy.npc.role', count: 2 } },
          line: { template: 'the {role} {npc.role|cap}' },
        },
        display: '{name}, {role|a}',
      }),
    ]);
    expect(errors).toEqual([]);
    const g = pack.generators['fantasy.npc'];
    expect(Object.keys(g?.fields ?? {})).toEqual(['name', 'role', 'sub', 'picks', 'line']);
    expect(g?.fields['sub']).toEqual({ gen: 'fantasy.other' });
    expect(g?.fields['picks']).toEqual({ pick: { table: 'fantasy.npc.role', count: 2 } });
    // generator-owned refs try <generatorId>.<ref> first: table "role" -> fantasy.npc.role
    expect(g?.fields['role']).toEqual({ table: 'fantasy.npc.role' });
    // `role` is also a field name, so it stays a short field ref (R10); `npc.role` resolves
    expect(g?.fields['line']).toEqual({
      template: [
        'the ',
        { slot: { kind: 'table', ref: 'role' }, mods: [] },
        ' ',
        { slot: { kind: 'table', ref: 'fantasy.npc.role' }, mods: [{ kind: 'cap' }] },
      ],
    });
    expect(g?.display).toEqual([
      { slot: { kind: 'name', part: 'full' }, mods: [] },
      ', ',
      { slot: { kind: 'table', ref: 'role' }, mods: [{ kind: 'a' }] },
    ]);
  });

  it('compiles oracles and decks', () => {
    const odds = { yes: 50, extreme: 5 };
    const { pack, errors } = compileDocs(manifest, [
      doc('o.yaml', {
        kind: 'oracle',
        id: 'fantasy.oracle',
        odds: { certain: odds, likely: odds, even: odds, unlikely: odds, remote: odds },
        meaning: ['fantasy.meaning.action'],
      }),
      doc('m.yaml', { kind: 'table', id: 'fantasy.meaning.action', entries: [{ text: 'x' }] }),
      doc('k.yaml', {
        kind: 'deck',
        id: 'fantasy.moves',
        title: 'Moves',
        cards: [{ id: 'one', text: 'One' }],
      }),
    ]);
    expect(errors).toEqual([]);
    expect(pack.oracles['fantasy.oracle']?.meaning).toEqual(['fantasy.meaning.action']);
    expect(pack.decks['fantasy.moves']?.cards).toEqual([{ id: 'one', text: 'One' }]);
  });

  it('reports schema errors with file#locator path and packId', () => {
    const { errors } = compileDocs(manifest, [
      doc('src/tables/x.yaml', {
        kind: 'table',
        id: 'fantasy.x.y',
        entries: [{ text: 'ok' }, { text: 'bad', weight: -1 }],
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'schema', packId: 'fantasy' });
    expect(errors[0]?.path).toBe('src/tables/x.yaml#entries[1].weight');
  });

  it('reports duplicate ids once, keeping the first', () => {
    const { pack, errors } = compileDocs(manifest, [
      doc('a.yaml', { kind: 'table', id: 'fantasy.a.b', entries: [{ text: 'first' }] }),
      doc('b.yaml', { kind: 'table', id: 'fantasy.a.b', entries: [{ text: 'second' }] }),
    ]);
    expect(errors.map((e) => e.code)).toEqual(['duplicate-id']);
    expect(errors[0]?.path).toBe('b.yaml');
    expect(pack.tables['fantasy.a.b']?.entries[0]?.ast).toEqual(['first']);
  });

  it('reports template parse errors with real path and packId', () => {
    const { errors } = compileDocs(manifest, [
      doc('t.yaml', {
        kind: 'table',
        id: 'fantasy.a.b',
        entries: [{ text: 'ok' }, { text: 'a {' }],
      }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'schema', packId: 'fantasy' });
    expect(errors[0]?.path).toBe('t.yaml#entries[1]');
  });

  it('reports lint-class problems with file paths (lint runs inside compile)', () => {
    const { errors } = compileDocs(manifest, [
      vocab,
      doc('src/t.yaml', {
        kind: 'table',
        id: 'fantasy.a.b',
        entries: [{ text: 'x' }, { text: 'y', tags: ['nope'] }],
      }),
    ]);
    expect(errors.map((e) => [e.code, e.path])).toEqual([['unknown-tag', 'src/t.yaml#entries[1]']]);
  });

  it('rejects malformed ids (e.g. __proto__, y) and accepts namespaced ones', () => {
    const t = (id: string): unknown => ({ kind: 'table', id, entries: [{ text: 'x' }] });
    for (const bad of ['__proto__', 'y']) {
      const { pack, errors } = compileDocs(manifest, [doc('bad.yaml', t(bad))]);
      expect(errors.map((e) => e.code)).toEqual(['schema']);
      expect(errors[0]?.path).toBe('bad.yaml#id');
      expect(Object.keys(pack.tables)).toEqual([]);
    }
    const ok = compileDocs(manifest, [doc('ok.yaml', t('fantasy.npc.want'))]);
    expect(ok.errors).toEqual([]);
    expect(Object.keys(ok.pack.tables)).toEqual(['fantasy.npc.want']);
  });
});
