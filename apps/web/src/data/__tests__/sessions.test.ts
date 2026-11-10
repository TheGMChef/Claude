import { describe, expect, it } from 'vitest';
import { seedCampaign, testDeps } from '../../test/fixtures';
import { RepoError } from '../deps';
import { createSession, listSessions } from '../repo/sessions';

describe('sessions', () => {
  it('numbers 1, 2, 3 within a campaign and independently across campaigns', async () => {
    const d = testDeps();
    const a = await seedCampaign(d, { name: 'A' });
    const b = await seedCampaign(d, { name: 'B' });
    expect((await createSession(d, a.id)).number).toBe(1);
    expect((await createSession(d, a.id)).number).toBe(2);
    expect((await createSession(d, b.id)).number).toBe(1);
    expect((await createSession(d, a.id)).number).toBe(3);
    expect((await createSession(d, b.id)).number).toBe(2);
    expect((await createSession(d, a.id)).number).toBe(4);
  });

  it('gives concurrent creates distinct numbers (the number is read inside the transaction)', async () => {
    const d = testDeps();
    const a = await seedCampaign(d);
    const made = await Promise.all([
      createSession(d, a.id),
      createSession(d, a.id),
      createSession(d, a.id),
    ]);
    expect(made.map((s) => s.number).sort()).toEqual([1, 2, 3]);
  });

  it('starts a session prepping at step 1 with empty arrays and a pocket seed (spec 5.2)', async () => {
    const d = testDeps();
    const a = await seedCampaign(d);
    const s = await createSession(d, a.id);
    expect(s).toMatchObject({
      campaignId: a.id,
      status: 'prepping',
      prepStep: 1,
      stepsVisited: [],
      stepsSkipped: [],
      prepElapsedMs: 0,
      presentPcIds: [],
      spotlightPcIds: [],
      plannedTicks: {},
      sceneOrder: [],
      pausedMs: 0,
      recap: '',
    });
    expect(s.id).toMatch(/^ses_/);
    expect(s.pocketSeed.length).toBeGreaterThan(0);
    expect(s.createdAt).toBe(s.updatedAt);
    expect(await d.db.sessions.get(s.id)).toEqual(s);
    expect(s.startedAt).toBeUndefined();
  });

  it('gives different pocket seeds to different sessions', async () => {
    const d = testDeps();
    const a = await seedCampaign(d);
    const s1 = await createSession(d, a.id);
    const s2 = await createSession(d, a.id);
    expect(s1.pocketSeed).not.toBe(s2.pocketSeed);
  });

  it('refuses a session for an unknown campaign', async () => {
    const d = testDeps();
    await expect(createSession(d, 'cmp_missing')).rejects.toMatchObject({ code: 'not-found' });
    await expect(createSession(d, 'cmp_missing')).rejects.toBeInstanceOf(RepoError);
    expect(await d.db.sessions.count()).toBe(0);
  });

  it('lists a campaign’s sessions newest number first', async () => {
    const d = testDeps();
    const a = await seedCampaign(d, { name: 'A' });
    const b = await seedCampaign(d, { name: 'B' });
    await createSession(d, a.id);
    await createSession(d, b.id);
    await createSession(d, a.id);
    await createSession(d, a.id);
    expect((await listSessions(d, a.id)).map((s) => s.number)).toEqual([3, 2, 1]);
    expect((await listSessions(d, b.id)).map((s) => s.number)).toEqual([1]);
  });
});
