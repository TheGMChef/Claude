import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedFullCampaign, snapshotDb } from '../../test/backupFixtures';
import { seedCampaign, testDeps } from '../../test/fixtures';
import { RepoError } from '../deps';
import { buildBackup } from '../export/json';
import {
  MAX_BACKUP_BYTES,
  RESTORE_MESSAGES,
  YIELD_EVERY,
  droppedMessage,
  readBackup,
  restoreBackup,
} from '../export/restore';
import type { Backup } from '../export/schema';
import { FIELD_KEY, FORBIDDEN_KEYS } from '../export/schema';
import { deleteCampaign } from '../repo/campaigns';
import { createEntity, updateEntity } from '../repo/entities';

// Indirect base: Vite rewrites the literal `new URL(path, import.meta.url)` form as an asset URL.
const here = import.meta.url;
const dir = new URL('../__fixtures__/hostile/', here);
const fixtureText = (name: string) => readFileSync(new URL(`${name}.json`, dir), 'utf8');
const blob = (text: string) => new Blob([text]);
const asBlob = (b: unknown) => blob(JSON.stringify(b));
const valid = (): Backup => JSON.parse(fixtureText('valid')) as Backup;

afterEach(() => vi.restoreAllMocks());

async function sortedRows(d: ReturnType<typeof testDeps>, cid: string) {
  const out: Record<string, string[]> = {};
  for (const s of [
    'sessions',
    'entities',
    'links',
    'ledger',
    'shortlist',
    'usedNames',
    'pocket',
    'drafts',
    'prepAnswers',
  ]) {
    const rows = await d.db.table(s).where('campaignId').equals(cid).toArray();
    out[s] = rows.map(canon).sort();
  }
  return out;
}

