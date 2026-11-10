import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import '@prepdesk/engine';
import { z } from '../../data/zod';
import { CULTURES, GENERATORS, lib } from '../lib';

describe('content library', () => {
  it('lists the three fantasy cultures with a voice each, sorted by name', () => {
    expect(CULTURES).toHaveLength(3);
    for (const c of CULTURES) {
      expect(c.id).toMatch(/^fantasy\./);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.voice.length).toBeGreaterThan(0);
    }
    const names = CULTURES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(new Set(CULTURES.map((c) => c.id)).size).toBe(3);
  });

  it('exposes the loaded generators', () => {
    expect(lib.generator('fantasy.npc')).toBeDefined();
    expect(GENERATORS.some((g) => g.id === 'fantasy.npc')).toBe(true);
  });

  it("shares the engine's zod instance, so jitless applies and the CSP sees no new Function", () => {
    expect(z.config().jitless).toBe(true);
  });

  it('injects the package version as __APP_VERSION__ (D65)', () => {
    const here = import.meta.url;
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', here), 'utf8')) as {
      version: string;
    };
    expect(__APP_VERSION__).toBe(pkg.version);
  });
});
