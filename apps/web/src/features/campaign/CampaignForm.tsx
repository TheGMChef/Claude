// Page pattern: 3, Form (page).
import { DEFAULT_LINES } from '@prepdesk/engine';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Field } from '../../kit';
import { useDeps } from '../../data/hooks';
import { RepoError } from '../../data/deps';
import { createCampaign } from '../../data/repo/campaigns';
import type { Safety } from '../../data/schema';
import { SafetyPicker } from '../SafetyPicker';
import '../pages.css';

export function CampaignForm() {
  const deps = useDeps();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [safety, setSafety] = useState<Safety>({ lines: [...DEFAULT_LINES], veils: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const c = await createCampaign(deps, { name, safety });
      navigate(`/c/${c.id}/forge`);
    } catch (err) {
      setError(
        err instanceof RepoError
          ? err.message
          : "We couldn't create the campaign. Check the name and try again.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="page" id="main">
      <h1 className="page__title">Create a campaign</h1>
      <p className="page__lede">
        Name your campaign, then choose what stays off the table. Lines never appear in anything you
        roll. You can change these any time in Settings.
      </p>
      <form className="stack" onSubmit={submit} noValidate>
        <Field
          label="Campaign name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The Marrow Coast"
          autoComplete="off"
          maxLength={120}
          required
        />
        <h2>Session zero</h2>
        <SafetyPicker value={safety} onChange={setSafety} />
        {error ? (
          <p role="alert" className="pg-error">
            {error}
          </p>
        ) : null}
        <div className="row">
          <Button type="submit" disabled={busy || name.trim() === ''}>
            Create campaign
          </Button>
        </div>
      </form>
    </main>
  );
}
