import { describe, expect, it } from 'vitest';
import { seedCampaign, testDeps } from '../../test/fixtures';
import { RepoError } from '../deps';
import {
  createEntity,
  deleteEntity,
  getEntity,
  listEntities,
  setClock,
  updateEntity,
} from '../repo/entities';
import type { Link, LedgerEvent, ShortlistItem } from '../schema';

async function setup() {
  const d = testDeps();
  const campaign = await seedCampaign(d);
  return { d, cid: campaign.id };
}

async function code(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return e instanceof RepoError ? e.code : 'other';
  }
  return undefined;
}

describe('createEntity', () => {
  it('stores tokens for title, summary, field values and the kind label', async () => {
    const { d, cid } = await setup();
    const e = await createEntity(d, cid, {
      kind: 'npc',
      title: 'Odrin Vey',
      summary: 'ferryman',
      aliases: ['Old Weir'],
      fields: { want: 'Clear the debt' },
    });
    const stored = await getEntity(d, e.id);
    for (const t of ['odrin', 'vey', 'ferryman', 'weir', 'clear', 'debt', 'npc']) {
      expect(stored?.tokens).toContain(t);
    }
    expect(e.campaignId).toBe(cid);
    expect(e.canon).toBe('kept');
    expect(e.origin).toBe('manual');
    expect(e.createdAt).toBe(e.updatedAt);
  });

  it('is findable through the multi-entry tokens index', async () => {
    const { d, cid } = await setup();
    const a = await createEntity(d, cid, { kind: 'npc', title: 'Odrin' });
    await createEntity(d, cid, { kind: 'npc', title: 'Mara' });
    const hit = await d.db.entities.where('tokens').equals('odrin').primaryKeys();
    expect(hit).toEqual([a.id]);
  });

  it('defaults a front to a 6-segment empty clock and a clue and truth to their first state', async () => {
    const { d, cid } = await setup();
    const front = await createEntity(d, cid, { kind: 'front', title: 'The Tide Rises' });
    expect(front.clock).toEqual({ size: 6, filled: 0, doom: '' });
    expect(front.state).toBe('active');
    expect((await createEntity(d, cid, { kind: 'clue', title: 'A wet ledger' })).state).toBe(
      'hidden',
    );
    expect((await createEntity(d, cid, { kind: 'truth', title: 'The lock is old' })).state).toBe(
      'open',
    );
    const npc = await createEntity(d, cid, { kind: 'npc', title: 'Odrin' });
    expect(npc.state).toBeUndefined();
    expect(npc.clock).toBeUndefined();
  });

  it('touches the campaign updatedAt', async () => {
    const { d, cid } = await setup();
    const before = (await d.db.campaigns.get(cid))!.updatedAt;
    await createEntity(d, cid, { kind: 'npc', title: 'Odrin' });
    expect((await d.db.campaigns.get(cid))!.updatedAt).toBeGreaterThan(before);
  });

  it('refuses a missing campaign, a bad title, bad aliases, and bad kind data', async () => {
    const { d, cid } = await setup();
    expect(await code(createEntity(d, 'cmp_0000000000009999', { kind: 'npc', title: 'x' }))).toBe(
      'not-found',
    );
    expect(await code(createEntity(d, cid, { kind: 'npc', title: 'A|B' }))).toBe('invalid');
    expect(await code(createEntity(d, cid, { kind: 'npc', title: '  ' }))).toBe('invalid');
    expect(await code(createEntity(d, cid, { kind: 'npc', title: 'x', aliases: ['[[y]]'] }))).toBe(
      'invalid',
    );
    expect(
      await code(
        createEntity(d, cid, {
          kind: 'npc',
          title: 'x',
          aliases: Array.from({ length: 51 }, (_, i) => `a${i}`),
        }),
      ),
    ).toBe('invalid');
    expect(await code(createEntity(d, cid, { kind: 'npc', title: 'x', subtype: 'tavern' }))).toBe(
      'invalid',
    );
    expect(await code(createEntity(d, cid, { kind: 'clue', title: 'x', state: 'open' }))).toBe(
      'invalid',
    );
    expect(await code(createEntity(d, cid, { kind: 'npc', title: 'x', veiled: ['nope'] }))).toBe(
      'invalid',
    );
    expect(
      await code(
        createEntity(d, cid, { kind: 'npc', title: 'x', clock: { size: 6, filled: 0, doom: '' } }),
      ),
    ).toBe('invalid');
    expect(await d.db.entities.count()).toBe(0);
  });

  it('drops aliases that repeat the title or each other (folded) and trims them', async () => {
    const { d, cid } = await setup();
    const e = await createEntity(d, cid, {
      kind: 'npc',
      title: 'Odrin',
      aliases: [' The Ferryman ', 'the  ferryman', 'ODRIN', 'Weir Man'],
    });
    expect(e.aliases).toEqual(['The Ferryman', 'Weir Man']);
  });

  it('refuses prototype-polluting and malformed field keys and leaves Object.prototype alone', async () => {
    const { d, cid } = await setup();
    const proto = JSON.parse('{"__proto__":"polluted"}') as Record<string, string>;
    expect(await code(createEntity(d, cid, { kind: 'npc', title: 'x', fields: proto }))).toBe(
      'invalid',
    );
    expect(
      await code(createEntity(d, cid, { kind: 'npc', title: 'x', fields: { constructor: 'x' } })),
    ).toBe('invalid');
    expect(
      await code(createEntity(d, cid, { kind: 'npc', title: 'x', fields: { 'bad key': 'x' } })),
    ).toBe('invalid');
    expect(
      await code(createEntity(d, cid, { kind: 'npc', title: 'x', fields: { '1st': 'x' } })),
    ).toBe('invalid');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
    expect(await d.db.entities.count()).toBe(0);
  });

  it('caps text sizes', async () => {
    const { d, cid } = await setup();
    expect(
      await code(createEntity(d, cid, { kind: 'npc', title: 'x', summary: 'y'.repeat(20_001) })),
    ).toBe('invalid');
    expect(
      await code(
        createEntity(d, cid, { kind: 'npc', title: 'x', fields: { want: 'y'.repeat(20_001) } }),
      ),
    ).toBe('invalid');
    expect(
      await code(createEntity(d, cid, { kind: 'npc', title: 'x', body: 'y'.repeat(200_001) })),
    ).toBe('invalid');
    const ok = await createEntity(d, cid, { kind: 'npc', title: 'x', body: 'y'.repeat(200_000) });
    expect(ok.body).toHaveLength(200_000);
  });
});

