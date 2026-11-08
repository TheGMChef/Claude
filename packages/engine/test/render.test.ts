import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPacks } from '../src/library';
import { createRng } from '../src/rng';
import { parseTemplate } from '../src/template';
import { renderTemplate } from '../src/render';
import type { Context, RenderEnv } from '../src/render';
import type { CompiledPack, CompiledTable } from '../src/schema';

const table = (id: string, entries: Array<{ t: string; safety?: string[] }>): CompiledTable => ({
  id,
  tags: [],
  entries: entries.map((e, i) => ({
    id: `${id}#${i}`,
    ast: parseTemplate(e.t),
    weight: 1,
    tags: [],
    safety: e.safety ?? [],
  })),
});

const tables: CompiledTable[] = [
  table('t.role', [{ t: 'innkeeper' }]),
  table('t.boat', [{ t: 'ferryman' }]),
  table('t.outer', [{ t: 'a {t.role} and {t.boat}' }]),
  table('t.loop', [{ t: 'x{t.loop}' }]),
  table('t.bad', [{ t: 'grim', safety: ['gore'] }]),
  table('t.holder', [{ t: 'see {t.bad}' }]),
  table('t.empty', [{ t: '' }]),
];

const pack = {
  id: 't',
  tables: Object.fromEntries(tables.map((t) => [t.id, t])),
  cultures: {},
  generators: {},
  oracles: {},
  decks: {},
  situations: {},
  vocabulary: [],
} as unknown as CompiledPack;
const lib = loadPacks([pack]);

const mkEnv = (over: Partial<RenderEnv> = {}, ctx: Context = {}): RenderEnv => ({
  lib,
  ctx,
  rng: createRng('r'),
  resolveName: (part) => `name-${part}`,
  resolveGen: (g, f) => `${g}.${f}`,
  mode: 'dev',
  ...over,
});
const render = (tpl: string, env: RenderEnv = mkEnv()) => renderTemplate(parseTemplate(tpl), env);

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe('renderTemplate', () => {
  it('expands nested table slots and lists sources', () => {
    const r = render('{t.outer}!');
    expect(r.text).toBe('a innkeeper and ferryman!');
    expect(r.sources).toEqual(['t.outer#0', 't.role#0', 't.boat#0']);
    expect(r.blocked).toBe(false);
    expect(r.relaxed).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('applies cap and a modifiers', () => {
    expect(render('{t.role|cap}').text).toBe('Innkeeper');
    expect(render('{t.role|a}').text).toBe('an innkeeper');
    expect(render('{t.boat|a}').text).toBe('a ferryman');
    expect(render('{t.empty|a|cap}').text).toBe('');
  });

  it('uses ctx values, or: fallback, and campaign.get', () => {
    const env = mkEnv({}, { settlement: { name: 'Saltmere' } });
    expect(render('{ctx.settlement.name|or:town}', env).text).toBe('Saltmere');
    expect(render('{ctx.settlement.name|or:town}').text).toBe('town');
    const get = vi.fn((p: string) => (p === 'activeFront.name' ? 'The Drowned' : undefined));
    const env2 = mkEnv({}, { campaign: { get } });
    expect(render('{ctx.campaign.activeFront.name}', env2).text).toBe('The Drowned');
    expect(get).toHaveBeenCalledWith('activeFront.name');
    expect(warn).not.toHaveBeenCalled();
  });

  it('or: only applies when empty', () => {
    expect(render('{t.role|or:x}').text).toBe('innkeeper');
    expect(render('{t.empty|or:x}').text).toBe('x');
  });

  it('missing ctx: marker in dev, empty in prod, one warn per path', () => {
    const dev = mkEnv();
    expect(render('{ctx.x}{ctx.x}', dev).text).toBe('[missing: ctx.x][missing: ctx.x]');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockClear();
    const prod = mkEnv({ mode: 'prod' });
    expect(render('[{ctx.x}]', prod).text).toBe('[]');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('missing table ref behaves like missing ctx', () => {
    expect(render('{t.nope}').text).toBe('[missing: t.nope]');
    expect(render('{t.nope}', mkEnv({ mode: 'prod' })).text).toBe('');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('stops a self-recursive table at depth 8 without throwing', () => {
    const r = render('{t.loop}');
    expect(r.text).toBe('x'.repeat(8));
    expect(r.sources).toHaveLength(8);
  });

  it('blocked nested table blocks whole result with empty slot text', () => {
    const env = mkEnv({}, { safety: { lines: ['gore'], veils: [] } });
    const r = render('see {t.bad}.', env);
    expect(r.blocked).toBe(true);
    expect(r.text).toBe('see .');
    expect(render('{t.holder}', env).blocked).toBe(true);
  });

  it('collects veiled entries de-duplicated', () => {
    const env = mkEnv({}, { safety: { lines: [], veils: ['gore'] } });
    const r = render('{t.bad} {t.bad}', env);
    expect(r.veiled).toEqual(['gore']);
    expect(r.text).toBe('grim grim');
  });

  it('reports relaxed when a nested selection relaxes', () => {
    const env = mkEnv({}, { tags: { require: ['nothing'] } });
    expect(render('{t.role}', env).relaxed).toBe(true);
  });

  it('renders fields without sources, applying modifiers', () => {
    const env = mkEnv({ fields: { 't.role': 'smith', name: 'Ada Voss' } });
    const r = render('{t.role|a} {name} {name:given|cap}', env);
    expect(r.text).toBe('a smith Ada Voss Name-given');
    expect(r.sources).toEqual([]);
  });

  it('resolves name and gen slots through injected resolvers', () => {
    expect(render('{name:family} {gen:g.x.title}').text).toBe('name-family g.x.title');
  });

  describe('own properties only (I2)', () => {
    const ctx: Context = {
      settlement: { name: 'Saltmere', size: 3, walled: false, gates: ['n'] },
      fn: () => 'leak',
    };
    const prod = (over: Partial<RenderEnv> = {}) => mkEnv({ mode: 'prod', ...over }, ctx);

    it('ctx paths never reach the prototype chain', () => {
      for (const path of [
        'constructor',
        'toString',
        '__proto__',
        'hasOwnProperty',
        'settlement.constructor',
        'settlement.__proto__',
        'settlement.name.length',
        '__proto__.constructor',
      ]) {
        expect(render(`x{ctx.${path}}y`, prod()).text, path).toBe('xy');
      }
    });

    it('ctx values must be primitives: functions and objects render as missing', () => {
      expect(render('{ctx.fn}|{ctx.settlement}|{ctx.settlement.gates}', prod()).text).toBe('||');
      expect(
        render('{ctx.settlement.name} {ctx.settlement.size} {ctx.settlement.walled}', prod()).text,
      ).toBe('Saltmere 3 false');
    });

    it('field refs are own-property lookups: constructor, __proto__ and toString are not fields', () => {
      const env = prod({ fields: { role: 'smith' } });
      expect(render('{role}|{constructor}|{__proto__}|{toString}|{hasOwnProperty}', env).text).toBe(
        'smith||||',
      );
      expect(render('{name}', prod({ fields: {} })).text).toBe('name-full');
    });
  });

  it('envs sharing a warned set warn once per key across all of them', () => {
    const warned = new Set<string>();
    render('{ctx.nope}', mkEnv({ warned }));
    render('{ctx.nope}', mkEnv({ warned }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warned.has('ctx.nope')).toBe(true);
  });
});
