// Page pattern: 5, Settings / Configuration. Safety saves the moment you change it.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, Dialog, Field } from '../../kit';
import { useCampaign, useDeps } from '../../data/hooks';
import { RepoError } from '../../data/deps';
import { deleteCampaign, renameCampaign, setSafety } from '../../data/repo/campaigns';
import { exportJson } from '../../data/export/json';
import { RestoreBackup } from './RestoreBackup';
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
  const [name, setName] = useState<string | undefined>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
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
          <RestoreBackup />
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
