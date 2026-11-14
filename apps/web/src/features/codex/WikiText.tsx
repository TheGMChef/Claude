import { useMemo } from 'react';
import { Link } from 'react-router';
import { makeResolver, parseWiki } from '../../data/wiki';
import type { Entity } from '../../data/schema';

/**
 * Renders text with [[wiki links]] as React nodes only (never HTML). A link that matches an entry
 * goes to it; one that doesn't shows a Create key that opens the create form with that title.
 */
export function WikiText({
  text,
  entities,
  cid,
  selfId,
}: {
  text: string;
  entities: readonly Entity[];
  cid: string;
  selfId?: string;
}) {
  const resolve = useMemo(() => makeResolver(entities), [entities]);
  const parts = useMemo(() => parseWiki(text), [text]);
  return (
    <>
      {parts.map((p, i) => {
        if ('text' in p) return <span key={i}>{p.text}</span>;
        const hit = resolve(p.target, selfId);
        if (hit) {
          return (
            <Link key={i} to={`/c/${cid}/codex/${hit.id}`}>
              {p.shown}
            </Link>
          );
        }
        const from = selfId ? `&from=${encodeURIComponent(selfId)}` : '';
        return (
          <span key={i}>
            {p.shown}{' '}
            <Link
              className="textlink"
              to={`/c/${cid}/codex/new?title=${encodeURIComponent(p.target)}${from}`}
            >
              Create “{p.target}”
            </Link>
          </span>
        );
      })}
    </>
  );
}
