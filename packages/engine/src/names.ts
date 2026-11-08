import { ContentError } from './errors';
import type { Library } from './library';
import { createRng, newSeed } from './rng';
import type { Rng } from './rng';
import type { CompiledCulture, NameParts } from './schema';

export type NameOptions = { seed?: string; avoidNames?: string[]; exclude?: Set<string> };

export type NameResult = {
  name: string;
  given: string;
  family?: string;
  cultureId: string;
  voice: { summary: string; tips: string[] };
  fromExamples: boolean;
  relaxed: boolean;
};

const ATTEMPTS = 20;
const RECENT = 8;

/** NFD, strip diacritics, lowercase, trim. */
export function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

const bannedCache = new WeakMap<CompiledCulture, RegExp[]>();
function bannedOf(culture: CompiledCulture): RegExp[] {
  let res = bannedCache.get(culture);
  if (!res) {
    res = culture.banned.map((b) => new RegExp(b, 'i'));
    bannedCache.set(culture, res);
  }
  return res;
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Tokens: `part`, `part?` (50%), `part?:0.3`. */
function buildPart(rules: NameParts, rng: Rng): string {
  let out = '';
  for (const token of rules.pattern) {
    const m = /^([^?]+)(\?(?::(.+))?)?$/.exec(token);
    if (!m) continue;
    const key = m[1] as string;
    if (m[2] !== undefined) {
      const p = m[3] !== undefined ? Number(m[3]) : 0.5;
      if (rng.next() >= p) continue;
    }
    const options = rules.parts[key] ?? [];
    if (options.length === 0) continue;
    out += options[rng.int(options.length)] ?? '';
  }
  return capitalise(out);
}

const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

type Candidate = { name: string; given: string; family?: string; fromExamples: boolean };

function fromPattern(culture: CompiledCulture, rng: Rng): Candidate {
  const given = tidy(buildPart(culture.names.given, rng));
  const family = culture.names.family ? tidy(buildPart(culture.names.family, rng)) : '';
  const format = culture.names.format ?? (culture.names.family ? '{given} {family}' : '{given}');
  const name = tidy(format.replace('{given}', given).replace('{family}', family));
  const c: Candidate = { name, given, fromExamples: false };
  if (family) c.family = family;
  return c;
}

function fromExample(culture: CompiledCulture, rng: Rng, exclude: Set<string>): Candidate | null {
  const pool = culture.examples.filter((e) => !exclude.has(normalizeName(e)));
  if (pool.length === 0) return null;
  const name = tidy(pool[rng.int(pool.length)] ?? '');
  const sp = name.indexOf(' ');
  const c: Candidate = { name, given: sp < 0 ? name : name.slice(0, sp), fromExamples: true };
  if (sp >= 0) c.family = name.slice(sp + 1);
  return c;
}

type Guard = { recent: string[]; all: string[] };

/** Relaxation stages: cumulative sets of dropped rules. */
const STAGES: Array<{ a: boolean; b: boolean; c: boolean }> = [
  { a: true, b: true, c: true },
  { a: false, b: true, c: true },
  { a: false, b: true, c: false },
  { a: false, b: false, c: false },
];

function passesGuard(given: string, g: Guard, rules: (typeof STAGES)[number]): boolean {
  const n = normalizeName(given);
  if (rules.a && g.recent.some((r) => r.charAt(0) === n.charAt(0))) return false;
  if (rules.b && g.all.some((r) => editDistance(r, n) <= 2)) return false;
  if (rules.c && g.all.some((r) => r.slice(0, 3) === n.slice(0, 3))) return false;
  return true;
}

export function nameWithRng(
  culture: CompiledCulture,
  rng: Rng,
  opts: Omit<NameOptions, 'seed'>,
): NameResult {
  const exclude = opts.exclude ?? new Set<string>();
  const avoid = (opts.avoidNames ?? []).map((n) => {
    const t = normalizeName(n);
    const sp = t.indexOf(' ');
    return sp < 0 ? t : t.slice(0, sp);
  });
  const guard: Guard = { recent: avoid.slice(-RECENT), all: avoid };
  const banned = bannedOf(culture);
  const stages = avoid.length > 0 ? STAGES : STAGES.slice(0, 1);
  let useExample = rng.next() < culture.exampleChance;

  // Fallback preference: passed banned+exclude, else passed banned, else anything.
  let lastValid: Candidate | null = null;
  let lastClean: Candidate | null = null;
  let last: Candidate = fromPattern(culture, rng);
  const avoidSet = new Set(avoid);
  for (let s = 0; s < stages.length; s++) {
    const rules = stages[s] as (typeof STAGES)[number];
    const finalStage = avoid.length > 0 && s === stages.length - 1;
    for (let i = 0; i < ATTEMPTS; i++) {
      let cand: Candidate | null = null;
      if (useExample) {
        cand = fromExample(culture, rng, exclude);
        if (!cand) useExample = false;
      }
      cand ??= fromPattern(culture, rng);
      last = cand;
      useExample = false;
      if (banned.some((re) => re.test(cand.name))) continue;
      lastClean = cand;
      if (exclude.has(normalizeName(cand.name))) continue;
      lastValid = cand;
      if (!passesGuard(cand.given, guard, rules)) continue;
      // Even with every rule off, prefer a given name that is not identical to an avoided one.
      if (finalStage && avoidSet.has(normalizeName(cand.given))) continue;
      return result(culture, cand, s > 0);
    }
  }
  return result(culture, lastValid ?? lastClean ?? last, true);
}

function result(culture: CompiledCulture, c: Candidate, relaxed: boolean): NameResult {
  const r: NameResult = {
    name: c.name,
    given: c.given,
    cultureId: culture.id,
    voice: culture.voice,
    fromExamples: c.fromExamples,
    relaxed,
  };
  if (c.family !== undefined) r.family = c.family;
  return r;
}

export function generateName(lib: Library, cultureId: string, opts: NameOptions = {}): NameResult {
  const culture = lib.culture(cultureId);
  if (!culture) {
    throw new ContentError('missing-source', `culture "${cultureId}" not found`, cultureId, '');
  }
  const rng = createRng('name', cultureId, opts.seed ?? newSeed());
  return nameWithRng(culture, rng, {
    avoidNames: opts.avoidNames ?? [],
    exclude: opts.exclude ?? new Set(),
  });
}
