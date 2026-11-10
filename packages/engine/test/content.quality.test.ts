import { describe, expect, it } from 'vitest';
import { generateName } from '../src/names';
import { stemHits } from '../src/safetyStems';
import { SAFETY_VOCABULARY } from '../src/safety';
import type { CompiledEntry, CompiledTable } from '../src/schema';
import {
  CTX_KEYS,
  CULTURES_SPEC,
  FAMILY_TAG,
  FREE_TEXT_KEYS,
  AUDIT_EXCEPTIONS,
  POOLS,
  STRICT_LINES,
  TABLE_SPEC,
  UNGATED_TABLES,
  TERRAIN,
} from './fixtures/content-spec';
import {
  allGenerators,
  allSituations,
  allTables,
  articleProblem,
  articleTables,
  astText,
  facetTables,
  literalText,
  pronunciationProblem,
  uncoveredTables,
} from './fixtures/content-helpers';
import { corePack, fantasyPack, lib } from './fixtures/starter-packs';

const specTables = Object.entries(TABLE_SPEC).map(([id, spec]) => ({
  id,
  spec,
  table: lib.table(id) as CompiledTable,
}));
const facets = facetTables(lib);
const words = (s: string): string[] => s.split(/\s+/).filter((w) => w !== '');
const first3 = (e: CompiledEntry): string =>
  words(literalText(e.ast).toLowerCase()).slice(0, 3).join(' ');
const startsWithSlot = (e: CompiledEntry): boolean => typeof e.ast[0] !== 'string';

/** Fails with every offender listed, so one run shows the whole job. */
const none = (label: string, offenders: string[]): void => {
  expect(offenders, label).toEqual([]);
};

describe('every gated table exists (the quality gates read it)', () => {
  it.each(specTables)('$id', ({ id, table }) => {
    expect(table, id).toBeDefined();
  });
});

describe('no exclamation marks', () => {
  it('in any gated table or situation facet', () => {
    const bad: string[] = [];
    for (const t of [...specTables.map((s) => s.table), ...facets])
      for (const e of t.entries) if (astText(e.ast).includes('!')) bad.push(e.id);
    none('entries with "!"', bad);
  });
});

describe('line entries', () => {
  const lineTables = [
    ...specTables.filter((s) => s.spec.kind === 'line').map((s) => ({ ...s, end: s.spec.end })),
    ...facets.map((table) => ({ id: table.id, spec: undefined, table, end: undefined })),
  ];

  it('are at most 110 characters of source text', () => {
    const bad: string[] = [];
    for (const { table } of lineTables)
      for (const e of table.entries) if (astText(e.ast).length > 110) bad.push(e.id);
    none('too long', bad);
  });

  it('start lower case or with a slot', () => {
    const bad: string[] = [];
    for (const { table } of lineTables)
      for (const e of table.entries) {
        if (startsWithSlot(e)) continue;
        if (!/^[a-z]/.test(astText(e.ast))) bad.push(`${e.id}: ${astText(e.ast)}`);
      }
    none('bad first character', bad);
  });

  it('do not end with "." or ",", or end with "?" when the table asks for it', () => {
    const bad: string[] = [];
    for (const { table, end } of lineTables)
      for (const e of table.entries) {
        const text = astText(e.ast);
        if (end === '?' ? !text.endsWith('?') : /[.,]$/.test(text)) bad.push(`${e.id}: ${text}`);
      }
    none('bad ending', bad);
  });

  it('never share their first 3 words within a table (rumor.text and secret.text pool)', () => {
    const groups = new Map<string, CompiledEntry[]>();
    for (const { id, table } of lineTables) {
      const key = POOLS.find((p) => p.includes(id))?.join('+') ?? id;
      groups.set(key, [...(groups.get(key) ?? []), ...table.entries]);
    }
    const bad: string[] = [];
    for (const [key, entries] of groups) {
      const seen = new Map<string, string>();
      for (const e of entries) {
        const stem = first3(e);
        if (stem === '') continue;
        const prior = seen.get(stem);
        if (prior !== undefined) bad.push(`${key}: "${stem}" in ${prior} and ${e.id}`);
        else seen.set(stem, e.id);
      }
    }
    none('shared stems', bad);
  });
});

