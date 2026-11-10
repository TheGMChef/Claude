import { SAFETY_VOCABULARY } from '@prepdesk/engine';
import { describe, expect, it } from 'vitest';
import { ENTITY_KINDS } from '../../data/schema';
import { CULTURES } from '../lib';
import { KIND_LABELS, KIND_PLURALS, TOPIC_GROUPS, TOPIC_LABELS, cultureName } from '../labels';

describe('safety topic labels', () => {
  it('the five groups hold exactly the 25 vocabulary topics, with no duplicates and none missing', () => {
    const all = TOPIC_GROUPS.flatMap((g) => g.topics);
    expect(SAFETY_VOCABULARY).toHaveLength(25);
    expect(all).toHaveLength(25);
    expect(new Set(all).size).toBe(25);
    expect([...all].sort()).toEqual([...SAFETY_VOCABULARY].sort());
  });

  it('uses the spec 7.1 group names, order and membership', () => {
    expect(TOPIC_GROUPS.map((g) => [g.label, g.topics])).toEqual([
      ['Harm and violence', ['violence', 'gore', 'death', 'torture', 'war']],
      [
        'People and bodies',
        [
          'abuse',
          'child-harm',
          'sexual-content',
          'pregnancy',
          'body-horror',
          'self-harm',
          'suicide',
        ],
      ],
      [
        'Mind and society',
        ['addiction', 'mental-illness', 'slavery', 'hate-bigotry', 'religion', 'police'],
      ],
      ['Fears', ['insects', 'spiders', 'rats', 'drowning', 'fire', 'claustrophobia']],
      ['Animals', ['animal-harm']],
    ]);
  });

  it('labels every topic in sentence case, uniquely', () => {
    expect(Object.keys(TOPIC_LABELS).sort()).toEqual([...SAFETY_VOCABULARY].sort());
    for (const label of Object.values(TOPIC_LABELS)) {
      expect(label).toMatch(/^[A-Z][a-z]+(?:[ -][a-z]+)*$/);
    }
    expect(new Set(Object.values(TOPIC_LABELS)).size).toBe(25);
    expect(TOPIC_LABELS['child-harm']).toBe('Child harm');
    expect(TOPIC_LABELS['sexual-content']).toBe('Sexual content');
    expect(TOPIC_LABELS['hate-bigotry']).toBe('Hate and bigotry');
    expect(TOPIC_LABELS['animal-harm']).toBe('Animal harm');
    expect(TOPIC_LABELS['body-horror']).toBe('Body horror');
    expect(TOPIC_LABELS['mental-illness']).toBe('Mental illness');
    expect(TOPIC_LABELS['self-harm']).toBe('Self-harm');
  });
});

describe('kind and culture labels', () => {
  it('has a singular and a plural label for every entity kind', () => {
    for (const k of ENTITY_KINDS) {
      expect(KIND_LABELS[k], k).toBeTruthy();
      expect(KIND_PLURALS[k], k).toBeTruthy();
    }
    expect(KIND_LABELS.pc).toBe('PC');
    expect(KIND_LABELS.npc).toBe('NPC');
    expect(KIND_PLURALS).toMatchObject({ pc: 'PCs', npc: 'NPCs', place: 'Places', note: 'Notes' });
  });

  it('names a culture by id and falls back to the id for an unknown one', () => {
    for (const c of CULTURES) expect(cultureName(c.id)).toBe(c.name);
    expect(cultureName('fantasy.culture.marsh')).toBe('Marsh-folk');
    expect(cultureName('user.culture.mine')).toBe('user.culture.mine');
  });
});
