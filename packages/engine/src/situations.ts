import type { CardField } from './generate';
import type { Library } from './library';
import type { CompiledGenerator, CompiledTable, Facet, FieldSource } from './schema';

/** A rolled piece of text with its provenance, as the generator builds fields from. */
export type Part = { text: string; sources: string[]; blocked: boolean; relaxed: boolean };

/**
 * Rolls a table (by id, or a view of a compiled table) through `rollInto` → `selectEntry`, the
 * single safety choke point. `exclude` lists entry ids that may not be chosen.
 */
export type Roll = (
  table: CompiledTable | string,
  exclude?: Set<string>,
) => Part & { entryId?: string };

type Done = Readonly<Record<string, CardField>>;

const blocked = (relaxed = false): Part => ({ text: '', sources: [], blocked: true, relaxed });

/** Fields this source needs generated first. */
export function fieldDeps(src: FieldSource): string[] {
  if ('facet' in src) return [src.facet.of];
  if ('situation' in src && src.situation.distinctFrom !== undefined) {
    return [src.situation.distinctFrom];
  }
  return [];
}

/**
 * S1-3: repeatedly take the first declared field whose dependencies are done. A dependency on a
 * field the generator lacks counts as done; fields left in a cycle follow in declared order.
 */
export function fieldOrder(gen: CompiledGenerator): string[] {
  const names = Object.keys(gen.fields);
  const order: string[] = [];
  const done = new Set<string>();
  let rest = names;
  for (;;) {
    const next = rest.find((n) =>
      fieldDeps(gen.fields[n] as FieldSource).every((d) => done.has(d) || !names.includes(d)),
    );
    if (next === undefined) break;
    order.push(next);
    done.add(next);
    rest = rest.filter((n) => n !== next);
  }
  return [...order, ...rest];
}

/** `rec` re-keyed in the generator's declared field order (share codes read key order). */
export function inDeclaredOrder<T>(
  gen: CompiledGenerator,
  rec: Record<string, T>,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const name of Object.keys(gen.fields))
    if (Object.hasOwn(rec, name)) out[name] = rec[name] as T;
  return out;
}

const doneField = (done: Done, name: string | undefined): CardField | undefined =>
  name !== undefined && Object.hasOwn(done, name) ? done[name] : undefined;

/** The index entry a situation field's first source names. */
function indexEntry(lib: Library, id: string | undefined) {
  const m = id === undefined ? null : /^(.+)#(\d+)$/.exec(id);
  return m ? lib.table(m[1] as string)?.entries[Number(m[2])] : undefined;
}

/**
 * Rolls a situation index table. Each entry gets its situation's genre as a tag so the genre
 * filter (relaxed last, R14) applies; `distinctFrom` excludes the other field's entry (S1-2).
 * Nothing left to choose is blocked.
 */
export function rollSituation(
  lib: Library,
  src: { table: string; distinctFrom?: string },
  done: Done,
  roll: Roll,
): Part {
  const table = lib.table(src.table);
  if (!table) return blocked();
  const view: CompiledTable = {
    ...table,
    entries: table.entries.map((e) => {
      const genre = e.ref !== undefined ? lib.situation(e.ref)?.genre : undefined;
      return genre !== undefined && !e.tags.includes(genre)
        ? { ...e, tags: [...e.tags, genre] }
        : e;
    }),
  };
  const other = doneField(done, src.distinctFrom);
  const exclude =
    other && !other.blocked && other.sources[0] !== undefined
      ? new Set([other.sources[0]])
      : undefined;
  const r = roll(view, exclude);
  if (r.entryId === undefined) return blocked(r.relaxed);
  return { text: r.text, sources: r.sources, blocked: r.blocked, relaxed: r.relaxed };
}

/**
 * Rolls facet `name` of the situation field `of` chose (S1-1). Its sources start with the index
 * entry id, so a line on the situation blocks the facet too. A missing or blocked `of` blocks it.
 */
export function rollFacet(
  lib: Library,
  src: { of: string; name: Facet },
  done: Done,
  roll: Roll,
): Part {
  const of = doneField(done, src.of);
  if (!of || of.blocked) return blocked();
  const indexId = of.sources[0];
  const ref = indexEntry(lib, indexId)?.ref;
  const situation = ref !== undefined ? lib.situation(ref) : undefined;
  if (!situation || indexId === undefined) return blocked();
  const r = roll(situation.facets[src.name]);
  if (r.entryId === undefined) return blocked(r.relaxed);
  return {
    text: r.text,
    sources: [indexId, ...r.sources],
    blocked: r.blocked,
    relaxed: r.relaxed,
  };
}
