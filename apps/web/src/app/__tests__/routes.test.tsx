import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '../routes';
import { ThemeProvider } from '../ThemeProvider';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeProvider>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </ThemeProvider>,
  );
  return router;
}

describe('routes', () => {
  it.each([
    ['/prep', 'Prep'],
    ['/table', 'Table'],
    ['/codex', 'Codex'],
    ['/forge', 'Forge'],
  ])('%s shows its title', (path, title) => {
    renderAt(path);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it('home shows the wordmark and links to all four modes', () => {
    renderAt('/');
    const main = screen.getByRole('main');
    for (const name of ['Prep', 'Table', 'Codex', 'Forge']) {
      expect(within(main).getByRole('link', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.getAllByText('Prep Desk').length).toBeGreaterThan(0);
  });

  it('mode shell links to the other modes only', () => {
    renderAt('/prep');
    const main = screen.getByRole('main');
    expect(within(main).queryByRole('link', { name: /^Prep/ })).toBeNull();
    expect(within(main).getByRole('link', { name: /Table/ })).toBeInTheDocument();
  });

  it('registers dev routes under DEV', () => {
    renderAt('/kit');
    expect(screen.getByRole('heading', { name: 'Kit' })).toBeInTheDocument();
  });

  it('top bar menu button toggles aria-expanded', async () => {
    renderAt('/');
    const btn = screen.getByRole('button', { name: 'Menu' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('theme toggle sets data-theme', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: /theme/i }));
    expect(document.documentElement.dataset.theme).toBeDefined();
  });
});
