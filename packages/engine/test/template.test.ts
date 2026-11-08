import { describe, expect, it } from 'vitest';
import { ContentError } from '../src/errors';
import { findCycle, parseTemplate, templateRefs } from '../src/template';

function schemaError(text: string): void {
  try {
    parseTemplate(text);
  } catch (e) {
    expect(e).toBeInstanceOf(ContentError);
    expect((e as ContentError).code).toBe('schema');
    return;
  }
  throw new Error(`expected parseTemplate to throw for ${JSON.stringify(text)}`);
}

describe('parseTemplate', () => {
  it('parses a table slot with a cap modifier', () => {
    expect(parseTemplate('to pay {fantasy.time.deadline|cap}')).toEqual([
      'to pay ',
      { slot: { kind: 'table', ref: 'fantasy.time.deadline' }, mods: [{ kind: 'cap' }] },
    ]);
  });
  it('parses ctx with or fallback', () => {
    expect(parseTemplate('{ctx.settlement.name|or:town}')).toEqual([
      { slot: { kind: 'ctx', path: 'settlement.name' }, mods: [{ kind: 'or', fallback: 'town' }] },
    ]);
  });
  it('parses gen slots', () => {
    expect(parseTemplate('{gen:fantasy.npc.name}')).toEqual([
      { slot: { kind: 'gen', generator: 'fantasy.npc', field: 'name' }, mods: [] },
    ]);
  });
  it('parses name slots and escaped braces', () => {
    expect(parseTemplate('{name:given} \\{x\\}')).toEqual([
      { slot: { kind: 'name', part: 'given' }, mods: [] },
      ' {x}',
    ]);
    expect(parseTemplate('{name}')).toEqual([{ slot: { kind: 'name', part: 'full' }, mods: [] }]);
    expect(parseTemplate('{name:family}')).toEqual([
      { slot: { kind: 'name', part: 'family' }, mods: [] },
    ]);
  });
  it('handles empty, plain and merged text', () => {
    expect(parseTemplate('')).toEqual([]);
    expect(parseTemplate('plain')).toEqual(['plain']);
    expect(parseTemplate('a\\{b\\}c')).toEqual(['a{b}c']);
  });
  it('trims slot content and modifier names, chains modifiers', () => {
    expect(parseTemplate('{ ctx.a | a | cap | or: x y }')).toEqual([
      {
        slot: { kind: 'ctx', path: 'a' },
        mods: [{ kind: 'a' }, { kind: 'cap' }, { kind: 'or', fallback: 'x y' }],
      },
    ]);
  });
  it('throws schema errors', () => {
    schemaError('oops {unclosed');
    schemaError('{}');
    schemaError('{  }');
    schemaError('{gen:x}');
    schemaError('{gen:x.}');
    schemaError('{a|bogus}');
    schemaError('{name:middle}');
    schemaError('{ctx.}');
  });
});

describe('templateRefs', () => {
  it('returns de-duplicated refs in first-seen order', () => {
    const ast = parseTemplate('{b.x} {gen:g.h.f} {a.y} {b.x} {gen:g.h.z} {gen:c.d.f} {ctx.q}');
    expect(templateRefs(ast)).toEqual({ tables: ['b.x', 'a.y'], generators: ['g.h', 'c.d'] });
  });
});

describe('findCycle', () => {
  it('finds a cycle path', () => {
    expect(
      findCycle(
        new Map([
          ['a', ['b']],
          ['b', ['a']],
        ]),
      ),
    ).toEqual(['a', 'b', 'a']);
  });
  it('returns null when acyclic, treating absent keys as leaves', () => {
    expect(
      findCycle(
        new Map([
          ['a', ['b', 'c']],
          ['b', ['c']],
        ]),
      ),
    ).toBeNull();
  });
  it('finds self loops and cycles not at the start', () => {
    expect(findCycle(new Map([['a', ['a']]]))).toEqual(['a', 'a']);
    expect(
      findCycle(
        new Map([
          ['a', ['b']],
          ['b', ['c']],
          ['c', ['b']],
        ]),
      ),
    ).toEqual(['b', 'c', 'b']);
  });
});
