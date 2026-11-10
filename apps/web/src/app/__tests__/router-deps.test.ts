import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Supply-chain guard: react-router < 7.18 has an open redirect (GHSA-wrjc-x8rr-h8h6) and a
// constructor-injection bug (GHSA-337j-9hxr-rhxg). The app ships react-router 7.18+ and imports
// it directly; react-router-dom (a v6-era re-export shim) must not come back.
// Indirect base: Vite rewrites the literal `new URL(path, import.meta.url)` form as an asset URL.
const here = import.meta.url;
const webRoot = new URL('../../../', here).href;
const pkg = JSON.parse(readFileSync(new URL('package.json', webRoot), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function sources(dir: string): URL[] {
  return readdirSync(new URL(dir)).flatMap((name) => {
    const entry = new URL(name, dir);
    if (statSync(entry).isDirectory()) return sources(new URL(`${name}/`, dir).href);
    return /\.(ts|tsx)$/.test(name) ? [entry] : [];
  });
}

describe('zod dependency', () => {
  it("the web app uses exactly the engine's zod range (one instance, so jitless applies)", () => {
    const enginePkg = JSON.parse(
      readFileSync(new URL('../../packages/engine/package.json', webRoot), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    const range = enginePkg.dependencies?.zod;
    expect(range).toBeDefined();
    expect(pkg.dependencies?.zod).toBe(range);
  });
});

describe('router dependency', () => {
  it('depends on react-router 7.18 or later and not on react-router-dom', () => {
    const range = pkg.dependencies?.['react-router'];
    expect(range).toBeDefined();
    const [major = 0, minor = 0] = (range ?? '').replace(/^[~^]/, '').split('.').map(Number);
    expect(major === 7 ? minor >= 18 : major > 7).toBe(true);
    expect(pkg.dependencies?.['react-router-dom']).toBeUndefined();
    expect(pkg.devDependencies?.['react-router-dom']).toBeUndefined();
  });

  it('no source file imports react-router-dom', () => {
    const files = [
      ...sources(new URL('src/', webRoot).href),
      ...sources(new URL('e2e/', webRoot).href),
    ];
    expect(files.length).toBeGreaterThan(10);
    const offenders = files
      .filter((file) => /from ['"]react-router-dom['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => file.href.slice(webRoot.length));
    expect(offenders).toEqual([]);
  });
});
