import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDocs } from '@prepdesk/engine';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli';
import { readPackDir } from '../src/readPack';

const fx = (name: string): string => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

function compileDir(name: string): ReturnType<typeof compileDocs> {
  const { manifest, docs } = readPackDir(fx(name));
  return compileDocs(manifest, docs);
}

describe('fixtures', () => {
  it('good compiles with zero errors', () => {
    const { pack, errors } = compileDir('good');
    expect(errors).toEqual([]);
    const role = pack.tables['fx.npc.role'];
    expect(role?.entries[0]?.id).toBe('fx.npc.role#0');
    expect(role?.entries[0]?.ast).toEqual(['a ferry clerk']);
    expect(pack.tables['fx.npc.want']?.entries[0]?.ast).toContainEqual({
      slot: { kind: 'table', ref: 'fx.npc.deadline' },
      mods: [],
    });
    expect(pack.cultures['fx.culture.marsh']?.exampleChance).toBe(0.25);
    expect(pack.decks['fx.moves']?.cards).toHaveLength(1);
  });

  const failing: Array<[string, string]> = [
    ['dup-id', 'duplicate-id'],
    ['unresolved', 'unresolved-ref'],
    ['cycle', 'cycle'],
    ['empty', 'schema'],
    ['bad-safety', 'unknown-safety-tag'],
    ['unknown-tag', 'unknown-tag'],
    ['missing-source', 'missing-source'],
    ['situation-facets', 'schema'],
    ['situation-namespace', 'namespace'],
    ['facet-ref', 'missing-source'],
    ['field-cycle', 'cycle'],
  ];
  it.each(failing)('%s yields exactly %s', (dir, code) => {
    const { errors } = compileDir(dir);
    expect(errors.map((e) => e.code)).toEqual([code]);
    expect(errors[0]?.packId).toBe('fx');
    expect(errors[0]?.path).toMatch(/^.*src\/tables\.yaml/);
  });
});

describe('weak-culture fixture', () => {
  it('yields exactly weak-culture, located in the culture file', () => {
    const { errors } = compileDir('weak-culture');
    expect(errors.map((e) => e.code)).toEqual(['weak-culture']);
    expect(errors[0]?.path).toMatch(/src\/culture\.yaml/);
  });
});

describe('readPackDir', () => {
  it('turns YAML syntax errors into schema ContentErrors', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pd-'));
    cpSync(fx('good'), dir, { recursive: true });
    writeFileSync(join(dir, 'src', 'broken.yaml'), 'kind: table\n  id: [oops\n');
    const { manifest, docs, errors: yamlErrors } = readPackDir(dir);
    const errors = [...yamlErrors, ...compileDocs(manifest, docs).errors];
    expect(errors.map((e) => e.code)).toEqual(['schema']);
    expect(errors[0]?.path).toContain('broken.yaml');
  });
});

describe('cli main', () => {
  it('build writes dist/<id>.json and exits 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pd-'));
    cpSync(fx('good'), dir, { recursive: true });
    const io = { out: [] as string[], err: [] as string[] };
    expect(main(['build', dir], io)).toBe(0);
    const file = join(dir, 'dist', 'fx.json');
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8')).id).toBe('fx');
  });

  it('build exits 1 and writes nothing on errors', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pd-'));
    cpSync(fx('empty'), dir, { recursive: true });
    const io = { out: [] as string[], err: [] as string[] };
    expect(main(['build', dir], io)).toBe(1);
    expect(existsSync(join(dir, 'dist'))).toBe(false);
  });

  it('lint prints "code path message" per error and exits 1', () => {
    const io = { out: [] as string[], err: [] as string[] };
    expect(main(['lint', fx('empty')], io)).toBe(1);
    expect(io.out).toHaveLength(1);
    expect(io.out[0]).toMatch(
      /^schema \S*src\/tables\.yaml#entries a table needs at least 1 entry$/,
    );
    expect(main(['lint', fx('good')], { out: [], err: [] })).toBe(0);
  });

  it('exits 2 on bad usage', () => {
    expect(main(['nope'], { out: [], err: [] })).toBe(2);
  });
});
