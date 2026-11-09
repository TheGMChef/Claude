import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import { App } from './App';
import { Home } from './Home';
import { ModeShell } from './ModeShell';
import { MODES } from './modes';

const children: RouteObject[] = [
  { index: true, element: <Home /> },
  ...MODES.map((m) => ({
    path: m.path.slice(1),
    element: <ModeShell title={m.title} description={m.description} />,
  })),
];

// Dev pages: lazy-loaded inside a statically-replaced gate so production builds drop them.
// The gate is also open for `vite build --mode e2e` so Playwright can reach them; both sides are
// replaced at build time, so a normal production build drops these pages entirely.
if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
  const KitPage = lazy(() => import('../dev/KitPage').then((m) => ({ default: m.KitPage })));
  const ForgePreview = lazy(() =>
    import('../dev/ForgePreview').then((m) => ({ default: m.ForgePreview })),
  );
  const page = (node: ReactNode) => <Suspense fallback={null}>{node}</Suspense>;
  children.push(
    { path: 'kit', element: page(<KitPage />) },
    { path: 'forge-preview', element: page(<ForgePreview />) },
  );
}

export const routes: RouteObject[] = [{ path: '/', element: <App />, children }];
