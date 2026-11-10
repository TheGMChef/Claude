import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// D51: src/data is plain TypeScript. It may import the engine and Dexie, never React, the router
// or the UI layers. data/hooks.ts is the one exception (React and dexie-react-hooks).
// Indirect base: Vite rewrites the literal `new URL(path, import.meta.url)` form as an asset URL.
const here = import.meta.url;
const dataDir = new URL('../', here).href;

function sources(dir: string): URL[] {
  return readdirSync(new URL(dir)).flatMap((name) => {
    const entry = new URL(name, dir);
    if (statSync(entry).isDirectory()) {
      return name === '__tests__' || name === '__fixtures__'
        ? []
        : sources(new URL(`${name}/`, dir).href);
    }
    return /\.(ts|tsx)$/.test(name) ? [entry] : [];
  });
}

export function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re =
    /(?:^|\n)\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(re)) out.push((m[1] ?? m[2] ?? m[3]) as string);
  return out;
}

const BANNED_PACKAGES = ['react', 'react-dom', 'react-router', 'dexie-react-hooks'];
const BANNED_PATH = /(^|\/)(kit|features|app)(\/|$)/;

function banned(spec: string): boolean {
  const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  return BANNED_PACKAGES.includes(pkg as string) || BANNED_PATH.test(spec);
}

describe('data layer boundary (D51)', () => {
  it('the scanner reads import, export-from, dynamic and side-effect imports', () => {
    const src = [
      "import a from 'react';",
      "import { b } from '../kit/Button';",
      "export * from 'react-router';",
      "const x = await import('../app/App');",
      "import 'dexie-react-hooks';",
      "import { ok } from 'dexie';",
    ].join('\n');
    expect(importSpecifiers(src).filter(banned)).toEqual([
      'react',
      '../kit/Button',
      'react-router',
      '../app/App',
      'dexie-react-hooks',
    ]);
  });

  it('no data module (except hooks.ts) imports React, the router or a UI layer', () => {
    const files = sources(dataDir).filter((f) => !f.pathname.endsWith('/data/hooks.ts'));
    const offenders = files.flatMap((f) =>
      importSpecifiers(readFileSync(f, 'utf8'))
        .filter(banned)
        .map((s) => `${f.pathname.split('/data/')[1]} -> ${s}`),
    );
    expect(offenders).toEqual([]);
  });

  // Enabled in Task 2, once data/db.ts exists: proves the scanner sees real Dexie imports.
  it.todo('the scanner finds dexie in data/db.ts');
});
