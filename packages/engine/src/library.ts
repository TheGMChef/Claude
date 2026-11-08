import { ContentError } from './errors';
import type {
  CompiledCulture,
  CompiledDeck,
  CompiledGenerator,
  CompiledOracle,
  CompiledPack,
  CompiledTable,
} from './schema';

export type Library = {
  packs: CompiledPack[];
  table(id: string): CompiledTable | undefined;
  culture(id: string): CompiledCulture | undefined;
  generator(id: string): CompiledGenerator | undefined;
  oracle(id: string): CompiledOracle | undefined;
  deck(id: string): CompiledDeck | undefined;
};

/**
 * Indexes packs by absolute id. `user.*` ids from a later pack replace earlier definitions;
 * any other duplicate id (across any kind) throws `duplicate-id`.
 */
export function loadPacks(packs: CompiledPack[]): Library {
  const tables = new Map<string, CompiledTable>();
  const cultures = new Map<string, CompiledCulture>();
  const generators = new Map<string, CompiledGenerator>();
  const oracles = new Map<string, CompiledOracle>();
  const decks = new Map<string, CompiledDeck>();
  const owner = new Map<string, string>();

  const add = <T>(map: Map<string, T>, kind: string, packId: string, record: Record<string, T>) => {
    for (const [id, value] of Object.entries(record)) {
      const key = `${kind}:${id}`;
      if (owner.has(key) && !id.startsWith('user.')) {
        throw new ContentError(
          'duplicate-id',
          `duplicate ${kind} id "${id}" (packs "${owner.get(key)}" and "${packId}")`,
          id,
          packId,
        );
      }
      owner.set(key, packId);
      map.set(id, value);
    }
  };

  // An id may only exist once across all kinds, so a table and a deck sharing an id clash too.
  const kindOf = new Map<string, string>();
  for (const pack of packs) {
    const groups: Array<[string, Record<string, unknown>]> = [
      ['table', pack.tables],
      ['culture', pack.cultures],
      ['generator', pack.generators],
      ['oracle', pack.oracles],
      ['deck', pack.decks],
    ];
    for (const [kind, record] of groups) {
      for (const id of Object.keys(record)) {
        const prior = kindOf.get(id);
        if (prior !== undefined && prior !== kind && !id.startsWith('user.')) {
          throw new ContentError(
            'duplicate-id',
            `duplicate id "${id}": defined as both ${prior} and ${kind}`,
            id,
            pack.id,
          );
        }
        kindOf.set(id, kind);
      }
    }
    add(tables, 'table', pack.id, pack.tables);
    add(cultures, 'culture', pack.id, pack.cultures);
    add(generators, 'generator', pack.id, pack.generators);
    add(oracles, 'oracle', pack.id, pack.oracles);
    add(decks, 'deck', pack.id, pack.decks);
  }

  return {
    packs,
    table: (id) => tables.get(id),
    culture: (id) => cultures.get(id),
    generator: (id) => generators.get(id),
    oracle: (id) => oracles.get(id),
    deck: (id) => decks.get(id),
  };
}
