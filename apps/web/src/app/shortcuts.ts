import { useEffect, useRef } from 'react';
import { useSetting } from '../data/hooks';

const TYPING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/**
 * A single-key shortcut (M-D11). It stays quiet while typing, while a modal dialog is open, with a
 * modifier held, and when the device setting "Single-key shortcuts" is off (WCAG 2.1.4). While the
 * setting is still loading it stays off, so a DM who turned it off never sees one fire.
 */
export function useShortcut(key: string, handler: () => void): void {
  const { value } = useSetting('singleKeyShortcuts');
  const enabled = value === true;
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== key || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(TYPING)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      latest.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, key]);
}
