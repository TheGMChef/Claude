import type { ElementType, ReactNode } from 'react';
import { InkOutline } from './InkOutline';

export interface CardProps {
  variant?: 'plain' | 'ruled' | 'taped';
  tilt?: number;
  as?: ElementType;
  children?: ReactNode;
}

export function Card({ variant = 'plain', tilt = 0, as: Tag = 'article', children }: CardProps) {
  const t = Math.max(-1, Math.min(1, tilt));
  return (
    <Tag
      className={`card card--${variant}`}
      style={t === 0 ? undefined : { transform: `rotate(${t}deg)` }}
    >
      <InkOutline radius={4} />
      {variant === 'taped' && <span className="card__tape" aria-hidden="true" />}
      {children}
    </Tag>
  );
}
