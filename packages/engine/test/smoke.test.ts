import { describe, expect, expectTypeOf, it } from 'vitest';
import * as engine from '../src';
import type {
  CampaignLookup,
  Card,
  CompiledOracle,
  Context,
  Likelihood,
  OracleResult,
  SerializableContext,
} from '../src';

describe('engine smoke', () => {
  it('exports VERSION', () => {
    expect(engine.VERSION).toBe('0.1.0');
  });

  it('exports the spec types: one Likelihood, CampaignLookup and SerializableContext (M5)', () => {
    expectTypeOf<OracleResult['likelihood']>().toEqualTypeOf<Likelihood>();
    expectTypeOf<keyof CompiledOracle['odds']>().toEqualTypeOf<Likelihood>();
    expectTypeOf<NonNullable<Context['campaign']>>().toEqualTypeOf<CampaignLookup>();
    expectTypeOf<Card['context']>().toEqualTypeOf<SerializableContext>();
    const lookup: CampaignLookup = { get: (path) => (path === 'a' ? 'b' : undefined) };
    expect(lookup.get('a')).toBe('b');
  });
});
