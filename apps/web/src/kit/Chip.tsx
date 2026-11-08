import type { ReactNode } from 'react';

export interface ChipProps {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
}

export function Chip({ children, onRemove, removeLabel = 'Remove' }: ChipProps) {
  return (
    <span className="chip">
      <span className="chip__text">{children}</span>
      {onRemove && (
        <button
          type="button"
          className="chip__remove"
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
