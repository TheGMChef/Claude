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

  // Proves the scanner sees real imports in a real data module (db.ts imports Dexie).
  it('the scanner finds dexie in data/db.ts', () => {
    const db = new URL('db.ts', dataDir);
    expect(importSpecifiers(readFileSync(db, 'utf8'))).toContain('dexie');
  });
});

// ---- Whole-app import rules (apps/web/src) ----
const srcDir = new URL('../../', here).href;

function allSources(dir: string): URL[] {
  return readdirSync(new URL(dir)).flatMap((name) => {
    const entry = new URL(name, dir);
    if (statSync(entry).isDirectory()) return allSources(new URL(`${name}/`, dir).href);
    return /\.(ts|tsx)$/.test(name) ? [entry] : [];
  });
}

/** Specifiers of dynamic import() and require() calls only. */
export function dynamicSpecifiers(source: string): string[] {
  const re = /(?:\bimport|\brequire)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  return [...source.matchAll(re)].map((m) => m[1] as string);
}

const rel = (f: URL) => f.pathname.split('/apps/web/src/')[1] as string;

describe('zod comes only from data/zod.ts (jitless under the CSP)', () => {
  it('the scanner reads bare and subpath zod imports', () => {
    expect(importSpecifiers("import { z } from 'zod';\nimport * as m from 'zod/v4';")).toEqual([
      'zod',
      'zod/v4',
    ]);
  });

  it('no other web module imports zod', () => {
    const offenders = allSources(srcDir)
      .filter((f) => rel(f) !== 'data/zod.ts')
      .flatMap((f) =>
        [
          ...importSpecifiers(readFileSync(f, 'utf8')),
          ...dynamicSpecifiers(readFileSync(f, 'utf8')),
        ]
          .filter((s) => s === 'zod' || s.startsWith('zod/'))
          .map((s) => `${rel(f)} -> ${s}`),
      );
    expect(offenders).toEqual([]);
  });

  it('data/zod.ts imports the engine first, so its zod config is set before any schema', () => {
    const src = readFileSync(new URL('zod.ts', dataDir), 'utf8');
    expect(importSpecifiers(src)[0]).toBe('@prepdesk/engine');
    expect(src).toMatch(/export \{ z \} from 'zod'/);
  });
});

describe('engine safety functions are reached only through content/safety.ts', () => {
  it('the scanner reads dynamic import() and require()', () => {
    const src =
      "const a = await import('@prepdesk/engine');\nconst b = require('@prepdesk/engine');";
    expect(dynamicSpecifiers(src)).toEqual(['@prepdesk/engine', '@prepdesk/engine']);
  });

  it('no module outside content, dev, test and __tests__ loads the engine dynamically', () => {
    const exempt = /^(content|dev|test)\/|(^|\/)__tests__\//;
    const offenders = allSources(srcDir)
      .filter((f) => !exempt.test(rel(f)))
      .filter((f) => dynamicSpecifiers(readFileSync(f, 'utf8')).includes('@prepdesk/engine'))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
