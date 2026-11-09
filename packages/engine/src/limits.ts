import type { FieldSource } from './schema';
import type { TemplateAst } from './template';

/**
 * Input limits for content the engine did not ship: user packs (validateUserPack), card JSON
 * (parseCard) and the runtime render budget. The UI can show these numbers to authors.
 */

/** A user pack as YAML or JSON text, in UTF-8 bytes. */
export const MAX_USER_PACK_BYTES = 1_000_000;
/** Content documents in one user pack. */
export const MAX_DOCUMENTS = 500;
/** Tables in one user pack (situations count their six facet tables). */
export const MAX_TABLES = 500;
/** Entries in one table (and in one situation facet). */
export const MAX_ENTRIES_PER_TABLE = 1000;
/** Characters in any one string of a user pack (entry text, template, display, title, ...). */
export const MAX_TEXT_LENGTH = 2000;
/** Fields in one generator. */
export const MAX_FIELDS = 64;
/** `pick.count` in a generator field. */
export const MAX_PICK_COUNT = 20;
/** YAML aliases (`*anchor`) in one user pack; stops "billion laughs" expansion. */
export const MAX_YAML_ALIASES = 100;

/** `banned` patterns per culture, and characters per pattern. */
export const MAX_BANNED_PATTERNS = 24;
export const MAX_BANNED_PATTERN_LENGTH = 64;
/** Variable quantifiers (`*`, `+`, `?`, `{m,n}`) per banned pattern. */
export const MAX_VARIABLE_QUANTIFIERS = 3;
/**
 * Wide quantifiers (`*`, `+`, `{m,n}` with n - m > 2) per banned pattern. A second one is allowed
 * only when the two repeat disjoint atoms (whitespace against word characters), as in
 * `^(\w{3})\w*\s+\1`.
 */
export const MAX_WIDE_QUANTIFIERS = 2;
/** Longest name a culture's rules may produce (patterns and format), in characters. */
export const MAX_NAME_LENGTH = 48;
/** Options in one name part list. */
export const MAX_NAME_PART_OPTIONS = 500;

/**
 * Worst-case expansion of one table or generator in a user pack: selections, renders and names
 * along the most expensive path (pick counts and fan-out multiply). See `expansionCost`.
 */
export const MAX_EXPANSION = 2000;
/**
 * Runtime backstop: template renders plus table-slot expansions in one generate, reroll, roll or
 * batch call. Past it, slots render as BUDGET_PLACEHOLDER and sub-generators stop.
 */
export const MAX_RENDER_STEPS = 50_000;
/** Card JSON text accepted by parseCard, in characters. */
export const MAX_CARD_JSON_LENGTH = 256_000;

type Quant = { min: number; max: number; length: number };

/** A quantifier at `s[i]`, or null. `{` that is not a well-formed quantifier is a literal. */
function quantifierAt(s: string, i: number): Quant | null {
  const c = s.charAt(i);
  let q: Quant | null = null;
  if (c === '*') q = { min: 0, max: Infinity, length: 1 };
  else if (c === '+') q = { min: 1, max: Infinity, length: 1 };
  else if (c === '?') q = { min: 0, max: 1, length: 1 };
  else if (c === '{') {
    const m = /^\{(\d+)(,(\d*))?\}/.exec(s.slice(i));
    if (!m) return null;
    const min = Number(m[1]);
    const max = m[2] === undefined ? min : m[3] === '' ? Infinity : Number(m[3]);
    q = { min, max, length: m[0].length };
  }
  if (q && s.charAt(i + q.length) === '?') q.length += 1; // lazy
  return q;
}

type AtomClass = 'space' | 'word' | 'any';

/** What a single-character atom can match, coarsely: whitespace, word characters, or more. */
function classOf(atom: string): AtomClass {
  if (atom === '\\s' || atom === ' ' || atom === '[ ]' || atom === '[\\s]') return 'space';
  if (/^\\[wd]$/.test(atom) || /^[A-Za-z0-9_]$/.test(atom)) return 'word';
  if (/^\[[^\]^\s\\]*(\\[wd][^\]\s\\]*)*\]$/.test(atom) && !atom.includes('\\s')) return 'word';
  return 'any';
}

/**
 * Why a `banned` pattern could backtrack catastrophically, or null when it is accepted. The check
 * is deliberately conservative (it may reject a harmless pattern):
 * - at most MAX_BANNED_PATTERN_LENGTH characters;
 * - a group that contains a quantifier or an alternation may not itself repeat (`(a+)+`,
 *   `(a|aa)*`); `?` on such a group is fine;
 * - at most MAX_VARIABLE_QUANTIFIERS variable quantifiers and MAX_WIDE_QUANTIFIERS wide ones,
 *   two wide ones only over disjoint atoms (`\s+` and `\w*`).
 * With MAX_NAME_LENGTH this keeps every accepted pattern polynomial and small on any name
 * (measured in security.regex.test.ts). The caller checks separately that the pattern compiles.
 */
