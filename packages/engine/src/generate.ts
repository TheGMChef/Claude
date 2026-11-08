import { ContentError } from './errors';
import type { Library } from './library';
import { nameWithRng, normalizeName } from './names';
import type { NameResult } from './names';
import { renderTemplate } from './render';
import type { Context, RenderEnv } from './render';
import { CROCKFORD, createRng, randomId, toSeed } from './rng';
import type { Rng } from './rng';
import type { CompiledCulture, CompiledGenerator, FieldSource } from './schema';
import { selectEntry } from './select';
import { decodeShare, encodeShare } from './share';

export type CardField = {
  value: string;
  locked: boolean;
  nonce: number;
  sources: string[];
  blocked?: boolean;
};

/** JSON-serialisable copy of a Context (the campaign hook is dropped), stored on a card. */
export type SerializableContext = Record<string, unknown>;

export type Card = {
  id: string;
  generatorId: string;
  packVersion: string;
  seed: string;
  fields: Record<string, CardField>;
  display: string;
  context: SerializableContext;
  flags: { veiled: string[]; relaxed: boolean };
};

export type RollResult = {
  text: string;
  sources: string[];
  relaxed: boolean;
  blocked: boolean;
  veiled: string[];
};

export type GenOptions = { seed?: string; context?: Context };

export type BatchRequest =
  | { generatorId: string; count: number }
  | { tableId: string; count: number }
  | { cultureId: string; count: number };

export const BLOCKED_VALUE = '—';
export const BLOCKED_DISPLAY = 'nothing fits your safety settings';
const MAX_GEN_DEPTH = 8;

/** Per generate/reroll/batch call: one warn set (R19) and the name-avoidance lists. */
type State = {
  lib: Library;
  warned: Set<string>;
  avoid: string[];
  exclude: Set<string>;
  /** In a batch, every produced name joins `exclude` and `avoid`. */
  grow: boolean;
};

type Part = { text: string; sources: string[]; blocked: boolean; relaxed: boolean };

type Built = {
  fields: Record<string, CardField>;
  display: string;
  displayBlocked: boolean;
  displaySources: string[];
  flags: Card['flags'];
};

type Plan = Record<string, { nonce: number; locked: boolean; keep?: CardField }>;

function missing(kind: string, id: string): never {
  throw new ContentError('missing-source', `${kind} "${id}" not found`, id, '');
}

function newState(lib: Library, ctx: Context, grow: boolean): State {
  return { lib, warned: new Set(), avoid: [...(ctx.avoidNames ?? [])], exclude: new Set(), grow };
}

function noteName(state: State, full: string): void {
  if (!state.grow) return;
  state.exclude.add(normalizeName(full));
  state.avoid.push(full);
}

/** A seed code drawn from an rng, for sub-cards and batch items. */
function seedFrom(rng: Rng): string {
  let s = '';
  for (let i = 0; i < 8; i++) {
    s += CROCKFORD.charAt(rng.int(32));
    if (i === 3) s += '-';
  }
  return s;
}

/** R19: with no cultureId, pick one from the seed among cultures of ctx.genre (else all). */
function resolveContext(lib: Library, ctx: Context, seed: string): Context {
  if (ctx.cultureId !== undefined) {
    if (!lib.culture(ctx.cultureId)) missing('culture', ctx.cultureId);
    return ctx;
  }
  const ids = new Set(lib.packs.flatMap((p) => Object.keys(p.cultures)));
  const all = [...ids].map((id) => lib.culture(id)).filter((c) => c !== undefined);
  if (all.length === 0) return ctx;
  const matching = ctx.genre !== undefined ? all.filter((c) => c.genre === ctx.genre) : [];
  const pool = matching.length > 0 ? matching : all;
  const chosen = pool[createRng(seed, '$culture').int(pool.length)] as CompiledCulture;
  return { ...ctx, cultureId: chosen.id };
}

