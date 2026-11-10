import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedFullCampaign } from '../../test/backupFixtures';
import { testDeps } from '../../test/fixtures';
import { REVOKE_DELAY_MS, buildBackup, downloadFile, exportJson, exportName } from '../export/json';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('exportName (D65)', () => {
  it('slugs the campaign and uses the local date', () => {
    expect(exportName({ name: 'The Salt Marsh Debts' }, 'json', new Date(2026, 10, 10))).toBe(
      'prepdesk-the-salt-marsh-debts-2026-11-10.json',
    );
    expect(exportName({ name: 'Ünïcode / ../x' }, 'zip', new Date(2026, 0, 5))).toBe(
      'prepdesk-unicode-x-2026-01-05.zip',
    );
  });

  it('cuts the slug at 40 characters, and an unsluggable name becomes "campaign"', () => {
    const n = exportName({ name: 'word '.repeat(30) }, 'json', new Date(2026, 10, 10));
    expect(n.length).toBeLessThanOrEqual('prepdesk-'.length + 40 + '-2026-11-10.json'.length);
    expect(n).not.toContain('--');
    expect(exportName({ name: '!!!' }, 'json', new Date(2026, 10, 10))).toBe(
      'prepdesk-campaign-2026-11-10.json',
    );
  });
});

describe('buildBackup', () => {
  it("has the 5.9 shape, versions and only this campaign's rows", async () => {
    const d = testDeps();
    const { camp } = await seedFullCampaign(d);
    const other = await seedFullCampaign(d, 'Other');
    const b = await buildBackup(d, camp.id);
    expect(b).toMatchObject({
      format: 'prepdesk-export',
      formatVersion: 1,
      schemaVersion: 1,
      appVersion: __APP_VERSION__,
      packs: { core: expect.any(String), fantasy: expect.any(String) },
    });
    expect(b.packs.core).not.toBe('0.0.0');
    expect(b.campaign.id).toBe(camp.id);
    for (const key of [
      'sessions',
      'entities',
      'links',
      'ledger',
      'shortlist',
      'usedNames',
      'pocket',
      'drafts',
      'prepAnswers',
    ] as const) {
      expect(b[key].length, key).toBeGreaterThan(0);
      expect(b[key].every((r) => r.campaignId === camp.id)).toBe(true);
    }
    expect(b.entities.some((e) => e.id === other.a.id)).toBe(false);
    expect(JSON.stringify(b)).not.toContain('currentCampaignId');
  });

  it('refuses a campaign that is gone', async () => {
    await expect(buildBackup(testDeps(), 'cmp_00000000000000ZZ')).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('downloadFile (D65)', () => {
  function stubUrl() {
    const create = vi.fn(() => 'blob:fake');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    return { create, revoke };
  }

  it('clicks a download anchor, removes it, and revokes the URL later', () => {
    vi.useFakeTimers();
    const { create, revoke } = stubUrl();
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
      expect(document.body.contains(this)).toBe(true);
    });
    downloadFile('a/b:c.json', new Blob(['x']));
    expect(create).toHaveBeenCalledOnce();
    expect(clicked[0]!.download).toBe('a-b-c.json');
    expect(clicked[0]!.getAttribute('href')).toBe('blob:fake');
    expect(document.body.contains(clicked[0]!)).toBe(false);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_DELAY_MS);
    expect(revoke).toHaveBeenCalledWith('blob:fake');
  });

  it('still removes the anchor and revokes when the click throws', () => {
    vi.useFakeTimers();
    const { revoke } = stubUrl();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => downloadFile('x.json', new Blob(['x']))).toThrow('blocked');
    expect(document.querySelectorAll('a[download]').length).toBe(0);
    vi.advanceTimersByTime(REVOKE_DELAY_MS);
    expect(revoke).toHaveBeenCalledOnce();
  });
});

describe('exportJson', () => {
  it('downloads the backup first, then sets lastExportedAt', async () => {
    const d = testDeps();
    const { camp } = await seedFullCampaign(d);
    expect((await d.db.campaigns.get(camp.id))?.lastExportedAt).toBeUndefined();
    const order: string[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(async function (
      this: HTMLAnchorElement,
    ) {
      order.push(`click:${this.download}`);
      order.push(`exported:${(await d.db.campaigns.get(camp.id))?.lastExportedAt}`);
    });
    await exportJson(d, camp.id);
    expect(order[0]).toMatch(/^click:prepdesk-the-salt-marsh-debts-\d{4}-\d{2}-\d{2}\.json$/);
    expect(order[1]).toBe('exported:undefined');
    expect((await d.db.campaigns.get(camp.id))?.lastExportedAt).toBeGreaterThan(0);
  });
});
