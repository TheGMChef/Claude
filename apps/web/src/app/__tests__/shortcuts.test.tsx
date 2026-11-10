import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DbProvider } from '../../data/hooks';
import { createDb } from '../../data/db';
import { setSetting } from '../../data/repo/settings';
import { liveDeps } from '../../data/deps';
import { useShortcut } from '../shortcuts';

function Probe({ handler }: { handler: () => void }) {
  useShortcut('/', handler);
  return (
    <div>
      <input aria-label="Field" />
      <textarea aria-label="Area" />
      <select aria-label="Pick">
        <option>a</option>
      </select>
      <div contentEditable suppressContentEditableWarning aria-label="Rich" />
    </div>
  );
}

let n = 0;
async function setup(single?: boolean) {
  const db = createDb(`sc-${++n}-${Math.random()}`);
  await db.open();
  if (single !== undefined) await setSetting(liveDeps(db), 'singleKeyShortcuts', single);
  const handler = vi.fn();
  render(
    <DbProvider db={db}>
      <Probe handler={handler} />
    </DbProvider>,
  );
  // let the live setting resolve
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  return handler;
}

describe('useShortcut (M-D11, WCAG 2.1.4)', () => {
  it('fires on / from the body', async () => {
    const handler = await setup();
    await userEvent.keyboard('/');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each(['Field', 'Area', 'Pick'])('does not fire from inside %s', async (label) => {
    const handler = await setup();
    await userEvent.click(screen.getByLabelText(label));
    await userEvent.keyboard('/');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not fire from a contenteditable', async () => {
    const handler = await setup();
    const rich = screen.getByLabelText('Rich');
    rich.focus();
    await userEvent.keyboard('/');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not fire while an aria-modal dialog is open', async () => {
    const handler = await setup();
    const dlg = document.createElement('div');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    document.body.append(dlg);
    await userEvent.keyboard('/');
    expect(handler).not.toHaveBeenCalled();
    dlg.remove();
    await userEvent.keyboard('/');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire with singleKeyShortcuts off', async () => {
    const handler = await setup(false);
    await userEvent.keyboard('/');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not fire with a modifier held', async () => {
    const handler = await setup();
    await userEvent.keyboard('{Control>}/{/Control}');
    expect(handler).not.toHaveBeenCalled();
  });
});