/** JSON-serialisable copy of the context; the campaign hook is dropped. */
function serialisable(ctx: Context): SerializableContext {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) if (k !== 'campaign') out[k] = v;
  return JSON.parse(JSON.stringify(out)) as SerializableContext;
}

/** Which of `tags` the entries named in `sources` (`<tableId>#<index>`) carry, first-seen order. */
function safetyOf(lib: Library, sources: string[], tags: string[], into: string[] = []): string[] {
  if (tags.length === 0) return into;
  for (const src of sources) {
    const m = /^(.+)#(\d+)$/.exec(src);
    const entry = m ? lib.table(m[1] as string)?.entries[Number(m[2])] : undefined;
    if (!entry) continue;
    for (const t of tags) if (entry.safety.includes(t) && !into.includes(t)) into.push(t);
  }
  return into;
}

const veilsOf = (ctx: Context): string[] => ctx.safety?.veils ?? [];

function readCulturePath(culture: CompiledCulture, path: string): string | undefined {
  let cur: unknown = culture;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, key)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (Array.isArray(cur)) return cur.map(String).join('; ');
  return typeof cur === 'string' || typeof cur === 'number' ? String(cur) : undefined;
}

function warnOnce(state: State, key: string): void {
  if (state.warned.has(key)) return;
  state.warned.add(key);
  console.warn(`[prepdesk] missing value: ${key}`);
}

function nameFor(state: State, ctx: Context, rng: Rng): NameResult | null {
  const culture = ctx.cultureId !== undefined ? state.lib.culture(ctx.cultureId) : undefined;
  if (!culture) {
    warnOnce(state, 'culture');
    return null;
  }
  const n = nameWithRng(culture, rng, { avoidNames: state.avoid, exclude: state.exclude });
  noteName(state, n.name);
  return n;
}

function namePart(n: NameResult | null, part: 'full' | 'given' | 'family'): string {
  if (!n) return '';
  return part === 'full' ? n.name : part === 'given' ? n.given : (n.family ?? '');
}

/**
 * Render env for one field. Sub-generators reached through `{gen:...}` slots push their
 * provenance into `extra`, which the caller merges into the field's sources.
 */
function makeEnv(
  state: State,
  depth: number,
  ctx: Context,
  rng: Rng,
  extra: Part,
  fields?: Record<string, string>,
): RenderEnv {
  const env: RenderEnv = {
    lib: state.lib,
    ctx,
    rng,
    mode: 'prod',
    warned: state.warned,
    resolveName: (part) => namePart(nameFor(state, ctx, rng), part),
    resolveGen: (generatorId, field, subCtx) => {
      const sub = subCard(state, depth, generatorId, subCtx, rng);
      if (!sub || !Object.hasOwn(sub.fields, field)) return '';
      const f = sub.fields[field] as CardField;
      extra.sources.push(...f.sources);
      if (f.blocked) extra.blocked = true;
      return f.value;
    },
  };
  if (fields) env.fields = fields;
  return env;
}

/** Runs a sub-generator with the parent's (already culture-resolved) context. */
function subCard(
  state: State,
  depth: number,
  generatorId: string,
  ctx: Context,
  rng: Rng,
): Built | null {
  const gen = state.lib.generator(generatorId);
  if (!gen || depth + 1 > MAX_GEN_DEPTH) return null;
  const seed = seedFrom(rng);
  return assemble(
    state,
    depth + 1,
    gen,
    seed,
    resolveContext(state.lib, ctx, seed),
    freshPlan(gen),
  );
}

