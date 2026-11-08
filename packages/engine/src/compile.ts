import type { ZodIssue } from 'zod';
import { ContentError } from './errors';
import { lintWith } from './lint';
import type { LintKind } from './lint';
import { DocumentSrc } from './schema';
import type {
  CompiledCulture,
  CompiledDeck,
  CompiledGenerator,
  CompiledOracle,
  CompiledPack,
  CompiledTable,
  CultureSource,
  DeckSource,
  FieldSource,
  GeneratorSource,
  OracleSource,
  PackManifest,
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
    seen.add(key);
    files.set(key, file);
    if (d.kind === 'table') tables.push(d);
    else if (d.kind === 'culture') cultures.push(d);
    else if (d.kind === 'generator') generators.push(d);
    else if (d.kind === 'oracle') oracles.push(d);
    else decks.push(d);
  }

  const tableIds = new Set([
    ...tables.map((t) => t.id),
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

  for (const c of cultures) {
    const { examples, exampleChance, banned, ...names } = c.names;
    const compiled: CompiledCulture = {
      id: c.id,
      name: c.name,
      voice: c.voice,
      names: names as CompiledCulture['names'],
      examples: examples ?? [],
      exampleChance: exampleChance ?? 0,
      banned: banned ?? [],
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

  errors.push(...lintWith(out, deps, (kind: LintKind, id: string) => fileOf(kind, id)));
  return { pack: out, errors };
}
