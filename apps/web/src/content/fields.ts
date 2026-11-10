/**
 * Generator → Codex mapping and field labels (M-D6, D59). The tables are total: a test walks every
 * generator and every field key, so a new generator or field fails CI until it is labelled.
 */
import type { EntityKind } from '../data/schema';

export const GENERATOR_KINDS: Record<string, { kind: EntityKind; subtype?: string }> = {
  'fantasy.npc': { kind: 'npc' },
  'fantasy.place': { kind: 'place', subtype: 'location' },
  'fantasy.settlement': { kind: 'place', subtype: 'settlement' },
  'fantasy.tavern': { kind: 'place', subtype: 'tavern' },
  'fantasy.shop': { kind: 'place', subtype: 'shop' },
  'fantasy.clue': { kind: 'clue' },
  'fantasy.treasure': { kind: 'item', subtype: 'treasure' },
  'fantasy.trinket': { kind: 'item', subtype: 'trinket' },
  'fantasy.rumor': { kind: 'note', subtype: 'rumor' },
  'fantasy.complication': { kind: 'note', subtype: 'complication' },
  'fantasy.encounter': { kind: 'note', subtype: 'encounter' },
  'fantasy.seed': { kind: 'note', subtype: 'seed' },
  'fantasy.secret': { kind: 'note', subtype: 'detail' },
  'fantasy.prep.pressure': { kind: 'note', subtype: 'detail' },
  'fantasy.prep.spotlight': { kind: 'note', subtype: 'detail' },
};

export const FIELD_LABELS: Record<string, string> = {
  // D59
  want: 'Want',
  player: 'Player',
  role: 'Role',
  look: 'Look',
  secret: 'Secret',
  voice: 'Voice',
  tell: 'Tell',
  culture: 'Culture',
  say: 'How to say it',
  kind: 'Kind',
  sight: 'Sight',
  sound: 'Sound',
  smell: 'Smell',
  happening: 'Happening',
  size: 'Size',
  knownFor: 'Known for',
  trouble: 'Trouble',
  power: 'Who has power',
  keeper: 'Keeper',
  keeperWay: "The keeper's way",
  menu: 'On the menu',
  regular: 'A regular',
  rumor: 'Rumor',
  wares: 'Wares',
  oddity: 'Oddity',
  haggle: 'Haggling',
  portent: 'Portent',
  doom: 'What happens when it fills',
  mustLearn: 'Must learn',
  delivery: "How it's found",
  trace: 'What it shows',
  where: 'Where',
  note: 'Margin note',
  detail: 'Detail',
  worth: 'Worth',
  hook: 'Hook',
  truth: 'True?',
  source: 'Heard from',
  twist: 'Twist',
  opposition: 'Opposition',
  goal: 'Goal',
  terrain: 'Terrain',
  turn: 'Turn',
  failForward: 'If they fail',
  // The rest of the generator field keys (M-D6)
  item: 'Item',
  text: 'Text',
  question: 'Question',
  a: 'First situation',
  b: 'Second situation',
  enemy: 'Enemy',
  friend: 'Friend',
  complication: 'Complication',
  thing: 'Thing',
  place: 'Place',
  pressure: 'Pressure',
  name: 'Name',
};

/** A label for any key: the table, else the camelCase key split into words in sentence case. */
export function fieldLabel(key: string): string {
  const known = FIELD_LABELS[key];
  if (known !== undefined) return known;
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const SENSES = ['sight', 'sound', 'smell'];

/** The form's fields for a kind (and subtype), in D59 order. Front is plain text in this release. */
export function FIELDS_BY_KIND(kind: EntityKind, subtype?: string): string[] {
  switch (kind) {
    case 'pc':
      return ['want', 'player'];
    case 'npc':
      return ['role', 'look', 'want', 'secret', 'voice', 'tell', 'culture', 'say'];
    case 'place':
      switch (subtype) {
        case 'settlement':
          return ['size', 'knownFor', 'trouble', 'power', ...SENSES];
        case 'tavern':
          return ['keeper', 'keeperWay', 'menu', 'regular', 'rumor', ...SENSES];
        case 'shop':
          return ['kind', 'keeper', 'wares', 'oddity', 'haggle'];
        default:
          return ['kind', ...SENSES, 'happening'];
      }
    case 'front':
      return ['portent', 'doom'];
    case 'truth':
      return ['mustLearn'];
    case 'clue':
      return ['delivery', 'trace', 'where'];
    case 'scene':
      return ['note'];
    case 'item':
      return subtype === 'treasure' ? ['worth', 'hook'] : ['detail'];
    case 'note':
      switch (subtype) {
        case 'rumor':
          return ['truth', 'source'];
        case 'complication':
          return ['twist'];
        case 'encounter':
          return ['opposition', 'goal', 'terrain', 'turn', 'failForward'];
        default:
          return [];
      }
    case 'thread':
      return [];
  }
}
