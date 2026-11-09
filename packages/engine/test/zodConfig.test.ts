import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validateUserPack } from '../src/index';

describe('engine zod config', () => {
  it('importing the engine turns off zod eval (strict CSP, no unsafe-eval)', () => {
    expect(z.config().jitless).toBe(true);
    expect(validateUserPack('kind: table\nid: user.t.a\nentries: [{ text: a }]\n').ok).toBe(true);
  });
});
