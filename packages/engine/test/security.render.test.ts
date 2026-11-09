import { describe, expect, it } from 'vitest';
import { batch, generate, rollTable } from '../src/generate';
import type { Card } from '../src/generate';
import { loadPacks } from '../src/library';
import { BUDGET_PLACEHOLDER } from '../src/render';
import type { CompiledPack, CompiledTable } from '../src/schema';
import { parseTemplate } from '../src/template';
import { corePack, fantasyPack } from './fixtures/starter-packs';

// Compiled packs built by hand: they skip validateUserPack's static bound on purpose (a pack read
// back from storage, or a future loader that forgets the check), so only the runtime budget holds.
const pack = (p: Partial<CompiledPack>): CompiledPack => ({
  id: 'user',
  version: '0',
  tables: {},
  cultures: {},
  generators: {},
  oracles: {},
  decks: {},
  situations: {},
  vocabulary: [],
  ...p,
});
const table = (id: string, texts: string[], safety: string[] = []): CompiledTable => ({
  id,
  tags: [],
  entries: texts.map((t, i) => ({
    id: `${id}#${i}`,
    ast: parseTemplate(t),
    weight: 1,
    tags: [],
    safety,
  })),
});

const fanout = (levels: number, width: number): Record<string, CompiledTable> =>
  Object.fromEntries(
    Array.from({ length: levels }, (_, i) => [
      `user.x.t${i}`,
      table(`user.x.t${i}`, [i + 1 < levels ? `{user.x.t${i + 1}} `.repeat(width) : 'leaf']),
    ]),
  );

describe('runtime render budget', () => {
  it('a 10-way, 8-deep table stops at the budget with a visible placeholder', () => {
    const lib = loadPacks([pack({ tables: fanout(8, 10) })]);
    const start = performance.now();
    const r = rollTable(lib, 'user.x.t0', { seed: 'AAAA-AAAA' });
    expect(performance.now() - start).toBeLessThan(3000);
    expect(r.text).toContain(BUDGET_PLACEHOLDER);
    expect(r.text.length).toBeLessThan(2_000_000);
  });

  it('sub-generator fan-out (gen fields only, no slots) stops too', () => {
    const generators: CompiledPack['generators'] = {};
    for (let i = 0; i < 8; i++) {
      const fields: CompiledPack['generators'][string]['fields'] = {};
      for (let f = 0; f < 10; f++)
        fields[`f${f}`] = i < 7 ? { gen: `user.g.l${i + 1}` } : { template: ['x'] };
      generators[`user.g.l${i}`] = { id: `user.g.l${i}`, title: 'L', fields, display: ['d'] };
    }
    const lib = loadPacks([pack({ generators })]);
    const start = performance.now();
    const card = generate(lib, 'user.g.l0', { seed: 'AAAA-AAAA' });
    expect(performance.now() - start).toBeLessThan(5000);
    expect(Object.keys(card.fields)).toHaveLength(10);
  });

  it('hitting the budget never selects a lined entry nor clears blocked', () => {
    const tables = {
      ...fanout(7, 10),
      'user.x.bad': table('user.x.bad', ['harm'], ['child-harm']),
      'user.x.first': table('user.x.first', ['{user.x.bad} {user.x.t0}']),
      'user.x.last': table('user.x.last', ['{user.x.t0} {user.x.bad}']),
    };
    const lib = loadPacks([pack({ tables })]);
    const context = { safety: { lines: ['child-harm'], veils: [] } };
    const first = rollTable(lib, 'user.x.first', { seed: 'AAAA-AAAA', context });
    expect(first.blocked).toBe(true); // set before the budget ran out, and kept
    expect(first.text).not.toContain('harm');
    const last = rollTable(lib, 'user.x.last', { seed: 'AAAA-AAAA', context });
    expect(last.text).not.toContain('harm'); // past the budget nothing is selected at all
    expect(last.text.endsWith(BUDGET_PLACEHOLDER)).toBe(true);
  });

  it('a 200-card batch of the shipped NPC never reaches the budget', () => {
    const lib = loadPacks([corePack, fantasyPack]);
    const out = batch(lib, [{ generatorId: 'fantasy.npc', count: 200 }], { seed: 'AAAA-AAAA' });
    const cards = out as Card[];
    expect(cards).toHaveLength(200);
    for (const c of cards) {
      expect(c.display).not.toContain(BUDGET_PLACEHOLDER);
      for (const f of Object.values(c.fields)) expect(f.value).not.toContain(BUDGET_PLACEHOLDER);
    }
  });
});
