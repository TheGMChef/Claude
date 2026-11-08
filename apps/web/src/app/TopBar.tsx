import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { MODES } from './modes';
import { useTheme } from './ThemeProvider';
import type { ThemeChoice } from './theme';

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };

export function TopBar() {
  const [open, setOpen] = useState(false);
  const { choice, setChoice } = useTheme();
  return (
    <header className="topbar">
      <Link to="/" className="topbar__wordmark">
        Prep Desk
      </Link>
      <button
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
      <button
        type="button"
        className="topbar__theme"
        aria-label={`Theme: ${choice}. Switch to ${NEXT[choice]}`}
        onClick={() => setChoice(NEXT[choice])}
      >
        {choice === 'dark' ? 'Night' : choice === 'light' ? 'Day' : 'Auto'}
      </button>
    </header>
  );
}
