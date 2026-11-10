import Dexie from 'dexie';
import { newSeed } from '@prepdesk/engine';
import { RepoError } from '../deps';
import type { RepoDeps } from '../deps';
import type { Session } from '../schema';

async function maxNumber(d: RepoDeps, cid: string): Promise<number> {
  const last = await d.db.sessions
    .where('[campaignId+number]')
    .between([cid, Dexie.minKey], [cid, Dexie.maxKey])
    .last();
  return last?.number ?? 0;
}

/** Max number + 1, or 1. Only safe inside the transaction in `createSession`. */
async function nextSessionNumber(d: RepoDeps, cid: string): Promise<number> {
  return (await maxNumber(d, cid)) + 1;
}

/** The number is read and the row written in one transaction, so concurrent creates never collide. */
export function createSession(d: RepoDeps, cid: string): Promise<Session> {
  return d.db.transaction('rw', d.db.campaigns, d.db.sessions, async () => {
    if (!(await d.db.campaigns.get(cid)))
      throw new RepoError('not-found', 'That campaign is gone.');
    const now = d.now();
    const session: Session = {
      id: d.newId('ses'),
      campaignId: cid,
      number: await nextSessionNumber(d, cid),
      status: 'prepping',
      prepStep: 1,
      stepsVisited: [],
      stepsSkipped: [],
      prepElapsedMs: 0,
      presentPcIds: [],
      spotlightPcIds: [],
      plannedTicks: {},
      sceneOrder: [],
      pocketSeed: newSeed(),
      pausedMs: 0,
      recap: '',
      createdAt: now,
      updatedAt: now,
    };
    await d.db.sessions.add(session);
    return session;
  });
}

/** Newest number first. */
export async function listSessions(d: RepoDeps, cid: string): Promise<Session[]> {
  const rows = await d.db.sessions.where('campaignId').equals(cid).toArray();
  return rows.sort((a, b) => b.number - a.number);
}
