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
export const MAX_RENDER_STEPS = 200_000;
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
