import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileDocs } from '@prepdesk/engine';
import type { CompiledPack, ContentError } from '@prepdesk/engine';
import { readPackDir } from './readPack';

export type Io = { out: string[]; err: string[] };

function compileDir(dir: string): { pack: CompiledPack; errors: ContentError[] } {
  const { manifest, docs, errors: readErrors } = readPackDir(dir);
  const { pack, errors } = compileDocs(manifest, docs);
  return { pack, errors: [...readErrors, ...errors] };
}

const USAGE = 'usage: prepdesk-content <build|lint> <packDir> [--out dist]';

/** Returns the process exit code. Output lines are appended to `io` (the caller prints them). */
export function main(argv: string[], io: Io): number {
  const [cmd, dir, ...rest] = argv;
  if ((cmd !== 'build' && cmd !== 'lint') || !dir) {
    io.err.push(USAGE);
    return 2;
  }
  const outFlag = rest.indexOf('--out');
  const outDir = join(resolve(dir), outFlag >= 0 ? (rest[outFlag + 1] ?? 'dist') : 'dist');
  const { pack, errors } = compileDir(dir);
  // The id names the output file: keep it a plain file name inside the output folder.
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(pack.id)) {
    io.out.push(
      `schema package.json#prepdesk.id pack id "${pack.id}" must match [a-z0-9][a-z0-9_-]*`,
    );
    return 1;
  }
  for (const e of errors) io.out.push(`${e.code} ${e.path} ${e.message}`);
  if (errors.length > 0) return 1;
  if (cmd === 'build') {
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `${pack.id}.json`);
    writeFileSync(file, JSON.stringify(pack));
    io.out.push(`wrote ${file}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const io: Io = { out: [], err: [] };
  const code = main(process.argv.slice(2), io);
  for (const l of io.out) console.log(l);
  for (const l of io.err) console.error(l);
  process.exit(code);
}