function rollInto(
  state: State,
  depth: number,
  tableId: string,
  rng: Rng,
  ctx: Context,
  exclude?: Set<string>,
): Part & { entryId?: string } {
  const out: Part & { entryId?: string } = {
    text: '',
    sources: [],
    blocked: false,
    relaxed: false,
  };
  const table = state.lib.table(tableId);
  if (!table) {
    warnOnce(state, tableId);
    return out;
  }
  const filtered = exclude
    ? { ...table, entries: table.entries.filter((e) => !exclude.has(e.id)) }
    : table;
  const sel = selectEntry(filtered, rng, { genre: ctx.genre, tags: ctx.tags, safety: ctx.safety });
  out.relaxed = sel.relaxed;
  if (sel.blocked) {
    out.blocked = true;
    return out;
  }
  if (!sel.entry) return out;
  const extra: Part = { text: '', sources: [], blocked: false, relaxed: false };
  const r = renderTemplate(sel.entry.ast, makeEnv(state, depth, ctx, rng, extra));
  out.entryId = sel.entry.id;
  out.text = r.text;
  out.sources = [sel.entry.id, ...r.sources, ...extra.sources];
  out.blocked = r.blocked || extra.blocked;
  out.relaxed ||= r.relaxed;
  return out;
}

function genField(state: State, depth: number, src: FieldSource, rng: Rng, ctx: Context): Part {
  if ('table' in src) return rollInto(state, depth, src.table, rng, ctx);
  if ('template' in src) {
    const extra: Part = { text: '', sources: [], blocked: false, relaxed: false };
    // R23: field refs are display-only, so template fields render without field values.
    const r = renderTemplate(src.template, makeEnv(state, depth, ctx, rng, extra));
    return {
      text: r.text,
      sources: [...r.sources, ...extra.sources],
      blocked: r.blocked || extra.blocked,
      relaxed: r.relaxed,
    };
  }
  if ('name' in src) {
    const n = nameFor(state, ctx, rng);
    return {
      text: namePart(n, src.name),
      sources: n ? [n.cultureId] : [],
      blocked: false,
      relaxed: n?.relaxed ?? false,
    };
  }
  if ('culture' in src) {
    const culture = ctx.cultureId !== undefined ? state.lib.culture(ctx.cultureId) : undefined;
    const text = culture ? readCulturePath(culture, src.culture) : undefined;
    if (text === undefined) warnOnce(state, `culture.${src.culture}`);
    return {
      text: text ?? '',
      sources: culture ? [culture.id] : [],
      blocked: false,
      relaxed: false,
    };
  }
  if ('gen' in src) {
    const sub = subCard(state, depth, src.gen, ctx, rng);
    if (!sub) return { text: '', sources: [], blocked: false, relaxed: false };
    return {
      text: sub.display,
      sources: [...Object.values(sub.fields).flatMap((f) => f.sources), ...sub.displaySources],
      blocked: sub.displayBlocked,
      relaxed: sub.flags.relaxed,
    };
  }
  // pick: N distinct entries, joined with "; ".
  const chosen = new Set<string>();
  const texts: string[] = [];
  const out: Part = { text: '', sources: [], blocked: false, relaxed: false };
  for (let i = 0; i < src.pick.count; i++) {
    const r = rollInto(state, depth, src.pick.table, rng, ctx, chosen);
    if (r.blocked && r.entryId === undefined) {
      if (i === 0) out.blocked = true;
      break;
    }
    if (r.entryId === undefined) break;
    chosen.add(r.entryId);
    texts.push(r.text);
    out.sources.push(...r.sources);
    out.blocked ||= r.blocked;
    out.relaxed ||= r.relaxed;
  }
  out.text = texts.join('; ');
  return out;
}

function freshPlan(gen: CompiledGenerator): Plan {
  return Object.fromEntries(Object.keys(gen.fields).map((k) => [k, { nonce: 0, locked: false }]));
}

