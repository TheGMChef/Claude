import { describe, expect, it } from 'vitest';
import { GENERATORS, lib } from '../lib';
import { SUBTYPES_BY_KIND } from '../../data/schema';
import { FIELDS_BY_KIND, FIELD_LABELS, GENERATOR_KINDS, fieldLabel } from '../fields';

describe('generator kinds (M-D6)', () => {
  it('every generator maps to a kind, with a valid subtype when the kind has subtypes', () => {
    expect(GENERATORS).toHaveLength(15);
    for (const g of GENERATORS) {
      const m = GENERATOR_KINDS[g.id];
      expect(m, g.id).toBeDefined();
      const allowed = SUBTYPES_BY_KIND[m!.kind];
      if (allowed) expect(allowed, g.id).toContain(m!.subtype);
      else expect(m!.subtype, g.id).toBeUndefined();
    }
  });

  it('has no entry for a generator that does not exist', () => {
    const ids = new Set(GENERATORS.map((g) => g.id));
    for (const id of Object.keys(GENERATOR_KINDS)) expect(ids.has(id), id).toBe(true);
  });

  it('matches the M-D6 table for a spread of generators', () => {
    expect(GENERATOR_KINDS['fantasy.npc']).toEqual({ kind: 'npc' });
    expect(GENERATOR_KINDS['fantasy.clue']).toEqual({ kind: 'clue' });
    expect(GENERATOR_KINDS['fantasy.tavern']).toEqual({ kind: 'place', subtype: 'tavern' });
    expect(GENERATOR_KINDS['fantasy.secret']).toEqual({ kind: 'note', subtype: 'detail' });
    expect(GENERATOR_KINDS['fantasy.prep.pressure']).toEqual({ kind: 'note', subtype: 'detail' });
  });
});

describe('field labels', () => {
  it('labels every field key of every generator, in sentence case', () => {
    for (const g of GENERATORS) {
      const keys = Object.keys(lib.generator(g.id)!.fields);
      expect(keys.length, g.id).toBeGreaterThan(0);
      for (const k of keys) {
        const label = FIELD_LABELS[k];
        expect(label, `${g.id}.${k}`).toBeDefined();
        expect(label, k).toMatch(/^[A-Z][^A-Z]*$|^[A-Z][a-z' ,.?]+$/);
        expect(label, k).not.toMatch(/[a-z][A-Z]/);
      }
    }
  });

  it('every label is sentence case: first letter capital, no other capital letters', () => {
    for (const [k, v] of Object.entries(FIELD_LABELS)) {
      expect(v.slice(1), k).toBe(v.slice(1).toLowerCase());
      expect(v[0], k).toBe(v[0]!.toUpperCase());
    }
  });

  it('uses the plan wording', () => {
    expect(FIELD_LABELS.knownFor).toBe('Known for');
    expect(FIELD_LABELS.truth).toBe('True?');
    expect(FIELD_LABELS.a).toBe('First situation');
    expect(FIELD_LABELS.delivery).toBe("How it's found");
  });

  it('fieldLabel falls back to a sentence-cased split of unknown camelCase keys', () => {
    expect(fieldLabel('knownFor')).toBe('Known for');
    expect(fieldLabel('someNewField')).toBe('Some new field');
    expect(fieldLabel('x')).toBe('X');
  });
});

describe('FIELDS_BY_KIND (D59)', () => {
  it('follows the D59 order for npc', () => {
    expect(FIELDS_BY_KIND('npc')).toEqual([
      'role',
      'look',
      'want',
      'secret',
      'voice',
      'tell',
      'culture',
      'say',
    ]);
  });
  it('depends on the subtype', () => {
    expect(FIELDS_BY_KIND('place', 'settlement')).toEqual([
      'size',
      'knownFor',
      'trouble',
      'power',
      'sight',
      'sound',
      'smell',
    ]);
    expect(FIELDS_BY_KIND('place', 'shop')).toEqual([
      'kind',
      'keeper',
      'wares',
      'oddity',
      'haggle',
    ]);
    expect(FIELDS_BY_KIND('place')).toEqual(FIELDS_BY_KIND('place', 'location'));
    expect(FIELDS_BY_KIND('item', 'treasure')).toEqual(['worth', 'hook']);
    expect(FIELDS_BY_KIND('note', 'rumor')).toEqual(['truth', 'source']);
  });
  it('front is plain text (portent, doom) and thread and seed have none', () => {
    expect(FIELDS_BY_KIND('front')).toEqual(['portent', 'doom']);
    expect(FIELDS_BY_KIND('thread')).toEqual([]);
    expect(FIELDS_BY_KIND('note', 'seed')).toEqual([]);
  });
  it('every listed key has a label', () => {
    for (const kind of [
      'pc',
      'npc',
      'place',
      'front',
      'truth',
      'clue',
      'scene',
      'item',
      'note',
    ] as const) {
      for (const sub of [undefined, ...(SUBTYPES_BY_KIND[kind] ?? [])]) {
        for (const k of FIELDS_BY_KIND(kind, sub))
          expect(FIELD_LABELS[k], `${kind}/${sub}/${k}`).toBeDefined();
      }
    }
  });
});
