import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useBlocker } from 'react-router';
import { Dialog } from '../kit/Dialog';

/**
 * Guards a form with unsaved work: in-app navigation opens a Keep editing / Leave page Dialog, and
 * closing or reloading the tab triggers the browser's own prompt. Render the returned node.
 */
export function useDirtyBlocker(dirty: boolean, copy: { title: string; leave: string }): ReactNode {
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return (
    <Dialog
      open={blocker.state === 'blocked'}
      title={copy.title}
      confirmLabel={copy.leave}
      cancelLabel="Keep editing"
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    >
      <p>Your changes are not saved yet.</p>
    </Dialog>
  );
}
