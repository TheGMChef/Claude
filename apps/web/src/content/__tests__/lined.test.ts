import { serializeCard, parseCard, type Card } from '@prepdesk/engine';
import { describe, expect, it } from 'vitest';
import { lib } from '../lib';
import { linedTopics, recheckCard, rollGenerator } from '../safety';

type Json = Record<string, unknown> & {
  context: { safety?: unknown };
  generatorId: string;
  packVersion: string;
  fields: unknown;
};
const NONE = { lines: [], veils: [] };
const linesOf = (c: Card) => (c.context['safety'] as { lines: string[] }).lines;
const sp = (...lines: string[]) => ({ lines, veils: [] });

/** A card (rolled with no lines) whose sources include an entry tagged with `topic`. */
function cardWith(generatorId: string, topic: string): Card {
  for (let i = 0; i < 4000; i++) {
    const card = rollGenerator(generatorId, NONE, { seed: `S2-${i}` });
    const hit = Object.values(card.fields).some((f) =>
      f.sources.some((s) => {
        const k = s.lastIndexOf('#');
        return lib.table(s.slice(0, k))?.entries[Number(s.slice(k + 1))]?.safety.includes(topic);
      }),
    );
    if (hit) return card;
  }
  throw new Error(`no ${generatorId} seed touches ${topic}`);
}

const edit = (card: Card, fn: (json: Json) => void): string => {
  const json = JSON.parse(serializeCard(card)) as Json;
  fn(json);
  return JSON.stringify(json);
};

describe('linedTopics (D64, Review Focus 4)', () => {
  const card = cardWith('fantasy.rumor', 'spiders');

  it('reports the campaign lines the card sources touch, whatever lines the card was rolled with', () => {
    expect(linesOf(card)).toEqual([]);
    expect(linedTopics(serializeCard(card), sp('spiders'))).toEqual(['spiders']);
  });

  it("ignores the card's own context.safety: a card that carried the line, read under a campaign without it", () => {
    const json = edit(card, (j) => {
      j.context.safety = { lines: ['spiders'], veils: [] };
    });
    expect(linesOf(JSON.parse(json) as Card)).toEqual(['spiders']);
    expect(linedTopics(json, sp())).toEqual([]);
    expect(linedTopics(json, sp('spiders'))).toEqual(['spiders']); // the same sources do hit
  });

  it('returns only topics that are both on a source and a current line, sorted', () => {
    expect(linedTopics(serializeCard(card), sp('fire', 'death'))).toEqual([]);
    const npc = cardWith('fantasy.npc', 'religion');
    expect(linedTopics(serializeCard(npc), sp('religion', 'spiders'))).toEqual(['religion']);
  });

  it('reads the sources of a field a current line has hidden', () => {
    const rechecked = recheckCard(card, sp('spiders'));
    expect(Object.values(rechecked.fields).some((f) => f.blocked && f.hidden)).toBe(true);
    const json = serializeCard(rechecked);
    expect(linedTopics(json, sp('spiders'))).toEqual(['spiders']);
    expect(linedTopics(json, sp())).toEqual([]);
  });

  it('says unreadable for text that is not a card', () => {
    expect(linedTopics('{not json', sp('spiders'))).toBe('unreadable');
    expect(linedTopics('{}', sp('spiders'))).toBe('unreadable');
    expect(linedTopics('', sp('spiders'))).toBe('unreadable');
    expect(linedTopics('x'.repeat(3_000_000), sp('spiders'))).toBe('unreadable');
  });

  it('does not throw for an unknown generator, and still computes from the sources', () => {
    const json = edit(card, (j) => {
      j.generatorId = 'user.gone';
    });
    const parsed = parseCard(lib, json);
    expect(parsed.ok).toBe(true);
    expect(linedTopics(json, sp('spiders'))).toEqual(['spiders']);
  });

  it('counts a stale card (another pack version) the same way', () => {
    const json = edit(card, (j) => {
      j.packVersion = '0.0.0-old';
    });
    expect((parseCard(lib, json) as { stale: boolean }).stale).toBe(true);
    expect(linedTopics(json, sp('spiders'))).toEqual(['spiders']);
  });

  it('ignores sources it cannot place: missing tables, bad indexes, hostile ids', () => {
    for (const bad of [
      'nope.table#3',
      '__proto__#0',
      'constructor#0',
      '#',
      '#5',
      'a#',
      'x#-1',
      'x#1e3',
      `a#${'9'.repeat(400)}`,
      'no hash',
      'fantasy.rumor.text#99999',
    ]) {
      const json = edit(card, (j) => {
        for (const f of Object.values(j.fields as Record<string, { sources: string[] }>))
          f.sources = [bad];
      });
      expect(linedTopics(json, sp('spiders'))).toEqual([]);
    }
  });
});
