import { describe, expect, it } from 'vitest';
import { entitiesToMarkdown } from '../export/markdown';
import type { Entity } from '../schema';

const base: Entity = {
  id: 'ent_0000000000000001',
  campaignId: 'cmp_0000000000000001',
  kind: 'npc',
  title: 'Odrin Vey',
  aliases: [],
  summary: 'A ferryman',
  fields: { want: 'to pay off [[Marl Hollow]]', secret: 'line one\nline two' },
  body: 'Drinks at [[The Otter]].',
  canon: 'kept',
  origin: 'manual',
  tokens: [],
  wikiTargets: [],
  createdAt: 1,
  updatedAt: 1,
} as unknown as Entity;

describe('entitiesToMarkdown', () => {
  const md = entitiesToMarkdown(
    'Marrow\nCoast',
    [base, { ...base, id: 'ent_2', title: 'Aa', kind: 'place' }],
    new Date(2026, 10, 15, 12),
  );
  it('has a heading, kind sections and entries', () => {
    expect(md).toContain('# Marrow Coast');
    expect(md).toContain('## NPCs');
    expect(md).toContain('## Places');
    expect(md).toContain('### Odrin Vey');
  });
  it('keeps wiki links and labels fields', () => {
    expect(md).toContain('- **Want:** to pay off [[Marl Hollow]]');
    expect(md).toContain('Drinks at [[The Otter]].');
  });
  it('keeps multi-line values inside their list item', () => {
    expect(md).toContain('- **Secret:** line one\n  line two');
  });
  it('an empty Codex still gives a valid document', () => {
    expect(entitiesToMarkdown('X', [], new Date(2026, 0, 1))).toBe(
      '# X\n\n_Prep Desk Codex, exported 2026-01-01_\n',
    );
  });
  it('a title cannot add a heading line', () => {
    const evil = entitiesToMarkdown('X', [{ ...base, title: 'Hi\n# Pwned' }], new Date(2026, 0, 1));
    expect(evil).toContain('### Hi # Pwned');
    expect(evil).not.toMatch(/^# Pwned/m);
  });
});
