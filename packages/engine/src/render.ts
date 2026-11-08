import type { Library } from './library';
import type { Rng } from './rng';
import type { SafetySettings } from './safety';
import { selectEntry } from './select';
import type { TagFilter } from './select';
import type { Modifier, Slot, TemplateAst } from './template';

/** Spec §4.2: read-only campaign hook; the Codex implements it (sub-project 3). */
export type CampaignLookup = {
  get(path: string): string | undefined;
};

export type Context = {
  genre?: string;
  cultureId?: string;
  tags?: TagFilter;
  safety?: SafetySettings;
  avoidNames?: string[];
  campaign?: CampaignLookup;
  [key: string]: unknown;
};

export type RenderEnv = {
  lib: Library;
  ctx: Context;
  rng: Rng;
  resolveName(part: 'full' | 'given' | 'family'): string;
  resolveGen(generatorId: string, field: string, ctx: Context): string;
  mode: 'dev' | 'prod';
  /** Already-generated field values: a table slot whose ref is a key, or `{name}` when `name` exists. */
  fields?: Record<string, string>;
  /** Shared warn de-dup set; envs sharing one set warn once per key across all of them. */
  warned?: Set<string>;
};

export type RenderResult = {
  text: string;
  sources: string[];
  veiled: string[];
  blocked: boolean;
  relaxed: boolean;
};

const MAX_DEPTH = 8;

// One warning set per env (or env.warned when given), so each missing path/ref warns once.
const warnedByEnv = new WeakMap<RenderEnv, Set<string>>();

function warnOnce(env: RenderEnv, key: string): void {
  let warned = env.warned ?? warnedByEnv.get(env);
  if (!warned) {
    warned = new Set();
    warnedByEnv.set(env, warned);
  }
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[prepdesk] missing value: ${key}`);
}

/** Own property only, so `constructor`, `__proto__` and friends never resolve (I2). */
function own(obj: unknown, key: string): unknown {
  if (obj === null || typeof obj !== 'object' || !Object.hasOwn(obj, key)) return undefined;
  return (obj as Record<string, unknown>)[key];
}

/** A ctx path, walked through own properties; only a string, number or boolean renders. */
function readCtx(ctx: Context, path: string): string | undefined {
  if (path.startsWith('campaign.')) {
    const campaign = own(ctx, 'campaign') as Context['campaign'];
    return campaign?.get(path.slice('campaign.'.length));
  }
  let cur: unknown = ctx;
  for (const key of path.split('.')) cur = own(cur, key);
  const t = typeof cur;
  return t === 'string' || t === 'number' || t === 'boolean' ? String(cur) : undefined;
}

function fieldValue(fields: Record<string, string> | undefined, key: string): string | undefined {
  const v = own(fields, key);
  return typeof v === 'string' ? v : undefined;
}

function applyMod(text: string, mod: Modifier): string {
  switch (mod.kind) {
    case 'cap':
      return text === '' ? text : text.charAt(0).toUpperCase() + text.slice(1);
    case 'a':
      return text === '' ? text : `${/^[aeiou]/i.test(text) ? 'an' : 'a'} ${text}`;
    case 'or':
      return text === '' ? mod.fallback : text;
  }
}

export function renderTemplate(ast: TemplateAst, env: RenderEnv, depth = 0): RenderResult {
  const out: RenderResult = { text: '', sources: [], veiled: [], blocked: false, relaxed: false };

  // Returns undefined when the value is missing (so modifiers other than `or` are skipped).
  const resolve = (slot: Slot): string | undefined => {
    const fields = env.fields;
    switch (slot.kind) {
      case 'ctx': {
        const v = readCtx(env.ctx, slot.path);
        return v;
      }
      case 'gen':
        return env.resolveGen(slot.generator, slot.field, env.ctx);
      case 'name': {
        const name = fieldValue(fields, 'name');
        if (slot.part === 'full' && name !== undefined) return name;
        return env.resolveName(slot.part);
      }
      case 'table': {
        const value = fieldValue(fields, slot.ref);
        if (value !== undefined) return value;
        const table = env.lib.table(slot.ref);
        if (!table) return undefined;
        if (depth + 1 > MAX_DEPTH) return '';
        const sel = selectEntry(table, env.rng, {
          genre: env.ctx.genre,
          tags: env.ctx.tags,
          safety: env.ctx.safety,
        });
        if (sel.relaxed) out.relaxed = true;
        if (sel.blocked) {
          out.blocked = true;
          return '';
        }
        for (const v of sel.veiled) if (!out.veiled.includes(v)) out.veiled.push(v);
        if (!sel.entry) return '';
        out.sources.push(sel.entry.id);
        const inner = renderTemplate(sel.entry.ast, env, depth + 1);
        out.sources.push(...inner.sources);
        for (const v of inner.veiled) if (!out.veiled.includes(v)) out.veiled.push(v);
        if (inner.blocked) out.blocked = true;
        if (inner.relaxed) out.relaxed = true;
        return inner.text;
      }
    }
  };

  for (const el of ast) {
    if (typeof el === 'string') {
      out.text += el;
      continue;
    }
    let value = resolve(el.slot);
    for (const mod of el.mods) {
      if (mod.kind === 'or') value = applyMod(value ?? '', mod);
      else if (value !== undefined) value = applyMod(value, mod);
    }
    if (value === undefined) {
      const key =
        el.slot.kind === 'ctx'
          ? `ctx.${el.slot.path}`
          : el.slot.kind === 'table'
            ? el.slot.ref
            : '';
      warnOnce(env, key);
      value = env.mode === 'dev' ? `[missing: ${key}]` : '';
    }
    out.text += value;
  }
  return out;
}
