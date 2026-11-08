import type { ReactNode } from 'react';

export type ChipProps = { children: ReactNode } & (
  { onRemove?: undefined; removeLabel?: undefined } | { onRemove: () => void; removeLabel: string }
);

export function Chip({ children, onRemove, removeLabel }: ChipProps) {
  return (
    <span className="chip">
      <span className="chip__text">{children}</span>
      {onRemove && (
        <button
          type="button"
          className="key chip__remove"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={onRemove}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </span>
  );
}
