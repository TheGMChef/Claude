import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { attachLifecycle } from '../data/db';
import type { PrepDeskDB } from '../data/db';
import { StorageBlocked } from './StorageBlocked';

/**
 * Opens the database before anything renders (M-D12). A refused open or a schema upgrade in
 * another tab replaces the app with one honest page, so nothing is ever written to a closed db.
 */
export function Boot({ db, children }: { db: PrepDeskDB; children: ReactNode }) {
  const [state, setState] = useState<'opening' | 'ready' | 'blocked' | 'updated'>('opening');

  useEffect(() => {
    const detach = attachLifecycle(db, {
      versionChange: () => setState('updated'),
      blocked: () => {},
    });
    let live = true;
    db.open().then(
      () => live && setState((s) => (s === 'opening' ? 'ready' : s)),
      () => live && setState('blocked'),
    );
    return () => {
      live = false;
      detach();
    };
  }, [db]);

  if (state === 'opening') return null;
  if (state === 'ready') return <>{children}</>;
  return <StorageBlocked reason={state} />;
}