describe('updateEntity', () => {
  it('recomputes tokens when a field changes and bumps updatedAt', async () => {
    const { d, cid } = await setup();
    const e = await createEntity(d, cid, {
      kind: 'npc',
      title: 'Odrin',
      fields: { want: 'Clear the debt' },
    });
    expect(e.tokens).toContain('debt');
    const next = await updateEntity(d, e.id, { fields: { want: 'Leave the marsh' } });
    expect(next.tokens).toContain('marsh');
    expect(next.tokens).not.toContain('debt');
    expect(next.updatedAt).toBeGreaterThan(e.updatedAt);
    expect(await d.db.entities.where('tokens').equals('debt').count()).toBe(0);
    expect(await d.db.entities.where('tokens').equals('marsh').count()).toBe(1);
  });

  it('keeps fields the patch does not mention', async () => {
    const { d, cid } = await setup();
    const e = await createEntity(d, cid, {
      kind: 'npc',
      title: 'Odrin',
      summary: 'ferryman',
      body: 'hello',
    });
    const next = await updateEntity(d, e.id, { body: 'changed' });
    expect(next.summary).toBe('ferryman');
    expect(next.title).toBe('Odrin');
    expect(next.body).toBe('changed');
  });

  it('refuses unknown ids, bad titles, a bad state and a clock on a non-front', async () => {
    const { d, cid } = await setup();
    expect(await code(updateEntity(d, 'ent_0000000000009999', { body: 'x' }))).toBe('not-found');
    const clue = await createEntity(d, cid, { kind: 'clue', title: 'A ledger' });
    expect(await code(updateEntity(d, clue.id, { title: 'a|b' }))).toBe('invalid');
    expect(await code(updateEntity(d, clue.id, { state: 'revealed' }))).toBe('invalid');
    expect(await code(updateEntity(d, clue.id, { clock: { size: 4, filled: 0, doom: '' } }))).toBe(
      'invalid',
    );
    expect((await updateEntity(d, clue.id, { state: 'found' })).state).toBe('found');
  });

  it('validates a clock patch', async () => {
    const { d, cid } = await setup();
    const f = await createEntity(d, cid, { kind: 'front', title: 'Tide' });
    const next = await updateEntity(d, f.id, {
      clock: { size: 8, filled: 12, doom: 'The weir breaks' },
    });
    expect(next.clock).toEqual({ size: 8, filled: 8, doom: 'The weir breaks' });
    expect(
      await code(updateEntity(d, f.id, { clock: { size: 5 as 4, filled: 0, doom: '' } })),
    ).toBe('invalid');
  });
});

