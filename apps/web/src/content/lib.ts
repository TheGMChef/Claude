import { loadPacks } from '@prepdesk/engine';
import type { Library } from '@prepdesk/engine';
import core from '@prepdesk/content-core/core.json';
import fantasy from '@prepdesk/content-fantasy/fantasy.json';

type CompiledPack = Parameters<typeof loadPacks>[0][number];

// The one narrow cast: tsc infers the JSON's literal shape, but the build CLI guarantees these
// files are compiled packs, which is the shape the engine expects.
export const lib: Library = loadPacks([core, fantasy] as unknown as CompiledPack[]);

/** Every generator the loaded packs ship, by title, for the dev page's picker. */
export const GENERATORS: { id: string; title: string }[] = Object.values(
  fantasy.generators as unknown as Record<string, { id: string; title: string }>,
)
  .map((g) => ({ id: g.id, title: g.title }))
  .sort((a, b) => a.title.localeCompare(b.title));

/** The fantasy cultures the loaded packs ship, by name: the campaign's name-culture choices. */
export const CULTURES: { id: string; name: string; voice: string }[] = lib.packs
  .filter((p) => p.genre === 'fantasy')
  .flatMap((p) => Object.values(p.cultures))
  .map((c) => ({ id: c.id, name: c.name, voice: c.voice.summary }))
  .sort((a, b) => a.name.localeCompare(b.name));
