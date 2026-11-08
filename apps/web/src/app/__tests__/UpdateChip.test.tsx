import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateChip } from '../UpdateChip';

describe('UpdateChip', () => {
  it('renders nothing when no update is waiting', () => {
    const { container } = render(
      <UpdateChip needRefresh={false} onReload={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('announces that an update is ready', () => {
    render(<UpdateChip needRefresh onReload={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Update ready');
  });

  it('never reloads on mount', () => {
    const onReload = vi.fn();
    render(<UpdateChip needRefresh onReload={onReload} onDismiss={vi.fn()} />);
    expect(onReload).not.toHaveBeenCalled();
  });

  it('calls onReload exactly once when Reload is pressed', async () => {
    const onReload = vi.fn();
    render(<UpdateChip needRefresh onReload={onReload} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss, not onReload, from the dismiss button', async () => {
    const onReload = vi.fn();
    const onDismiss = vi.fn();
    render(<UpdateChip needRefresh onReload={onReload} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss update notice' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
  });
});
