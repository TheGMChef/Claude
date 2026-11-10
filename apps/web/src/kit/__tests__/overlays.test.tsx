import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, EmptyState, Pagination, Button, Icon } from '..';

const css = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

function Harness(props: { tone?: 'destructive'; onConfirm?: () => void; onCancel?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      <Dialog
        open={open}
        title="Delete entry 'Mira'?"
        confirmLabel="Delete entry"
        tone={props.tone}
        onConfirm={() => {
          props.onConfirm?.();
          setOpen(false);
        }}
        onCancel={() => {
          props.onCancel?.();
          setOpen(false);
        }}
      >
        <p>This removes Mira for good.</p>
        <a href="#x">A link</a>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a modal dialog labelled by its h2 title and described by its body', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    const dlg = screen.getByRole('dialog', { name: "Delete entry 'Mira'?" });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent("Delete entry 'Mira'?");
    expect(dlg).toHaveAccessibleDescription(/removes Mira/);
  });

  it('puts the default focus on Cancel', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('traps Tab and Shift+Tab inside', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    const dlg = screen.getByRole('dialog');
    const seen = new Set<Element>();
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dlg.contains(document.activeElement)).toBe(true);
      seen.add(document.activeElement!);
    }
    expect(seen.size).toBe(3); // link, Cancel, confirm
    for (let i = 0; i < 8; i++) {
      await user.tab({ shift: true });
      expect(dlg.contains(document.activeElement)).toBe(true);
    }
  });

  it('Escape cancels without confirming and returns focus to the opener', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('Cancel button cancels and returns focus; confirm confirms', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onConfirm={onConfirm} onCancel={onCancel} />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(opener).toHaveFocus();
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('uses a custom cancel label', async () => {
    render(
      <Dialog
        open
        title="T"
        confirmLabel="Leave page"
        cancelLabel="Keep editing"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        x
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  });

  it('marks the destructive confirm only when tone is destructive', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness tone="destructive" />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    expect(screen.getByRole('button', { name: 'Delete entry' })).toHaveClass('btn--destructive');
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toHaveClass('btn--destructive');
    unmount();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    expect(screen.getByRole('button', { name: 'Delete entry' })).not.toHaveClass(
      'btn--destructive',
    );
  });

  it('locks page scroll while open and unlocks on close and on unmount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    expect(document.body).not.toHaveClass('scroll-locked');
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    expect(document.body).toHaveClass('scroll-locked');
    await user.keyboard('{Escape}');
    expect(document.body).not.toHaveClass('scroll-locked');
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    expect(document.body).toHaveClass('scroll-locked');
    unmount();
    expect(document.body).not.toHaveClass('scroll-locked');
  });

  it('does not close on a scrim click', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    await user.click(document.querySelector('.dialog-scrim')!);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Dialog css', () => {
  const KIT = css('../kit.css');
  const TOKENS = css('../../styles/tokens.css');
  it('uses the dialog layer token and a scrim token in light and dark', () => {
    expect(TOKENS).toMatch(/--z-dialog:\s*60/);
    expect(TOKENS.match(/--scrim:/g)?.length).toBe(3);
    expect(KIT).toMatch(/z-index:\s*var\(--z-dialog\)/);
    expect(KIT).toMatch(/background:\s*var\(--scrim\)/);
  });
  it('only animates under no-preference and has no raw hex', () => {
    const dlg = KIT.slice(KIT.indexOf('/* Dialog: '));
    expect(dlg).toMatch(/@media \(prefers-reduced-motion: no-preference\)[^{]*\{[^]*dialog-in/);
    expect(dlg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('EmptyState css', () => {
  it('stretches a secondary link to a 44px target itself, not just its wrapper', () => {
    const KIT = css('../kit.css');
    expect(KIT).toMatch(/\.empty-state__secondary > \*\s*\{[^}]*min-height:\s*44px/);
  });
});

describe('EmptyState', () => {
  it('renders an h2, the sentence and both CTAs, in a labelled section', () => {
    render(
      <EmptyState
        title="No entries yet"
        sentence="Entries keep your people and places in one place."
        primary={<Button>Create entry</Button>}
        secondary={<a href="#r">Restore from backup</a>}
      />,
    );
    const region = screen.getByRole('region', { name: 'No entries yet' });
    expect(region).toHaveTextContent('Entries keep your people');
    expect(screen.getByRole('heading', { level: 2, name: 'No entries yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create entry' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Restore from backup' })).toBeInTheDocument();
    expect(region.querySelector('img, svg')).toBeNull();
  });
  it('omits the secondary slot when absent', () => {
    const { container } = render(
      <EmptyState title="T" sentence="S" primary={<Button>Go</Button>} />,
    );
    expect(container.querySelector('.empty-state__secondary')).toBeNull();
  });
});

describe('Pagination', () => {
  it('on page 1 Previous is disabled but readable; Next calls onPage(2)', async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    render(<Pagination page={1} pageSize={50} total={312} onPage={onPage} label="Codex pages" />);
    const nav = screen.getByRole('navigation', { name: 'Codex pages' });
    expect(nav).toHaveTextContent('Page 1 of 7 · 312 entries');
    const prev = screen.getByRole('button', { name: 'Previous' });
    expect(prev).toBeDisabled();
    expect(prev).toHaveTextContent('Previous');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
  it('Previous goes back and Next is disabled on the last page', async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    render(<Pagination page={7} pageSize={50} total={312} onPage={onPage} label="p" />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenCalledWith(6);
  });
  it('total 0 reads Page 1 of 1 · 0 entries; singular for 1', () => {
    const { rerender } = render(
      <Pagination page={1} pageSize={50} total={0} onPage={() => {}} label="p" />,
    );
    expect(screen.getByRole('navigation')).toHaveTextContent('Page 1 of 1 · 0 entries');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    rerender(<Pagination page={1} pageSize={50} total={1} onPage={() => {}} label="p" />);
    expect(screen.getByRole('navigation')).toHaveTextContent('Page 1 of 1 · 1 entry');
  });
});

describe('new icons', () => {
  it.each(['plus', 'restore', 'search'] as const)('%s draws a path', (name) => {
    const { container } = render(<Icon name={name} />);
    expect(container.querySelector('path')?.getAttribute('d')?.length).toBeGreaterThan(10);
  });
});
