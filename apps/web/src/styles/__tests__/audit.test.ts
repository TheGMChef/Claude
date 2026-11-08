import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ux-audit guards: lists are L1 surfaces, only the three viewport tokens, soft shadows.
const css = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const FORGE = css('../../dev/forge.css');
const KIT = css('../../kit/kit.css');
const BASE = css('../base.css');
const TOKENS = css('../tokens.css');

function rule(source: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(source)?.[1] ?? '';
}

describe('ux-audit CSS guards', () => {
  it.each(['.forge__safety', '.forge__names'])('%s is a framed L1 surface', (sel) => {
    const r = rule(FORGE, sel);
    expect(r).toMatch(/background:\s*var\(--card\)/);
    expect(r).toMatch(/border:\s*1px solid var\(--rule\)/);
  });

  it('uses only the 768px medium breakpoint (narrow = max 767.98px)', () => {
    for (const src of [FORGE, KIT, BASE]) {
      for (const [, v] of src.matchAll(/@media \((?:min|max)-width:\s*([\d.]+)px\)/g)) {
        expect(['768', '767.98', '767']).toContain(v);
      }
    }
  });

  it('the ambient shadow alpha stays under 0.08', () => {
    const m = /--card-shadow:\s*rgb\([^)]*\/\s*([\d.]+)\)/.exec(TOKENS);
    expect(Number(m?.[1])).toBeLessThan(0.08);
  });
});
