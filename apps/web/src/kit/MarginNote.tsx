import type { ReactNode } from 'react';

export interface MarginNoteProps {
  children: ReactNode;
  arrow?: 'right' | 'left';
}

export function MarginNote({ children, arrow }: MarginNoteProps) {
  return (
    <span className="margin-note">
      {arrow === 'left' && <span aria-hidden="true">← </span>}
      {children}
      {arrow === 'right' && <span aria-hidden="true"> →</span>}
    </span>
  );
}