export function regexRisk(src: string): string | null {
  if (src.length > MAX_BANNED_PATTERN_LENGTH) {
    return `longer than ${MAX_BANNED_PATTERN_LENGTH} characters`;
  }
  const stack: Array<{ risky: boolean }> = [{ risky: false }];
  const top = () => stack[stack.length - 1] as { risky: boolean };
  let variable = 0;
  const wide: AtomClass[] = [];
  // The atom a following quantifier applies to: a closed group (with its riskiness) or text.
  let lastGroup: { risky: boolean } | null = null;
  let atom: string | null = null;
  let i = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    if (c === '\\') {
      atom = src.slice(i, i + 2);
      i += 2;
      lastGroup = null;
      continue;
    }
    if (c === '[') {
      const from = i;
      i += 1;
      if (src.charAt(i) === '^') i += 1;
      if (src.charAt(i) === ']') i += 1;
      while (i < src.length && src.charAt(i) !== ']') i += src.charAt(i) === '\\' ? 2 : 1;
      i += 1;
      atom = src.slice(from, i);
      lastGroup = null;
      continue;
    }
    if (c === '(') {
      stack.push({ risky: false });
      i += 1;
      if (src.charAt(i) === '?') {
        const m = /^\?(?::|=|!|<=|<!|<[A-Za-z_$][\w$]*>)/.exec(src.slice(i));
        i += m ? m[0].length : 1;
      }
      lastGroup = null;
      atom = null;
      continue;
    }
    if (c === ')') {
      const g = stack.length > 1 ? (stack.pop() as { risky: boolean }) : { risky: false };
      if (g.risky) top().risky = true;
      lastGroup = g;
      atom = '()';
      i += 1;
      continue;
    }
    if (c === '|') {
      top().risky = true;
      lastGroup = null;
      atom = null;
      i += 1;
      continue;
    }
    const q = atom !== null ? quantifierAt(src, i) : null;
    if (q) {
      if (lastGroup?.risky && q.max > 1) {
        return 'a group with a quantifier or "|" inside repeats (nested quantifier)';
      }
      if (q.max !== q.min) {
        variable += 1;
        top().risky = true;
      }
      if (q.max - q.min > 2) wide.push(classOf(atom as string));
      i += q.length;
      lastGroup = null;
      atom = null;
      continue;
    }
    lastGroup = null;
    atom = c === '^' || c === '$' ? null : c;
    i += 1;
  }
  const disjoint = wide.length === 2 && wide.includes('space') && wide.includes('word');
  if (
    variable > MAX_VARIABLE_QUANTIFIERS ||
    wide.length > MAX_WIDE_QUANTIFIERS ||
    (wide.length === 2 && !disjoint)
  ) {
    return `too many repeating quantifiers (at most ${MAX_VARIABLE_QUANTIFIERS} variable, one wide, or two wide over whitespace and word characters)`;
  }
  return null;
}

/** A banned pattern compiled only if it is valid and passes regexRisk; otherwise null. */
export function safeBannedRegExp(src: string): RegExp | null {
  if (regexRisk(src) !== null) return null;
  try {
    return new RegExp(src, 'i');
  } catch {
    return null;
  }
}

// ---------- User pack checks (validateUserPack runs these before and after compileDocs) ----------

type RawDoc = { file: string; data: unknown };
type Problem = { message: string; path: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** UTF-8 byte length without TextEncoder (the engine has no DOM lib). */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4;
      i += 1;
    } else n += 3;
  }
  return n;
}

const MAX_WALK_DEPTH = 32;

/** Longest string a name-part rule set can produce. */
function partsLength(rules: unknown): number {
  if (!isObj(rules) || !Array.isArray(rules.pattern) || !isObj(rules.parts)) return 0;
  const parts = rules.parts;
  let n = 0;
  for (const token of rules.pattern) {
    if (typeof token !== 'string') continue;
    const key = token.split('?')[0] as string;
    const options = Object.hasOwn(parts, key) ? parts[key] : undefined;
    if (!Array.isArray(options)) continue;
    n += Math.max(0, ...options.map((o) => (typeof o === 'string' ? o.length : 0)));
  }
  return n;
}

