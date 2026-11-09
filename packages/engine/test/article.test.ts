import { describe, expect, it } from 'vitest';
import { article } from '../src/article';

const A = [
  'ferryman',
  'lamplighter',
  'beggar',
  'one-eyed ferryman',
  'one',
  'once-famous bard',
  'usurer',
  'usher',
  'ushers the choir',
  'use-worn glove',
  'usual suspect',
  'utensil maker',
  'uranium miner',
  'unicorn warden',
  'union rep',
  'uniform tailor',
  'unique mapmaker',
  'universe-gazer',
  'unit clerk',
  'eulogist',
  'euphemist',
  'european envoy',
  'ewe herder',
  'ubiquitous peddler',
  'ukulele player',
  'yeoman',
  'house-sitter',
  'hero',
  'horse trader',
  'herbalist',
  'hat-maker',
];
const AN = [
  'oyster diver',
  'apothecary',
  'eel-trap mender',
  'inn cook',
  'umbrella mender',
  'uncle',
  'undertaker',
  'ugly twin',
  'upstart',
  'unable heir',
  'unimpressed guard',
  'uninvited guest',
  'urn-keeper',
  'ulcerous hermit',
  'utter fraud',
  'hour-glass maker',
  'hourglass maker',
  'heirloom dealer',
  'heir-apparent',
  'heir',
  'honest broker',
  'honour guard',
  'honor student',
  'honorary consul',
  'hour-keeper',
  'olive grower',
  'orphan',
  'ox-driver',
  'umpire',
  'ember seller',
  "'old' sailor",
];

describe('article', () => {
  it.each(A)('"%s" takes a', (text) => expect(article(text)).toBe('a'));
  it.each(AN)('"%s" takes an', (text) => expect(article(text)).toBe('an'));
  it('defaults to a for empty or non-letter starts', () => {
    expect(article('')).toBe('a');
    expect(article('7 candles')).toBe('a');
  });
});
