/**
 * Which indefinite article ("a" or "an") text takes, decided by how its first word is said, not
 * by its first letter. Deterministic and table-free: a handful of documented rules.
 *
 * The first word is the text up to the first space or hyphen, lower-cased ("one-eyed" -> "one").
 *
 * - Vowel letter, consonant sound, so "a": `one`, `once`; `eu...` (euro), `ewe`; `uni` before
 *   c/f/l/o/q/s/t/v (unicorn, uniform, union, unique, unit, universe) but not unimpressed or
 *   uninvited; `ush...` (usher); and `u` + one of b/c/f/k/l/r/s/t/v/z + vowel (use, usual, usurer,
 *   utensil, uranium, ubiquitous, ukulele), which leaves un-, up-, and clusters (umbrella, ugly,
 *   urn) on "an".
 * - Consonant letter, vowel sound, so "an": `hour...`, `heir...`, `honest...`, `hono...` (honor,
 *   honour, honorary).
 * - Everything else: "an" before a vowel letter, otherwise "a" (also for empty or non-letter text).
 */
export function article(text: string): 'a' | 'an' {
  const first =
    text
      .toLowerCase()
      .replace(/^[^a-z0-9]+/, '')
      .split(/[\s-]/)[0] ?? '';
  const w = first.replace(/[^a-z]/g, '');
  if (/^(?:hour|heir|honest|hono)/.test(w)) return 'an';
  if (/^(?:one|once)$/.test(w)) return 'a';
  if (/^(?:eu|ewe|ush|uni[cfloqstv])/.test(w)) return 'a';
  if (/^u[bcfklrstvz][aeiou]/.test(w)) return 'a';
  return /^[aeiou]/.test(w) ? 'an' : 'a';
}
