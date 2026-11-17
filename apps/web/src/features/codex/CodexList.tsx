// Page pattern: 1, List / Index.
import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button, EmptyState, Field } from '../../kit';
import { KIND_LABELS } from '../../content/labels';
import { ENTITY_KINDS } from '../../data/schema';
import type { EntityKind } from '../../data/schema';
import { useLive } from '../../data/hooks';
import { listEntities } from '../../data/repo/entities';
import { useDeps } from '../../data/hooks';
import { buildIndex, search } from '../../data/search';
import { Skeleton } from '../../app/Skeleton';
import '../pages.css';

export function CodexList() {
  const { cid = '' } = useParams();
  const deps = useDeps();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const kindParam = params.get('kind') ?? '';
  const kind = (ENTITY_KINDS as readonly string[]).includes(kindParam)
    ? (kindParam as EntityKind)
    : undefined;
  const update = (next: { q?: string; kind?: string }) => {
    const merged = { q, kind: kind ?? '', ...next };
    const out: Record<string, string> = {};
    if (merged.q) out['q'] = merged.q;
    if (merged.kind) out['kind'] = merged.kind;
    setParams(out, { replace: true });
  };
  const entities = useLive(() => listEntities(deps, cid), [deps, cid]);
  const index = useMemo(() => (entities ? buildIndex(entities) : undefined), [entities]);

  if (!entities || !index) return <Skeleton />;

  const ofKind = kind ? entities.filter((e) => e.kind === kind) : entities;
  const shown =
    q.trim() === ''
      ? [...ofKind].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100)
      : search(index, q, { limit: 20, ...(kind ? { kinds: [kind] } : {}) }).map((h) => h.entity);

  return (
    <main className="page" id="main">
      <h1 className="page__title">Codex</h1>
      <div className="row">
        <Link className="key btn btn--outline btn--md" to={`/c/${cid}/codex/new`}>
          New entry
        </Link>
      </div>
      {entities.length === 0 ? (
        <EmptyState
          title="Your Codex is empty"
          sentence="Roll something in the Forge and save it, and it lands here."
          primary={
            <Link className="key btn btn--solid btn--md" to={`/c/${cid}/forge`}>
              Open the Forge
            </Link>
          }
        />
      ) : (
        <>
          <Field
            label="Search your Codex"
            type="search"
            value={q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="a name, a place, a word"
            autoComplete="off"
          />
          <div className="field">
            <label className="field__label" htmlFor="codex-kind">
              Show
            </label>
            <select
              id="codex-kind"
              className="entry-select"
              value={kind ?? ''}
              onChange={(e) => update({ kind: e.target.value })}
            >
              <option value="">Everything</option>
              {ENTITY_KINDS.filter((k) => entities.some((e) => e.kind === k)).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <p className="muted" role="status">
            {q.trim() === ''
              ? ofKind.length > shown.length
                ? `Showing the ${shown.length} newest of ${ofKind.length} entries. Search to find the rest.`
                : `${ofKind.length} ${ofKind.length === 1 ? 'entry' : 'entries'}`
              : shown.length >= 20
                ? 'The 20 best matches. Add more words to narrow it.'
                : `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}`}
          </p>
          {shown.length === 0 ? (
            <EmptyState
              title="Nothing matches that"
              sentence="Try fewer words, or a name you saved."
              primary={
                <Button variant="outline" onClick={() => update({ q: '', kind: '' })}>
                  Clear the search
                </Button>
              }
            />
          ) : (
            <ul className="entry-list" role="list">
              {shown.map((e) => (
                <li key={e.id}>
                  <Link to={`/c/${cid}/codex/${e.id}`}>
                    <strong>{e.title}</strong>
                    <span className="muted">
                      {KIND_LABELS[e.kind]}
                      {e.summary ? ` · ${e.summary}` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
