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
 * - `unanim...` (unanimous), `oneness`, `ulysses` read "a"; `x` alone (x-ray) reads "an" ("ex").
 * - Digits: a leading number reads "an" when it is said starting with a vowel: 8, 80-89, 800s,
 *   8,000 (eight...), and 11 or 18 as the whole number or times a thousand (eleven, eighteen:
 *   11, 11th, 18,000), but not 110 or 180 ("one hundred ..."). Other numbers read "a".
 * - Everything else: "an" before a vowel letter, otherwise "a" (also for empty or non-letter text).
 *
 * Known limits: input is lower-cased, so acronyms and initialisms (FBI, MP, UFO) are out of scope
 * and follow their first letter; other loanword and silent-letter exceptions beyond the lists
 * above (herb, houri, ouija), years read as words (1850 is "eighteen fifty", so "an"; this
 * function says "a"), and fractions or decimals are not handled.
 */
export function article(text: string): 'a' | 'an' {
  const first =
    text
      .toLowerCase()
      .replace(/^[^a-z0-9]+/, '')
      .split(/[\s-]/)[0] ?? '';
  const num = /^\d[\d,]*/.exec(first)?.[0].replace(/,/g, '');
  if (num !== undefined) {
    if (num.startsWith('8')) return 'an';
    return /^1[18]/.test(num) && num.length % 3 === 2 ? 'an' : 'a';
  }
  const w = first.replace(/[^a-z]/g, '');
  if (/^(?:hour|heir|honest|hono)/.test(w)) return 'an';
  if (/^(?:one|once|oneness)$|^(?:ulysses|unanim)/.test(w)) return 'a';
  if (w === 'x') return 'an';
  if (/^(?:eu|ewe|ush|uni[cfloqstv])/.test(w)) return 'a';
  if (/^u[bcfklrstvz][aeiou]/.test(w)) return 'a';
  return /^[aeiou]/.test(w) ? 'an' : 'a';
}
