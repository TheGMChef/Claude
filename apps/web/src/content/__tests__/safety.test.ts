import {
  applySafety,
  generate,
  parseCard,
  serializeCard,
  type Card,
  type Context,
} from '@prepdesk/engine';
import { describe, expect, it } from 'vitest';
import { lib } from '../lib';
import { contextFor, recheckCard, rerollCard, rollGenerator } from '../safety';

type S = { lines: string[]; veils: string[] };
const NONE: S = { lines: [], veils: [] };

/** Tags carried by the table entries behind a card's fields, including hidden ones. */
function tagsOf(card: Card): Set<string> {
  const out = new Set<string>();
  const srcs = Object.values(card.fields).flatMap((f) => [
    ...f.sources,
    ...(f.hidden?.sources ?? []),
  ]);
  for (const src of srcs) {
    const m = /^(.+)#(\d+)$/.exec(src);
    const entry = m ? lib.table(m[1] as string)?.entries[Number(m[2])] : undefined;
    for (const t of entry?.safety ?? []) out.add(t);
  }
  return out;
}
const activeTags = (card: Card): Set<string> => {
  const out = new Set<string>();
  for (const f of Object.values(card.fields)) {
    if (f.blocked) continue;
    for (const src of f.sources) {
      const m = /^(.+)#(\d+)$/.exec(src);
      const entry = m ? lib.table(m[1] as string)?.entries[Number(m[2])] : undefined;
      for (const t of entry?.safety ?? []) out.add(t);
    }
  }
  return out;
};

// fantasy.npc has no spiders entries, so its test line is religion; fantasy.rumor has spiders.
const CASES: { generator: string; topic: string }[] = [
  { generator: 'fantasy.npc', topic: 'religion' },
  { generator: 'fantasy.rumor', topic: 'spiders' },
];

/** The import path: a card as another device exported it, read back through parseCard. */
function imported(card: Card): Card {
  const parsed = parseCard(lib, serializeCard(card));
  if (!parsed.ok) throw new Error('fixture card did not parse');
  return parsed.card;
}

describe('rerollCard honours the campaign, never the imported card (Security B)', () => {
  it.each(CASES)(
    '$generator: a card exported with no lines still avoids the campaign’s $topic over 2,000 seeds',
    ({ generator, topic }) => {
      const campaign: S = { lines: ['child-harm', topic], veils: [] };

      // Non-vacuity: the unrestricted roll really does reach the tagged entries.
      let unrestrictedHits = 0;
      for (let i = 0; i < 2000; i++) {
        if (
          activeTags(
            generate(lib, generator, { seed: `SEC-${i}`, context: { genre: 'fantasy' } }),
          ).has(topic)
        ) {
          unrestrictedHits++;
        }
      }
      expect(unrestrictedHits).toBeGreaterThan(0);

      let rerolled = 0;
      for (let i = 0; i < 2000; i++) {
        const card = imported(rollGenerator(generator, NONE, { seed: `SEC-${i}` }));
        expect(card.context.safety).toEqual(NONE);
        const out = rerollCard(card, campaign);
        expect((out.context.safety as S).lines).toEqual(campaign.lines);
        expect(activeTags(out).has(topic), `seed SEC-${i}`).toBe(false);
        rerolled++;
      }
      expect(rerolled).toBe(2000);
    },
  );

  it('overrides a hostile card context: safety lines, veils and the genre guard', () => {
    const card = imported(rollGenerator('fantasy.npc', NONE, { seed: 'HOSTILE-1' }));
    const hostile: Card = {
      ...card,
      context: { ...card.context, safety: { lines: [], veils: ['war'] }, avoidNames: ['x'] },
    };
    const out = rerollCard(hostile, { lines: ['child-harm'], veils: ['fire'] });
    expect(out.context.safety).toEqual({ lines: ['child-harm'], veils: ['fire'] });
  });

  it('keeps the card’s own culture and locks across a reroll', () => {
    const card = rollGenerator('fantasy.npc', NONE, {
      seed: 'KEEP-1',
      extras: { cultureId: 'fantasy.culture.marsh' },
    });
    const out = rerollCard(card, { lines: ['child-harm'], veils: [] }, { locks: ['name'] });
    expect(out.context.cultureId).toBe('fantasy.culture.marsh');
    expect(out.fields.name?.value).toBe(card.fields.name?.value);
    expect(out.fields.name?.locked).toBe(true);
  });
});

