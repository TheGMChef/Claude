import { describe, expect, it } from 'vitest';
import {
  ContentError,
  CultureSrc,
  DeckSrc,
  DEFAULT_LINES,
  DocumentSrc,
  GeneratorSrc,
  OracleSrc,
  PackManifestSrc,
  SAFETY_VOCABULARY,
  TableSrc,
  VocabularySrc,
} from '../src/index';

const table = { kind: 'table', id: 'fantasy.npc.want', entries: [{ text: 'a thing' }] };

describe('schemas', () => {
  it('defaults weight to 1 and tags/safety to []', () => {
    const t = TableSrc.parse(table);
    expect(t.entries[0]).toEqual({ text: 'a thing', weight: 1, tags: [], safety: [] });
    expect(t.tags).toEqual([]);
  });
  it('rejects weight 0 and negative', () => {
    expect(TableSrc.safeParse({ ...table, entries: [{ text: 'x', weight: 0 }] }).success).toBe(
      false,
    );
    expect(TableSrc.safeParse({ ...table, entries: [{ text: 'x', weight: -1 }] }).success).toBe(
      false,
    );
  });
  it('rejects an unknown kind', () => {
    expect(DocumentSrc.safeParse({ kind: 'spell', id: 'a.b.c' }).success).toBe(false);
  });
  it('accepts the pick field source', () => {
    const g = GeneratorSrc.parse({
      kind: 'generator',
      id: 'a.b',
      title: 'T',
      fields: { aspects: { pick: { table: 'x', count: 3 } }, n: { name: 'given' } },
      display: '{n}',
    });
    expect(Object.keys(g.fields)).toEqual(['aspects', 'n']);
  });
  it('rejects a bad name part and malformed field source', () => {
    const g = {
      kind: 'generator',
      id: 'a.b',
      title: 'T',
      display: '',
      fields: { n: { name: 'middle' } },
    };
    expect(GeneratorSrc.safeParse(g).success).toBe(false);
  });
  it('parses a culture with optional parts and defaults', () => {
    const c = CultureSrc.parse({
      kind: 'culture',
      id: 'f.culture.marsh',
      name: 'Marsh',
      voice: { summary: 's', tips: ['t'] },
      names: {
        given: {
          pattern: ['start', 'mid?', 'end?:0.3'],
          parts: { start: ['O'], mid: ['dr'], end: ['in'] },
        },
      },
    });
    expect(c.names.exampleChance).toBe(0);
    expect(c.names.banned).toEqual([]);
  });
  it('rejects a malformed pattern token', () => {
    const base = { kind: 'culture', id: 'a.b.c', name: 'n', voice: { summary: '', tips: [] } };
    const bad = { ...base, names: { given: { pattern: ['mid?:abc'], parts: {} } } };
    expect(CultureSrc.safeParse(bad).success).toBe(false);
  });
  it('parses oracle, deck, vocabulary and manifest', () => {
    const o = { yes: 50, extreme: 8 };
    expect(
      OracleSrc.safeParse({
        kind: 'oracle',
        id: 'a.oracle',
        odds: { certain: o, likely: o, even: o, unlikely: o, remote: o },
        meaning: ['a.b.c', 'a.b.d'],
      }).success,
    ).toBe(true);
    expect(
      DeckSrc.safeParse({
        kind: 'deck',
        id: 'core.d',
        title: 'D',
        cards: [{ id: 'x', text: 'T', prompt: 'P' }],
      }).success,
    ).toBe(true);
    expect(VocabularySrc.safeParse({ kind: 'vocabulary', tags: ['debt'] }).success).toBe(true);
    expect(
      PackManifestSrc.safeParse({ id: 'fantasy', version: '1.0.0', title: 'Fantasy' }).success,
    ).toBe(true);
  });
});

describe('safety vocabulary and errors', () => {
  it('has 25 tags including child-harm and claustrophobia', () => {
    expect(SAFETY_VOCABULARY.length).toBe(25);
    expect(SAFETY_VOCABULARY).toContain('child-harm');
    expect(SAFETY_VOCABULARY).toContain('claustrophobia');
    expect(DEFAULT_LINES).toEqual(['child-harm']);
  });
  it('ContentError carries code, path and packId', () => {
    const e = new ContentError('cycle', 'loops', 'a.b#0', 'fantasy');
    expect(e).toBeInstanceOf(Error);
    expect([e.code, e.path, e.packId]).toEqual(['cycle', 'a.b#0', 'fantasy']);
  });
});