/** Fills fields in field order, then renders display with the field values (R15). */
function assemble(
  state: State,
  depth: number,
  gen: CompiledGenerator,
  seed: string,
  ctx: Context,
  plan: Plan,
): Built {
  const fields: Record<string, CardField> = {};
  const values: Record<string, string> = {};
  const veiled: string[] = [];
  let relaxed = false;
  let anyBlocked = false;
  for (const [name, src] of Object.entries(gen.fields)) {
    const p = plan[name] ?? { nonce: 0, locked: false };
    const r = genField(state, depth, src, createRng(seed, name, p.nonce), ctx);
    let field: CardField;
    if (p.keep) {
      // Locked: value, sources and nonce stay exactly; the regeneration only recovers `relaxed`.
      // R22: safety beats locks, so kept content now behind a line is blocked.
      field = { ...p.keep, locked: true };
      if (safetyOf(state.lib, p.keep.sources, ctx.safety?.lines ?? []).length > 0) {
        field.value = BLOCKED_VALUE;
        field.blocked = true;
      }
    } else {
      field = {
        value: r.blocked ? BLOCKED_VALUE : r.text,
        locked: p.locked,
        nonce: p.nonce,
        sources: r.sources,
      };
      if (r.blocked) field.blocked = true;
    }
    relaxed ||= r.relaxed;
    anyBlocked ||= field.blocked === true;
    if (!field.blocked) safetyOf(state.lib, field.sources, veilsOf(ctx), veiled);
    fields[name] = field;
    values[name] = field.value;
  }
  const extra: Part = { text: '', sources: [], blocked: false, relaxed: false };
  const env = makeEnv(state, depth, ctx, createRng(seed, '$display'), extra, values);
  const d = renderTemplate(gen.display, env);
  const displaySources = [...d.sources, ...extra.sources];
  safetyOf(state.lib, displaySources, veilsOf(ctx), veiled);
  const displayBlocked = anyBlocked || d.blocked || extra.blocked;
  return {
    fields,
    display: displayBlocked ? BLOCKED_DISPLAY : d.text,
    displayBlocked,
    displaySources,
    flags: { veiled, relaxed: relaxed || d.relaxed },
  };
}

function requireGenerator(lib: Library, id: string): CompiledGenerator {
  return lib.generator(id) ?? missing('generator', id);
}

function packVersion(lib: Library, generatorId: string): string {
  let version = '';
  for (const p of lib.packs) if (Object.hasOwn(p.generators, generatorId)) version = p.version;
  return version;
}

function toCard(
  lib: Library,
  id: string,
  gen: CompiledGenerator,
  seed: string,
  ctx: Context,
  built: Built,
): Card {
  return {
    id,
    generatorId: gen.id,
    packVersion: packVersion(lib, gen.id),
    seed,
    fields: built.fields,
    display: built.display,
    context: serialisable(ctx),
    flags: built.flags,
  };
}

function cardWith(
  lib: Library,
  state: State,
  gen: CompiledGenerator,
  seed: string,
  ctx: Context,
): Card {
  const resolved = resolveContext(lib, ctx, seed);
  const built = assemble(state, 0, gen, seed, resolved, freshPlan(gen));
  return toCard(lib, randomId(), gen, seed, resolved, built);
}

export function generate(lib: Library, generatorId: string, opts: GenOptions = {}): Card {
  const gen = requireGenerator(lib, generatorId);
  const seed = toSeed(opts.seed);
  const ctx = opts.context ?? {};
  return cardWith(lib, newState(lib, ctx, false), gen, seed, ctx);
}

/**
 * Regenerates every unlocked field at nonce + 1; locked fields keep value, sources and nonce.
 * `locks` (field names) replaces the card's lock set when given; context defaults to the card's.
 */
export function reroll(
  lib: Library,
  card: Card,
  opts: { locks?: string[]; context?: Context } = {},
): Card {
  const gen = requireGenerator(lib, card.generatorId);
  const ctx = resolveContext(lib, opts.context ?? (card.context as Context), card.seed);
  const locks = new Set(
    opts.locks ?? Object.keys(card.fields).filter((k) => card.fields[k]?.locked === true),
  );
  const plan: Plan = {};
  for (const name of Object.keys(gen.fields)) {
    const prev = card.fields[name];
    if (prev && locks.has(name)) plan[name] = { nonce: prev.nonce, locked: true, keep: prev };
    else plan[name] = { nonce: prev ? prev.nonce + 1 : 0, locked: locks.has(name) };
  }
  const built = assemble(newState(lib, ctx, false), 0, gen, card.seed, ctx, plan);
  return toCard(lib, card.id, gen, card.seed, ctx, built);
}

