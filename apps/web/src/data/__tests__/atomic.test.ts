import { describe, expect, it, vi } from 'vitest';
import { seedCampaign, testDeps } from '../../test/fixtures';
import { createEntity, deleteEntity, renameEntity, updateEntity } from '../repo/entities';
import { addLink } from '../repo/links';

async function snapshot(d: ReturnType<typeof testDeps>): Promise<string> {
  const all = {
    campaigns: await d.db.campaigns.toArray(),
    entities: await d.db.entities.orderBy('id').toArray(),
    links: await d.db.links.orderBy('id').toArray(),
    shortlist: await d.db.shortlist.orderBy('id').toArray(),
  };
  return JSON.stringify(all);
}

/** Makes the campaign `updatedAt` write, the last step of every write, fail once. */
function failLastStep(d: ReturnType<typeof testDeps>) {
  return vi.spyOn(d.db.campaigns, 'update').mockImplementationOnce(() => {
    throw new Error('boom');
  });
}

async function world() {
  const d = testDeps();
  const c = await seedCampaign(d);
  const x = await createEntity(d, c.id, { kind: 'npc', title: 'Odrin Vey' });
  const a = await createEntity(d, c.id, {
    kind: 'npc',
    title: 'A',
    body: '[[Odrin Vey]] and [[Odrin]]',
  });
  await createEntity(d, c.id, { kind: 'npc', title: 'B', fields: { want: '[[Odrin Vey]]' } });
  const other = await createEntity(d, c.id, { kind: 'npc', title: 'Other' });
  await addLink(d, { campaignId: c.id, fromId: x.id, toId: other.id, rel: 'knows' });
  await d.db.shortlist.add({
    id: 'sho_1',
    campaignId: c.id,
    fromSessionId: 'ses_1',
    entityId: x.id,
    label: 'l',
    title: 't',
    question: 'q',
    yesLabel: 'y',
    status: 'open',
    deferrals: 0,
    createdAt: 1,
  });
  return { d, c, x, a };
}

describe('writes are atomic', () => {
  it('renameEntity: a failure after the rewrites leaves every row as it was', async () => {
    const { d, x } = await world();
    const before = await snapshot(d);
    const spy = failLastStep(d);
    await expect(renameEntity(d, x.id, 'Odrin Hale')).rejects.toThrow('boom');
    expect(spy).toHaveBeenCalled();
    expect(await snapshot(d)).toBe(before);
  });

  it('createEntity: a failure after the row and the incoming links were written leaves nothing', async () => {
    const { d, c } = await world();
    const before = await snapshot(d);
    failLastStep(d);
    await expect(createEntity(d, c.id, { kind: 'npc', title: 'Odrin' })).rejects.toThrow('boom');
    expect(await snapshot(d)).toBe(before);
  });

  it('updateEntity: a failure after the row and the derived links leaves nothing', async () => {
    const { d, a } = await world();
    const before = await snapshot(d);
    failLastStep(d);
    await expect(updateEntity(d, a.id, { body: '[[Other]]' })).rejects.toThrow('boom');
    expect(await snapshot(d)).toBe(before);
  });

  it('deleteEntity: a failure after the cascade leaves links, shortlist rows and the entry', async () => {
    const { d, x } = await world();
    const before = await snapshot(d);
    failLastStep(d);
    await expect(deleteEntity(d, x.id)).rejects.toThrow('boom');
    expect(await snapshot(d)).toBe(before);
  });
});
