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
  it.each([
    ['the severed hand', 'gore'],
    ['he stabbed', 'violence'],
    ['drowning', 'drowning'],
    ['nests of spiders', 'spiders'],
    ['gore', 'gore'],
    ['severance pay', 'gore'],
  ])('hits %s', (text, topic) => {
    expect(stemHits(text)).toContain(topic);
  });
  it.each(['Severin Oko', 'Severus', 'Seraphine', 'Warden', 'Warren', 'Arthur'])(
    'does not hit %s',
    (text) => {
      expect(stemHits(text)).toEqual([]);
      expect(stemHits(text, { wholeWord: true })).toEqual([]);
    },
  );
  it('wholeWord stops ordinary prefix hits in names', () => {
    expect(stemHits('Torturelle')).toEqual(['torture']);
    expect(stemHits('Torturelle', { wholeWord: true })).toEqual([]);
  });
  it.each([
    ['strangled', 'violence'],
    ['a lynch mob', 'violence'],
    ['he hanged himself', 'suicide'],
    ['took her own life', 'suicide'],
    ['she will hurt herself', 'self-harm'],
    ['poisoned wine', 'death'],
    ['starving', 'death'],
    ['she gambled everything', 'addiction'],
    ['kept chained', 'slavery'],
    ['a hostage', 'war'],
    ['an orphan', 'child-harm'],
    ['a worm in the apple', 'body-horror'],
  ])('plain stem hits %s', (text, topic) => {
    expect(stemHits(text)).toContain(topic);
  });
  it.each([
    'a hangar',
    "Hangman's Rest",
    'Tomlin',
    'Tomblin',
    'Slaymaker',
    'wormwood',
    'executive',
  ])('plain stems let %s through', (text) => {
    expect(stemHits(text, { wholeWord: true })).toEqual([]);
  });
  it.each([
    ['Deadwick', 'death'],
    ['Tombwatch', 'death'],
    ['Slayby', 'violence'],
  ])('wholeWord catches compound %s', (name, topic) => {
    expect(stemHits(name, { wholeWord: true })).toContain(topic);
  });
  it.each([
    ['Corpsewick', 'death'],
    ['Bloodmere', 'violence'],
    ['Gravewick', 'death'],
    ['Gorefell', 'gore'],
    ['Slaughterby', 'animal-harm'],
  ])('wholeWord still catches high-risk compound %s', (name, topic) => {
    expect(stemHits(name, { wholeWord: true })).toContain(topic);
  });
  it.each(['Gravelle', 'Gorecki', 'Killian'])('wholeWord lets %s through', (name) => {
    expect(stemHits(name, { wholeWord: true })).toEqual([]);
  });
  it('keeps the owner-approved imperial examples', () => {
    const ex = Object.values(fantasyPack.cultures).flatMap((c) => c.examples);
    for (const n of [
      'Odrin Vey',
      'Ilsa Merrow',
      'Tamsin Fenwick',
      'Wenna Brack',
      'Brakka Dunmor',
      'Korvel Athe',
      'Gessa Rhun',
      'Cassia Vellane',
      'Aurel Tantis',
      'Severin Oko',
    ]) {
      expect(ex, n).toContain(n);
    }
  });
  it('keys SAFETY_STEMS by every vocabulary tag, in order', () => {
    expect(Object.keys(SAFETY_STEMS)).toEqual([...SAFETY_VOCABULARY]);
  });
  it('finds nothing in the shipped culture examples and tips', () => {
    for (const c of Object.values(fantasyPack.cultures)) {
      for (const ex of c.examples) expect(stemHits(ex, { wholeWord: true }), ex).toEqual([]);
      for (const tip of c.voice.tips) expect(stemHits(tip), tip).toEqual([]);
    }
  });
});
