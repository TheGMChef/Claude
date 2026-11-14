import { SAFETY_VOCABULARY, serializeCard } from '@prepdesk/engine';
import { describe, expect, it } from 'vitest';
import type { Card } from '@prepdesk/engine';
import { GENERATORS, lib } from '../../../content/lib';
import { linedTopics, recheckCard, rerollCard, rollGenerator } from '../../../content/safety';

const SEEDS = 40;
const seed = (n: number) => `forge-safety-${n}`;

/** Lined topics in what the page SHOWS: sources of fields that are not blocked, plus the display. */
function shownTopics(card: Card, lines: string[]): string[] {
  const set = new Set(lines);
  const hits = new Set<string>();
  for (const f of Object.values(card.fields)) {
    if (f.blocked) {
      // A blocked field shows a dash, and the display must not carry its hidden text.
      if (f.hidden && f.hidden.value !== '' && card.display.includes(f.hidden.value)) {
        hits.add('display-leak');
      }
      continue;
    }
    for (const src of f.sources) {
      const cut = src.lastIndexOf('#');
      const entry = lib.table(src.slice(0, cut))?.entries[Number(src.slice(cut + 1))];
      for (const t of entry?.safety ?? []) if (set.has(t)) hits.add(t);
    }
  }
  return [...hits].sort();
}

describe('the Forge never shows what a line forbids', () => {
  // Control: with no lines, rolling does reach tagged entries for most tags. Otherwise the checks
  // below could pass on content that never touches the topic.
  const reached = new Map<string, number>();
  for (const g of GENERATORS) {
    for (let n = 0; n < SEEDS; n++) {
      const card = rollGenerator(g.id, { lines: [], veils: [] }, { seed: seed(n) });
      const topics = linedTopics(serializeCard(card), { lines: [...SAFETY_VOCABULARY], veils: [] });
      if (topics !== 'unreadable')
        for (const t of topics) reached.set(t, (reached.get(t) ?? 0) + 1);
    }
  }

  it('control: unrestricted rolls do touch the safety topics the pack tags', () => {
    expect(reached.size).toBeGreaterThanOrEqual(12);
  });

  it.each(SAFETY_VOCABULARY.map((t) => [t]))('line %s: no generator shows it', (tag) => {
    const hits: string[] = [];
    for (const g of GENERATORS) {
      for (let n = 0; n < SEEDS; n++) {
        const safety = { lines: [tag], veils: [] };
        const card = rollGenerator(g.id, safety, { seed: seed(n) });
        const again = rerollCard(card, safety, {});
        for (const c of [card, again]) {
          const topics = linedTopics(serializeCard(c), safety);
          if (topics === 'unreadable' || topics.length > 0) hits.push(`${g.id}#${n}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('every line on at once still rolls something for every generator', () => {
    const safety = { lines: [...SAFETY_VOCABULARY], veils: [] };
    for (const g of GENERATORS) {
      const card = rollGenerator(g.id, safety, { seed: seed(1) });
      expect(card.display.length).toBeGreaterThan(0);
    }
  });

  it('a card rolled with no lines is re-checked when the campaign adds one', () => {
    // Find a card that reaches a tagged entry, then add that line: it must stop showing it.
    let proved = 0;
    for (const g of GENERATORS) {
      for (let n = 0; n < SEEDS && proved < 5; n++) {
        const card = rollGenerator(g.id, { lines: [], veils: [] }, { seed: seed(n) });
        const topics = linedTopics(serializeCard(card), {
          lines: [...SAFETY_VOCABULARY],
          veils: [],
        });
        if (topics === 'unreadable' || topics.length === 0) continue;
        const safety = { lines: [topics[0] as string], veils: [] };
        const rechecked = recheckCard(card, safety);
        expect(shownTopics(rechecked, safety.lines)).toEqual([]);
        proved++;
      }
    }
    expect(proved).toBeGreaterThan(0);
  });
});
