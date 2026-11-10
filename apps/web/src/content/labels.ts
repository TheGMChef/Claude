import type { EntityKind } from '../data/schema';
import { CULTURES } from './lib';

/** The five session-zero groups (spec 7.1), in order. Together they hold all 25 topics. */
export const TOPIC_GROUPS: { id: string; label: string; topics: string[] }[] = [
  {
    id: 'harm',
    label: 'Harm and violence',
    topics: ['violence', 'gore', 'death', 'torture', 'war'],
  },
  {
    id: 'bodies',
    label: 'People and bodies',
    topics: [
      'abuse',
      'child-harm',
      'sexual-content',
      'pregnancy',
      'body-horror',
      'self-harm',
      'suicide',
    ],
  },
  {
    id: 'mind',
    label: 'Mind and society',
    topics: ['addiction', 'mental-illness', 'slavery', 'hate-bigotry', 'religion', 'police'],
  },
  {
    id: 'fears',
    label: 'Fears',
    topics: ['insects', 'spiders', 'rats', 'drowning', 'fire', 'claustrophobia'],
  },
  { id: 'animals', label: 'Animals', topics: ['animal-harm'] },
];

export const TOPIC_LABELS: Record<string, string> = {
  violence: 'Violence',
  gore: 'Gore',
  death: 'Death',
  torture: 'Torture',
  'sexual-content': 'Sexual content',
  abuse: 'Abuse',
  'child-harm': 'Child harm',
  'self-harm': 'Self-harm',
  suicide: 'Suicide',
  addiction: 'Addiction',
  slavery: 'Slavery',
  'body-horror': 'Body horror',
  insects: 'Insects',
  spiders: 'Spiders',
  rats: 'Rats',
  drowning: 'Drowning',
  fire: 'Fire',
  claustrophobia: 'Claustrophobia',
  religion: 'Religion',
  'hate-bigotry': 'Hate and bigotry',
  'animal-harm': 'Animal harm',
  pregnancy: 'Pregnancy',
  'mental-illness': 'Mental illness',
  police: 'Police',
  war: 'War',
};

export const KIND_LABELS: Record<EntityKind, string> = {
  pc: 'PC',
  npc: 'NPC',
  place: 'Place',
  front: 'Front',
  truth: 'Truth',
  clue: 'Clue',
  scene: 'Scene',
  thread: 'Thread',
  item: 'Item',
  note: 'Note',
};

/** Plural forms, used for the Markdown vault folders (spec 5.9). */
export const KIND_PLURALS: Record<EntityKind, string> = {
  pc: 'PCs',
  npc: 'NPCs',
  place: 'Places',
  front: 'Fronts',
  truth: 'Truths',
  clue: 'Clues',
  scene: 'Scenes',
  thread: 'Threads',
  item: 'Items',
  note: 'Notes',
};

/** A culture's display name; an id the loaded packs don't know is shown as it is. */
export function cultureName(id: string): string {
  return CULTURES.find((c) => c.id === id)?.name ?? id;
}
