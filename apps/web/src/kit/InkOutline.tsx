export interface InkOutlineProps {
  radius?: number;
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
