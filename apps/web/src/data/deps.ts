import { newId } from './ids';
import type { PrepDeskDB } from './db';
import type { IdPrefix } from './schema';

/** Everything a repository function needs, injected so tests are deterministic (D54). */
export type RepoDeps = {
  db: PrepDeskDB;
  now: () => number;
  newId: (prefix: IdPrefix) => string;
};

export function liveDeps(db: PrepDeskDB): RepoDeps {
  return { db, now: () => Date.now(), newId };
}

export type RepoErrorCode = 'not-found' | 'invalid' | 'conflict';

export class RepoError extends Error {
  readonly code: RepoErrorCode;
  constructor(code: RepoErrorCode, message: string) {
    super(message);
    this.name = 'RepoError';
    this.code = code;
  }
}