/** Share code over the generator's field order (seed, nonces, locks). */
export function cardToShare(lib: Library, card: Card): string {
  const names = Object.keys(requireGenerator(lib, card.generatorId).fields);
  return encodeShare({
    seed: card.seed,
    nonces: names.map((n) => card.fields[n]?.nonce ?? 0),
    locks: names.map((n) => card.fields[n]?.locked ?? false),
  });
}

/** Rebuilds a card from a share code: every field regenerates at its decoded nonce. */
export function cardFromShare(
  lib: Library,
  generatorId: string,
  code: string,
  context: Context = {},
): { ok: true; card: Card } | { ok: false; error: 'malformed' | 'field-count' } {
  const gen = requireGenerator(lib, generatorId);
  const names = Object.keys(gen.fields);
  const decoded = decodeShare(code, names.length);
  if (!decoded.ok) return decoded;
  const { seed, nonces, locks } = decoded.state;
  const plan: Plan = Object.fromEntries(
    names.map((n, i) => [n, { nonce: nonces[i] ?? 0, locked: locks[i] ?? false }]),
  );
  const ctx = resolveContext(lib, context, seed);
  const built = assemble(newState(lib, ctx, false), 0, gen, seed, ctx, plan);
  return { ok: true, card: toCard(lib, randomId(), gen, seed, ctx, built) };
}

function rollWith(state: State, tableId: string, rng: Rng, ctx: Context): RollResult {
  const r = rollInto(state, 0, tableId, rng, ctx);
  return {
    text: r.blocked ? BLOCKED_VALUE : r.text,
    sources: r.sources,
    relaxed: r.relaxed,
    blocked: r.blocked,
    veiled: r.blocked ? [] : safetyOf(state.lib, r.sources, veilsOf(ctx)),
  };
}

/** One entry of a table, rendered. A blocked roll has text '—'. */
export function rollTable(lib: Library, tableId: string, opts: GenOptions = {}): RollResult {
  if (!lib.table(tableId)) missing('table', tableId);
  const seed = toSeed(opts.seed);
  const ctx = resolveContext(lib, opts.context ?? {}, seed);
  return rollWith(newState(lib, ctx, false), tableId, createRng('table', tableId, seed), ctx);
}

/**
 * Many results in request order. One exclude set and one growing avoidNames list span the whole
 * batch, so names (name results, name fields and `{name}` slots in cards) never repeat.
 */
export function batch(
  lib: Library,
  requests: BatchRequest[],
  opts: GenOptions = {},
): Array<Card | RollResult | NameResult> {
  for (const req of requests) {
    if ('generatorId' in req) requireGenerator(lib, req.generatorId);
    else if ('tableId' in req) {
      if (!lib.table(req.tableId)) missing('table', req.tableId);
    } else if (!lib.culture(req.cultureId)) missing('culture', req.cultureId);
  }
  const base = toSeed(opts.seed);
  const ctx = opts.context ?? {};
  const state = newState(lib, ctx, true);
  const out: Array<Card | RollResult | NameResult> = [];
  requests.forEach((req, ri) => {
    for (let i = 0; i < req.count; i++) {
      const rng = createRng(base, 'batch', ri, i);
      if ('generatorId' in req) {
        out.push(cardWith(lib, state, requireGenerator(lib, req.generatorId), seedFrom(rng), ctx));
      } else if ('tableId' in req) {
        out.push(rollWith(state, req.tableId, rng, resolveContext(lib, ctx, base)));
      } else {
        const culture = lib.culture(req.cultureId) as CompiledCulture;
        const n = nameWithRng(culture, rng, { avoidNames: state.avoid, exclude: state.exclude });
        noteName(state, n.name);
        out.push(n);
      }
    }
  });
  return out;
}
