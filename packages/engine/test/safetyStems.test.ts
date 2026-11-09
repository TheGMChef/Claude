import { describe, expect, it } from 'vitest';
import { SAFETY_VOCABULARY } from '../src/safety';
import { SAFETY_STEMS, stemHits } from '../src/safetyStems';
import { fantasyPack } from './fixtures/starter-packs';

describe('stemHits', () => {
  it('returns matching topics in vocabulary order', () => {
    expect(stemHits('a fight over the coal fire')).toEqual(['violence', 'fire']);
  });
  it('matches whole words where the stem asks for it', () => {
    expect(stemHits('jars of moths and beer')).toEqual(['insects']);
    expect(stemHits('mother been warrick brackish')).toEqual([]);
  });
  it('is case-insensitive and matches at a word start only', () => {
    expect(stemHits('FIGHT')).toEqual(['violence']);
    expect(stemHits('wildfire')).toEqual([]);
  });
  it('keys SAFETY_STEMS by every vocabulary tag, in order', () => {
    expect(Object.keys(SAFETY_STEMS)).toEqual([...SAFETY_VOCABULARY]);
  });
  it('finds nothing in the shipped culture examples and tips', () => {
    for (const c of Object.values(fantasyPack.cultures)) {
      for (const ex of c.examples) expect(stemHits(ex), ex).toEqual([]);
      for (const tip of c.voice.tips) expect(stemHits(tip), tip).toEqual([]);
    }
  });
});
