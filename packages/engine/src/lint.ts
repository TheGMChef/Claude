import { ContentError } from './errors';
import { nameWithRng, normalizeName } from './names';
import { createRng } from './rng';
import { SAFETY_VOCABULARY } from './safety';
import { stemHits } from './safetyStems';
import type { CompiledPack, FieldSource } from './schema';
import { fieldDeps } from './situations';
import { findCycle, templateRefs } from './template';
import type { TemplateAst } from './template';

export type LintKind = 'table' | 'generator' | 'oracle' | 'culture' | 'deck' | 'situation';

/** Path of table `tableId`'s entry `index` in error messages. */
export type EntryPath = (tableId: string, index: number) => string;

/** Maps a definition to the path prefix used in error messages (a file, or the bare id). */
export type Locate = (kind: LintKind, id: string) => string;

const byId: Locate = (_kind, id) => id;

/**
 * Lint rules over a compiled pack. `compileDocs` runs this with a file-aware locator; the public
 * `lintPack` uses ids as locators.
 */
export function lintWith(
  pack: CompiledPack,
  deps: CompiledPack[],
  locate: Locate,
  entryPath: EntryPath = (tableId, i) => `${locate('table', tableId)}#entries[${i}]`,
): ContentError[] {
  const errors: ContentError[] = [];
  const err = (code: ContentError['code'], message: string, path: string): void => {
    errors.push(new ContentError(code, message, path, pack.id));
  };
  const all = [pack, ...deps];
  // Null prototype: a ref such as `constructor` must not resolve to an Object.prototype member (I2).
  const tables = Object.assign(
    Object.create(null),
    ...all.map((p) => p.tables),
  ) as CompiledPack['tables'];
  const generators = Object.assign(
    Object.create(null),
    ...all.map((p) => p.generators),
  ) as CompiledPack['generators'];
  const situations = Object.assign(
    Object.create(null),
    ...all.map((p) => p.situations),
  ) as CompiledPack['situations'];
  const vocabulary = new Set(all.flatMap((p) => p.vocabulary));
  const safety = new Set(SAFETY_VOCABULARY);

  const checkAst = (ast: TemplateAst, path: string, fieldNames: ReadonlySet<string>): void => {
    for (const el of ast) {
      if (typeof el === 'string') continue;
      const { slot } = el;
      if (slot.kind === 'table') {
        if (!fieldNames.has(slot.ref) && !tables[slot.ref]) {
          err('unresolved-ref', `table "${slot.ref}" not found`, path);
        }
      } else if (slot.kind === 'gen') {
        const g = generators[slot.generator];
        if (!g) err('unresolved-ref', `generator "${slot.generator}" not found`, path);
        else if (!Object.hasOwn(g.fields, slot.field)) {
          err('missing-source', `generator "${slot.generator}" has no field "${slot.field}"`, path);
        }
      }
    }
  };

  const graph = new Map<string, string[]>();
  const edges = (ast: TemplateAst, out: string[], fieldNames: ReadonlySet<string>): void => {
    const refs = templateRefs(ast);
    for (const t of refs.tables) if (!fieldNames.has(t)) out.push(`table:${t}`);
    for (const g of refs.generators) out.push(`generator:${g}`);
  };
  const noFields: ReadonlySet<string> = new Set();

  for (const t of Object.values(pack.tables)) {
    const base = locate('table', t.id);
    if (t.entries.length === 0) err('empty-table', `table "${t.id}" has no entries`, base);
    t.entries.forEach((e, i) => {
      const path = entryPath(t.id, i);
      for (const s of e.safety) {
        if (!safety.has(s)) err('unknown-safety-tag', `unknown safety tag "${s}"`, path);
      }
      for (const tag of e.tags) {
        if (!vocabulary.has(tag)) err('unknown-tag', `tag "${tag}" is not in the vocabulary`, path);
      }
      checkAst(e.ast, path, noFields);
    });
  }
  for (const p of all) {
    for (const t of Object.values(p.tables)) {
      const out: string[] = [];
      for (const e of t.entries) edges(e.ast, out, noFields);
      graph.set(`table:${t.id}`, out);
    }
  }

  for (const p of all) {
    for (const g of Object.values(p.generators)) {
      const own = p === pack;
      const base = locate('generator', g.id);
      const fieldNames = new Set(Object.keys(g.fields));
      const isSituation = (n: string): boolean =>
        Object.hasOwn(g.fields, n) && 'situation' in (g.fields[n] as FieldSource);
      const out: string[] = [];
      for (const [name, src] of Object.entries(g.fields)) {
        const path = `${base}#fields.${name}`;
        if ('situation' in src) {
          const { table, distinctFrom } = src.situation;
          const t = tables[table];
          if (own && !t) err('missing-source', `table "${table}" not found`, path);
          else if (own && t?.entries.some((e) => e.ref === undefined)) {
            err('missing-source', `table "${table}" is not a situation index table`, path);
          }
          if (own && distinctFrom !== undefined && !isSituation(distinctFrom)) {
            err('missing-source', `distinctFrom "${distinctFrom}" is not a situation field`, path);
          }
          out.push(`table:${table}`);
        } else if ('facet' in src) {
          // R37: a facet roll reaches that facet's table of every situation the index can pick, so
          // a {gen:} in a facet entry that points back here shows up as a reference cycle.
          const of = Object.hasOwn(g.fields, src.facet.of) ? g.fields[src.facet.of] : undefined;
          if (of && 'situation' in of) {
            for (const e of tables[of.situation.table]?.entries ?? []) {
              const st = e.ref === undefined ? undefined : situations[e.ref];
              if (st) out.push(`table:${st.facets[src.facet.name]}`);
            }
          }
          if (own && !isSituation(src.facet.of)) {
            err('missing-source', `facet of "${src.facet.of}": not a situation field`, path);
          }
        } else if ('table' in src) {
          if (own && !tables[src.table]) {
            err('missing-source', `table "${src.table}" not found`, path);
          }
          out.push(`table:${src.table}`);
        } else if ('pick' in src) {
          if (own && !tables[src.pick.table]) {
            err('missing-source', `table "${src.pick.table}" not found`, path);
          }
          out.push(`table:${src.pick.table}`);
        } else if ('gen' in src) {
          if (own && !generators[src.gen]) {
            err('missing-source', `generator "${src.gen}" not found`, path);
          }
          out.push(`generator:${src.gen}`);
        } else if ('template' in src) {
          if (own) {
            // R23: field refs (R10) are display-only, so share codes reproduce cards exactly.
            for (const el of src.template) {
              if (
                typeof el !== 'string' &&
                el.slot.kind === 'table' &&
                fieldNames.has(el.slot.ref)
              ) {
                err(
                  'unresolved-ref',
                  `field "${el.slot.ref}" can only be referenced from display, not from a template field`,
                  path,
                );
              }
            }
            checkAst(src.template, path, fieldNames);
          }
          edges(src.template, out, fieldNames);
        }
      }
      if (own) {
        checkAst(g.display, `${base}#display`, fieldNames);
        // Field dependency cycles (S1-7); generate falls back to declared order, but authors are told.
        const deps = new Map<string, string[]>();
        for (const [name, src] of Object.entries(g.fields)) {
          // Only valid targets (situation fields) count; a bad target is already missing-source.
          deps.set(name, fieldDeps(src).filter(isSituation));
        }
        const loop = findCycle(deps);
        if (loop) {
          err('cycle', `field cycle: ${loop.join(' -> ')}`, `${base}#fields.${loop[0] as string}`);
        }
      }
      edges(g.display, out, fieldNames);
      graph.set(`generator:${g.id}`, out);
    }
  }

  for (const o of Object.values(pack.oracles)) {
    o.meaning.forEach((m, i) => {
      if (!tables[m])
        err('unresolved-ref', `table "${m}" not found`, `${locate('oracle', o.id)}#meaning[${i}]`);
    });
  }

  for (const d of Object.values(pack.decks)) {
    d.cards.forEach((c, i) => {
      for (const s of c.safety ?? []) {
        if (!safety.has(s)) {
          err(
            'unknown-safety-tag',
            `unknown safety tag "${s}"`,
            `${locate('deck', d.id)}#cards[${i}]`,
          );
        }
      }
    });
  }

  const cycle = findCycle(graph);
  if (cycle) {
    const first = cycle[0] as string;
    const sep = first.indexOf(':');
    const kind = first.slice(0, sep) as LintKind;
    errors.push(
      new ContentError(
        'cycle',
        `reference cycle: ${cycle.map((n) => n.slice(n.indexOf(':') + 1)).join(' -> ')}`,
        locate(kind, first.slice(sep + 1)),
        pack.id,
      ),
    );
  }

  for (const c of Object.values(pack.cultures)) {
    const where = locate('culture', c.id);
    const flag = (text: string, path: string, wholeWord = false): void => {
      const hits = stemHits(text, { wholeWord });
      if (hits.length > 0) {
        err('culture-safety', `"${text}" touches ${hits.join(', ')}; reword it`, path);
      }
    };
    c.examples.forEach((ex, i) => flag(ex, `${where}#names.examples[${i}]`, true));
    c.voice.tips.forEach((tip, i) => flag(tip, `${where}#voice.tips[${i}]`));
    const rng = createRng('lint', c.id);
    const seen = new Set<string>();
    for (let i = 0; i < 500 && seen.size < 20; i++) {
      const r = nameWithRng(c, rng, { exclude: seen });
      if (!r.relaxed) seen.add(normalizeName(r.name));
    }
    if (seen.size < 20) {
      err(
        'weak-culture',
        `culture "${c.id}" produced only ${seen.size} distinct valid names in 500 tries (need 20)`,
        locate('culture', c.id),
      );
    }
  }

  return errors;
}

export function lintPack(pack: CompiledPack, deps: CompiledPack[] = []): ContentError[] {
  return lintWith(pack, deps, byId);
}
