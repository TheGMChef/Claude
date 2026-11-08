export interface InkOutlineProps {
  /** px, or a CSS length such as `var(--radius-key)` so the ring tracks its key */
  radius?: number | string;
  dashed?: boolean;
}

export function InkOutline({ radius = 4, dashed = false }: InkOutlineProps) {
  return (
    <span
      className={dashed ? 'ink-outline ink-outline--dashed' : 'ink-outline'}
      aria-hidden="true"
      style={{ borderRadius: radius }}
    />
  );
}
