import { bench, describe } from 'vitest';
import { batch, generate } from '../src/generate';
import type { BatchRequest } from '../src/generate';
import { lib } from '../test/fixtures/starter-packs';

// Soft targets (reported, not enforced): one NPC < 5 ms, a 60-item batch < 25 ms.
const context = { cultureId: 'fantasy.culture.marsh' };

const sixtyItems: BatchRequest[] = [
  { generatorId: 'fantasy.npc', count: 6 },
  { cultureId: 'fantasy.culture.marsh', count: 10 },
  { cultureId: 'fantasy.culture.highland', count: 10 },
  { cultureId: 'fantasy.culture.imperial', count: 10 },
  { tableId: 'fantasy.npc.want', count: 8 },
  { tableId: 'fantasy.npc.secret', count: 8 },
  { tableId: 'fantasy.meaning.theme', count: 8 },
];

let n = 0;

describe('starter packs', () => {
  bench('generate one fantasy.npc', () => {
    generate(lib, 'fantasy.npc', { seed: `bench-${n++}`, context });
  });

  bench('batch 60 items (6 NPCs + 30 names + 24 table rolls)', () => {
    batch(lib, sixtyItems, { seed: `bench-${n++}`, context });
  });
});