/**
 * Shape limits over raw (unvalidated) user documents: counts, string lengths, `__proto__` keys,
 * pick counts, field counts, culture name lengths, banned and part-list sizes. Defensive: data
 * may have any shape; zod reports shape errors afterwards.
 */
export function userPackProblems(docs: RawDoc[]): Problem[] {
  const out: Problem[] = [];
  if (docs.length > MAX_DOCUMENTS) {
    return [
      {
        message: `a user pack may hold at most ${MAX_DOCUMENTS} documents (more than ${MAX_DOCUMENTS} documents found)`,
        path: '',
      },
    ];
  }
  let tables = 0;
  const walk = (v: unknown, path: string, depth: number): void => {
    if (out.length > 50) return;
    if (depth > MAX_WALK_DEPTH) {
      out.push({ message: `nested more than ${MAX_WALK_DEPTH} levels deep`, path });
      return;
    }
    if (typeof v === 'string') {
      if (v.length > MAX_TEXT_LENGTH) {
        out.push({ message: `text longer than ${MAX_TEXT_LENGTH} characters`, path });
      }
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1));
    } else if (isObj(v)) {
      for (const key of Object.keys(v)) {
        if (key === '__proto__') {
          out.push({ message: 'the key "__proto__" is not allowed', path });
          continue;
        }
        walk(v[key], path.endsWith('#') ? `${path}${key}` : `${path}.${key}`, depth + 1);
      }
    }
  };
  for (const { file, data } of docs) {
    walk(data, `${file}#`, 0);
    if (!isObj(data)) continue;
    const at = (p: string): string => `${file}#${p}`;
    if (data.kind === 'table') {
      tables += 1;
      if (Array.isArray(data.entries) && data.entries.length > MAX_ENTRIES_PER_TABLE) {
        out.push({
          message: `a table may hold at most ${MAX_ENTRIES_PER_TABLE} entries (more than ${MAX_ENTRIES_PER_TABLE} entries found)`,
          path: at('entries'),
        });
      }
    }
    if (data.kind === 'situation') {
      tables += 6;
      if (isObj(data.facets)) {
        for (const [f, list] of Object.entries(data.facets)) {
          if (Array.isArray(list) && list.length > MAX_ENTRIES_PER_TABLE) {
            out.push({
              message: `a facet may hold at most ${MAX_ENTRIES_PER_TABLE} entries (more than ${MAX_ENTRIES_PER_TABLE} entries found)`,
              path: at(`facets.${f}`),
            });
          }
        }
      }
    }
    if (data.kind === 'generator' && isObj(data.fields)) {
      const names = Object.keys(data.fields);
      if (names.length > MAX_FIELDS) {
        out.push({
          message: `a generator may have at most ${MAX_FIELDS} fields (more than ${MAX_FIELDS} fields found)`,
          path: at('fields'),
        });
      }
      for (const name of names) {
        const src = data.fields[name];
        const pick = isObj(src) && isObj(src.pick) ? src.pick : undefined;
        if (pick && typeof pick.count === 'number' && pick.count > MAX_PICK_COUNT) {
          out.push({
            message: `pick.count is ${pick.count}; it may be at most ${MAX_PICK_COUNT}`,
            path: at(`fields.${name}`),
          });
        }
      }
    }
    if (data.kind === 'culture' && isObj(data.names)) {
      const names = data.names;
      if (Array.isArray(names.banned) && names.banned.length > MAX_BANNED_PATTERNS) {
        out.push({
          message: `a culture may have at most ${MAX_BANNED_PATTERNS} banned patterns (more than ${MAX_BANNED_PATTERNS} banned patterns found)`,
          path: at('names.banned'),
        });
      }
      for (const which of ['given', 'family'] as const) {
        const rules = names[which];
        if (!isObj(rules) || !isObj(rules.parts)) continue;
        if (Array.isArray(rules.pattern) && rules.pattern.length > 16) {
          out.push({
            message: 'a name pattern may have at most 16 parts',
            path: at(`names.${which}.pattern`),
          });
        }
        for (const [key, list] of Object.entries(rules.parts)) {
          if (Array.isArray(list) && list.length > MAX_NAME_PART_OPTIONS) {
            out.push({
              message: `a name part may list at most ${MAX_NAME_PART_OPTIONS} options (more than ${MAX_NAME_PART_OPTIONS} options found)`,
              path: at(`names.${which}.parts.${key}`),
            });
          }
        }
      }
      const given = partsLength(names.given);
      const family = partsLength(names.family);
      const format =
        typeof names.format === 'string'
          ? names.format
          : family > 0
            ? '{given} {family}'
            : '{given}';
      const literal = format.replace('{given}', '').replace('{family}', '').length;
      const longest =
        literal +
        (format.includes('{given}') ? given : 0) +
        (format.includes('{family}') ? family : 0);
      const example = Array.isArray(names.examples)
        ? Math.max(0, ...names.examples.map((e) => (typeof e === 'string' ? e.length : 0)))
        : 0;
      const worst = Math.max(longest, example);
      if (worst > MAX_NAME_LENGTH) {
        out.push({
          message: `these rules can make names up to ${worst} characters long; names may be at most ${MAX_NAME_LENGTH}`,
          path: at('names'),
        });
      }
    }
  }
  if (tables > MAX_TABLES) {
    out.unshift({
      message: `a user pack may define at most ${MAX_TABLES} tables (more than ${MAX_TABLES} tables found)`,
      path: '',
    });
  }
  return out;
}

