import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chip, IconButton } from '..';

// jsdom has no PointerEvent, so build the event and give it a pointerType by hand.
function pointer(el: Element, type: 'pointerover' | 'pointerout', pointerType: string) {
  const ev = new Event(type, { bubbles: true });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  fireEvent(el, ev);
}

// ux-audit icon-buttons: a native title is not a tooltip. Every icon-only key has a real one.
describe('icon key tooltips', () => {
  it('shows the label on mouse hover, links it by aria-describedby, and hides on leave', () => {
    render(<IconButton icon="copy" label="Copy share code" />);
    const btn = screen.getByRole('button', { name: 'Copy share code' });
    expect(btn).not.toHaveAttribute('title');
    expect(screen.queryByRole('tooltip')).toBeNull();
    pointer(btn, 'pointerover', 'mouse');
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Copy share code');
    expect(btn).toHaveAttribute('aria-describedby', tip.id);
    pointer(btn, 'pointerout', 'mouse');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('does not pop on a touch tap', () => {
    render(<IconButton icon="copy" label="Copy share code" />);
    pointer(screen.getByRole('button'), 'pointerover', 'touch');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows on keyboard focus, Escape dismisses it, blur hides it', async () => {
    const user = userEvent.setup();
    render(<IconButton icon="dice" label="Roll again" />);
    await user.tab();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Roll again');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.tab();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('the chip remove key has one too', async () => {
    const user = userEvent.setup();
    render(
      <Chip onRemove={() => {}} removeLabel="Remove Tobren">
        Tobren
      </Chip>,
    );
    await user.tab();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Remove Tobren');
  });
});
