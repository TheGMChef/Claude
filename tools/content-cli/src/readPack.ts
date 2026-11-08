import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ContentError, PackManifestSrc } from '@prepdesk/engine';
import type { PackManifest } from '@prepdesk/engine';
import { parseAllDocuments } from 'yaml';

export type PackDocs = {
  manifest: PackManifest;
  docs: Array<{ file: string; data: unknown }>;
  /** YAML syntax errors (code `schema`); the affected documents are left out of `docs`. */
  errors: ContentError[];
};

function yamlFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...yamlFiles(full));
    else if (name.endsWith('.yaml')) found.push(full);
  }
  return found;
}

/**
 * Reads `package.json#prepdesk` and every `src/**\/*.yaml` (multi-document allowed). YAML syntax
 * errors are returned in `errors` as `schema` ContentErrors.
 */
export function readPackDir(dir: string): PackDocs {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { prepdesk?: unknown };
  const manifest = PackManifestSrc.parse(pkg.prepdesk);
  const docs: PackDocs['docs'] = [];
  const errors: ContentError[] = [];
  for (const full of yamlFiles(join(dir, 'src'))) {
    const file = relative(dir, full).split('\\').join('/');
    for (const doc of parseAllDocuments(readFileSync(full, 'utf8'))) {
      if (doc.errors.length > 0) {
        const msg = doc.errors.map((e) => e.message.split('\n')[0]).join('; ');
        errors.push(new ContentError('schema', `YAML error: ${msg}`, file, manifest.id));
        continue;
      }
      const data = doc.toJS() as unknown;
      if (data !== null && data !== undefined) docs.push({ file, data });
    }
  }
  return { manifest, docs, errors };
}
