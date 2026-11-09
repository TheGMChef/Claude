import { SAFETY_VOCABULARY } from './safety';

/**
 * Regex fragments per safety topic, matched case-insensitively at a word start. A trailing `\b`
 * makes a stem a whole word. The list is short on purpose: it is a backstop for review (the
 * `culture-safety` lint), not a classifier.
 */
export const SAFETY_STEMS: Readonly<Record<string, readonly string[]>> = {
  violence: [
    'fight',
    'brawl',
    'stab',
    'murder',
    'kill',
    'slay',
    'slain',
    'assault',
    'riot',
    'ambush',
    'blood',
    'strangl',
    'throttl',
    'lynch',
    'execut(?:e[sd]?|ing|ion|ioner)\\b',
    'throat',
  ],
  gore: [
    'gore\\b',
    'gory',
    'guts?\\b',
    'gutted',
    'entrail',
    'sever(?:s|ed|ing|ance)?\\b',
    'flay',
    'maim',
    'dismember',
  ],
  death: [
    'dead',
    'death',
    'die\\b',
    'dies\\b',
    'died\\b',
    'dying',
    'corpse',
    'graves?\\b',
    'graveyard',
    'tomb',
    'burial',
    'buried',
    'funeral',
    'coffin',
    'ghost',
    'undead',
    'poison',
    'starv',
  ],
  torture: ['tortur', 'torment', 'thumbscrew'],
  'sexual-content': [
    'brothel',
    'seduc',
    'naked',
    'nude',
    'sexual',
    'courtesan',
    'lover',
    'rape[sd]?\\b',
    'orgy\\b',
  ],
  abuse: ['abus', 'bully', 'bullie'],
  'child-harm': ['child-?(?:beat|harm)', 'infantic', 'orphan'],
  'self-harm': ['self-harm', 'self-injur', 'hurt (?:her|him|them)sel'],
  suicide: ['suicid', 'noose', 'hanged', 'own life', 'hang(?:s|ed|ing)?\\b'],
  addiction: ['addict', 'drunk', 'opium', 'craving', 'withdrawal', 'gambl'],
  slavery: ['slave', 'enslav', 'shackle', 'thrall', 'indentur', 'chattel', 'chained\\b'],
  'body-horror': ['parasite', 'mutat', 'fester', 'pustule', 'flesh-', 'worm\\b'],
  insects: [
    'insect',
    'beetle',
    'maggot',
    'wasp',
    'hornet',
    'locust',
    'termite',
    'cockroach',
    'swarm',
    'bees?\\b',
    'ants?\\b',
    'moths?\\b',
    'flies\\b',
    'lice\\b',
    'louse',
  ],
  spiders: ['spider', 'cobweb', 'arachn', 'webs?\\b'],
  rats: ['rats?\\b', 'rodent', 'vermin', 'mice\\b'],
  drowning: ['drown', 'flood', 'undertow', 'sank\\b', 'sunk\\b', 'sinking'],
  fire: [
    'fire',
    'flame',
    'burn',
    'blaze',
    'inferno',
    'arson',
    'pyre',
    'scorch',
    'smoulder',
    'smolder',
  ],
  claustrophobia: ['cramped', 'crawlspace', 'buried alive', 'walled up', 'airless'],
  religion: [
    'shrine',
    'temple',
    'priest',
    'gods?\\b',
    'goddess',
    'saint',
    'pray',
    'monk',
    'nuns?\\b',
    'abbey',
    'abbot',
    'chapel',
    'church',
    'holy',
    'sacred',
    'relic',
    'cults?\\b',
    'blessed',
    'heres',
    'heretic',
    'pilgrim',
    'faith',
    'altar',
  ],
  'hate-bigotry': ['bigot', 'pogrom', 'slur'],
  'animal-harm': ['slaughter', 'cockfight', 'dogfight', 'bear-bait', 'poach', 'cull\\b', 'skinned'],
  pregnancy: ['pregnan', 'midwife', 'childbirth', 'with child', 'unborn'],
  'mental-illness': [
    'madness',
    'mad\\b',
    'insane',
    'insanity',
    'lunatic',
    'asylum',
    'delusion',
    'deranged',
  ],
  police: [
    'constable',
    'sheriff',
    'bailiff',
    'watchm',
    'sergeant',
    'guards?\\b',
    'the watch\\b',
    'jailer',
    'gaoler',
  ],
  war: [
    'wars?\\b',
    'warfare',
    'warlord',
    'soldier',
    'army',
    'armies',
    'siege',
    'battle',
    'deserter',
    'desertion',
    'mercenar',
    'regiment',
    'veteran',
    'hostage',
    'razed\\b',
  ],
};

/**
 * High-risk stems that `wholeWord` (example-name) matching still treats as PREFIXES, because a
 * death or violence word is often hidden inside an invented compound ("Corpsewick", "Bloodmere").
 * Each is a stem none of whose prefix forms is a common real name start. `except` lists whole
 * words (regex fragments, case-insensitive) that begin with the stem but are legitimate names.
 * Keep this list short; every addition needs a reason. `sever` is deliberately absent (Severin).
 */
export const NAME_PREFIX_STEMS: ReadonlyArray<{
  topic: string;
  stem: string;
  except: readonly string[];
}> = [
  { topic: 'death', stem: 'corpse', except: [] },
  { topic: 'violence', stem: 'blood', except: [] },
  { topic: 'violence', stem: 'murder', except: [] },
  { topic: 'violence', stem: 'kill', except: ['killian', 'killoran'] },
  { topic: 'gore', stem: 'gore', except: ['goren', 'gorey', 'gorecki'] },
  { topic: 'death', stem: 'grave', except: ['gravel\\w*'] },
  { topic: 'animal-harm', stem: 'slaughter', except: [] },
  { topic: 'death', stem: 'dead', except: [] },
  { topic: 'death', stem: 'tomb', except: ['tombl\\w*'] },
  { topic: 'violence', stem: 'slay', except: ['slaymaker', 'slayton'] },
];

const prefixHit = (text: string, topic: string): boolean =>
  NAME_PREFIX_STEMS.some(({ topic: t, stem, except }) => {
    if (t !== topic) return false;
    const ok = new RegExp(`^(?:${except.join('|') || '(?!)'})$`, 'i');
    return (text.match(new RegExp(`\\b${stem}\\w*`, 'gi')) ?? []).some((w) => !ok.test(w));
  });

const build = (suffix: string): ReadonlyArray<readonly [string, RegExp]> =>
  SAFETY_VOCABULARY.map((topic) => [
    topic,
    new RegExp(`\\b(?:${(SAFETY_STEMS[topic] ?? []).join('|')})${suffix}`, 'i'),
  ]);
const MATCHERS = build('');
const WHOLE_WORD_MATCHERS = build('\\b');

/**
 * Topics whose stems match `text`, in vocabulary order. With `wholeWord`, every stem must also end
 * at a word boundary (used for invented example names, so "Severin" or "Warren" never trip).
 */
export function stemHits(text: string, opts: { wholeWord?: boolean } = {}): string[] {
  const ms = opts.wholeWord ? WHOLE_WORD_MATCHERS : MATCHERS;
  return ms
    .filter(([topic, re]) => re.test(text) || (opts.wholeWord === true && prefixHit(text, topic)))
    .map(([topic]) => topic);
}
