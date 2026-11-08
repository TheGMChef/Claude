import type { ReactNode } from 'react';

export interface StampProps {
  children: ReactNode;
  tone?: 'stamp' | 'pencil';
  rotate?: number;
}

export function Stamp({ children, tone = 'stamp', rotate = 7 }: StampProps) {
  return (
    <span className={`stamp stamp--${tone}`} style={{ transform: `rotate(${rotate}deg)` }}>
      {children}
    </span>
  );
}
