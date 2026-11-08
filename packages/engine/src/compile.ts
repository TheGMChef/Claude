import type { ZodIssue } from 'zod';
import { ContentError } from './errors';
import { lintWith } from './lint';
import type { LintKind } from './lint';
import { DocumentSrc, FACETS } from './schema';
import type {
  CompiledCulture,
  CompiledDeck,
  CompiledGenerator,
  CompiledOracle,
  CompiledPack,
  CompiledSituation,
  CompiledTable,
  CultureSource,
  DeckSource,
  FieldSource,
  GeneratorSource,
  OracleSource,
  PackManifest,
  SituationSource,
  TableSource,
} from './schema';
import { parseTemplate } from './template';
import type { TemplateAst } from './template';

type Doc = { file: string; data: unknown };

/** Namespaced id: at least two dot-separated segments of `[a-z0-9][a-z0-9_-]*` (R13). */
const ID_FORMAT = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$/;

function locator(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return '';
  return (
    '#' +
    path
      .map((seg, i) =>
        typeof seg === 'number' ? `[${seg}]` : i === 0 ? String(seg) : `.${String(seg)}`,
      )
      .join('')
  );
}

/**
 * Sibling `a.b.<ref>`, then `<packId>.<ref>`, then `<ref>` as an absolute id (R9). For refs owned
 * by a generator (`ownedByGenerator`), `<generatorId>.<ref>` is tried first (R11).
 */
function resolver(
  owner: string,
  packId: string,
  exists: (id: string) => boolean,
  ownedByGenerator = false,
): (ref: string) => string {
  const dot = owner.lastIndexOf('.');
  return (ref) => {
    const candidates = ownedByGenerator ? [`${owner}.${ref}`] : [];
    if (dot > 0) candidates.push(`${owner.slice(0, dot)}.${ref}`);
    candidates.push(`${packId}.${ref}`, ref);
    return candidates.find(exists) ?? ref;
  };
}

