import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Clock, DockButton, Field, Tabs } from '..';

const TABS = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
];

describe('kit part 2', () => {
  it('Tabs exposes tablist/tab semantics and roving tabindex', () => {
    render(<Tabs tabs={TABS} value="b" onChange={() => {}} label="Sections" />);
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('Tabs moves focus and selection with arrows, Home and End', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} value="a" onChange={onChange} label="Sections" />);
    screen.getByRole('tab', { name: 'Alpha' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith('c');
    expect(screen.getByRole('tab', { name: 'Gamma' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('a');
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('c');
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('a');
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveFocus();
  });

  it('Tabs click selects', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} value="a" onChange={onChange} label="Sections" />);
    await userEvent.click(screen.getByRole('tab', { name: 'Gamma' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('Clock has an accessible name and clamps filled', () => {
    const { rerender } = render(<Clock segments={6} filled={3} label="The Tide Rises" />);
    expect(screen.getByRole('img', { name: 'The Tide Rises. Clock: 3 of 6' })).toBeInTheDocument();
    rerender(<Clock segments={6} filled={9} label="The Tide Rises" />);
    expect(screen.getByRole('img', { name: 'The Tide Rises. Clock: 6 of 6' })).toBeInTheDocument();
    rerender(<Clock segments={4} filled={-2} label="X" />);
    expect(screen.getByRole('img', { name: 'X. Clock: 0 of 4' })).toBeInTheDocument();
  });

  it('Clock without onTick has no button; with onTick it ticks', async () => {
    const { rerender } = render(<Clock segments={4} filled={1} label="X" />);
    expect(screen.queryByRole('button')).toBeNull();
    const onTick = vi.fn();
    rerender(<Clock segments={4} filled={1} label="X" onTick={onTick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tick +1' }));
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('Field binds a visible label to input or textarea', () => {
    const { rerender } = render(<Field label="Name" />);
    expect(screen.getByLabelText('Name').tagName).toBe('INPUT');
    rerender(<Field label="Notes" multiline hand />);
    const ta = screen.getByLabelText('Notes');
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta).toHaveClass('field__control--hand');
  });

  it('DockButton name equals label and click works', async () => {
    const onClick = vi.fn();
    render(<DockButton icon="npc" label="NPC" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'NPC' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('Field keeps label binding when caller passes an id', () => {
    render(<Field label="Custom" id="custom" />);
    const input = screen.getByLabelText('Custom');
    expect(input).toHaveAttribute('id', 'custom');
    expect(screen.getByText('Custom')).toHaveAttribute('for', 'custom');
  });

  it('Tabs falls back to first tab stop when value matches nothing', () => {
    render(<Tabs tabs={TABS} value="zzz" onChange={() => {}} label="S" />);
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it('Tabs ignores keys with modifiers', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} value="a" onChange={onChange} label="S" />);
    screen.getByRole('tab', { name: 'Alpha' }).focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}{Control>}{End}{/Control}{Meta>}{Home}{/Meta}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Clock coerces NaN to 0 and disables Tick when full', () => {
    const { rerender } = render(<Clock segments={4} filled={NaN} label="X" />);
    expect(screen.getByRole('img', { name: 'X. Clock: 0 of 4' })).toBeInTheDocument();
    rerender(<Clock segments={4} filled={4} label="X" onTick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Tick +1' })).toBeDisabled();
  });

  it('tokens.css light block also targets [data-theme=light]', () => {
    const css = readFileSync(resolve(__dirname, '../../styles/tokens.css'), 'utf8');
    expect(css).toMatch(/:root,\s*\[data-theme='light'\]\s*\{/);
  });

  it('stamp text is never faded with opacity (it dropped below 4.5:1 contrast)', () => {
    const css = readFileSync(resolve(__dirname, '../kit.css'), 'utf8');
    const rule = /\n\.stamp\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('border:');
    expect(rule).not.toMatch(/opacity/);
  });
});