describe('setClock', () => {
  it('clamps to 0..size, writes no ledger line and bumps updatedAt', async () => {
    const { d, cid } = await setup();
    const f = await createEntity(d, cid, { kind: 'front', title: 'Tide' });
    await setClock(d, f.id, 99);
    expect((await getEntity(d, f.id))?.clock?.filled).toBe(6);
    await setClock(d, f.id, -4);
    expect((await getEntity(d, f.id))?.clock?.filled).toBe(0);
    await setClock(d, f.id, 3);
    const after = await getEntity(d, f.id);
    expect(after?.clock?.filled).toBe(3);
    expect(after!.updatedAt).toBeGreaterThan(f.updatedAt);
    expect(await d.db.ledger.count()).toBe(0);
  });

  it('refuses a non-front and a non-integer', async () => {
    const { d, cid } = await setup();
    const n = await createEntity(d, cid, { kind: 'npc', title: 'Odrin' });
    expect(await code(setClock(d, n.id, 1))).toBe('invalid');
    const f = await createEntity(d, cid, { kind: 'front', title: 'Tide' });
    expect(await code(setClock(d, f.id, 1.5))).toBe('invalid');
    expect(await code(setClock(d, 'ent_0000000000009999', 1))).toBe('not-found');
  });
});

describe('listEntities', () => {
  it('lists only the campaign asked for', async () => {
    const { d, cid } = await setup();
    const other = await seedCampaign(d, { name: 'Other' });
    await createEntity(d, cid, { kind: 'npc', title: 'A' });
    await createEntity(d, other.id, { kind: 'npc', title: 'B' });
    expect((await listEntities(d, cid)).map((e) => e.title)).toEqual(['A']);
  });
});

describe('deleteEntity cascade (Review Focus 5)', () => {
  it('removes its links and shortlist rows, keeps the ledger, and leaves other entities alone', async () => {
    const { d, cid } = await setup();
    const x = await createEntity(d, cid, { kind: 'npc', title: 'X' });
    const y = await createEntity(d, cid, { kind: 'npc', title: 'Y' });
    const z = await createEntity(d, cid, { kind: 'npc', title: 'Z' });
    const link = (id: string, fromId: string, toId: string): Link => ({
      id,
      campaignId: cid,
      fromId,
      toId,
      rel: 'knows',
      origin: 'explicit',
      createdAt: 1,
    });
    await d.db.links.bulkAdd([
      link('lnk_a', x.id, y.id),
      link('lnk_b', x.id, z.id),
      link('lnk_c', y.id, x.id),
      link('lnk_keep', y.id, z.id),
    ]);
    const short = (id: string, entityId: string): ShortlistItem => ({
      id,
      campaignId: cid,
      fromSessionId: 'ses_1',
      entityId,
      label: 'l',
      title: 't',
      question: 'q',
      yesLabel: 'y',
      status: 'open',
      deferrals: 0,
      createdAt: 1,
    });
    await d.db.shortlist.bulkAdd([short('sho_x', x.id), short('sho_y', y.id)]);
    const ev: LedgerEvent = {
      id: 'evt_1',
      campaignId: cid,
      sessionId: 'ses_1',
      at: 1,
      t: 0,
      kind: 'npc-used',
      text: 'X',
      entityId: x.id,
      review: 'none',
      undo: {},
    };
    await d.db.ledger.add(ev);

    await deleteEntity(d, x.id);

    expect(await getEntity(d, x.id)).toBeUndefined();
    expect((await d.db.links.toArray()).map((l) => l.id)).toEqual(['lnk_keep']);
    expect((await d.db.shortlist.toArray()).map((s) => s.id)).toEqual(['sho_y']);
    expect(await d.db.ledger.count()).toBe(1);
    expect(await getEntity(d, y.id)).toBeDefined();
    expect(await getEntity(d, z.id)).toBeDefined();
  });

  it('refuses an unknown id', async () => {
    const { d } = await setup();
    expect(await code(deleteEntity(d, 'ent_0000000000009999'))).toBe('not-found');
  });
});
