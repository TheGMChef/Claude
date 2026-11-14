// Page pattern: 2, Detail / Record.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Card, Dialog } from '../../kit';
import { fieldLabel } from '../../content/fields';
import { KIND_LABELS } from '../../content/labels';
import { useDeps, useLive } from '../../data/hooks';
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
  const found = useLive(
    async () => ({ entity: await getEntity(deps, eid), all: await listEntities(deps, cid) }),
    [deps, eid, cid],
  );

  if (!found) return <Skeleton />;
  const entity = found.entity;
  const all = found.all;
  if (!entity || entity.campaignId !== cid) return <NotFound what="entry" />;

  async function remove() {
    await deleteEntity(deps, eid);
    navigate(`/c/${cid}/codex`);
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
