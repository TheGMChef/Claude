import { parseAllDocuments } from 'yaml';
import { compileDocs } from './compile';
import { ContentError } from './errors';
import {
  MAX_EXPANSION,
  MAX_USER_PACK_BYTES,
  MAX_YAML_ALIASES,
  expansionCost,
  userPackProblems,
  utf8Length,
} from './limits';
import { PackManifestSrc } from './schema';
import type { CompiledPack, PackManifest } from './schema';

const DEFAULT_MANIFEST: PackManifest = { id: 'user', version: '0', title: 'User pack' };
const NAMESPACE = 'user.';

type Doc = { file: string; data: unknown };
type Result = { ok: true; pack: CompiledPack } | { ok: false; errors: ContentError[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const docName = (i: number): string => `user-pack[${i}]`;

/**
 * Accepted shapes, as a YAML string (any number of `---`-separated documents) or as an object:
 * - one content document (`{ kind, id, ... }`);
 * - an array of content documents;
 * - `{ manifest?, docs: [...] }` — `manifest` is a pack manifest (defaults to
 *   `{ id: 'user', version: '0', title: 'User pack' }`, as for the other shapes).
 * A YAML string holding exactly one document is read with the object rules.
 */
function toDocs(src: unknown): { manifest: PackManifest; docs: Doc[]; errors: ContentError[] } {
  const errors: ContentError[] = [];
  const schemaError = (message: string, path: string): void => {
    errors.push(new ContentError('schema', message, path, DEFAULT_MANIFEST.id));
  };
  const list = (items: unknown[]): Doc[] => items.map((data, i) => ({ file: docName(i), data }));

  let value = src;
  if (typeof src === 'string') {
    // Size first: nothing is parsed past the cap.
    if (utf8Length(src) > MAX_USER_PACK_BYTES) {
      schemaError(`the pack is larger than ${MAX_USER_PACK_BYTES} bytes`, '');
      return { manifest: DEFAULT_MANIFEST, docs: [], errors };
    }
    const parsed = parseAllDocuments(src);
    const datas: unknown[] = [];
    parsed.forEach((doc, i) => {
      for (const e of doc.errors) schemaError(`YAML: ${e.message}`, docName(i));
      if (doc.errors.length > 0) return;
      const data: unknown = doc.toJS({ maxAliasCount: MAX_YAML_ALIASES });
      if (data !== null && data !== undefined) datas.push(data); // skip empty documents
    });
    if (errors.length > 0) return { manifest: DEFAULT_MANIFEST, docs: [], errors };
    value = datas.length === 1 ? datas[0] : datas;
  } else if (utf8Length(JSON.stringify(src) ?? '') > MAX_USER_PACK_BYTES) {
    schemaError(`the pack is larger than ${MAX_USER_PACK_BYTES} bytes`, '');
    return { manifest: DEFAULT_MANIFEST, docs: [], errors };
  }

  if (Array.isArray(value)) return { manifest: DEFAULT_MANIFEST, docs: list(value), errors };
  if (isRecord(value) && Array.isArray(value.docs)) {
    let manifest = DEFAULT_MANIFEST;
    if (value.manifest !== undefined) {
      const m = PackManifestSrc.safeParse(value.manifest);
      if (m.success) manifest = m.data;
      else for (const issue of m.error.issues) schemaError(issue.message, 'manifest');
    }
    return { manifest, docs: list(value.docs), errors };
  }
  if (isRecord(value)) return { manifest: DEFAULT_MANIFEST, docs: list([value]), errors };
  schemaError('expected a content document, an array of documents or { manifest, docs }', '');
  return { manifest: DEFAULT_MANIFEST, docs: [], errors };
}

/**
 * Validates and compiles a user pack. Returns compileDocs errors (which include every lint rule,
 * R12) plus a `namespace` error for each defined id outside `user.`. Never throws.
 */
export function validateUserPack(src: string | object, deps: CompiledPack[] = []): Result {
  try {
    const { manifest, docs, errors } = toDocs(src);
    if (errors.length > 0) return { ok: false, errors };
    if (docs.length === 0) {
      const empty = new ContentError('schema', 'pack is empty', '', manifest.id);
      return { ok: false, errors: [empty] };
    }
    // Limits before compile: compile and lint must never see an oversized or hostile pack.
    const problems = userPackProblems(docs);
    if (problems.length > 0) {
      const toError = (p: { message: string; path: string }) =>
        new ContentError('schema', p.message, p.path, manifest.id);
      return { ok: false, errors: problems.map(toError) };
    }
    for (const { file, data } of docs) {
      if (!isRecord(data) || data.kind === 'vocabulary' || typeof data.id !== 'string') continue;
      if (!data.id.startsWith(NAMESPACE)) {
        errors.push(
          new ContentError(
            'namespace',
            `id "${data.id}" must start with "${NAMESPACE}" in a user pack`,
            `${file}#id`,
            manifest.id,
          ),
        );
      }
    }
    const compiled = compileDocs(manifest, docs, deps);
    errors.push(...compiled.errors);
    // Template explosion: a table or generator whose worst case fans out too far is refused.
    for (const [key, cost] of expansionCost(compiled.pack, deps)) {
      if (cost <= MAX_EXPANSION) continue;
      const sep = key.indexOf(':');
      const [kind, id] = [key.slice(0, sep), key.slice(sep + 1)];
      errors.push(
        new ContentError(
          'schema',
          `${kind} "${id}" can expand to ${cost} steps; the limit is ${MAX_EXPANSION}`,
          id,
          manifest.id,
        ),
      );
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true, pack: compiled.pack };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [new ContentError('schema', message, '', DEFAULT_MANIFEST.id)] };
  }
}
