import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileDocs } from '../src/compile';
import { BLOCKED_DISPLAY, BLOCKED_VALUE, generate } from '../src/generate';
import { loadPacks } from '../src/library';

/**
 * I5: the display line blanks only when it actually uses a blocked field (a field ref), or when one
 * of its own display-only slots (table or `{gen:}`) is blocked. Blocked fields the display does not
 * use leave it intact, and that holds through `gen` fields (sub-cards).
 */
const docs = [
  {
    kind: 'table',
    id: 'd.t.role',
    entries: [
      { text: 'smith', safety: ['fire'] },
      { text: 'baker', safety: ['fire'] },
    ],
  },
  {
    kind: 'table',
    id: 'd.t.secret',
    entries: [
      { text: 'hid a body', safety: ['violence'] },
      { text: 'broke a jaw', safety: ['violence'] },
    ],
  },
  { kind: 'table', id: 'd.t.plain', entries: [{ text: 'quiet' }, { text: 'tall' }] },
  {
    kind: 'generator',
    id: 'd.person',
    title: 'Person',
    fields: {
      plain: { table: 'd.t.plain' },
      role: { table: 'd.t.role' },
      secret: { table: 'd.t.secret' },
    },
    display: '{plain} {role}',
  },
  {
    kind: 'generator',
    id: 'd.inn',
    title: 'Inn',
    fields: { sign: { template: 'The Goose' }, keeper: { gen: 'd.person' } },
    display: '{sign}, kept by {keeper}',
  },
  {
    kind: 'generator',
    id: 'd.gossip',
    title: 'Gossip',
    fields: { sign: { template: 'The Goose' } },
    display: '{sign} hears that someone {gen:d.person.secret}',
  },
  {
    kind: 'generator',
    id: 'd.rumour',
    title: 'Rumour',
    fields: { sign: { template: 'The Goose' } },
    display: '{sign}: someone {d.t.secret}',
  },
];

const compiled = compileDocs(
  { id: 'd', version: '1', title: 'Display pack' },
  docs.map((data, i) => ({ file: `d${i}`, data })),
);
const lib = loadPacks([compiled.pack]);
const lines = (...l: string[]) => ({ safety: { lines: l, veils: [] } });

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('display blanking (I5)', () => {
  it('the fixture compiles', () => {
    expect(compiled.errors).toEqual([]);
  });

  it('a blocked field the display does not use leaves the display intact', () => {
    const card = generate(lib, 'd.person', { seed: 'DISP-0001', context: lines('violence') });
    expect(card.fields.secret).toMatchObject({ value: BLOCKED_VALUE, blocked: true });
    expect(card.display).toBe(`${card.fields.plain?.value} ${card.fields.role?.value}`);
  });

  it('a blocked field the display references blanks it', () => {
    const card = generate(lib, 'd.person', { seed: 'DISP-0001', context: lines('fire') });
    expect(card.fields.role).toMatchObject({ value: BLOCKED_VALUE, blocked: true });
    expect(card.display).toBe(BLOCKED_DISPLAY);
  });

  it('cascades through gen fields only when the sub-card display is blanked', () => {
    const fine = generate(lib, 'd.inn', { seed: 'DISP-0002', context: lines('violence') });
    expect(fine.fields.keeper?.blocked).toBeUndefined();
    expect(fine.display).toBe(`The Goose, kept by ${fine.fields.keeper?.value}`);

    const blank = generate(lib, 'd.inn', { seed: 'DISP-0002', context: lines('fire') });
    expect(blank.fields.keeper).toMatchObject({ value: BLOCKED_VALUE, blocked: true });
    expect(blank.display).toBe(BLOCKED_DISPLAY);
  });

  it('a gen field records only the provenance its text shows (sub-display fields)', () => {
    const inn = generate(lib, 'd.inn', { seed: 'DISP-0003' });
    const sources = inn.fields.keeper?.sources ?? [];
    expect(sources.some((s) => s.startsWith('d.t.plain#'))).toBe(true);
    expect(sources.some((s) => s.startsWith('d.t.role#'))).toBe(true);
    expect(sources.some((s) => s.startsWith('d.t.secret#'))).toBe(false);
  });

  it('a blocked display-only {gen:} slot or table slot blanks the display', () => {
    expect(generate(lib, 'd.gossip', { seed: 'DISP-0004' }).display).toMatch(/^The Goose hears/);
    expect(
      generate(lib, 'd.gossip', { seed: 'DISP-0004', context: lines('violence') }).display,
    ).toBe(BLOCKED_DISPLAY);
    expect(generate(lib, 'd.rumour', { seed: 'DISP-0005' }).display).toMatch(/^The Goose: someone/);
    expect(
      generate(lib, 'd.rumour', { seed: 'DISP-0005', context: lines('violence') }).display,
    ).toBe(BLOCKED_DISPLAY);
  });
});