describe('recheckCard round trip through the wrapper', () => {
  it('blocks a field whose source carries a new line, and removing the line restores it', () => {
    let found: Card | undefined;
    for (let i = 0; i < 2000 && !found; i++) {
      const c = rollGenerator('fantasy.npc', NONE, { seed: `RECHECK-${i}` });
      if (activeTags(c).has('religion')) found = c;
    }
    expect(found, 'a card that touches religion').toBeDefined();
    const card = found as Card;
    const before = Object.fromEntries(Object.entries(card.fields).map(([k, f]) => [k, f.value]));

    const lined = recheckCard(card, { lines: ['religion'], veils: [] });
    expect(Object.values(lined.fields).some((f) => f.blocked === true)).toBe(true);
    expect(activeTags(lined).has('religion')).toBe(false);
    expect(tagsOf(lined).has('religion')).toBe(true); // original kept as hidden, not rewritten

    const restored = recheckCard(lined, NONE);
    expect(
      Object.fromEntries(Object.entries(restored.fields).map(([k, f]) => [k, f.value])),
    ).toEqual(before);
    expect(Object.values(restored.fields).some((f) => f.blocked === true)).toBe(false);
  });

  it('uses the campaign’s safety even when the card’s own context says otherwise', () => {
    let found: Card | undefined;
    for (let i = 0; i < 2000 && !found; i++) {
      const c = rollGenerator('fantasy.npc', NONE, { seed: `RECHECK2-${i}` });
      if (activeTags(c).has('religion')) found = c;
    }
    const card = found as Card;
    expect(card.context.safety).toEqual(NONE);
    const direct = applySafety(lib, card); // the raw engine call would trust the card: no change
    expect(Object.values(direct.fields).some((f) => f.blocked === true)).toBe(false);
    const wrapped = recheckCard(card, { lines: ['religion'], veils: [] });
    expect(Object.values(wrapped.fields).some((f) => f.blocked === true)).toBe(true);
  });
});

describe('contextFor', () => {
  it('never shares arrays with the campaign', () => {
    const campaign = { safety: { lines: ['child-harm'], veils: ['rats'] } };
    const ctx = contextFor(campaign, { avoidNames: ['Odrin'] });
    (ctx.safety as S).lines.push('war');
    (ctx.safety as S).veils.push('fire');
    ctx.avoidNames?.push('Maren');
    expect(campaign.safety).toEqual({ lines: ['child-harm'], veils: ['rats'] });
    const again = contextFor(campaign);
    expect(again.safety).toEqual({ lines: ['child-harm'], veils: ['rats'] });
    expect(again.safety?.lines).not.toBe(campaign.safety.lines);
  });

  it('has lines [child-harm] for a default campaign', () => {
    const ctx = contextFor({ safety: { lines: ['child-harm'], veils: [] } });
    expect((ctx.safety as S).lines).toEqual(['child-harm']);
    expect(ctx.genre).toBe('fantasy');
    expect(ctx.avoidNames).toEqual([]);
  });

  it('carries the extras, but extra context can never replace the safety', () => {
    const ctx: Context = contextFor(
      { safety: { lines: ['war'], veils: [] } },
      {
        avoidNames: ['Odrin'],
        cultureId: 'fantasy.culture.marsh',
        ctx: { safety: { lines: [], veils: [] }, tags: { prefer: ['x'] } },
      },
    );
    expect(ctx.avoidNames).toEqual(['Odrin']);
    expect(ctx.cultureId).toBe('fantasy.culture.marsh');
    expect(ctx.tags).toEqual({ prefer: ['x'] });
    expect(ctx.safety).toEqual({ lines: ['war'], veils: [] });
  });

  it('omits cultureId when none is given', () => {
    expect('cultureId' in contextFor({ safety: { lines: [], veils: [] } })).toBe(false);
  });
});

describe('rollGenerator', () => {
  it('stores the campaign safety on the card and is deterministic for a seed', () => {
    const s: S = { lines: ['child-harm', 'war'], veils: ['rats'] };
    const a = rollGenerator('fantasy.npc', s, { seed: 'TEST-0001' });
    const b = rollGenerator('fantasy.npc', s, { seed: 'TEST-0001' });
    expect(a.context.safety).toEqual(s);
    expect(a.fields).toEqual(b.fields);
    expect(a.seed).toBe('TEST-0001');
  });
});
