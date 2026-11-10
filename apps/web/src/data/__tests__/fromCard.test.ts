import { parseCard, serializeCard, type Card } from '@prepdesk/engine';
import { describe, expect, it } from 'vitest';
import { lib } from '../../content/lib';
import { recheckCard, rollGenerator } from '../../content/safety';
import { seedCampaign, testDeps } from '../../test/fixtures';
import { createEntity, entityFromCard } from '../repo/entities';

type S = { lines: string[]; veils: string[] };
const NONE: S = { lines: [], veils: [] };
const roll = (id: string, seed = 'TEST-0001', safety = NONE): Card =>
  rollGenerator(id, safety, { seed });
const val = (c: Card, k: string) => c.fields[k]!.value;

async function keep(card: Card, kind: Parameters<typeof entityFromCard>[1], text?: string) {
  const d = testDeps();
  const camp = await seedCampaign(d);
  const input = entityFromCard(card, kind, {
    campaignId: camp.id,
    origin: 'table',
    ...(text !== undefined ? { text } : {}),
  });
  return { input, entity: await createEntity(d, camp.id, input) };
}

describe('entityFromCard (spec 5.4)', () => {
  it('npc: title is the name, summary the role, fields copied one to one', async () => {
    const card = roll('fantasy.npc');
    const { input, entity } = await keep(card, 'npc');
    expect(input.title).toBe(val(card, 'name'));
    expect(input.summary).toBe(val(card, 'role'));
    for (const [k, f] of Object.entries(card.fields)) expect(entity.fields[k]).toBe(f.value);
    expect(Object.keys(entity.fields).sort()).toEqual(Object.keys(card.fields).sort());
    expect(entity.origin).toBe('table');
  });

  it('place: summary is the kind; settlement the size; tavern what follows the name in the line', async () => {
    const place = roll('fantasy.place');
    expect(entityFromCard(place, 'place', { campaignId: 'c', origin: 'table' }).summary).toBe(
      val(place, 'kind'),
    );
    const town = roll('fantasy.settlement');
    const t = entityFromCard(town, 'place', {
      campaignId: 'c',
      origin: 'table',
      subtype: 'settlement',
    });
    expect(t.title).toBe(val(town, 'name'));
    expect(t.summary).toBe(val(town, 'size'));
    expect(t.subtype).toBe('settlement');
    const tavern = roll('fantasy.tavern');
    const v = entityFromCard(tavern, 'place', { campaignId: 'c', origin: 'table' });
    expect(v.title).toBe(val(tavern, 'name'));
    expect(v.summary).toBe(tavern.display.slice(tavern.display.indexOf(', ') + 2));
    expect(v.summary).toMatch(/^kept by /);
    const shop = roll('fantasy.shop');
    expect(entityFromCard(shop, 'place', { campaignId: 'c', origin: 'table' }).summary).toBe(
      val(shop, 'kind'),
    );
  });

  it('item, note and clue: title and summary are the display line', async () => {
    for (const [id, kind] of [
      ['fantasy.treasure', 'item'],
      ['fantasy.trinket', 'item'],
      ['fantasy.rumor', 'note'],
      ['fantasy.clue', 'clue'],
    ] as const) {
      const card = roll(id);
      const { input, entity } = await keep(card, kind);
      expect(input.title).toBe(card.display);
      expect(input.summary).toBe(card.display);
      expect(entity.title).toBe(card.display);
    }
  });

  it("truth and scene: the DM's text when present, else the display line", async () => {
    const card = roll('fantasy.secret');
    expect(
      entityFromCard(card, 'truth', { campaignId: 'c', origin: 'prep', text: 'The weir is rotten' })
        .title,
    ).toBe('The weir is rotten');
    expect(entityFromCard(card, 'truth', { campaignId: 'c', origin: 'prep' }).title).toBe(
      card.display,
    );
    expect(
      entityFromCard(card, 'scene', { campaignId: 'c', origin: 'prep', text: 'A storm' }).title,
    ).toBe('A storm');
  });

  it('makes a title the entity repository accepts, even from a hostile display line', async () => {
    const card = { ...roll('fantasy.rumor'), display: `${'x'.repeat(300)} a|b [[c]] ]] ` };
    const { entity } = await keep(card, 'note');
    expect(entity.title.length).toBeLessThanOrEqual(200);
    expect(entity.title).not.toMatch(/\[\[|\]\]|\|/);
    const blank = { ...roll('fantasy.rumor'), display: ' | ' };
    expect((await keep(blank, 'note')).entity.title).toBe('Untitled');
  });

  it('keeps the card: it parses back and deep-equals the original (round trip)', async () => {
    for (const id of ['fantasy.npc', 'fantasy.tavern', 'fantasy.rumor']) {
      const card = roll(id);
      const { entity } = await keep(card, 'npc');
      const parsed = parseCard(lib, entity.card!);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.card).toEqual(card);
      expect(entity.card).toBe(serializeCard(card));
    }
  });

  it('leaves a blocked field out of fields', async () => {
    let card: Card | undefined;
    for (let i = 0; i < 400 && !card; i++) {
      const c = recheckCard(roll('fantasy.npc', `S2-${i}`), { lines: ['religion'], veils: [] });
      if (Object.values(c.fields).some((f) => f.blocked)) card = c;
    }
    expect(card).toBeDefined();
    const blocked = Object.keys(card!.fields).filter((k) => card!.fields[k]!.blocked);
    const { entity } = await keep(card!, 'npc');
    for (const k of blocked) expect(k in entity.fields).toBe(false);
    for (const k of Object.keys(card!.fields).filter((k) => !blocked.includes(k))) {
      expect(entity.fields[k]).toBe(card!.fields[k]!.value);
    }
    expect(Object.values(entity.fields)).not.toContain('—');
  });

  it('copies veiled from the card flags', async () => {
    let card: Card | undefined;
    for (let i = 0; i < 400 && !card; i++) {
      const c = roll('fantasy.rumor', `S2-${i}`, {
        lines: [],
        veils: ['spiders', 'religion', 'death'],
      });
      if (c.flags.veiled.length > 0) card = c;
    }
    expect(card).toBeDefined();
    const { entity } = await keep(card!, 'note');
    expect(entity.veiled).toEqual(card!.flags.veiled);
  });

  it('skips card field names the repository would refuse', () => {
    const card = roll('fantasy.npc');
    const evil: Card = {
      ...card,
      fields: {
        ...card.fields,
        ['__proto__x']: card.fields['name']!,
        constructor: card.fields['name']!,
      },
    };
    const input = entityFromCard(evil, 'npc', { campaignId: 'c', origin: 'table' });
    expect(Object.keys(input.fields ?? {})).not.toContain('constructor');
    expect(Object.keys(input.fields ?? {})).not.toContain('__proto__x');
  });
});
