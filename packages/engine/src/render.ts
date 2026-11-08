import type { Library } from './library';
import type { Rng } from './rng';
import type { SafetySettings } from './safety';
import { selectEntry } from './select';
import type { TagFilter } from './select';
import type { Modifier, Slot, TemplateAst } from './template';

export type Context = {
  genre?: string;
  cultureId?: string;
  tags?: TagFilter;
  safety?: SafetySettings;
  avoidNames?: string[];
  campaign?: { get(path: string): string | undefined };
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

function readCtx(ctx: Context, path: string): string | undefined {
  if (path.startsWith('campaign.')) return ctx.campaign?.get(path.slice('campaign.'.length));
  let cur: unknown = ctx;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (cur === undefined || cur === null) return undefined;
  return typeof cur === 'object' ? undefined : String(cur);
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
      case 'name':
        if (slot.part === 'full' && fields?.name !== undefined) return fields.name;
        return env.resolveName(slot.part);
      case 'table': {
        const fieldValue = fields?.[slot.ref];
        if (fieldValue !== undefined) return fieldValue;
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
