import type { ElementType, ReactNode } from 'react';

export function SectionLabel({
  children,
  as: Tag = 'span',
}: {
  children: ReactNode;
  as?: ElementType;
}) {
  return <Tag className="section-label">{children}</Tag>;
}
