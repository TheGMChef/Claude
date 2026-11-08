import type { RouteObject } from 'react-router-dom';
import { KitPage } from '../dev/KitPage';
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

if (import.meta.env.DEV) {
  children.push(
    {
      path: 'kit',
      element: <KitPage />,
    },
    {
      path: 'forge-preview',
      element: (
        <main className="shell">
          <h1>Forge preview</h1>
        </main>
      ),
    },
  );
}

export const routes: RouteObject[] = [{ path: '/', element: <App />, children }];
