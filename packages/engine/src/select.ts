import type { Rng } from './rng';
import type { SafetySettings } from './safety';
import type { CompiledEntry, CompiledTable } from './schema';

export type TagFilter = { require?: string[]; prefer?: string[]; exclude?: string[] };

export type Selection = {
  entry: CompiledEntry | null;
  relaxed: boolean;
  blocked: boolean;
  veiled: string[];
};

/**
 * CompiledEntry has no genre field, so genre is matched as a tag: with `opts.genre` set, only
 * entries tagged with a DIFFERENT known genre are excluded; untagged entries stay eligible.
 */
const KNOWN_GENRES: readonly string[] = ['fantasy', 'scifi', 'horror', 'cyberpunk', 'modern'];

const PREFER_FACTOR = 3;

export function selectEntry(
  table: CompiledTable,
  rng: Rng,
  opts: { genre?: string; tags?: TagFilter; safety?: SafetySettings },
): Selection {
  const none = (blocked: boolean): Selection => ({
    entry: null,
    relaxed: false,
    blocked,
    veiled: [],
  });
  if (table.entries.length === 0) return none(false);

  const { genre } = opts;
  const genreOk = (e: CompiledEntry): boolean =>
    !genre || !e.tags.some((t) => t !== genre && KNOWN_GENRES.includes(t));

  // Safety lines are applied at every stage and are never relaxed. blocked only when lines
  // exclude every entry of a non-empty table.
  const lines = opts.safety?.lines ?? [];
  const safeEntries = table.entries.filter((e) => !e.safety.some((s) => lines.includes(s)));
  if (safeEntries.length === 0) return none(true);

  const require = opts.tags?.require ?? [];
  const exclude = opts.tags?.exclude ?? [];
  const prefer = opts.tags?.prefer ?? [];

  const pool = (req: string[], exc: string[], useGenre: boolean): CompiledEntry[] =>
    safeEntries.filter(
      (e) =>
        (!useGenre || genreOk(e)) &&
        req.every((t) => e.tags.includes(t)) &&
        !exc.some((t) => e.tags.includes(t)),
    );

  // Relaxation order (R14): prefer (never affects the pool), then require, then exclude, then genre.
  let relaxed = false;
  let candidates = pool(require, exclude, true);
  if (candidates.length === 0) {
    relaxed = true;
    candidates = pool([], exclude, true);
    if (candidates.length === 0) candidates = pool([], [], true);
    if (candidates.length === 0) candidates = pool([], [], false);
  }
  if (candidates.length === 0) return none(true);

  const weights = candidates.map((e) =>
    prefer.some((t) => e.tags.includes(t)) ? e.weight * PREFER_FACTOR : e.weight,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  let chosen = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll < 0) {
      chosen = candidates[i];
      break;
    }
  }
  if (!chosen) return none(false);

  const veils = opts.safety?.veils ?? [];
  return {
    entry: chosen,
    relaxed,
    blocked: false,
    veiled: veils.filter((v) => chosen.safety.includes(v)),
  };
}
