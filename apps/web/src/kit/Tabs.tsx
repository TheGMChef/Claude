import { useRef } from 'react';
import type { KeyboardEvent } from 'react';

export interface TabsProps {
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}

export function Tabs({ tabs, value, onChange, label }: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const hasSelected = tabs.some((t) => t.id === value);

  const select = (index: number) => {
    const tab = tabs[index];
    if (!tab) return;
    refs.current[index]?.focus();
    onChange(tab.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const last = tabs.length - 1;
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    e.preventDefault();
    select(next);
  };

  return (
    <div role="tablist" aria-label={label} className="tabs">
      {tabs.map((t, i) => {
        const selected = t.id === value;
        const stop = hasSelected ? selected : i === 0;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={stop ? 0 : -1}
            className={selected ? 'tabs__tab tabs__tab--active' : 'tabs__tab'}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
