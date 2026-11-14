// Page pattern: 3, Form (page) for both create and edit.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, Field } from '../../kit';
import { FIELDS_BY_KIND, fieldLabel } from '../../content/fields';
import { KIND_LABELS } from '../../content/labels';
import { useDeps, useLive } from '../../data/hooks';
import { RepoError } from '../../data/deps';
import {
  LIMITS,
  createEntity,
  findDuplicateTitle,
  getEntity,
  updateEntity,
} from '../../data/repo/entities';
import { ENTITY_KINDS, SUBTYPES_BY_KIND } from '../../data/schema';
import type { Entity, EntityKind } from '../../data/schema';
import { useDirtyBlocker } from '../../app/useDirtyBlocker';
import { NotFound } from '../../app/NotFound';
import { Skeleton } from '../../app/Skeleton';
import '../pages.css';

type Values = { title: string; summary: string; body: string; fields: Record<string, string> };

const EMPTY: Values = { title: '', summary: '', body: '', fields: {} };

function EntryFormView({
  cid,
  mode,
  entity,
  initial,
  from,
}: {
  cid: string;
  mode: 'create' | 'edit';
  entity?: Entity;
  initial: Values;
  from?: string;
}) {
  const deps = useDeps();
  const navigate = useNavigate();
  const [kind, setKind] = useState<EntityKind>(entity?.kind ?? 'note');
  const [subtype, setSubtype] = useState<string | undefined>(entity?.subtype);
  const [values, setValues] = useState<Values>(initial);
  const [error, setError] = useState('');
  const [dupe, setDupe] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [next, setNext] = useState<string | undefined>();

  const keys = useMemo(() => {
    const base = FIELDS_BY_KIND(kind, subtype);
    // An entry saved from the Forge may carry fields the form doesn't list: keep them editable.
    const extra = Object.keys(values.fields).filter((k) => !base.includes(k));
    return [...base, ...extra];
  }, [kind, subtype, values.fields]);

  const dirty =
    !done &&
    (values.title !== initial.title ||
      values.summary !== initial.summary ||
      values.body !== initial.body ||
      keys.some((k) => (values.fields[k] ?? '') !== (initial.fields[k] ?? '')));
  const guard = useDirtyBlocker(dirty, { title: 'Leave without saving?', leave: 'Leave page' });

  useEffect(() => {
    if (done && next) navigate(next);
  }, [done, next, navigate]);

  // D56: a duplicate title is allowed, with a warning.
  useEffect(() => {
    const t = values.title.trim();
    if (t === '' || (entity && t === entity.title)) {
      setDupe('');
      return;
    }
    let live = true;
    void findDuplicateTitle(deps, cid, t, entity?.id).then((hit) => {
      if (live) setDupe(hit ? `You already have “${hit.title}”. Links go to the older one.` : '');
    });
    return () => {
      live = false;
    };
  }, [values.title, deps, cid, entity]);

  const setField = (key: string, v: string) =>
    setValues((s) => ({ ...s, fields: { ...s.fields, [key]: v } }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const fields: Record<string, string> = {};
      for (const k of keys) if ((values.fields[k] ?? '') !== '') fields[k] = values.fields[k] ?? '';
      let saved: Entity;
      if (mode === 'edit' && entity) {
        // Send only what changed: never overwrite what another tab or the Forge saved meanwhile.
        const patch: Parameters<typeof updateEntity>[2] = {};
        if (values.title !== initial.title) patch.title = values.title;
        if (values.summary !== initial.summary) patch.summary = values.summary;
        if (values.body !== initial.body) patch.body = values.body;
        const changed = keys.some((k) => (values.fields[k] ?? '') !== (initial.fields[k] ?? ''));
        if (changed)
          patch.fields = { ...entity.fields, ...fields, ...blanked(keys, values, entity) };
        saved = await updateEntity(deps, entity.id, patch);
      } else {
        saved = await createEntity(deps, cid, {
          kind,
          ...(subtype !== undefined ? { subtype } : {}),
          title: values.title,
          summary: values.summary,
          body: values.body,
          fields,
          origin: 'manual',
        });
      }
      // Created from a wiki link: return to the entry you came from. Navigate after the render
      // that clears `dirty`, or the unsaved-changes guard would stop us.
      setNext(`/c/${cid}/codex/${from && mode === 'create' ? from : saved.id}`);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof RepoError ? err.message : "We couldn't save that. Try again in a moment.",
      );
      setSaving(false);
    }
  }

  return (
    <main className="page" id="main">
      <h1 className="page__title">{mode === 'create' ? 'Create an entry' : 'Edit entry'}</h1>
      <form className="stack" onSubmit={submit} noValidate>
        {mode === 'create' ? (
          <div className="field">
            <label className="field__label" htmlFor="entry-kind">
              Kind
            </label>
            <select
              id="entry-kind"
              className="entry-select"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as EntityKind);
                setSubtype(undefined);
              }}
            >
              {ENTITY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {mode === 'create' && SUBTYPES_BY_KIND[kind] ? (
          <div className="field">
            <label className="field__label" htmlFor="entry-subtype">
              Type
            </label>
            <select
              id="entry-subtype"
              className="entry-select"
              value={subtype ?? ''}
              onChange={(e) => setSubtype(e.target.value || undefined)}
            >
              <option value="">Any</option>
              {SUBTYPES_BY_KIND[kind]?.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Field
          label="Title"
          value={values.title}
          onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))}
          maxLength={LIMITS.title}
          autoComplete="off"
          required
        />
        {dupe ? (
          <p role="status" className="muted">
            {dupe}
          </p>
        ) : null}
        <Field
          label="Summary"
          value={values.summary}
          onChange={(e) => setValues((s) => ({ ...s, summary: e.target.value }))}
          maxLength={LIMITS.text}
        />
        {keys.map((k) => (
          <Field
            key={k}
            multiline
            label={fieldLabel(k)}
            value={values.fields[k] ?? ''}
            onChange={(e) => setField(k, e.target.value)}
            maxLength={LIMITS.text}
          />
        ))}
        <Field
          multiline
          label="Notes"
          value={values.body}
          onChange={(e) => setValues((s) => ({ ...s, body: e.target.value }))}
          maxLength={LIMITS.body}
          rows={6}
        />
        <p className="muted">Link entries with [[double brackets]], for example [[Odrin Vey]].</p>
        {error ? (
          <p role="alert" className="pg-error">
            {error}
          </p>
        ) : null}
        <div className="row">
          <Button type="submit" disabled={saving || values.title.trim() === ''}>
            {mode === 'create' ? 'Create entry' : 'Save changes'}
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
      {guard}
    </main>
  );
}

