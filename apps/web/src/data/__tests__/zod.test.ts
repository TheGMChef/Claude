import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from '../zod';

afterEach(() => {
  vi.unstubAllGlobals();
  z.config({ jitless: true });
});

/** Counts `new Function(...)` calls, the way zod's JIT compiler would make them. */
function trackFunction(): { calls: () => number } {
  let n = 0;
  const Real = globalThis.Function;
  vi.stubGlobal(
    'Function',
    new Proxy(Real, {
      construct(target, args) {
        n++;
        return Reflect.construct(target, args) as object;
      },
    }),
  );
  return { calls: () => n };
}

const build = () => z.strictObject({ a: z.string(), b: z.array(z.number()) });

describe('data/zod', () => {
  it('is jitless: a schema built through it parses without new Function (strict CSP)', () => {
    expect(z.config().jitless).toBe(true);
    const t = trackFunction();
    const schema = build();
    expect(schema.safeParse({ a: 'x', b: [1] }).success).toBe(true);
    expect(schema.safeParse({ a: 'x', b: [1], c: 1 }).success).toBe(false);
    expect(t.calls()).toBe(0);
  });

  it('control: the tracker does see JIT compilation when jitless is switched off', () => {
    z.config({ jitless: false });
    const t = trackFunction();
    const schema = build();
    schema.safeParse({ a: 'x', b: [1] });
    expect(t.calls()).toBeGreaterThan(0);
  });
});