/** JSON with sorted keys, so rows compare by value and not by key order. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x !== null && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x,
  );
}

describe('round trip (spec 5.10.3)', () => {
  it('export, delete, read, restore gives the same rows in every store; another campaign is untouched', async () => {
    const d = testDeps();
    const { camp } = await seedFullCampaign(d);
    const other = await seedFullCampaign(d, 'Other camp');
    const before = await sortedRows(d, camp.id);
    const otherBefore = await sortedRows(d, other.camp.id);
    for (const [store, rows] of Object.entries(before)) {
      expect(rows.length, `${store} must have rows`).toBeGreaterThan(0);
    }
    const backup = await buildBackup(d, camp.id);
    await deleteCampaign(d, camp.id);
    expect(await d.db.entities.where('campaignId').equals(camp.id).count()).toBe(0);

    const read = await readBackup(d, asBlob(backup));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.exists).toBe(false);
    expect(read.dropped).toBe(0);
    await restoreBackup(d, read.backup);

    expect(await sortedRows(d, camp.id)).toEqual(before);
    expect(await sortedRows(d, other.camp.id)).toEqual(otherBefore);
    expect((await d.db.campaigns.get(camp.id))?.name).toBe('The Salt Marsh Debts');
    expect((await d.db.settings.get('currentCampaignId'))?.value).toBe(camp.id);
  });

  it('every restored entry can be edited (it passes the validation updateEntity applies)', async () => {
    const d = testDeps();
    const { camp } = await seedFullCampaign(d);
    const backup = await buildBackup(d, camp.id);
    await deleteCampaign(d, camp.id);
    const read = await readBackup(d, asBlob(backup));
    if (!read.ok) throw new Error('read failed');
    await restoreBackup(d, read.backup);
    const ents = await d.db.entities.where('campaignId').equals(camp.id).toArray();
    expect(ents.length).toBeGreaterThan(1);
    for (const e of ents) await expect(updateEntity(d, e.id, {})).resolves.toBeTruthy();
  });
});

describe('replace', () => {
  it('reports exists, swaps the rows, drops device-only rows, and is one transaction', async () => {
    const d = testDeps();
    const { camp } = await seedFullCampaign(d);
    const backup = await buildBackup(d, camp.id);
    backup.campaign.name = 'Renamed in backup';
    const extra = await createEntity(d, camp.id, { kind: 'note', title: 'Only on device' });

    const read = await readBackup(d, asBlob(backup));
    if (!read.ok) throw new Error('read failed');
    expect(read.exists).toBe(true);

    // a failure part-way through leaves the device exactly as it was
    const before = await snapshotDb(d);
    vi.spyOn(d.db.links, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));
    await expect(restoreBackup(d, read.backup)).rejects.toThrow('disk full');
    expect(await snapshotDb(d)).toEqual(before);
    expect(await d.db.entities.get(extra.id)).toBeDefined();

    vi.restoreAllMocks();
    await restoreBackup(d, read.backup);
    expect((await d.db.campaigns.get(camp.id))?.name).toBe('Renamed in backup');
    expect(await d.db.entities.get(extra.id)).toBeUndefined();
  });
});

describe('hostile files (Review Focus 1)', () => {
  const EXPECT_REJECTED = [
    'bad-field-key',
    'constructor-key-in-fields',
    'dangling-link',
    'duplicate-entity-id',
    'foreign-campaign-entity',
    'ledger-unknown-session',
    'long-title',
    'plain-array',
    'proto-at-root',
    'proto-in-fields',
    'unknown-key',
    'unknown-safety-topic',
    'wrong-format',
  ];

  it('the fixture folder holds exactly these hostile files plus one valid control', () => {
    const names = readdirSync(dir)
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    expect(names).toEqual([...EXPECT_REJECTED, 'valid'].sort());
  });

  it('the control reads fine, so each rejection below is caused by its one defect', async () => {
    const d = testDeps();
    const r = await readBackup(d, blob(fixtureText('valid')));
    expect(r.ok).toBe(true);
  });

  it('raw-text fixtures really carry the prototype keys (guard against a vacuous test)', () => {
    expect(
      Object.hasOwn(JSON.parse(fixtureText('proto-in-fields')).entities[0].fields, '__proto__'),
    ).toBe(true);
    expect(Object.hasOwn(JSON.parse(fixtureText('proto-at-root')), '__proto__')).toBe(true);
    expect(
      Object.hasOwn(
        JSON.parse(fixtureText('constructor-key-in-fields')).entities[0].fields,
        'constructor',
      ),
    ).toBe(true);
  });

  it.each(EXPECT_REJECTED)('%s -> not-backup, and nothing is written', async (name) => {
    const d = testDeps();
    await seedCampaign(d, { name: 'Already here' });
    const before = await snapshotDb(d);
    const r = await readBackup(d, blob(fixtureText(name)));
    expect(r).toEqual({ ok: false, error: 'not-backup' });
    expect(await snapshotDb(d)).toEqual(before);
  });

  it('not JSON at all, an empty file and a binary blob -> not-backup', async () => {
    const d = testDeps();
    for (const text of ['this is not json', '', '\u0000\u0001{']) {
      expect(await readBackup(d, blob(text))).toEqual({ ok: false, error: 'not-backup' });
    }
  });

  it('a session id that already belongs to another campaign -> not-backup', async () => {
    const d = testDeps();
    const other = await seedFullCampaign(d, 'Other');
    const b = valid();
    b.sessions[0]!.id = other.ses.id;
    b.entities[0]!.firstSessionId = other.ses.id;
    expect(await readBackup(d, asBlob(b))).toEqual({ ok: false, error: 'not-backup' });
  });

  it('an entity id that already belongs to another campaign -> not-backup', async () => {
    const d = testDeps();
    const other = await seedFullCampaign(d, 'Other');
    const b = valid();
    const e = b.entities[0]!;
    b.links = [];
    e.id = other.a.id;
    expect(await readBackup(d, asBlob(b))).toEqual({ ok: false, error: 'not-backup' });
  });

  it('a prepAnswers key (session id + step) colliding with another campaign -> not-backup', async () => {
    const d = testDeps();
    const other = await seedFullCampaign(d, 'Other');
    const b = valid();
    // the session id is free on this device only if no other campaign has it; give the answer the other's key
    b.prepAnswers.push({
      sessionId: other.ses.id,
      campaignId: b.campaign.id,
      step: 1,
      answers: {},
      updatedAt: 1,
    });
    b.sessions.push({ ...b.sessions[0]!, id: other.ses.id });
    expect(await readBackup(d, asBlob(b))).toEqual({ ok: false, error: 'not-backup' });
  });

  it("a dangling ledger entityId or undo id that names another campaign's entry -> not-backup", async () => {
    const d = testDeps();
    const other = await seedFullCampaign(d, 'Other');
    const mk = (over: Record<string, unknown>) => {
      const b = valid();
      b.ledger.push({
        id: 'evt_0000000000000001',
        campaignId: b.campaign.id,
        sessionId: b.sessions[0]!.id,
        at: 1,
        t: 0,
        kind: 'note',
        text: 'x',
        review: 'none',
        undo: {},
        ...over,
      } as Backup['ledger'][number]);
      return b;
    };
    expect(await readBackup(d, asBlob(mk({})))).toMatchObject({ ok: true });
    expect(await readBackup(d, asBlob(mk({ entityId: other.a.id })))).toEqual({
      ok: false,
      error: 'not-backup',
    });
    expect(await readBackup(d, asBlob(mk({ undo: { createdEntityIds: [other.b.id] } })))).toEqual({
      ok: false,
      error: 'not-backup',
    });
    expect(
      await readBackup(d, asBlob(mk({ undo: { createdLinkIds: ['lnk_0000000000000001'] } }))),
    ).toMatchObject({
      ok: true,
    });
  });

  it('the collision is checked again inside the restore transaction', async () => {
    const d = testDeps();
    const read = await readBackup(d, blob(fixtureText('valid')));
    if (!read.ok) throw new Error('read failed');
    const other = await seedCampaign(d, { name: 'Raced in' });
    await d.db.entities.add({ ...read.backup.entities[0]!, campaignId: other.id });
    const before = await snapshotDb(d);
    await expect(restoreBackup(d, read.backup)).rejects.toMatchObject({ code: 'conflict' });
    expect(await snapshotDb(d)).toEqual(before);
    expect(RepoError).toBeDefined();
  });

  it('structure bombs are rejected with a typed result, never a throw', async () => {
    const d = testDeps();
    const deepArray = '['.repeat(200_000) + ']'.repeat(200_000);
    const deepObject = '{"a":'.repeat(50_000) + '1' + '}'.repeat(50_000);
    const b = valid();
    const nest = (n: number) => {
      let v: unknown = 1;
      for (let i = 0; i < n; i++) v = { k: v };
      return v;
    };
    const cases: [string, string][] = [
      ['deep array', deepArray],
      ['deep object', deepObject],
      ['root-level deep object in a field', JSON.stringify({ ...b, extra: nest(30) })],
      [
        '6,000 aliases',
        JSON.stringify({ ...b, entities: [{ ...b.entities[0], aliases: Array(6000).fill('a') }] }),
      ],
      ['50,001 entities', JSON.stringify({ ...b, entities: Array(50_001).fill(0) })],
      [
        '300,000-character body',
        JSON.stringify({ ...b, entities: [{ ...b.entities[0], body: 'x'.repeat(300_000) }] }),
      ],
      [
        'body just over the 200,000 cap',
        JSON.stringify({ ...b, entities: [{ ...b.entities[0], body: 'x'.repeat(200_001) }] }),
      ],
      [
        'a 5,000-character key',
        JSON.stringify({
          ...b,
          entities: [{ ...b.entities[0], fields: { ['k'.repeat(5000)]: 'x' } }],
        }),
      ],
    ];
    for (const [label, text] of cases) {
      expect(await readBackup(d, blob(text)), label).toEqual({ ok: false, error: 'not-backup' });
    }
  });

  it('too many fields on one entry -> not-backup (the repo allows 100)', async () => {
    const d = testDeps();
    const b = valid();
    b.entities[0]!.fields = Object.fromEntries(
      Array.from({ length: 101 }, (_, i) => [`f${i}`, 'x']),
    );
    expect(await readBackup(d, asBlob(b))).toEqual({ ok: false, error: 'not-backup' });
    b.entities[0]!.fields = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`f${i}`, 'x']),
    );
    expect((await readBackup(d, asBlob(b))).ok).toBe(true);
  });

  it('the schema rejects the same field keys createEntity rejects', async () => {
    const d = testDeps();
    const camp = await seedCampaign(d);
    const keys = [
      'okKey',
      'a',
      'constructor',
      'prototype',
      'bad key',
      '1abc',
      'x'.repeat(41),
      'x'.repeat(40),
      'has-dash',
      '',
    ];
    for (const k of keys) {
      const repo = await createEntity(d, camp.id, {
        kind: 'note',
        title: `T ${k.length}`,
        fields: { [k]: 'v' },
      }).then(
        () => true,
        () => false,
      );
      const inSchema = FIELD_KEY.test(k) && !FORBIDDEN_KEYS.has(k);
      expect(inSchema, `key "${k}"`).toBe(repo);
    }
  });

  it('titles with [[ ]] or | , a bad subtype or state, a clock on a non-front -> not-backup', async () => {
    const d = testDeps();
    type Ent = Backup['entities'][number];
    const mutate: ((e: Ent) => unknown)[] = [
      (e) => (e.title = 'A [[B]]'),
      (e) => (e.title = 'A|B'),
      (e) => (e.aliases = ['x|y']),
      (e) => (e.subtype = 'settlement'),
      (e) => (e.state = 'open'),
      (e) => (e.clock = { size: 6, filled: 1, doom: '' }),
      (e) => (e.veiled = ['spooky']),
    ];
    for (const m of mutate) {
      const b = valid();
      m(b.entities[0]!);
      expect(await readBackup(d, asBlob(b))).toEqual({ ok: false, error: 'not-backup' });
    }
  });
});

describe('versions and size (D63 steps 1 and 4)', () => {
  it('formatVersion 2 -> newer, even with fields this version has never seen', async () => {
    const d = testDeps();
    const b = { ...valid(), formatVersion: 2, brandNewThing: { x: 1 } };
    expect(await readBackup(d, asBlob(b))).toEqual({ ok: false, error: 'newer' });
    const s = { ...valid(), schemaVersion: 2 };
    expect(await readBackup(d, asBlob(s))).toEqual({ ok: false, error: 'newer' });
    expect(await readBackup(d, asBlob({ ...valid(), formatVersion: 0 }))).toEqual({
      ok: false,
      error: 'not-backup',
    });
    expect(await readBackup(d, asBlob({ ...valid(), formatVersion: 1.5 }))).toEqual({
      ok: false,
      error: 'not-backup',
    });
  });

  it('a file over 50 MB is too big, judged by size before any reading', async () => {
    const d = testDeps();
    const text = vi.fn(() => {
      throw new Error('must not read');
    });
    const fake = { size: MAX_BACKUP_BYTES + 1, text } as unknown as Blob;
    expect(await readBackup(d, fake)).toEqual({ ok: false, error: 'too-big' });
    expect(text).not.toHaveBeenCalled();
    const real = new Blob([new Uint8Array(51 * 1024 * 1024)]);
    expect(await readBackup(d, real)).toEqual({ ok: false, error: 'too-big' });
  });

  it('carries the exact D63 messages', () => {
    expect(RESTORE_MESSAGES['not-backup']).toBe(
      "That file isn't a Prep Desk backup. Choose a .json file exported from Prep Desk.",
    );
    expect(RESTORE_MESSAGES['too-big']).toBe(
      'That file is too big to be a Prep Desk backup. Choose a .json file exported from Prep Desk.',
    );
    expect(RESTORE_MESSAGES.newer).toBe(
      'This backup was made by a newer Prep Desk. Update the app, then try again.',
    );
    expect(droppedMessage(3)).toBe(
      "3 saved cards couldn't be read and were left out. Your text is kept.",
    );
    expect(droppedMessage(1)).toBe(
      "1 saved card couldn't be read and was left out. Your text is kept.",
    );
  });
});

describe('cards (D63 step 9, Security B)', () => {
  it('keeps an otherwise valid card whose own context has lines: [] (provenance only)', async () => {
    const d = testDeps();
    const { camp, a } = await seedFullCampaign(d);
    const backup = await buildBackup(d, camp.id);
    const card = JSON.parse(backup.entities.find((e) => e.id === a.id)!.card!);
    expect(card.context.safety.lines).toEqual([]); // npcCardJson is rolled with no lines
    const r = await readBackup(d, asBlob(backup));
    if (!r.ok) throw new Error('read failed');
    expect(r.backup.entities.find((e) => e.id === a.id)!.card).toBe(
      backup.entities.find((e) => e.id === a.id)!.card,
    );
    expect(r.dropped).toBe(0);
  });

  it('removes a corrupt card, keeps the entry text, and lists the card for the summary', async () => {
    const d = testDeps();
    const { camp, a } = await seedFullCampaign(d);
    const backup = await buildBackup(d, camp.id);
    const ent = backup.entities.find((e) => e.id === a.id)!;
    ent.card = '{"not":"a card"}';
    const r = await readBackup(d, asBlob(backup));
    if (!r.ok) throw new Error('read failed');
    const got = r.backup.entities.find((e) => e.id === a.id)!;
    expect('card' in got).toBe(false);
    expect(got.title).toBe('Odrin Vey');
    expect(got.body).toContain('Salt Office');
    expect(r.dropped).toBe(1);
    expect(r.droppedCards).toEqual([
      { store: 'entities', id: a.id, title: 'Odrin Vey', action: 'card-removed' },
    ]);
  });

  it('drops a card-only shortlist item and a non-names pocket item whose card is corrupt, and lists them', async () => {
    const d = testDeps();
    const { camp } = await seedFullCampaign(d);
    const backup = await buildBackup(d, camp.id);
    const cardOnly = backup.shortlist.find((s) => s.entityId === undefined)!;
    const withEntity = backup.shortlist.find((s) => s.entityId !== undefined)!;
    withEntity.card = 'garbage';
    cardOnly.card = 'garbage';
    const npcs = backup.pocket.find((p) => p.section === 'npcs')!;
    npcs.card = 'garbage';
    const draft = backup.drafts[0]!;
    draft.card = 'garbage';
    const r = await readBackup(d, asBlob(backup));
    if (!r.ok) throw new Error('read failed');
    expect(r.backup.shortlist.map((s) => s.id)).toEqual([withEntity.id]);
    expect('card' in r.backup.shortlist[0]!).toBe(false);
    expect(r.backup.pocket.map((p) => p.section)).toEqual(['names']);
    expect(r.backup.drafts[0]!.line).toBe('A rumor');
    expect('card' in r.backup.drafts[0]!).toBe(false);
    expect(r.dropped).toBe(4);
    expect(r.droppedCards.map((x) => `${x.store}:${x.action}`).sort()).toEqual([
      'drafts:card-removed',
      'pocket:record-dropped',
      'shortlist:card-removed',
      'shortlist:record-dropped',
    ]);
  });
});

describe('hidden text is not restored (R65)', () => {
  it('strips `hidden` from every kind of stored card and leaves untouched cards byte-identical', async () => {
    const d = testDeps();
    const { camp, a } = await seedFullCampaign(d);
    const backup = await buildBackup(d, camp.id);
    const withHidden = (json: string) => {
      const c = JSON.parse(json);
      c.fields.look.hidden = { value: 'a swarm of spiders', sources: ['fantasy.npc.look#0'] };
      return JSON.stringify(c);
    };
    const untouched = backup.pocket.find((p) => p.section === 'npcs')!.card!;
    backup.entities.find((e) => e.id === a.id)!.card = withHidden(
      backup.entities.find((e) => e.id === a.id)!.card!,
    );
    backup.shortlist.find((s) => s.card !== undefined)!.card = withHidden(
      backup.shortlist.find((s) => s.card !== undefined)!.card!,
    );
    backup.drafts[0]!.card = withHidden(backup.drafts[0]!.card!);
    const r = await readBackup(d, asBlob(backup));
    if (!r.ok) throw new Error('read failed');
    expect(r.dropped).toBe(0);
    const cards = [
      r.backup.entities.find((e) => e.id === a.id)!.card!,
      r.backup.shortlist.find((s) => s.card !== undefined)!.card!,
      r.backup.drafts[0]!.card!,
    ];
    for (const c of cards) {
      expect(c).not.toContain('spiders');
      expect(c).not.toContain('hidden');
      expect(JSON.parse(c).fields.look.value).toBeTruthy();
    }
    expect(r.backup.pocket.find((p) => p.section === 'npcs')!.card).toBe(untouched);
  });
});

describe('derived data is recomputed, never trusted (D63 step 10, R65)', () => {
  it('tokens and wikiTargets in the file are replaced', async () => {
    const d = testDeps();
    const b = valid();
    b.entities[0]!.tokens = ['x'];
    b.entities[0]!.wikiTargets = ['planted'];
    const r = await readBackup(d, asBlob(b));
    if (!r.ok) throw new Error('read failed');
    expect(r.backup.entities[0]!.tokens).toEqual(expect.arrayContaining(['fixture', '1', 'npc']));
    expect(r.backup.entities[0]!.tokens).not.toContain('x');
    expect(r.backup.entities[0]!.wikiTargets).toEqual(['fixture 2']);
  });

  it('wiki links come from the text: a planted one is dropped, a missing one is made', async () => {
    const d = testDeps();
    const b = valid();
    // planted: Fixture 2's text says nothing, but the file claims it mentions Fixture 1
    b.links.push({
      id: 'lnk_0000000000000009',
      campaignId: b.campaign.id,
      fromId: b.entities[1]!.id,
      toId: b.entities[0]!.id,
      rel: 'mentions',
      origin: 'wiki',
      createdAt: 1,
    });
    const r = await readBackup(d, asBlob(b));
    if (!r.ok) throw new Error('read failed');
    const wiki = r.backup.links.filter((l) => l.origin === 'wiki');
    expect(wiki.map((l) => [l.fromId, l.toId, l.rel])).toEqual([
      [b.entities[0]!.id, b.entities[1]!.id, 'mentions'],
    ]);
    expect(r.backup.links.some((l) => l.id === 'lnk_0000000000000009')).toBe(false);
    expect(r.backup.links.some((l) => l.origin === 'explicit')).toBe(true);
  });

  it('recomputing yields to the page every 200 entries', async () => {
    const d = testDeps();
    const b = valid();
    const base = b.entities[0]!;
    b.links = [];
    b.entities = Array.from({ length: YIELD_EVERY * 2 + 50 }, (_, i) => ({
      ...base,
      id: `ent_${String(i + 1).padStart(16, '0')}`,
      title: `Entry ${i}`,
      body: '',
    }));
    const text = JSON.stringify(b);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const r = await readBackup(d, blob(text));
    expect(r.ok).toBe(true);
    const zeroDelay = spy.mock.calls.filter((c) => c[1] === 0).length;
    // two yields while recomputing tokens and two more while deriving links
    expect(zeroDelay).toBeGreaterThanOrEqual(4);
  });
});
