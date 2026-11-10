import { createEntity, deleteEntity } from '../data/repo/entities';
import { addLink } from '../data/repo/links';
import { createSession } from '../data/repo/sessions';
import type { RepoDeps } from '../data/deps';
import { seedCampaign } from './fixtures';
import { npcCardJson } from './fixtures';

export const DB_STORES = [
  'campaigns',
  'sessions',
  'entities',
  'links',
  'ledger',
  'shortlist',
  'usedNames',
  'pocket',
  'drafts',
  'prepAnswers',
  'settings',
] as const;

/** Every row of every store, sorted by JSON text, for before and after comparisons. */
export async function snapshotDb(d: RepoDeps): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const s of DB_STORES) {
    out[s] = (await d.db.table(s).toArray()).map((r) => JSON.stringify(r)).sort();
  }
  return out;
}

/** A campaign with at least one row in every store, a wiki link, and a ledger line for a deleted entry. */
export async function seedFullCampaign(d: RepoDeps, name = 'The Salt Marsh Debts') {
  const camp = await seedCampaign(d, { name });
  const ses = await createSession(d, camp.id);
  const b = await createEntity(d, camp.id, {
    kind: 'npc',
    title: 'Salt Office',
    summary: 'a desk',
  });
  const a = await createEntity(d, camp.id, {
    kind: 'npc',
    title: 'Odrin Vey',
    summary: 'ferryman',
    fields: { want: 'quiet', secret: 'owes the [[Salt Office]]' },
    body: 'Works for the [[Salt Office]] and fears [[Nobody]].',
    card: npcCardJson(),
    firstSessionId: ses.id,
  });
  const gone = await createEntity(d, camp.id, { kind: 'note', title: 'Soon gone' });
  await addLink(d, { campaignId: camp.id, fromId: a.id, toId: b.id, rel: 'knows' });
  await d.db.ledger.bulkAdd([
    {
      id: d.newId('evt'),
      campaignId: camp.id,
      sessionId: ses.id,
      at: 5,
      t: 4_200_000,
      kind: 'npc-improvised',
      text: 'Odrin Vey, ferryman',
      entityId: a.id,
      review: 'ask',
      undo: { createdEntityIds: [a.id] },
    },
    {
      id: d.newId('evt'),
      campaignId: camp.id,
      sessionId: ses.id,
      at: 6,
      t: 4_300_000,
      kind: 'note',
      text: 'Soon gone',
      entityId: gone.id,
      review: 'none',
      undo: {},
    },
  ]);
  await deleteEntity(d, gone.id);
  await d.db.shortlist.bulkAdd([
    {
      id: d.newId('sho'),
      campaignId: camp.id,
      fromSessionId: ses.id,
      entityId: a.id,
      label: 'Improvised NPC',
      title: 'Odrin Vey',
      question: 'Keep?',
      yesLabel: 'Yes',
      status: 'open',
      deferrals: 0,
      createdAt: 7,
    },
    {
      id: d.newId('sho'),
      campaignId: camp.id,
      fromSessionId: ses.id,
      card: npcCardJson('TEST-0002'),
      label: 'Improvised NPC',
      title: 'Card only',
      question: 'Keep?',
      yesLabel: 'Yes',
      status: 'open',
      deferrals: 1,
      createdAt: 8,
    },
  ]);
  await d.db.usedNames.add({
    campaignId: camp.id,
    nameKey: 'odrin',
    name: 'Odrin',
    cultureId: 'fantasy.culture.marsh',
    sessionId: ses.id,
    entityId: a.id,
    at: 9,
  });
  await d.db.pocket.bulkAdd([
    {
      id: d.newId('poc'),
      sessionId: ses.id,
      campaignId: camp.id,
      section: 'names',
      order: 0,
      locked: false,
      name: { name: 'Tamsin', cultureId: 'fantasy.culture.marsh' },
    },
    {
      id: d.newId('poc'),
      sessionId: ses.id,
      campaignId: camp.id,
      section: 'npcs',
      order: 1,
      locked: true,
      card: npcCardJson('TEST-0003'),
      entityId: gone.id,
    },
  ]);
  await d.db.drafts.add({
    id: d.newId('drf'),
    sessionId: ses.id,
    campaignId: camp.id,
    step: 2,
    kind: 'rumor',
    line: 'A rumor',
    card: npcCardJson('TEST-0004'),
    status: 'draft',
    order: 0,
  });
  await d.db.prepAnswers.add({
    sessionId: ses.id,
    campaignId: camp.id,
    step: 1,
    answers: { q1: 'strong start' },
    updatedAt: 10,
  });
  return { camp, ses, a, b, gone };
}
