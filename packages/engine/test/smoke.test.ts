import { describe, expect, it } from 'vitest';
import * as engine from '../src';

describe('engine smoke', () => {
  it('exports VERSION', () => {
    expect(engine.VERSION).toBe('0.1.0');
  });
});
