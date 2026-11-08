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
import type { Modifier, Slot, TemplateAst } from './template';

type Doc = { file: string; data: unknown };

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

const esc = (s: string): string => s.replace(/[{}]/g, (c) => `\\${c}`);

function slotText(slot: Slot): string {
  switch (slot.kind) {
    case 'table':
      return slot.ref;
    case 'ctx':
      return `ctx.${slot.path}`;
    case 'gen':
      return `gen:${slot.generator}.${slot.field}`;
    case 'name':
      return slot.part === 'full' ? 'name' : `name:${slot.part}`;
  }
}

function modText(m: Modifier): string {
  return m.kind === 'or' ? `or:${esc(m.fallback)}` : m.kind;
}

/** Inverse of `parseTemplate`; used to store template fields with resolved ids. */
function renderTemplate(ast: TemplateAst): string {
  return ast
    .map((el) =>
      typeof el === 'string'
        ? esc(el)
        : `{${esc(slotText(el.slot))}${el.mods.map((m) => `|${modText(m)}`).join('')}}`,
    )
    .join('');
}

/** Sibling `a.b.<ref>`, then `<packId>.<ref>`, then `<ref>` as an absolute id. */
function resolver(
  owner: string,
  packId: string,
  exists: (id: string) => boolean,
): (ref: string) => string {
  const dot = owner.lastIndexOf('.');
  return (ref) => {
    const candidates = dot > 0 ? [`${owner.slice(0, dot)}.${ref}`] : [];
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
  /** Rewrites table/gen slot refs to absolute ids; `fieldNames` refs (generator-local) are kept. */
  const resolveAst = (
    ast: TemplateAst,
    owner: string,
    fieldNames: ReadonlySet<string> = new Set(),
  ): TemplateAst => {
    const table = resolver(owner, packId, (id) => tableIds.has(id));
    const gen = resolver(owner, packId, (id) => genIds.has(id));
    return ast.map((el) => {
      if (typeof el === 'string') return el;
      const { slot } = el;
      if (slot.kind === 'table' && !fieldNames.has(slot.ref)) {
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
    const table = resolver(g.id, packId, (id) => tableIds.has(id));
    const gen = resolver(g.id, packId, (id) => genIds.has(id));
    const fields: Record<string, FieldSource> = {};
    for (const [name, src] of Object.entries(g.fields)) {
      if ('table' in src) fields[name] = { table: table(src.table) };
      else if ('gen' in src) fields[name] = { gen: gen(src.gen) };
      else if ('pick' in src)
        fields[name] = { pick: { ...src.pick, table: table(src.pick.table) } };
      else if ('template' in src) {
        const parsed = parse(src.template, `${base}#fields.${name}`);
        fields[name] = {
          template: parsed ? renderTemplate(resolveAst(parsed, g.id, fieldNames)) : src.template,
        };
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
