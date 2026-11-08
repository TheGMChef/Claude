import type { ReactNode } from 'react';

export function Highlight({ children, struck = false }: { children: ReactNode; struck?: boolean }) {
  return (
    <mark className={struck ? 'hl hl--struck' : 'hl'}>
      {children}
      {struck && <span className="visually-hidden"> (used)</span>}
    </mark>
  );
}
