import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from '../app/routes';
import { ThemeProvider } from '../app/ThemeProvider';
import { DbProvider } from '../data/hooks';
import { createDb } from '../data/db';
import type { PrepDeskDB } from '../data/db';
import type { RepoDeps } from '../data/deps';

let count = 0;

export type RenderAppOptions = {
  path: string;
  db?: PrepDeskDB;
  /** Runs against the db (with deterministic deps) before the first render. */
  seed?: (deps: RepoDeps) => Promise<void>;
};

/**
 * D70: a memory data router with the real routes, ThemeProvider and DbProvider over a fresh
 * database. `deps` is a deterministic clone for seeding and reading back; the app itself runs on
 * live deps, so ids it makes never collide with the seeded counter ids.
 */
export async function renderApp({ path, db, seed }: RenderAppOptions) {
  const database = db ?? createDb(`app-${++count}-${Math.random().toString(36).slice(2)}`);
  let clock = Date.UTC(2026, 10, 10);
  let counter = 0;
  const deps: RepoDeps = {
    db: database,
    now: () => clock++,
    newId: (prefix) => `${prefix}_${String(++counter).padStart(16, '0')}`,
  };
  await database.open();
  if (seed) await seed(deps);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <DbProvider db={database}>
        <RouterProvider router={router} />
      </DbProvider>
    </ThemeProvider>,
  );
  return { db: database, deps, router, user };
}
