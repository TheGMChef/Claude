import { describe, expect, it } from 'vitest';
import { generate } from '../src/generate';
import { lib } from './fixtures/starter-packs';

const WORDS_A = lib.table('fantasy.place.word-a')?.entries ?? [];
const WORDS_B = lib.table('fantasy.place.word-b')?.entries ?? [];
const text = (e: { ast: Array<string | object> }): string => e.ast.join('');

describe('place and settlement names (R46)', () => {
  it('never glue a word-a to a word-b with a doubled letter at the seam', () => {
    const bad: string[] = [];
    for (const a of WORDS_A)
      for (const b of WORDS_B) {
        const [x, y] = [text(a).toLowerCase(), text(b).toLowerCase()];
        if (x.endsWith(y[0] as string)) bad.push(`${text(a)}${y}`);
      }
    expect(bad).toEqual([]);
  });

  it('never repeat a word inside one settlement name (3,000 settlements)', () => {
    const bad: string[] = [];
    for (let i = 0; i < 3000; i++) {
      const name =
        generate(lib, 'fantasy.settlement', { seed: `name-${i}` }).fields.name?.value ?? '';
      const parts = name
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w !== '');
      if (new Set(parts).size !== parts.length) bad.push(name);
    }
    expect(bad).toEqual([]);
  });
});

describe('settlement.size', () => {
  it('holds exactly the six sizes with their weights', () => {
    const entries = lib.table('fantasy.settlement.size')?.entries ?? [];
    expect(entries.map((e) => [text(e), e.weight])).toEqual([
      ['hamlet', 3],
      ['village', 5],
      ['market town', 3],
      ['walled town', 2],
      ['river port', 1],
      ['city', 1],
    ]);
  });

  it('weights favour village over every other size', () => {
    const entries = lib.table('fantasy.settlement.size')?.entries ?? [];
    const village = entries.find((e) => text(e) === 'village');
    expect(village).toBeDefined();
    for (const e of entries) if (e !== village) expect(village!.weight).toBeGreaterThan(e.weight);
  });
});