describe('word entries', () => {
  const wordTables = specTables.filter((s) => s.spec.kind === 'word');

  it('are short, plain and unique', () => {
    const bad: string[] = [];
    for (const { id, spec, table } of wordTables) {
      const shape = spec.family === 'oracle' ? /^[a-z]+$/ : spec.caps ? TITLE_CASE : LOWER_WORD;
      const seen = new Set<string>();
      for (const e of table.entries) {
        const text = astText(e.ast);
        if (text.length > 20 || words(text).length > 2 || !shape.test(text)) bad.push(e.id);
        if (seen.has(text.toLowerCase())) bad.push(`${id}: duplicate "${text}"`);
        seen.add(text.toLowerCase());
      }
    }
    none('bad words', bad);
  });
});
const TITLE_CASE = /^[A-Z][a-z']*(?:[ -][A-Z][a-z']*)*$/;
const LOWER_WORD = /^[a-z][a-z' -]*$/;

describe('pattern entries', () => {
  it('each contain at least one slot', () => {
    const bad: string[] = [];
    for (const { table, spec } of specTables)
      if (spec.kind === 'pattern')
        for (const e of table.entries)
          if (!e.ast.some((el) => typeof el !== 'string')) bad.push(e.id);
    none('patterns without a slot', bad);
  });
});

describe('articles', () => {
  it('tables read through an "a" slot render cleanly with the engine article()', () => {
    const bad: string[] = [];
    for (const id of articleTables(lib))
      for (const e of lib.table(id)?.entries ?? []) {
        if (startsWithSlot(e)) continue;
        const problem = articleProblem(astText(e.ast));
        if (problem) bad.push(`${e.id}: ${problem}`);
      }
    none('article traps', bad);
  });

  it('reaches fantasy.npc.role (the walk is not vacuous)', () => {
    expect(articleTables(lib).has('fantasy.npc.role')).toBe(true);
  });

  it('gate fixture: pronunciation-correct entries pass, a manual article fails', () => {
    for (const ok of [
      'usurer with a ledger',
      'one-eyed ferryman',
      'hourglass maker',
      'a-frame builder',
      'an-tiro the cook',
    ])
      expect(articleProblem(ok), ok).toBe('');
    for (const bad of ['an usurer', 'a ferryman', 'the usurer'])
      expect(articleProblem(bad), bad).not.toBe('');
  });
});

describe('every table is gated', () => {
  const structural = new Set([
    ...facets.map((t) => t.id),
    ...allTables(lib)
      .filter((t) => t.entries.some((e) => e.ref !== undefined))
      .map((t) => t.id),
  ]);

  it('each shipped table has a TABLE_SPEC row, is a situation table, or is excluded with a reason', () => {
    none(
      'tables with no gate',
      uncoveredTables(allTables(lib), Object.keys(TABLE_SPEC), structural, UNGATED_TABLES),
    );
  });

  it('exclusions carry a reason and name a real table', () => {
    for (const [id, reason] of Object.entries(UNGATED_TABLES)) {
      expect(reason.length, id).toBeGreaterThan(10);
      expect(lib.table(id), `stale exclusion ${id}`).toBeDefined();
    }
  });

  it('gate fixture: a table with no row fails, and rows, structure and exclusions cover it', () => {
    const t = (id: string) => ({ id, tags: [], entries: [] });
    const tables = [t('x.a'), t('x.b'), t('x.c'), t('x.d')];
    expect(
      uncoveredTables(tables, ['x.a'], new Set(['x.b']), { 'x.c': 'documented reason' }),
    ).toEqual(['x.d']);
  });
});

describe('context slots', () => {
  const asts = [
    ...allTables(lib).flatMap((t) => t.entries.map((e) => ({ where: e.id, ast: e.ast }))),
    ...allGenerators(lib).flatMap((g) => [
      { where: `${g.id} display`, ast: g.display },
      ...Object.entries(g.fields).flatMap(([name, src]) =>
        'template' in src ? [{ where: `${g.id}.${name}`, ast: src.template }] : [],
      ),
    ]),
  ];

  it('have an or: fallback and a known key; free-text keys come last', () => {
    const bad: string[] = [];
    for (const { where, ast } of asts) {
      ast.forEach((el, i) => {
        if (typeof el === 'string' || el.slot.kind !== 'ctx') return;
        const { path } = el.slot;
        if (!el.mods.some((m) => m.kind === 'or')) bad.push(`${where}: ${path} has no or:`);
        if (!CTX_KEYS.includes(path)) bad.push(`${where}: unknown ctx key ${path}`);
        if (FREE_TEXT_KEYS.includes(path) && i !== ast.length - 1)
          bad.push(`${where}: ${path} is not last`);
      });
    }
    none('ctx slots', bad);
  });
});

describe('safety audit', () => {
  const audited = [...specTables.map((s) => s.table), ...facets];

  it('every stem hit is covered by the entry safety tags or an exception', () => {
    const bad: string[] = [];
    for (const table of audited)
      for (const e of table.entries) {
        const text = astText(e.ast);
        for (const topic of stemHits(text)) {
          if (e.safety.includes(topic)) continue;
          const exempt = AUDIT_EXCEPTIONS.some(
            (x) => x.table === table.id && x.text === text && x.topic === topic,
          );
          if (!exempt) bad.push(`${e.id}: "${text}" touches ${topic} without the tag`);
        }
      }
    none('untagged stem hits', bad);
  });

  it('every exception has a reason and still matches a real entry', () => {
    for (const x of AUDIT_EXCEPTIONS) {
      expect(x.reason.length, `${x.table}: ${x.text}`).toBeGreaterThan(10);
      const hit = lib
        .table(x.table)
        ?.entries.some(
          (e) => astText(e.ast) === x.text && stemHits(astText(e.ast)).includes(x.topic),
        );
      expect(hit, `stale exception ${x.table}: ${x.text}`).toBe(true);
    }
  });

  it('only uses topics from the safety vocabulary', () => {
    for (const t of audited)
      for (const e of t.entries)
        for (const s of e.safety) expect(SAFETY_VOCABULARY, `${e.id}: ${s}`).toContain(s);
  });
});

describe('tags', () => {
  it('every table whose family has a FAMILY_TAG carries it', () => {
    const bad: string[] = [];
    for (const { id, spec, table } of specTables) {
      const tag = FAMILY_TAG[spec.family];
      if (tag !== undefined && !table.tags.includes(tag)) bad.push(`${id} lacks ${tag}`);
    }
    none('family tags', bad);
  });

  it('terrain tables that are full carry each TERRAIN tag on at least 3 entries', () => {
    const bad: string[] = [];
    for (const { id, spec, table } of specTables) {
      if (!(spec.terrain && spec.full)) continue;
      for (const tag of TERRAIN) {
        const n = table.entries.filter((e) => e.tags.includes(tag)).length;
        if (n < 3) bad.push(`${id}: ${tag} on ${n}`);
      }
    }
    none('terrain coverage', bad);
  });

  it('every vocabulary tag is used by a table, an entry or a situation', () => {
    const used = new Set<string>();
    for (const t of allTables(lib)) {
      t.tags.forEach((x) => used.add(x));
      t.entries.forEach((e) => e.tags.forEach((x) => used.add(x)));
    }
    allSituations(lib).forEach((s) => s.tags.forEach((x) => used.add(x)));
    const unused = [corePack, fantasyPack].flatMap((p) => p.vocabulary).filter((t) => !used.has(t));
    none('unused vocabulary tags', unused);
  });
});

describe('situations', () => {
  const situations = allSituations(lib);

  it('have unique 2-3 word titles, "situation" first in tags, and short summaries', () => {
    const bad: string[] = [];
    const titles = new Set<string>();
    for (const s of situations) {
      const n = words(s.title).length;
      if (n < 2 || n > 3) bad.push(`${s.id}: title has ${n} words`);
      if (titles.has(s.title.toLowerCase())) bad.push(`${s.id}: duplicate title`);
      titles.add(s.title.toLowerCase());
      if (s.tags[0] !== 'situation') bad.push(`${s.id}: tags[0] is ${s.tags[0]}`);
      if (s.summary.length > 120) bad.push(`${s.id}: summary ${s.summary.length} chars`);
      if (!s.summary.endsWith('.')) bad.push(`${s.id}: summary lacks a final "."`);
    }
    none('situation shape', bad);
  });
});

describe('cultures', () => {
  it('have enough examples and the right number of tips', () => {
    const [examples, tips] = CULTURES_SPEC.full
      ? [CULTURES_SPEC.examples, CULTURES_SPEC.tips]
      : [8, 3];
    const bad: string[] = [];
    for (const p of [corePack, fantasyPack])
      for (const c of Object.values(p.cultures)) {
        if (c.examples.length < examples) bad.push(`${c.id}: ${c.examples.length} examples`);
        if (c.voice.tips.length !== tips) bad.push(`${c.id}: ${c.voice.tips.length} tips`);
      }
    none('culture counts', bad);
  });
});

describe('culture names (D41)', () => {
  const cultures = Object.values(fantasyPack.cultures);
  const rolled = (id: string): string[] =>
    Array.from({ length: 300 }, (_, i) => generateName(lib, id, { seed: `QUAL-${i}` }).name);

  it.each(cultures.map((c) => c.id))('%s rolls only pronounceable names', (id) => {
    const bad: string[] = [];
    for (const name of new Set(rolled(id)))
      for (const word of name.split(' ')) {
        const problem = pronunciationProblem(word);
        if (problem) bad.push(`${name}: ${problem}`);
      }
    none(`unpronounceable names for ${id}`, bad);
  });

  it.each(cultures.map((c) => c.id))('%s rolls no name that touches a safety stem', (id) => {
    const bad = [...new Set(rolled(id))].filter((n) => stemHits(n, { wholeWord: true }).length > 0);
    none(`safety-stem names for ${id}`, bad);
  });

  /** Every word a name part list can produce (optional tokens both ways), capitalised. */
  const wordsOf = (rules: { pattern: string[]; parts: Record<string, string[]> }): string[] => {
    let acc = [''];
    for (const token of rules.pattern) {
      const m = /^([^?]+)(\?(?::(.+))?)?$/.exec(token);
      const opts = rules.parts[m?.[1] ?? ''] ?? [];
      const next = acc.flatMap((a) => opts.map((o) => a + o));
      acc = m?.[2] ? [...acc, ...next] : next;
    }
    return [...new Set(acc.map((w) => w.charAt(0).toUpperCase() + w.slice(1)))];
  };
  /** Words that read as a real word, a brand, a catchphrase or a bad joke (D41 review). */
  const FORBIDDEN =
    /^(semen\w*|money|one|data|skata|hakka|dakka|gravel|dusk|albus|tibia|honus|octette|cassette|domino|calvino|lola|dad|tarn|hand|kind|hard|bold)$/i;

  it.each(cultures.map((c) => c.id))('%s: every producible word is clean and distinct', (id) => {
    const c = lib.culture(id) as (typeof cultures)[number];
    const banned = c.banned.map((b) => new RegExp(b, 'i'));
    const givens = wordsOf(c.names.given);
    const families = wordsOf(c.names.family ?? { pattern: [], parts: {} });
    const reachableG = givens.filter((g) =>
      families.some((f) => !banned.some((re) => re.test(`${g} ${f}`))),
    );
    const reachableF = families.filter((f) =>
      reachableG.some((g) => !banned.some((re) => re.test(`${g} ${f}`))),
    );
    const bad: string[] = [];
    for (const w of [...reachableG, ...reachableF]) {
      if (FORBIDDEN.test(w)) bad.push(`${w}: forbidden word`);
      if (stemHits(w, { wholeWord: true }).length > 0) bad.push(`${w}: safety stem`);
      const p = pronunciationProblem(w);
      if (p) bad.push(`${w}: ${p}`);
    }
    const fam = new Set(reachableF.map((w) => w.toLowerCase()));
    for (const g of reachableG)
      if (fam.has(g.toLowerCase())) bad.push(`${g}: both given and family`);
    none(`producible words for ${id}`, bad);
  });

  it('shares no producible word between cultures', () => {
    const seen = new Map<string, string>();
    const bad: string[] = [];
    for (const c of cultures) {
      const all = [
        ...wordsOf(c.names.given),
        ...wordsOf(c.names.family ?? { pattern: [], parts: {} }),
      ];
      for (const w of all.filter((x) => x.length >= 4)) {
        const key = w.toLowerCase();
        const other = seen.get(key);
        if (other && other !== c.id) bad.push(`${w}: ${other} and ${c.id}`);
        seen.set(key, c.id);
      }
    }
    none('cross-culture words', bad);
  });

  it('every curated example is pronounceable, passes its own banned rules and is unique', () => {
    const seen = new Map<string, string>();
    const bad: string[] = [];
    for (const c of cultures) {
      const banned = c.banned.map((b) => new RegExp(b, 'i'));
      for (const ex of c.examples) {
        if (banned.some((re) => re.test(ex)))
          bad.push(`${c.id}: "${ex}" is banned by its own rules`);
        if (stemHits(ex, { wholeWord: true }).length > 0) bad.push(`${c.id}: "${ex}" hits a stem`);
        for (const word of ex.split(' ')) {
          const problem = pronunciationProblem(word);
          if (problem) bad.push(`${c.id}: "${ex}" ${problem}`);
        }
        const key = ex.toLowerCase();
        if (seen.has(key)) bad.push(`"${ex}" in ${seen.get(key)} and ${c.id}`);
        seen.set(key, c.id);
      }
    }
    none('culture examples', bad);
  });
});

describe('GM moves deck (D41)', () => {
  const cards = lib.deck('core.gm-moves')?.cards ?? [];

  it('has namespaced lowercase ids, short moves and question prompts', () => {
    const bad: string[] = [];
    for (const c of cards) {
      if (!/^core\.move\.[a-z]+(-[a-z]+)*$/.test(c.id)) bad.push(`${c.id}: id`);
      if (words(c.text).length > 8) bad.push(`${c.id}: text over 8 words`);
      if (!c.prompt?.endsWith('?')) bad.push(`${c.id}: prompt is not a question`);
      if (/[.!?]$/.test(c.text)) bad.push(`${c.id}: text ends with punctuation`);
    }
    none('move shape', bad);
  });

  it('tags every move that touches the vocabulary, tags at most 30%, keeps 17 drawable under strict lines', () => {
    const missing = cards
      .filter((c) => {
        const hits = stemHits(`${c.text} ${c.prompt ?? ''}`);
        return hits.some((h) => !(c.safety ?? []).includes(h));
      })
      .map((c) => c.id);
    none('moves with an untagged stem hit', missing);
    const tagged = cards.filter((c) => (c.safety ?? []).length > 0).length;
    expect(tagged / cards.length).toBeLessThanOrEqual(0.3);
    const drawable = cards.filter((c) => !(c.safety ?? []).some((t) => STRICT_LINES.includes(t)));
    expect(drawable.length).toBeGreaterThanOrEqual(17);
  });

  it('varies its openings and tags a good-news-too-late move for death', () => {
    expect(cards.filter((c) => c.text.startsWith('Let ')).length).toBeLessThanOrEqual(4);
    expect(cards.find((c) => c.id === 'core.move.news-too-late')?.safety).toContain('death');
    const firstWords = cards.map((c) => c.text.split(' ').slice(0, 2).join(' ').toLowerCase());
    expect(new Set(firstWords).size).toBe(cards.length);
  });

  it('has distinct texts', () => {
    expect(new Set(cards.map((c) => c.text.toLowerCase())).size).toBe(cards.length);
  });
});
