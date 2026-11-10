import { describe, expect, it } from 'vitest';
import type { Entity, EntityKind } from '../schema';
import { ENTITY_KINDS } from '../schema';
import { buildIndex, search } from '../search';
import { entityTokens } from '../text';

// R62: the hard gate is 100 ms in jsdom (CI noise); the 20 ms target (spec 5.6, D58) is reported,
// and enforced when PREPDESK_SEARCH_STRICT=1 (run it on a quiet machine).
const HARD_MS = 100;
const TARGET_MS = 20;

const WORDS = [
  'salt',
  'marsh',
  'reeve',
  'ferry',
  'odrin',
  'vey',
  'lantern',
  'harbour',
  'tide',
  'ledger',
  'crow',
  'bell',
  'thorn',
  'ember',
  'quill',
  'moss',
  'granite',
  'willow',
  'raven',
  'copper',
  'silk',
  'oak',
  'ash',
  'fen',
  'weir',
  'mire',
  'cairn',
  'hollow',
  'north',
  'south',
  'grim',
  'fable',
  'cinder',
  'pike',
  'rook',
  'sable',
  'tarn',
  'umber',
  'vale',
  'wick',
];

function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function fixture(count: number): Entity[] {
  const rnd = lcg(42);
  const word = () => WORDS[Math.floor(rnd() * WORDS.length)]!;
  const now = Date.UTC(2026, 10, 10);
  return Array.from({ length: count }, (_, i) => {
    const kind: EntityKind = ENTITY_KINDS[i % ENTITY_KINDS.length]!;
    const e: Entity = {
      id: `ent_${String(i).padStart(16, '0')}`,
      campaignId: 'cmp_0000000000000001',
      kind,
      title: `${word()} ${word()} ${i}`,
      aliases: i % 5 === 0 ? [`${word()} ${word()}`] : [],
      summary: `${word()} ${word()} ${word()}`,
      fields: Object.fromEntries(
        ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => [`field${k}`, `${word()} ${word()} ${word()}`]),
      ),
      body: '',
      canon: 'kept',
      veiled: [],
      origin: 'manual',
      tokens: [],
      wikiTargets: [],
      createdAt: now - i,
      updatedAt: now - (i % 20) * 24 * 60 * 60 * 1000,
    };
    e.tokens = entityTokens(e);
    return e;
  });
}

const QUERIES = [
  's',
  'm',
  'r',
  'f',
  'o',
  'l',
  'sa',
  'ma',
  're',
  'fe',
  'od',
  'ta',
  'gr',
  'ca',
  'wi',
  'sal',
  'mar',
  'ree',
  'fer',
  'odr',
  'thor',
  'gran',
  'salt marsh',
  'reeve ferry',
  'odrin vey',
  'moss fen',
  'ra co',
  'ember quill',
  'lan har',
  'tide l',
];

describe('search budget, 5,000 entities (D58, R62)', () => {
  it('has 30 queries that all return results, and a median under the hard gate', () => {
    const entities = fixture(5000);
    const t0 = performance.now();
    const index = buildIndex(entities);
    const buildMs = performance.now() - t0;
    expect(QUERIES).toHaveLength(30);

    const now = Date.UTC(2026, 10, 10);
    // warm up the JIT once so the median is not the first-call cost
    search(index, 'sal', { now });
    const times: number[] = [];
    for (const q of QUERIES) {
      const s = performance.now();
      const r = search(index, q, { now });
      times.push(performance.now() - s);
      expect(r.length, `query "${q}" must return results`).toBeGreaterThan(0);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)]!;
    const worst = times[times.length - 1]!;
    console.info(
      `[search bench] 5,000 entities: index ${buildMs.toFixed(1)} ms, median ${median.toFixed(2)} ms, ` +
        `worst ${worst.toFixed(2)} ms (target ${TARGET_MS} ms, hard gate ${HARD_MS} ms)`,
    );
    expect(median).toBeLessThanOrEqual(HARD_MS);
    if (process.env['PREPDESK_SEARCH_STRICT'] === '1')
      expect(median).toBeLessThanOrEqual(TARGET_MS);
  });
});
