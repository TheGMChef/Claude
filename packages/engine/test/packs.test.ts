import corePkg from '../../content-core/package.json?raw';
import fantasyPkg from '../../content-fantasy/package.json?raw';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { askOracle, drawMove } from '../src/oracle';
import { batch, generate } from '../src/generate';
import type { Card } from '../src/generate';
import { lintPack } from '../src/lint';
import { normalizeName } from '../src/names';
import type { NameResult } from '../src/names';
import { SAFETY_VOCABULARY } from '../src/safety';
import type { CompiledTable } from '../src/schema';
import { FACETS } from '../src/schema';
import { allSituations } from './fixtures/content-helpers';
import {
  CULTURES_SPEC,
  DECK_SPEC,
  GENERATORS,
  SITUATIONS,
  STRICT_LINES,
  TABLE_SPEC,
  threshold,
} from './fixtures/content-spec';
import { corePack, fantasyPack, lib } from './fixtures/starter-packs';

const CULTURES = ['fantasy.culture.marsh', 'fantasy.culture.highland', 'fantasy.culture.imperial'];
const fullLines = { lines: [...SAFETY_VOCABULARY], veils: [] };

describe('starter packs', () => {
  it("each content package's version matches its pack version (prepdesk.version)", () => {
    for (const [dir, raw] of [
      ['content-core', corePkg],
      ['content-fantasy', fantasyPkg],
    ] as const) {
      const pkg = JSON.parse(raw) as { version: string; prepdesk: { version: string } };
      expect(pkg.version, dir).toBe(pkg.prepdesk.version);
    }
  });

  it('S1 content is complete: every spec row is full', () => {
    expect(Object.values(TABLE_SPEC).every((s) => s.full)).toBe(true);
    expect(SITUATIONS.full).toBe(true);
    expect(CULTURES_SPEC.full).toBe(true);
    expect(DECK_SPEC.full).toBe(true);
  });

  it('both lint clean', () => {
    expect(lintPack(corePack)).toEqual([]);
    expect(lintPack(fantasyPack)).toEqual([]);
  });

  it('ship no empty table', () => {
    for (const pack of [corePack, fantasyPack]) {
      for (const t of Object.values(pack.tables)) expect(t.entries.length, t.id).toBeGreaterThan(0);
    }
  });

  it('generates the stored fantasy.npc snapshot for a fixed seed', async () => {
    const card = generate(lib, 'fantasy.npc', {
      seed: 'TEST-0001',
      context: { cultureId: 'fantasy.culture.marsh' },
    });
    const snap = { display: card.display, fields: card.fields };
    await expect(`${JSON.stringify(snap, null, 2)}\n`).toMatchFileSnapshot(
      './fixtures/__snapshots__/fantasy-npc.marsh.json',
    );
  });

  it.each(CULTURES)('%s yields 20 distinct names', (cultureId) => {
    const names = batch(lib, [{ cultureId, count: 20 }], { seed: 'TEST-0001' }) as NameResult[];
    expect(new Set(names.map((n) => normalizeName(n.name))).size).toBe(20);
  });

  it('generates 1,000 NPCs under the full safety vocabulary without throwing', () => {
    const lined = (source: string): boolean => {
      const [tableId, index] = source.split('#');
      const entry = lib.table(tableId ?? '')?.entries[Number(index)];
      return (entry?.safety.length ?? 0) > 0;
    };
    for (let i = 0; i < 1000; i++) {
      const card: Card = generate(lib, 'fantasy.npc', {
        seed: `npc-${i}`,
        context: { cultureId: CULTURES[i % 3], safety: fullLines },
      });
      for (const field of Object.values(card.fields)) {
        if (!field.blocked) expect(field.sources.filter(lined)).toEqual([]);
      }
    }
  });

  it('draws a GM move from core.gm-moves', () => {
    const move = drawMove(lib, 'core.gm-moves', { seed: 'TEST-0001' });
    const ids = lib.deck('core.gm-moves')?.cards.map((c) => c.id) ?? [];
    expect(ids.length).toBeGreaterThanOrEqual(threshold(DECK_SPEC));
    expect(ids).toContain(move.id);
    expect(move.text.length).toBeGreaterThan(0);
    expect(move.prompt).toMatch(/\?$/);
    for (const card of lib.deck('core.gm-moves')?.cards ?? []) {
      expect(card.text.split(/\s+/).length, card.id).toBeLessThanOrEqual(8);
    }
  });

  it('answers fantasy.oracle with the spec odds and single-word meanings', () => {
    expect(lib.oracle('fantasy.oracle')?.odds).toEqual({
      certain: { yes: 90, extreme: 15 },
      likely: { yes: 70, extreme: 10 },
      even: { yes: 50, extreme: 8 },
      unlikely: { yes: 30, extreme: 5 },
      remote: { yes: 10, extreme: 3 },
    });
    for (const id of ['fantasy.meaning.action', 'fantasy.meaning.theme']) {
      const spec = TABLE_SPEC[id];
      expect(spec, `${id} has a TABLE_SPEC row`).toBeDefined();
      expect(lib.table(id)?.entries.length, id).toBeGreaterThanOrEqual(threshold(spec!));
    }
    const answer = askOracle(lib, 'fantasy.oracle', 'even', { seed: 'TEST-0001' });
    for (const word of answer.meaning) expect(word).toMatch(/^[a-z]+$/);
  });
});