// ---------- Static expansion bound ----------

type PackLike = {
  tables: Record<string, { entries: Array<{ ast: TemplateAst; ref?: string }> }>;
  generators: Record<string, { fields: Record<string, FieldSource>; display: TemplateAst }>;
  situations?: Record<string, { facets: Record<string, string> }>;
};

/**
 * Worst-case work for every table and generator of `pack`, keyed `table:<id>` and
 * `generator:<id>`: 1 per table selection or sub-generator, plus slots along the most expensive
 * entry of each table, summed over a generator's fields and display; `pick` multiplies by the
 * number of entries it can draw. Cycles count 0 here (lint reports them).
 */
export function expansionCost(pack: PackLike, deps: PackLike[] = []): Map<string, number> {
  const all = [...deps, pack];
  const tables = new Map(all.flatMap((p) => Object.entries(p.tables)));
  const gens = new Map(all.flatMap((p) => Object.entries(p.generators)));
  const situations = new Map(all.flatMap((p) => Object.entries(p.situations ?? {})));
  const memo = new Map<string, number>();
  const active = new Set<string>();

  const memoised = (key: string, f: () => number): number => {
    const known = memo.get(key);
    if (known !== undefined) return known;
    if (active.has(key)) return 0;
    active.add(key);
    const v = f();
    active.delete(key);
    memo.set(key, v);
    return v;
  };
  const ast = (a: TemplateAst, fields?: Record<string, unknown>): number => {
    let n = 0;
    for (const el of a) {
      if (typeof el === 'string') continue;
      const { slot } = el;
      if (slot.kind === 'table' && !(fields && Object.hasOwn(fields, slot.ref)))
        n += table(slot.ref);
      else if (slot.kind === 'gen') n += gen(slot.generator);
      else if (slot.kind === 'name') n += 1;
    }
    return n;
  };
  const table = (id: string): number =>
    memoised(`table:${id}`, () => {
      const t = tables.get(id);
      if (!t) return 0;
      return 1 + Math.max(0, ...t.entries.map((e) => ast(e.ast)));
    });
  const facetCost = (
    g: { fields: Record<string, FieldSource> },
    of: string,
    name: string,
  ): number => {
    const src = Object.hasOwn(g.fields, of) ? g.fields[of] : undefined;
    if (!src || !('situation' in src)) return 0;
    const index = tables.get(src.situation.table);
    let worst = 0;
    for (const e of index?.entries ?? []) {
      const st = e.ref !== undefined ? situations.get(e.ref) : undefined;
      const facetId = st && Object.hasOwn(st.facets, name) ? st.facets[name] : undefined;
      if (facetId !== undefined) worst = Math.max(worst, table(facetId));
    }
    return worst;
  };
  const gen = (id: string): number =>
    memoised(`generator:${id}`, () => {
      const g = gens.get(id);
      if (!g) return 0;
      let n = 1 + ast(g.display, g.fields);
      for (const src of Object.values(g.fields)) {
        if ('table' in src) n += table(src.table);
        else if ('pick' in src) {
          const entries = tables.get(src.pick.table)?.entries.length ?? 0;
          n += Math.min(src.pick.count, entries) * table(src.pick.table);
        } else if ('gen' in src) n += gen(src.gen);
        else if ('template' in src) n += ast(src.template);
        else if ('situation' in src) n += table(src.situation.table);
        else if ('facet' in src) n += facetCost(g, src.facet.of, src.facet.name);
        else n += 1; // name, culture
      }
      return n;
    });

  const out = new Map<string, number>();
  for (const id of Object.keys(pack.tables)) out.set(`table:${id}`, table(id));
  for (const id of Object.keys(pack.generators)) out.set(`generator:${id}`, gen(id));
  return out;
}
