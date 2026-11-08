import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useTooltip } from './Tooltip';

export type ChipProps = { children: ReactNode } & (
  { onRemove?: undefined; removeLabel?: undefined } | { onRemove: () => void; removeLabel: string }
);

export function Chip({ children, onRemove, removeLabel }: ChipProps) {
  const removeRef = useRef<HTMLButtonElement>(null);
  const { triggerProps, tip } = useTooltip(removeLabel ?? '', removeRef);
  return (
    <span className="chip">
      <span className="chip__text">{children}</span>
      {onRemove && (
        <button
          ref={removeRef}
          type="button"
          className="key chip__remove"
          aria-label={removeLabel}
          onClick={onRemove}
          {...triggerProps}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
      {tip}
    </span>
  );
}
