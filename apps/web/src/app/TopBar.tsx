import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { IconButton } from '../kit';
import { MODES } from './modes';
import { useTheme } from './ThemeProvider';
import type { ThemeChoice } from './theme';

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const WORD: Record<ThemeChoice, string> = { system: 'Auto', light: 'Day', dark: 'Night' };

export function TopBar() {
  const [open, setOpen] = useState(false);
  const { choice, setChoice } = useTheme();
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        menuRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <header className="topbar">
      <Link to="/" className="topbar__wordmark">
        Prep Desk
      </Link>
      <button
        ref={menuRef}
        type="button"
        className="topbar__menu"
        aria-expanded={open}
        aria-controls="topbar-modes"
        onClick={() => setOpen((o) => !o)}
      >
        Menu
      </button>
      <nav id="topbar-modes" className="topbar__nav" data-open={open} aria-label="Modes">
        {MODES.map((m) => (
          <NavLink key={m.path} to={m.path} className="topbar__link" onClick={() => setOpen(false)}>
            {m.title}
          </NavLink>
        ))}
      </nav>
      <IconButton
        className="topbar__theme"
        icon={choice === 'dark' ? 'moon' : 'sun'}
        label={`Theme: ${WORD[choice]} — switch to ${WORD[NEXT[choice]]}`}
        onClick={() => setChoice(NEXT[choice])}
      />
    </header>
  );
}
