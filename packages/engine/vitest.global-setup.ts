import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

/** Builds every packages/content-* pack with the content CLI so tests never read a stale dist. */
export default function setup(): void {
  const tsx = join(root, 'node_modules/.bin/tsx');
  const cli = join(root, 'tools/content-cli/src/cli.ts');
  const packages = join(root, 'packages');
  for (const name of readdirSync(packages).sort()) {
    const dir = join(packages, name);
    if (!name.startsWith('content-') || !existsSync(join(dir, 'package.json'))) continue;
    try {
      execFileSync(tsx, [cli, 'build', dir], { cwd: root, stdio: 'pipe' });
    } catch (e) {
      const { stdout, stderr } = e as { stdout?: Buffer; stderr?: Buffer };
      const out = [stdout?.toString(), stderr?.toString()].filter(Boolean).join('\n');
      throw new Error(`content build failed for ${name}:\n${out}`);
    }
  }
}
