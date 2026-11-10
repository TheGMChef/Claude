import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router';
import { IconButton, InkOutline } from '../kit';
import type { IconName } from '../kit';
import { useCurrentCampaign } from '../data/hooks';
import { MODES, SETTINGS_MODE } from './modes';
import { useTheme } from './ThemeProvider';
import type { ThemeChoice } from './theme';

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const ICON: Record<ThemeChoice, IconName> = { system: 'auto', light: 'sun', dark: 'moon' };
const WORD: Record<ThemeChoice, string> = { system: 'Auto', light: 'Day', dark: 'Night' };

export function TopBar() {
  const [open, setOpen] = useState(false);
  const { choice, setChoice } = useTheme();
  const { campaign } = useCurrentCampaign();
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
      {campaign ? (
        <>
          <button
            ref={menuRef}
            type="button"
            className="key topbar__menu"
            aria-expanded={open}
            aria-controls="topbar-modes"
            onClick={() => setOpen((o) => !o)}
          >
            <InkOutline radius="var(--radius-key)" />
            Menu
          </button>
          <nav id="topbar-modes" className="topbar__nav" data-open={open} aria-label="Campaign">
            {[...MODES, SETTINGS_MODE].map((m) => (
              <NavLink
                key={m.path}
                to={`/c/${campaign.id}/${m.path}`}
                className="key topbar__link"
                onClick={() => setOpen(false)}
              >
                <InkOutline radius="var(--radius-key)" />
                {m.title}
              </NavLink>
            ))}
          </nav>
        </>
      ) : null}
      <IconButton
        className="topbar__theme"
        icon={ICON[choice]}
        label={`Switch to ${WORD[NEXT[choice]]} theme`}
        onClick={() => setChoice(NEXT[choice])}
      />
    </header>
  );
}