export function compileDocs(
  manifest: PackManifest,
  docs: Doc[],
  deps: CompiledPack[] = [],
): { pack: CompiledPack; errors: ContentError[] } {
  const packId = manifest.id;
  const errors: ContentError[] = [];
  const fail = (code: ContentError['code'], message: string, path: string): void => {
    errors.push(new ContentError(code, message, path, packId));
  };

  const tables: TableSource[] = [];
  const cultures: CultureSource[] = [];
  const generators: GeneratorSource[] = [];
  const oracles: OracleSource[] = [];
  const decks: DeckSource[] = [];
  const situations: SituationSource[] = [];
  const indexId = `${packId}.situations`;
  const facetTableId = (situationId: string, facet: string): string => `${situationId}.${facet}`;
  const vocabulary: string[] = [];
  const files = new Map<string, string>();
  const seen = new Set<string>();

  for (const { file, data } of docs) {
    const parsed = DocumentSrc.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues as ZodIssue[]) {
        fail('schema', issue.message, `${file}${locator(issue.path)}`);
      }
      continue;
    }
    const d = parsed.data;
    if (d.kind === 'vocabulary') {
      for (const t of d.tags) if (!vocabulary.includes(t)) vocabulary.push(t);
      continue;
    }
    if (!ID_FORMAT.test(d.id)) {
      fail('schema', `invalid ${d.kind} id "${d.id}": expected <pack>.<area>.<name>`, `${file}#id`);
      continue;
    }
    const key = `${d.kind}:${d.id}`;
    if (seen.has(key)) {
      fail('duplicate-id', `duplicate ${d.kind} id "${d.id}"`, file);
      continue;
    }
    // A situation id and a table id share one namespace in the Library, so they may not meet.
    const other = d.kind === 'table' ? 'situation' : d.kind === 'situation' ? 'table' : null;
    if (other !== null && seen.has(`${other}:${d.id}`)) {
      fail('duplicate-id', `${d.kind} id "${d.id}" is also defined as a ${other}`, file);
      continue;
    }
    if (d.kind === 'situation') {
      if (!d.id.startsWith(`${packId}.situation.`)) {
        fail(
          'namespace',
          `situation id "${d.id}" must start with "${packId}.situation."`,
          `${file}#id`,
        );
        continue;
      }
      // The situation owns six facet tables; the first one also claims the pack's index table.
      const derived = FACETS.map((f) => facetTableId(d.id, f));
      if (situations.length === 0) derived.push(indexId);
      const clash = derived.find((id) => seen.has(`table:${id}`) || seen.has(`situation:${id}`));
      if (clash !== undefined) {
        fail(
          'duplicate-id',
          `situation "${d.id}" would define table "${clash}", which is already defined`,
          file,
        );
        continue;
      }
    }
    seen.add(key);
    files.set(key, file);
    if (d.kind === 'situation') {
      for (const f of FACETS) seen.add(`table:${facetTableId(d.id, f)}`);
      seen.add(`table:${indexId}`);
    }
    if (d.kind === 'table') tables.push(d);
    else if (d.kind === 'culture') cultures.push(d);
    else if (d.kind === 'generator') generators.push(d);
    else if (d.kind === 'oracle') oracles.push(d);
    else if (d.kind === 'situation') situations.push(d);
    else decks.push(d);
  }

  const tableIds = new Set([
    ...tables.map((t) => t.id),
    ...situations.flatMap((st) => FACETS.map((f) => facetTableId(st.id, f))),
    ...(situations.length > 0 ? [indexId] : []),
    ...deps.flatMap((p) => Object.keys(p.tables)),
  ]);
  const genIds = new Set([
    ...generators.map((g) => g.id),
    ...deps.flatMap((p) => Object.keys(p.generators)),
  ]);
  const fileOf = (kind: string, id: string): string => files.get(`${kind}:${id}`) ?? id;

  const parse = (text: string, path: string): TemplateAst | null => {
    try {
      return parseTemplate(text);
    } catch (e) {
      fail('schema', e instanceof Error ? e.message : String(e), path);
      return null;
    }
  };
  /**
   * Rewrites table/gen slot refs to absolute ids.
   * R10: inside a generator's template fields and display, a table ref equal to one of the
   * generator's own field names is a field ref and is deliberately kept short; `{name}` stays a
   * name slot (the runtime resolves field refs first, so a `name` field wins).
   */
  const resolveAst = (
    ast: TemplateAst,
    owner: string,
    fieldNames?: ReadonlySet<string>,
  ): TemplateAst => {
    const generatorOwned = fieldNames !== undefined;
    const table = resolver(owner, packId, (id) => tableIds.has(id), generatorOwned);
    const gen = resolver(owner, packId, (id) => genIds.has(id), generatorOwned);
    return ast.map((el) => {
      if (typeof el === 'string') return el;
      const { slot } = el;
      if (slot.kind === 'table' && !fieldNames?.has(slot.ref)) {
        return { ...el, slot: { ...slot, ref: table(slot.ref) } };
      }
      if (slot.kind === 'gen') return { ...el, slot: { ...slot, generator: gen(slot.generator) } };
      return el;
    });
  };

  const out: CompiledPack = {
    id: packId,
    version: manifest.version,
    ...(manifest.genre !== undefined ? { genre: manifest.genre } : {}),
    tables: {},
    cultures: {},
    generators: {},
    oracles: {},
    decks: {},
    situations: {},
    vocabulary,
  };

  for (const t of tables) {
    const base = fileOf('table', t.id);
    const entries = t.entries.map((e, i) => {
      const parsed = parse(e.text, `${base}#entries[${i}]`);
      return {
        id: `${t.id}#${i}`,
        ast: parsed ? resolveAst(parsed, t.id) : [e.text],
        weight: e.weight ?? 1,
        tags: e.tags ?? [],
        safety: e.safety ?? [],
      };
    });
    const compiled: CompiledTable = { id: t.id, tags: t.tags ?? [], entries };
    if (t.title !== undefined) compiled.title = t.title;
    out.tables[t.id] = compiled;
  }

  // Where lint should point for the entries of derived tables (facet entries, index entries).
  const derivedPath = new Map<string, (i: number) => string>();
  // Contract for the generator layer: facet entries do NOT inherit the situation's `safety`. Only
  // the index entry carries it; authors tag facet entries themselves.
  for (const st of situations) {
    const base = fileOf('situation', st.id);
    const tags = st.tags ?? [];
    const facetIds = {} as CompiledSituation['facets'];
    for (const f of FACETS) {
      const id = facetTableId(st.id, f);
      facetIds[f] = id;
      const entries = st.facets[f].map((e, i) => {
        const path = `${base}#facets.${f}[${i}]`;
        const parsed = parse(e.text, path);
        return {
          id: `${id}#${i}`,
          ast: parsed ? resolveAst(parsed, id) : [e.text],
          weight: e.weight ?? 1,
          tags: e.tags ?? [],
          safety: e.safety ?? [],
        };
      });
      out.tables[id] = { id, title: `${st.title}: ${f}`, tags, entries };
      derivedPath.set(id, (i) => `${base}#facets.${f}[${i}]`);
    }
    const compiled: CompiledSituation = {
      id: st.id,
      title: st.title,
      summary: st.summary,
      tags,
      safety: st.safety ?? [],
      facets: facetIds,
    };
    if (manifest.genre !== undefined) compiled.genre = manifest.genre;
    out.situations[st.id] = compiled;
  }
  if (situations.length > 0) {
    out.tables[indexId] = {
      id: indexId,
      title: 'Situations',
      tags: [],
      entries: situations.map((st, i) => ({
        id: `${indexId}#${i}`,
        ast: [st.title],
        weight: st.weight ?? 1,
        tags: st.tags ?? [],
        safety: st.safety ?? [],
        ref: st.id,
      })),
    };
    derivedPath.set(indexId, (i) => fileOf('situation', (situations[i] as SituationSource).id));
  }

  for (const c of cultures) {
    const { examples, exampleChance, banned, ...names } = c.names;
    const validBanned = (banned ?? []).filter((b, i) => {
      try {
        new RegExp(b, 'i');
        return true;
      } catch (e) {
        fail(
          'schema',
          `invalid banned pattern "${b}": ${e instanceof Error ? e.message : String(e)}`,
          `${fileOf('culture', c.id)}#names.banned[${i}]`,
        );
        return false;
      }
    });
    const compiled: CompiledCulture = {
      id: c.id,
      name: c.name,
      voice: c.voice,
      names: names as CompiledCulture['names'],
      examples: examples ?? [],
      exampleChance: exampleChance ?? 0,
      banned: validBanned,
    };
    if (c.genre !== undefined) compiled.genre = c.genre;
    out.cultures[c.id] = compiled;
  }

  for (const g of generators) {
    const base = fileOf('generator', g.id);
    const fieldNames = new Set(Object.keys(g.fields));
    const table = resolver(g.id, packId, (id) => tableIds.has(id), true);
    const gen = resolver(g.id, packId, (id) => genIds.has(id), true);
    const fields: Record<string, FieldSource> = {};
    for (const [name, src] of Object.entries(g.fields)) {
      if ('table' in src) fields[name] = { table: table(src.table) };
      else if ('gen' in src) fields[name] = { gen: gen(src.gen) };
      else if ('pick' in src)
        fields[name] = { pick: { ...src.pick, table: table(src.pick.table) } };
      else if ('template' in src) {
        const parsed = parse(src.template, `${base}#fields.${name}`);
        fields[name] = { template: parsed ? resolveAst(parsed, g.id, fieldNames) : [src.template] };
      } else fields[name] = src;
    }
    const display = parse(g.display, `${base}#display`);
    const compiled: CompiledGenerator = {
      id: g.id,
      title: g.title,
      fields,
      display: display ? resolveAst(display, g.id, fieldNames) : [g.display],
    };
    out.generators[g.id] = compiled;
  }

  for (const o of oracles) {
    const compiled: CompiledOracle = {
      id: o.id,
      odds: o.odds,
      meaning: o.meaning.map(resolver(o.id, packId, (id) => tableIds.has(id))),
    };
    out.oracles[o.id] = compiled;
  }

  for (const d of decks) {
    const compiled: CompiledDeck = {
      id: d.id,
      title: d.title,
      cards: d.cards.map((c) => ({ ...c })),
    };
    out.decks[d.id] = compiled;
  }

  const locate = (kind: LintKind, id: string): string => fileOf(kind, id);
  const entryPath = (tableId: string, i: number): string =>
    derivedPath.get(tableId)?.(i) ?? `${locate('table', tableId)}#entries[${i}]`;
  errors.push(...lintWith(out, deps, locate, entryPath));
  return { pack: out, errors };
}
