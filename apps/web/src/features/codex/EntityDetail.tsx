// Page pattern: 2, Detail / Record.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Card, Dialog } from '../../kit';
import { fieldLabel } from '../../content/fields';
import { KIND_LABELS, TOPIC_LABELS } from '../../content/labels';
import { useCampaign, useDeps, useLive } from '../../data/hooks';
import { linedTopics } from '../../content/safety';
import { deleteEntity, getEntity, listEntities } from '../../data/repo/entities';
import { WikiText } from './WikiText';
import { NotFound } from '../../app/NotFound';
import { Skeleton } from '../../app/Skeleton';
import '../pages.css';

export function EntityDetail() {
  const { cid = '', eid = '' } = useParams();
  const deps = useDeps();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { campaign } = useCampaign(cid);
  const found = useLive(
    async () => ({ entity: await getEntity(deps, eid), all: await listEntities(deps, cid) }),
    [deps, eid, cid],
  );

  if (!found) return <Skeleton />;
  const entity = found.entity;
  const all = found.all;
  if (!entity || entity.campaignId !== cid) return <NotFound what="entry" />;

  // D12: a saved roll whose table entries now touch one of the campaign's lines gets a notice.
  // The DM's kept text is never changed or hidden.
  const touched =
    entity.card && campaign ? linedTopics(entity.card, campaign.safety) : ([] as string[]);

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteEntity(deps, eid);
      navigate(`/c/${cid}/codex`);
    } catch {
      setConfirming(false);
      setBusy(false);
      setError("We couldn't delete that. Try again in a moment.");
    }
  }

  return (
    <main className="page" id="main">
      <p className="muted">
        <Link className="textlink" to={`/c/${cid}/codex`}>
          Codex
        </Link>{' '}
        · {KIND_LABELS[entity.kind]}
        {entity.subtype ? ` · ${entity.subtype}` : ''}
      </p>
      <h1 className="page__title">{entity.title}</h1>
      {entity.summary ? (
        <p className="page__lede">
          <WikiText text={entity.summary} entities={all} cid={cid} selfId={entity.id} />
        </p>
      ) : null}
      {Array.isArray(touched) && touched.length > 0 ? (
        <p role="note" className="pg-ok">
          Part of this came from a table that touches one of your lines:{' '}
          {touched.map((t) => TOPIC_LABELS[t] ?? t).join(', ')}. Your text is kept as it is.
        </p>
      ) : null}
      <Card variant="ruled">
        <div className="detail">
          <dl>
            {Object.entries(entity.fields).map(([key, value]) => (
              <div key={key}>
                <dt>{fieldLabel(key)}</dt>
                <dd>
                  <WikiText text={value} entities={all} cid={cid} selfId={entity.id} />
                </dd>
              </div>
            ))}
            {entity.body ? (
              <div>
                <dt>Notes</dt>
                <dd>
                  <WikiText text={entity.body} entities={all} cid={cid} selfId={entity.id} />
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </Card>
      {error ? (
        <p role="alert" className="pg-error">
          {error}
        </p>
      ) : null}
      <div className="row">
        <Link className="key btn btn--outline btn--md" to={`/c/${cid}/codex/${entity.id}/edit`}>
          Edit entry
        </Link>
        <Button variant="outline" className="btn--destructive" onClick={() => setConfirming(true)}>
          Delete this entry
        </Button>
      </div>
      <Dialog
        open={confirming}
        title={`Delete “${entity.title}”?`}
        confirmLabel="Delete entry"
        tone="destructive"
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      >
        <p>It leaves your Codex and any links to it stop working. This can't be undone.</p>
      </Dialog>
    </main>
  );
}
