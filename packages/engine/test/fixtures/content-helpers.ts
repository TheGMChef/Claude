import { article } from '../../src/article';
import type { Library } from '../../src/library';
import type {
  CompiledEntry,
  CompiledGenerator,
  CompiledTable,
  FieldSource,
} from '../../src/schema';
import { FACETS } from '../../src/schema';
import type { TemplateAst } from '../../src/template';

/** Source-like text of an AST: literals as written, every slot as `{…}` (for length checks). */
export function astText(ast: TemplateAst): string {
  return ast
    .map((el) => {
      if (typeof el === 'string') return el;
      const s = el.slot;
      const body =
        s.kind === 'table'
          ? s.ref
          : s.kind === 'ctx'
            ? `ctx.${s.path}`
            : s.kind === 'gen'
              ? `gen:${s.generator}.${s.field}`
              : s.part === 'full'
                ? 'name'
                : `name:${s.part}`;
      const mods = el.mods.map((m) => (m.kind === 'or' ? `|or:${m.fallback}` : `|${m.kind}`));
      return `{${body}${mods.join('')}}`;
    })
    .join('');
}

/** Only the literal parts of an AST, slots dropped (what a reader sees of the author's words). */
export const literalText = (ast: TemplateAst): string =>
  ast.filter((el): el is string => typeof el === 'string').join('');

export const allTables = (lib: Library): CompiledTable[] =>
  lib.packs.flatMap((p) => Object.values(p.tables));

export const allGenerators = (lib: Library): CompiledGenerator[] =>
  lib.packs.flatMap((p) => Object.values(p.generators));

export const allSituations = (lib: Library) =>
  lib.packs.flatMap((p) => Object.values(p.situations));

/** Facet tables of every situation, with the situation's id for messages. */
export const facetTables = (lib: Library): CompiledTable[] =>
  allSituations(lib).flatMap((s) =>
    FACETS.map((f) => lib.table(s.facets[f])).filter((t): t is CompiledTable => t !== undefined),
  );

/** The entry a card source id (`<tableId>#<index>`) names, or undefined (e.g. a culture id). */
export function entryOfSource(lib: Library, id: string): CompiledEntry | undefined {
  const m = /^(.+)#(\d+)$/.exec(id);
  return m ? lib.table(m[1] as string)?.entries[Number(m[2])] : undefined;
}

/**
 * Ids of the tables whose entries are read through a slot with the `a` modifier: found by walking
 * every generator's display and template fields, following field references to their field's
 * table and recursing through the entries' own table slots.
 */
export function articleTables(lib: Library): Set<string> {
  const found = new Set<string>();
  const visited = new Set<string>();

  const fieldTables = (src: FieldSource | undefined): string[] => {
    if (!src) return [];
    if ('table' in src) return [src.table];
    if ('pick' in src) return [src.pick.table];
    if ('situation' in src) return [src.situation.table];
    if ('facet' in src) {
      return allSituations(lib).map((s) => s.facets[src.facet.name]);
    }
    return [];
  };

  const walk = (ast: TemplateAst, gen: CompiledGenerator | undefined): void => {
    for (const el of ast) {
      if (typeof el === 'string') continue;
      const { slot, mods } = el;
      const withA = mods.some((m) => m.kind === 'a');
      if (slot.kind === 'table') {
        const field = gen && Object.hasOwn(gen.fields, slot.ref) ? gen.fields[slot.ref] : undefined;
        if (field) {
          if (withA) for (const t of fieldTables(field)) found.add(t);
          for (const t of fieldTables(field)) visitTable(t);
        } else {
          if (withA) found.add(slot.ref);
          visitTable(slot.ref);
        }
      } else if (slot.kind === 'gen') {
        const other = lib.generator(slot.generator);
        const field = other?.fields[slot.field];
        if (other && field) {
          for (const t of fieldTables(field)) {
            if (withA) found.add(t);
            visitTable(t);
          }
        }
      }
    }
  };

  function visitTable(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    for (const e of lib.table(id)?.entries ?? []) walk(e.ast, undefined);
  }

  for (const gen of allGenerators(lib)) {
    walk(gen.display, gen);
    for (const src of Object.values(gen.fields)) if ('template' in src) walk(src.template, gen);
  }
  return found;
}

/**
 * Renders `text` as the `|a` modifier would (with the engine's own `article()`) and returns what
 * is wrong with it, or ''. Catches a manual article ("an usurer", "the usurer") that would double
 * up, so the gate and the renderer cannot drift.
 */
export function articleProblem(text: string): string {
  const rendered = `${article(text)} ${text}`;
  return /^(a|an) (a|an|the)(?![\w-])/i.test(rendered) ? `"${rendered}" doubles the article` : '';
}

/** Ids of `tables` with no spec row, no structural role (situation facet/index) and no exclusion. */
export function uncoveredTables(
  tables: Array<{ id: string }>,
  specIds: string[],
  structural: Set<string>,
  excluded: Record<string, string>,
): string[] {
  return tables
    .map((t) => t.id)
    .filter((id) => !specIds.includes(id) && !structural.has(id) && !Object.hasOwn(excluded, id));
}

/**
 * Ids of every table generator `id` can roll from: its field sources (situation facets included),
 * template fields, `{gen:}` slots and whole-generator `gen` fields, recursing through the table
 * slots inside entries. Used to tell which generators can ever show a safety-tagged entry.
 */
export function reachableTables(lib: Library, id: string): Set<string> {
  const tables = new Set<string>();
  const gens = new Set<string>();

  const visitTable = (tableId: string): void => {
    if (tables.has(tableId)) return;
    tables.add(tableId);
    for (const e of lib.table(tableId)?.entries ?? []) visitAst(e.ast);
  };
  const visitAst = (ast: TemplateAst): void => {
    for (const el of ast) {
      if (typeof el === 'string') continue;
      if (el.slot.kind === 'table') visitTable(el.slot.ref);
      else if (el.slot.kind === 'gen') visitGen(el.slot.generator);
    }
  };
  const visitSource = (src: FieldSource): void => {
    if ('table' in src) visitTable(src.table);
    else if ('pick' in src) visitTable(src.pick.table);
    else if ('template' in src) visitAst(src.template);
    else if ('gen' in src) visitGen(src.gen);
    else if ('situation' in src) visitTable(src.situation.table);
    else if ('facet' in src)
      for (const s of allSituations(lib)) visitTable(s.facets[src.facet.name]);
  };
  function visitGen(genId: string): void {
    if (gens.has(genId)) return;
    gens.add(genId);
    const gen = lib.generator(genId);
    if (!gen) return;
    Object.values(gen.fields).forEach(visitSource);
  }

  visitGen(id);
  return tables;
}

/** True when some table `id` can roll from holds an entry carrying a safety tag. */
export const reachesTagged = (lib: Library, id: string): boolean =>
  [...reachableTables(lib, id)].some((t) =>
    (lib.table(t)?.entries ?? []).some((e) => e.safety.length > 0),
  );
