import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { Button, Chip, DockButton, IconButton, Tabs } from '..';
import { UpdateChip } from '../../app/UpdateChip';
import { routes } from '../../app/routes';
import { ThemeProvider } from '../../app/ThemeProvider';

// R31: every pressable control is a raised rectangular "key"; no pill shapes anywhere.
const css = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const KIT = css('../kit.css');
const BASE = css('../../styles/base.css');
const TOKENS = css('../../styles/tokens.css');
const FORGE = css('../../dev/forge.css');

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(source: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(source);
  if (!m?.[1]) throw new Error(`no rule for ${selector}`);
  return m[1];
}

/** The body of a token block, found by its selector line. */
function block(start: string): string {
  const i = TOKENS.indexOf(start);
  if (i < 0) throw new Error(`no block ${start}`);
  return TOKENS.slice(i, TOKENS.indexOf('}', i));
}

describe('no pills (guard)', () => {
  it.each([
    ['kit.css', KIT],
    ['base.css', BASE],
    ['tokens.css', TOKENS],
    ['forge.css', FORGE],
  ])('%s has no 999px radius, --radius-pill or 50%% radius', (_, text) => {
    expect(text).not.toMatch(/999px/);
    expect(text).not.toMatch(/--radius-pill/);
    expect(text).not.toMatch(/border-radius:\s*50%/);
  });

  it('the old large-button radius token is gone and key radii exist', () => {
    expect(TOKENS).not.toMatch(/--radius-lg-btn/);
    expect(TOKENS).toMatch(/--radius-key:\s*10px/);
    expect(TOKENS).toMatch(/--radius-key-lg:\s*14px/);
    expect(TOKENS).toMatch(/--key-depth:\s*3px/);
    expect(TOKENS).toMatch(/--key-depth-lg:\s*4px/);
  });

  it.each([
    [":root,\n[data-theme='light']"],
    ["[data-theme='dark']"],
    [":root:not([data-theme='light'])"],
  ])('key edge colours are defined in the %s block', (start) => {
    const b = block(start);
    expect(b).toMatch(/--key-edge:/);
    expect(b).toMatch(/--key-edge-solid:/);
    expect(b).toMatch(/--key-face-hover:/);
    expect(b).toMatch(/--key-solid-hover:/);
  });
});

describe('key recipe (CSS text)', () => {
  it('press sinks the face by the depth with transform and collapses the hard edge', () => {
    const pressed = /\.key:active[^{]*\{([^}]*)\}/.exec(KIT)?.[1] ?? '';
    expect(pressed).toMatch(/transform:\s*translateY\(var\(--key-d\)\)/);
    expect(pressed).toMatch(/box-shadow:\s*0 0 0/);
    for (const sel of ['.is-pressed', "[aria-pressed='true']", "[aria-selected='true']"]) {
      expect(KIT).toContain(sel);
    }
    expect(BASE).toContain(".topbar__link[aria-current='page']");
  });

  it('only transform and box-shadow transition, on the 100ms motion token, and reduced motion turns it off', () => {
    expect(TOKENS).toMatch(/--motion-100:\s*100ms/);
    expect(KIT).toMatch(
      /transition:\s*\n?\s*transform var\(--motion-100\) ease-out,\s*\n?\s*box-shadow var\(--motion-100\) ease-out/,
    );
    expect(KIT).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^@]*\.btn[^@]*transition:\s*none/);
  });

  it('forced colours give keys a real border', () => {
    expect(KIT).toMatch(/forced-colors: active\)\s*\{[^@]*border:\s*1px solid ButtonText/);
  });

  it('chip body is a flat tag and the update notice is a card', () => {
    const chip = rule(KIT, '.chip');
    expect(chip).toMatch(/border-radius:\s*var\(--radius-tag\)/);
    expect(chip).not.toMatch(/box-shadow/);
    const notice = rule(KIT, '.update-chip');
    expect(notice).toMatch(/border-radius:\s*var\(--radius-panel\)/);
    expect(notice).toMatch(/box-shadow/);
  });
});

describe('key components', () => {
  it('Button rings follow the key radius, never a pill', () => {
    render(
      <>
        <Button variant="outline">Md</Button>
        <Button variant="dashed" size="lg">
          Lg
        </Button>
      </>,
    );
    const ring = (n: string) =>
      screen.getByRole('button', { name: n }).querySelector<HTMLElement>('.ink-outline');
    expect(ring('Md')?.style.borderRadius).toBe('var(--radius-key)');
    expect(ring('Lg')?.style.borderRadius).toBe('var(--radius-key-lg)');
  });

  it('IconButton is a ringed key and keeps its accessible name', () => {
    render(<IconButton icon="dice" label="Roll again" />);
    const btn = screen.getByRole('button', { name: 'Roll again' });
    expect(btn).toHaveClass('icon-btn');
    expect(btn.querySelector<HTMLElement>('.ink-outline')?.style.borderRadius).toBe(
      'var(--radius-key)',
    );
  });

  it('DockButton ring uses the large key radius', () => {
    render(<DockButton icon="npc" label="NPC" />);
    const ring = screen
      .getByRole('button', { name: 'NPC' })
      .querySelector<HTMLElement>('.ink-outline');
    expect(ring?.style.borderRadius).toBe('var(--radius-key-lg)');
  });

  it('Tabs are ringed keys; the selected one is aria-selected (pressed in)', () => {
    render(
      <Tabs
        tabs={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
        value="b"
        onChange={() => {}}
        label="S"
      />,
    );
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.querySelector('.ink-outline')).not.toBeNull();
    }
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Chip body is not a button; its remove key keeps its name', () => {
    render(
      <Chip onRemove={() => {}} removeLabel="Remove Tobren">
        Tobren
      </Chip>,
    );
    const body = screen.getByText('Tobren').closest('.chip');
    expect(body?.tagName).toBe('SPAN');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Remove Tobren' })).toHaveClass('chip__remove');
  });

  it('UpdateChip is a card container whose controls are shared keys', () => {
    render(<UpdateChip needRefresh onReload={vi.fn()} onDismiss={vi.fn()} />);
    const status = screen.getByRole('status');
    expect(status).toHaveClass('update-chip');
    expect(screen.getByRole('button', { name: 'Reload' })).toHaveClass('btn');
    expect(screen.getByRole('button', { name: 'Dismiss update notice' })).toHaveClass('icon-btn');
  });

  it('TopBar nav links and Menu are ringed keys', () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/prep'] });
    render(
      <ThemeProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </ThemeProvider>,
    );
    const nav = screen.getByRole('navigation', { name: 'Modes' });
    const links = nav.querySelectorAll('.topbar__link');
    expect(links.length).toBe(4);
    for (const a of links) expect(a.querySelector('.ink-outline')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Prep' })).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('button', { name: 'Menu' }).querySelector('.ink-outline'),
    ).not.toBeNull();
  });
});
