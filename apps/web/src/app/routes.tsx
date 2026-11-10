import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import { CampaignForm } from '../features/campaign/CampaignForm';
import { CampaignSettings } from '../features/campaign/CampaignSettings';
import { Home } from '../features/campaign/Home';
import { CodexList } from '../features/codex/CodexList';
import { EntityDetail } from '../features/codex/EntityDetail';
import { CreateEntryPage, EditEntryPage } from '../features/codex/EntryForm';
import { ForgePage } from '../features/forge/ForgePage';
import { App } from './App';
import { NotFound } from './NotFound';
import { CampaignEntry, CampaignScope, ToCurrentCampaign, ToDesk } from './Redirects';

const children: RouteObject[] = [
  { index: true, element: <Home /> },
  { path: 'campaigns/new', element: <CampaignForm /> },
  {
    path: 'c/:cid',
    element: <CampaignScope />,
    children: [
      { index: true, element: <CampaignEntry /> },
      { path: 'forge', element: <ForgePage /> },
      { path: 'codex', element: <CodexList /> },
      { path: 'codex/new', element: <CreateEntryPage /> },
      { path: 'codex/:eid', element: <EntityDetail /> },
      { path: 'codex/:eid/edit', element: <EditEntryPage /> },
      { path: 'settings', element: <CampaignSettings /> },
    ],
  },
  { path: 'forge', element: <ToCurrentCampaign section="forge" /> },
  { path: 'codex', element: <ToCurrentCampaign section="codex" /> },
  { path: 'prep', element: <ToDesk /> },
  { path: 'table', element: <ToDesk /> },
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

children.push({ path: '*', element: <NotFound /> });

export const routes: RouteObject[] = [{ path: '/', element: <App />, children }];
