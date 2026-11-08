import { ContentError } from './errors';
import { SAFETY_VOCABULARY } from './safety';
import type { CompiledPack } from './schema';
import { findCycle, parseTemplate, templateRefs } from './template';
import type { TemplateAst } from './template';

export type LintKind = 'table' | 'generator' | 'oracle';

/** Maps a definition to the path prefix used in error messages (a file, or the bare id). */
export type Locate = (kind: LintKind, id: string) => string;

const byId: Locate = (_kind, id) => id;

/**
 * Lint rules over a compiled pack. `compileDocs` runs this with a file-aware locator; the public
 * `lintPack` uses ids as locators.
 */
export function lintWith(pack: CompiledPack, deps: CompiledPack[], locate: Locate): ContentError[] {
  const errors: ContentError[] = [];
  const err = (code: ContentError['code'], message: string, path: string): void => {
    errors.push(new ContentError(code, message, path, pack.id));
  };
  const all = [pack, ...deps];
  const tables = Object.assign({}, ...all.map((p) => p.tables)) as CompiledPack['tables'];
  const generators = Object.assign(
    {},
    ...all.map((p) => p.generators),
  ) as CompiledPack['generators'];
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
        else if (!(slot.field in g.fields)) {
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
      const path = `${base}#entries[${i}]`;
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

  const parseField = (text: string, path: string): TemplateAst | null => {
    try {
      return parseTemplate(text);
    } catch (e) {
      err('schema', e instanceof Error ? e.message : String(e), path);
      return null;
    }
  };
  for (const p of all) {
    for (const g of Object.values(p.generators)) {
      const own = p === pack;
      const base = locate('generator', g.id);
      const fieldNames = new Set(Object.keys(g.fields));
      const out: string[] = [];
      for (const [name, src] of Object.entries(g.fields)) {
        const path = `${base}#fields.${name}`;
        if ('table' in src) {
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
          const ast = parseField(src.template, path);
          if (ast) {
            if (own) checkAst(ast, path, fieldNames);
            edges(ast, out, fieldNames);
          }
        }
      }
      if (own) checkAst(g.display, `${base}#display`, fieldNames);
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

  // TODO(Task 8): weak-culture rule. A culture that cannot produce 20 distinct valid names in 500
  // tries is reported here once generateName exists; this task deliberately does not import it.

  return errors;
}

export function lintPack(pack: CompiledPack, deps: CompiledPack[] = []): ContentError[] {
  return lintWith(pack, deps, byId);
}
