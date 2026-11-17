import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useFocusTrap } from '../kit';
import { KIND_LABELS } from '../content/labels';
import { useCurrentCampaign, useDeps } from '../data/hooks';
import { listEntities } from '../data/repo/entities';
import { buildIndex, search } from '../data/search';
import type { Entity } from '../data/schema';
import { fold } from '../data/text';

type Hit = { key: string; label: string; hint: string; to: string };

/**
 * Quick find: Ctrl or Cmd + K from anywhere opens a box that finds Codex entries and jumps to the
 * main pages. Enter opens the first result. Escape closes and returns focus. React text only.
 */
export function QuickFind() {
  const { campaign } = useCurrentCampaign();
  const deps = useDeps();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [entities, setEntities] = useState<Entity[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (campaign) setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [campaign]);

  useEffect(() => {
    if (!open || !campaign) return;
    setQ('');
    let live = true;
    void listEntities(deps, campaign.id).then((list) => {
      if (live) setEntities(list);
    });
    return () => {
      live = false;
    };
  }, [open, campaign, deps]);

  useFocusTrap(panel, open, input);

  const hits = useMemo<Hit[]>(() => {
    if (!campaign) return [];
    const base = `/c/${campaign.id}`;
    const pages: Hit[] = [
      { key: 'p-forge', label: 'Forge', hint: 'Page', to: `${base}/forge` },
      { key: 'p-table', label: 'Table', hint: 'Page', to: `${base}/table` },
      { key: 'p-codex', label: 'Codex', hint: 'Page', to: `${base}/codex` },
      { key: 'p-new', label: 'New entry', hint: 'Action', to: `${base}/codex/new` },
      { key: 'p-settings', label: 'Settings', hint: 'Page', to: `${base}/settings` },
    ];
    const needle = fold(q.trim());
    const matchedPages =
      needle === '' ? pages : pages.filter((p) => fold(p.label).includes(needle));
    const found =
      needle === ''
        ? [...entities].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)
        : search(buildIndex(entities), q, { limit: 8 }).map((h) => h.entity);
    const entries: Hit[] = found.map((e) => ({
      key: e.id,
      label: e.title,
      hint: KIND_LABELS[e.kind],
      to: `${base}/codex/${e.id}`,
    }));
    return [...entries, ...matchedPages];
  }, [q, entities, campaign]);

  const close = () => setOpen(false);
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  if (!open || !campaign) return null;
  return createPortal(
    <div className="dialog-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={panel}
        className="dialog quickfind"
        role="dialog"
        aria-modal="true"
        aria-label="Quick find"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
      >
        <label className="field__label" htmlFor="quickfind-input">
          Find an entry or jump to a page
        </label>
        <input
          ref={input}
          id="quickfind-input"
          className="field__control"
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            const first = hits[0];
            if (e.key === 'Enter' && first) go(first.to);
          }}
          placeholder="a name, a place, or a page"
        />
        <ul className="entry-list" role="list">
          {hits.length === 0 ? (
            <li className="muted">Nothing matches that.</li>
          ) : (
            hits.map((h) => (
              <li key={h.key}>
                <a
                  href={h.to}
                  onClick={(e) => {
                    e.preventDefault();
                    go(h.to);
                  }}
                >
                  <strong>{h.label}</strong>
                  <span className="muted">{h.hint}</span>
                </a>
              </li>
            ))
          )}
        </ul>
        <p className="muted">Enter opens the first result. Escape closes.</p>
      </div>
    </div>,
    document.body,
  );
}
