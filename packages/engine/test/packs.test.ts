import { describe, expect, it } from 'vitest';
import { askOracle, drawMove } from '../src/oracle';
import { batch, generate } from '../src/generate';
import type { Card } from '../src/generate';
import { lintPack } from '../src/lint';
import { normalizeName } from '../src/names';
import type { NameResult } from '../src/names';
import { SAFETY_VOCABULARY } from '../src/safety';
import { corePack, fantasyPack, lib } from './fixtures/starter-packs';

const CULTURES = ['fantasy.culture.marsh', 'fantasy.culture.highland', 'fantasy.culture.imperial'];
const NPC_TABLES = ['role', 'look', 'want', 'secret', 'tell'].map((t) => `fantasy.npc.${t}`);
const fullLines = { lines: [...SAFETY_VOCABULARY], veils: [] };

describe('starter packs', () => {
  it('both lint clean', () => {
    expect(lintPack(corePack)).toEqual([]);
    expect(lintPack(fantasyPack)).toEqual([]);
  });

  it('generates the stored fantasy.npc snapshot for a fixed seed', async () => {
    const card = generate(lib, 'fantasy.npc', {
      seed: 'TEST-0001',
      context: { cultureId: 'fantasy.culture.marsh' },
    });
    const snap = { display: card.display, fields: card.fields };
    await expect(`${JSON.stringify(snap, null, 2)}\n`).toMatchFileSnapshot(
      './fixtures/__snapshots__/fantasy-npc.marsh.json',
    );
  });

  it.each(CULTURES)('%s yields 20 distinct names', (cultureId) => {
    const names = batch(lib, [{ cultureId, count: 20 }], { seed: 'TEST-0001' }) as NameResult[];
    expect(new Set(names.map((n) => normalizeName(n.name))).size).toBe(20);
  });

  it('generates 1,000 NPCs under the full safety vocabulary without throwing', () => {
    const lined = (source: string): boolean => {
      const [tableId, index] = source.split('#');
      const entry = lib.table(tableId ?? '')?.entries[Number(index)];
      return (entry?.safety.length ?? 0) > 0;
    };
    for (let i = 0; i < 1000; i++) {
      const card: Card = generate(lib, 'fantasy.npc', {
        seed: `npc-${i}`,
        context: { cultureId: CULTURES[i % 3], safety: fullLines },
      });
      for (const field of Object.values(card.fields)) {
        if (!field.blocked) expect(field.sources.filter(lined)).toEqual([]);
      }
    }
  });

  it('keeps every NPC table usable under strict lines (at most 30% safety-tagged)', () => {
    for (const id of NPC_TABLES) {
      const entries = lib.table(id)?.entries ?? [];
      expect(entries.length, id).toBeGreaterThanOrEqual(18);
      const tagged = entries.filter((e) => e.safety.length > 0).length;
      expect(tagged / entries.length, id).toBeLessThanOrEqual(0.3);
    }
  });

  it('draws a GM move from core.gm-moves', () => {
    const move = drawMove(lib, 'core.gm-moves', { seed: 'TEST-0001' });
    const ids = lib.deck('core.gm-moves')?.cards.map((c) => c.id) ?? [];
    expect(ids).toHaveLength(12);
    expect(ids).toContain(move.id);
    expect(move.text.length).toBeGreaterThan(0);
    expect(move.prompt).toMatch(/\?$/);
    for (const card of lib.deck('core.gm-moves')?.cards ?? []) {
      expect(card.text.split(/\s+/).length, card.id).toBeLessThanOrEqual(8);
    }
  });

  it('answers fantasy.oracle with the spec odds and single-word meanings', () => {
    expect(lib.oracle('fantasy.oracle')?.odds).toEqual({
      certain: { yes: 90, extreme: 15 },
      likely: { yes: 70, extreme: 10 },
      even: { yes: 50, extreme: 8 },
      unlikely: { yes: 30, extreme: 5 },
      remote: { yes: 10, extreme: 3 },
    });
    for (const id of ['fantasy.meaning.action', 'fantasy.meaning.theme']) {
      expect(lib.table(id)?.entries, id).toHaveLength(30);
    }
    const answer = askOracle(lib, 'fantasy.oracle', 'even', { seed: 'TEST-0001' });
    for (const word of answer.meaning) expect(word).toMatch(/^[a-z]+$/);
  });
});
