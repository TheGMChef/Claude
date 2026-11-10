import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createDb } from '../../data/db';
import Dexie from 'dexie';
import { STORES_V1 } from '../../data/db';
import { Boot } from '../Boot';
import { StorageBlocked } from '../StorageBlocked';

describe('StorageBlocked (M-D12)', () => {
  it('blocked copy', () => {
    render(<StorageBlocked reason="blocked" />);
    expect(
      screen.getByRole('heading', { level: 1, name: "Prep Desk can't save in this browser" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This browser is blocking storage, so nothing you make could be kept. Try another browser, or leave private browsing.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });
  it('updated copy has a Reload key', () => {
    render(<StorageBlocked reason="updated" />);
    expect(
      screen.getByText('Prep Desk was updated in another tab. Reload to keep going.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});

describe('Boot', () => {
  it('renders the app once the database opens', async () => {
    const db = createDb(`boot-ok-${Math.random()}`);
    render(
      <Boot db={db}>
        <p>the app</p>
      </Boot>,
    );
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  it('shows the blocked page when indexedDB.open throws, and never the app', async () => {
    const broken = {
      open: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    } as unknown as IDBFactory;
    const db = createDb(`boot-bad-${Math.random()}`, { indexedDB: broken, IDBKeyRange });
    render(
      <Boot db={db}>
        <p>the app</p>
      </Boot>,
    );
    expect(
      await screen.findByRole('heading', { name: "Prep Desk can't save in this browser" }),
    ).toBeInTheDocument();
    expect(screen.queryByText('the app')).toBeNull();
  });

  it('shows the updated page with Reload when another tab upgrades the schema', async () => {
    const name = `boot-up-${Math.random()}`;
    const db = createDb(name);
    render(
      <Boot db={db}>
        <p>the app</p>
      </Boot>,
    );
    await screen.findByText('the app');
    const next = new Dexie(name);
    next.version(2).stores(STORES_V1);
    await act(async () => {
      await next.open();
    });
    expect(
      await screen.findByText('Prep Desk was updated in another tab. Reload to keep going.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('the app')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    next.close();
  });
});
