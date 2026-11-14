// Page pattern: 5, Settings / Configuration. Safety saves the moment you change it.
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, Dialog, Field } from '../../kit';
import { useCampaign, useDeps } from '../../data/hooks';
import { RepoError } from '../../data/deps';
import { deleteCampaign, renameCampaign, setSafety } from '../../data/repo/campaigns';
import { exportJson } from '../../data/export/json';
import {
  RESTORE_MESSAGES,
  droppedMessage,
  readBackup,
  restoreBackup,
} from '../../data/export/restore';
import type { CheckedBackup } from '../../data/export/restore';
import type { Safety } from '../../data/schema';
import { SafetyPicker } from '../SafetyPicker';
import { NotFound } from '../../app/NotFound';
import { Skeleton } from '../../app/Skeleton';
import '../pages.css';

export function CampaignSettings() {
  const { cid = '' } = useParams();
  const { campaign, loading, missing } = useCampaign(cid);
  const deps = useDeps();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | undefined>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<
    { backup: CheckedBackup; note: string; existing?: string } | undefined
  >();
  const [deleting, setDeleting] = useState(false);

  if (loading) return <Skeleton />;
  if (missing || !campaign) return <NotFound what="campaign" />;
  const current = campaign;

  const fail = (err: unknown, fallback: string) =>
    setError(err instanceof RepoError ? err.message : fallback);

  async function saveSafety(next: Safety) {
    setError('');
    try {
      await setSafety(deps, current.id, next);
    } catch (err) {
      fail(err, "We couldn't save that. Try again.");
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await renameCampaign(deps, current.id, name ?? current.name);
      setName(undefined);
      setMessage('Name saved.');
    } catch (err) {
      fail(err, "We couldn't save the name. Try again.");
    }
  }

  async function backup() {
    setError('');
    try {
      await exportJson(deps, current.id);
      setMessage('Backup downloaded. Keep the file somewhere safe.');
    } catch (err) {
      fail(err, "We couldn't make the backup. Try again.");
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError('');
    setMessage('');
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

  async function confirmRestore() {
    if (!pending) return;
    try {
      const restored = await restoreBackup(deps, pending.backup);
      setPending(undefined);
      navigate(`/c/${restored.id}/codex`);
    } catch (err) {
      setPending(undefined);
      fail(err, "We couldn't restore that file. Nothing on this device changed.");
    }
  }

  async function remove() {
    await deleteCampaign(deps, current.id);
    navigate('/');
  }

  return (
    <main className="page" id="main">
      <h1 className="page__title">Settings</h1>

      <form className="stack" onSubmit={saveName}>
        <h2>Campaign</h2>
        <Field
          label="Campaign name"
          value={name ?? current.name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
        />
        <div className="row">
          <Button
            type="submit"
            variant="outline"
            disabled={name === undefined || name.trim() === ''}
          >
            Save name
          </Button>
        </div>
      </form>

      <section className="stack" aria-labelledby="safety-h">
        <h2 id="safety-h">Safety</h2>
        <p className="muted">
          Changes apply to every roll straight away. Cards already on screen are re-checked.
        </p>
        <SafetyPicker value={current.safety} onChange={saveSafety} />
      </section>

      <section className="stack" aria-labelledby="data-h">
        <h2 id="data-h">Your data</h2>
        <p className="muted">
          Everything is stored on this device only. A backup file is your safety net.
        </p>
        <div className="row">
          <Button onClick={backup}>Download backup</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
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
        </div>
      </section>

      {message ? (
        <p role="status" className="pg-ok">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="pg-error">
          {error}
        </p>
      ) : null}

      <section className="stack" aria-labelledby="danger-h">
        <h2 id="danger-h">Danger zone</h2>
        <div className="row">
          <Button variant="outline" className="btn--destructive" onClick={() => setDeleting(true)}>
            Delete this campaign
          </Button>
        </div>
      </section>

      <Dialog
        open={pending !== undefined}
        title={pending?.existing ? `Replace “${pending.existing}”?` : 'Restore this backup?'}
        confirmLabel={pending?.existing ? 'Replace campaign' : 'Restore backup'}
        tone={pending?.existing ? 'destructive' : undefined}
        onConfirm={confirmRestore}
        onCancel={() => setPending(undefined)}
      >
        <p>
          {pending?.existing
            ? 'The campaign on this device is replaced by the one in the file.'
            : 'This adds the campaign in the file to this device.'}
          {pending?.note ? ` ${pending.note}` : ''}
        </p>
      </Dialog>
      <Dialog
        open={deleting}
        title={`Delete “${current.name}”?`}
        confirmLabel="Delete campaign"
        tone="destructive"
        onConfirm={remove}
        onCancel={() => setDeleting(false)}
      >
        <p>
          Every entry in it is deleted from this device. Download a backup first if you might want
          it back.
        </p>
      </Dialog>
    </main>
  );
}
