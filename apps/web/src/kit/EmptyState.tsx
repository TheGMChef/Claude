import { useId } from 'react';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  sentence: string;
  primary: ReactNode;
  secondary?: ReactNode;
}

/** A zero state is never a dead end: what belongs here, why, and one obvious key. No illustration. */
export function EmptyState({ title, sentence, primary, secondary }: EmptyStateProps) {
  const id = useId();
  return (
    <section className="empty-state" aria-labelledby={id}>
      <h2 id={id} className="empty-state__title">
        {title}
      </h2>
      <p className="empty-state__sentence">{sentence}</p>
      <div className="empty-state__actions">
        {primary}
        {secondary ? <span className="empty-state__secondary">{secondary}</span> : null}
      </div>
    </section>
  );
}