const specRows = Object.entries(TABLE_SPEC);
const tableOf = (id: string): CompiledTable => lib.table(id) as CompiledTable;
const strict = (entry: { safety: string[] }): boolean =>
  entry.safety.some((t) => STRICT_LINES.includes(t));

describe('table counts (TABLE_SPEC)', () => {
  it.each(specRows)('%s has its entries', (id, spec) => {
    const table = lib.table(id);
    expect(table, `${id} exists`).toBeDefined();
    const n = table?.entries.length ?? 0;
    if (spec.kind === 'fixed') expect(n, id).toBe(spec.target);
    else expect(n, id).toBeGreaterThanOrEqual(threshold(spec));
  });

  it('threshold is the target once full, else the stub (default min(8, target))', () => {
    const base = { family: 'x', kind: 'line' as const };
    expect(threshold({ ...base, target: 40, full: true })).toBe(40);
    expect(threshold({ ...base, target: 40, full: false })).toBe(8);
    expect(threshold({ ...base, target: 6, full: false })).toBe(6);
    expect(threshold({ ...base, target: 50, stub: 30, full: false })).toBe(30);
  });
});

describe('safety tagging stays rare (TABLE_SPEC)', () => {
  const lineOrWord = specRows.filter(([, s]) => s.kind === 'line' || s.kind === 'word');

  it.each(lineOrWord)('%s has at most 30% safety-tagged entries', (id) => {
    const entries = tableOf(id).entries;
    const tagged = entries.filter((e) => e.safety.length > 0).length;
    expect(tagged / entries.length, id).toBeLessThanOrEqual(0.3);
  });

  it.each(lineOrWord)('%s loses at most 40% under the strict-lines fixture', (id) => {
    const entries = tableOf(id).entries;
    if (entries.length < 8) return;
    const lost = entries.filter(strict).length;
    expect(lost / entries.length, id).toBeLessThanOrEqual(0.4);
  });

  it('Pocket-feeding tables keep at least 12 eligible entries once full', () => {
    const short = specRows
      .filter(([, s]) => s.pocket && s.full)
      .map(([id]) => [id, tableOf(id).entries.filter((e) => !strict(e)).length] as const)
      .filter(([, n]) => n < 12);
    expect(short).toEqual([]);
  });
});

describe('situations (SITUATIONS)', () => {
  const situations = allSituations(lib);
  const index = lib.packs
    .flatMap((p) => Object.values(p.tables))
    .find((t) => t.id.endsWith('.situations'));

  it.skipIf(!SITUATIONS.required && situations.length === 0)(
    'meet their counts and keep strict-lines coverage',
    () => {
      const full = SITUATIONS.full;
      expect(situations.length, 'situations').toBeGreaterThanOrEqual(
        full ? SITUATIONS.target : SITUATIONS.stub,
      );
      const eligible = (index?.entries ?? []).filter((e) => !strict(e)).length;
      expect(eligible, 'index entries kept under strict lines').toBeGreaterThanOrEqual(
        full ? 10 : 2,
      );
      for (const s of situations) {
        for (const f of FACETS) {
          const t = tableOf(s.facets[f]);
          expect(t.entries.length, t.id).toBeGreaterThanOrEqual(
            full ? SITUATIONS.facetTarget : SITUATIONS.facetStub,
          );
          // A strict-lined situation never appears under strict lines; its facets inherit the tag.
          if (!s.safety.some((x) => STRICT_LINES.includes(x)))
            expect(
              t.entries.filter(strict).length,
              `${t.id} strict-lined entries`,
            ).toBeLessThanOrEqual(1);
        }
      }
    },
  );

  it('SITUATIONS.required is set once the pack ships a situation', () => {
    if (situations.length > 0)
      expect(SITUATIONS.required, 'set required: true in content-spec').toBe(true);
  });
});

describe('generators (GENERATORS)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => warn.mockRestore());

  it.each(GENERATORS)('%s generates 1,000 times without a missing ref or an empty field', (id) => {
    for (let i = 0; i < 1000; i++) {
      const card = generate(lib, id, { seed: `sweep-${i}`, context: {} });
      for (const [name, field] of Object.entries(card.fields)) {
        if (!field.blocked) expect(field.value, `${id} ${i} ${name}`).not.toBe('');
        expect(field.value, `${id} ${i} ${name}`).not.toContain('[missing');
      }
      expect(card.display, `${id} ${i} display`).not.toContain('[missing');
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('matches the stored snapshot of every generator but fantasy.npc (which has its own)', async () => {
    for (const id of GENERATORS.filter((g) => g !== 'fantasy.npc')) {
      const card = generate(lib, id, { seed: 'TEST-0001' });
      const snap = { display: card.display, fields: card.fields };
      await expect(`${JSON.stringify(snap, null, 2)}\n`).toMatchFileSnapshot(
        `./fixtures/__snapshots__/${id}.json`,
      );
    }
  });
});
