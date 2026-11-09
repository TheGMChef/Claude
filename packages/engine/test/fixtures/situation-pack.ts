import { FACETS } from '../../src/schema';
import type { Facet } from '../../src/schema';

export const situationManifest = { id: 's', version: '1', title: 'Situations' };
const facets = (slug: string, tag?: { facet: Facet; safety: string }) =>
  Object.fromEntries(
    FACETS.map((f) => [
      f,
      [1, 2, 3].map((n) => ({
        text: `${slug} ${f} ${n}`,
        ...(tag?.facet === f && n === 1 ? { safety: [tag.safety] } : {}),
      })),
    ]),
  );
export const situationOnlyDocs = [
  { kind: 'vocabulary', tags: ['situation', 'coastal', 'trade'] },
  {
    kind: 'situation',
    id: 's.situation.ember-toll',
    title: 'Ember toll',
    summary: 'A toll paid in coal.',
    tags: ['situation', 'trade'],
    safety: ['fire'],
    facets: facets('ember'),
  },
  {
    kind: 'situation',
    id: 's.situation.bell-debt',
    title: 'Bell debt',
    summary: 'The chapel bell is pawned.',
    tags: ['situation'],
    safety: ['religion'],
    facets: facets('bell'),
  },
  {
    kind: 'situation',
    id: 's.situation.reed-vow',
    title: 'Reed vow',
    summary: 'A promise made on the water.',
    tags: ['situation', 'coastal'],
    facets: facets('reed', { facet: 'enemy', safety: 'rats' }),
  },
];
export const seedGeneratorDoc = {
  kind: 'generator',
  id: 's.seed',
  title: 'Seed',
  fields: {
    enemy: { facet: { of: 'a', name: 'enemy' } },
    b: { situation: { table: 's.situations', distinctFrom: 'a' } },
    a: { situation: { table: 's.situations' } },
    thing: { facet: { of: 'b', name: 'thing' } },
  },
  display: '{a} meets {b}',
};
export const asDocs = (data: unknown[]) => data.map((d, i) => ({ file: `d${i}`, data: d }));
