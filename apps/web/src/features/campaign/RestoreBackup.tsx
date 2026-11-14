import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Dialog } from '../../kit';
import { useDeps } from '../../data/hooks';
import { RepoError } from '../../data/deps';
import {
  RESTORE_MESSAGES,
  droppedMessage,
  readBackup,
  restoreBackup,
} from '../../data/export/restore';
import type { CheckedBackup } from '../../data/export/restore';

type Pending = { backup: CheckedBackup; note: string; existing?: string };

/** "Restore from backup": pick a file, read it without touching the device, confirm, replace or add. */
export function RestoreBackup({ variant = 'outline' }: { variant?: 'solid' | 'outline' }) {
  const deps = useDeps();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending | undefined>();

  async function pick(file: File | undefined) {
    if (!file) return;
    setError('');
    const result = await readBackup(deps, file);
    if (!result.ok) {
      setError(RESTORE_MESSAGES[result.error]);
      return;
    }
    const notes = [
      result.dropped > 0 ? droppedMessage(result.droppedCards) : '',
      result.droppedCultures.length > 0
        ? 'Some name cultures in the file are not in this version and were left out.'
        : '',
    ].filter(Boolean);
    setPending({
      backup: result.backup,
      note: notes.join(' '),
      ...(result.existingName !== undefined ? { existing: result.existingName } : {}),
    });
  }

  async function confirm() {
    if (!pending) return;
    try {
      const restored = await restoreBackup(deps, pending.backup);
      setPending(undefined);
      navigate(`/c/${restored.id}/codex`);
    } catch (err) {
      setPending(undefined);
      setError(
        err instanceof RepoError
          ? err.message
          : "We couldn't restore that file. Nothing on this device changed.",
      );
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => fileRef.current?.click()}>
        Restore from backup
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Backup file"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error ? (
        <p role="alert" className="pg-error">
          {error}
        </p>
      ) : null}
      <Dialog
        open={pending !== undefined}
        title={pending?.existing ? `Replace “${pending.existing}”?` : 'Restore this backup?'}
        confirmLabel={pending?.existing ? 'Replace campaign' : 'Restore backup'}
        tone={pending?.existing ? 'destructive' : undefined}
        onConfirm={confirm}
        onCancel={() => setPending(undefined)}
      >
        <p>
          {pending?.existing
            ? 'The campaign on this device is replaced by the one in the file.'
            : 'This adds the campaign in the file to this device.'}
          {pending?.note ? ` ${pending.note}` : ''}
        </p>
      </Dialog>
    </>
  );
}
