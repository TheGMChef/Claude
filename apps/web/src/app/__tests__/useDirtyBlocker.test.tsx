import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { useDirtyBlocker } from '../useDirtyBlocker';

function Form({ dirty }: { dirty: boolean }) {
  const dialog = useDirtyBlocker(dirty, {
    title: 'Leave without saving this entry?',
    leave: 'Leave page',
  });
  return (
    <main>
      <h1>Form</h1>
      <Link to="/other">Go elsewhere</Link>
      {dialog}
    </main>
  );
}

function setup(dirty: boolean) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Form dirty={dirty} /> },
      { path: '/other', element: <h1>Other</h1> },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

/** Counts beforeunload listeners by spying on add/removeEventListener. */
function spyBeforeUnload() {
  let count = 0;
  const add = window.addEventListener.bind(window);
  const rem = window.removeEventListener.bind(window);
  window.addEventListener = ((t: string, ...a: unknown[]) => {
    if (t === 'beforeunload') count++;
    return (add as (...x: unknown[]) => void)(t, ...a);
  }) as typeof window.addEventListener;
  window.removeEventListener = ((t: string, ...a: unknown[]) => {
    if (t === 'beforeunload') count--;
    return (rem as (...x: unknown[]) => void)(t, ...a);
  }) as typeof window.removeEventListener;
  return {
    count: () => count,
    restore: () => {
      window.addEventListener = add;
      window.removeEventListener = rem;
    },
  };
}

describe('useDirtyBlocker', () => {
  it('shows the Dialog when dirty and a link is clicked, staying put', async () => {
    const user = userEvent.setup();
    const router = setup(true);
    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    expect(screen.getByRole('dialog', { name: 'Leave without saving this entry?' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Leave page' })).not.toHaveClass('btn--destructive');
  });

  it('Escape keeps editing', async () => {
    const user = userEvent.setup();
    const router = setup(true);
    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { name: 'Form' })).toBeInTheDocument();
  });

  it('Leave page navigates', async () => {
    const user = userEvent.setup();
    const router = setup(true);
    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    await user.click(screen.getByRole('button', { name: 'Leave page' }));
    expect(router.state.location.pathname).toBe('/other');
    expect(await screen.findByRole('heading', { name: 'Other' })).toBeInTheDocument();
  });

  it('navigates with no Dialog when clean', async () => {
    const user = userEvent.setup();
    const router = setup(false);
    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/other');
  });

  it('has a beforeunload listener only while dirty', async () => {
    const spy = spyBeforeUnload();
    try {
      const { rerender } = renderDirty(true);
      expect(spy.count()).toBe(1);
      rerender(false);
      expect(spy.count()).toBe(0);
      rerender(true);
      expect(spy.count()).toBe(1);
    } finally {
      spy.restore();
    }
  });

  it('the beforeunload handler prevents default', () => {
    const { unmount } = renderDirty(true);
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    unmount();
    const ev2 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
  });
});

function renderDirty(initial: boolean) {
  let set: (v: boolean) => void = () => {};
  function Wrapper() {
    const [d, setD] = useState(initial);
    set = setD;
    return <Form dirty={d} />;
  }
  const router = createMemoryRouter([{ path: '/', element: <Wrapper /> }]);
  const r = render(<RouterProvider router={router} />);
  return {
    unmount: r.unmount,
    rerender: (v: boolean) => act(() => set(v)),
  };
}