/** Fields the DM emptied: kept as empty strings only if they existed, so they can be cleared. */
function blanked(keys: string[], values: Values, entity: Entity): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    if ((values.fields[k] ?? '') === '' && k in entity.fields) out[k] = '';
  }
  return out;
}

export function CreateEntryPage() {
  const { cid = '' } = useParams();
  const [params] = useSearchParams();
  const initial: Values = { ...EMPTY, title: (params.get('title') ?? '').slice(0, LIMITS.title) };
  const from = params.get('from') ?? undefined;
  return (
    <EntryFormView
      cid={cid}
      mode="create"
      initial={initial}
      {...(from !== undefined ? { from } : {})}
    />
  );
}

export function EditEntryPage() {
  const { cid = '', eid = '' } = useParams();
  const deps = useDeps();
  const found = useLive(async () => ({ entity: await getEntity(deps, eid) }), [deps, eid]);
  if (!found) return <Skeleton />;
  const entity = found.entity;
  if (!entity || entity.campaignId !== cid) return <NotFound what="entry" />;
  return (
    <EntryFormView
      key={entity.id}
      cid={cid}
      mode="edit"
      entity={entity}
      initial={{
        title: entity.title,
        summary: entity.summary,
        body: entity.body,
        fields: { ...entity.fields },
      }}
    />
  );
}
