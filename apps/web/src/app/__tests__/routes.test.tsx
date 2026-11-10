import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from '../../test/renderApp';
import { seedCampaign } from '../../test/fixtures';

const withCampaign = {
  seed: async (d: Parameters<typeof seedCampaign>[0]) => {
    await seedCampaign(d);
  },
};

describe('routes', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('home shows the Prep Desk wordmark and h1 on first run', async () => {
    await renderApp({ path: '/' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Prep Desk' })).toBeInTheDocument();
    expect(screen.getAllByText('Prep Desk').length).toBeGreaterThan(1);
  });

  it('registers dev routes under DEV (lazy-loaded)', async () => {
    await renderApp({ path: '/kit' });
    expect(await screen.findByRole('heading', { name: 'Kit' })).toBeInTheDocument();
  });

  it('top bar menu button toggles aria-expanded (with a campaign)', async () => {
    const { user } = await renderApp({ path: '/', ...withCampaign });
    const btn = await screen.findByRole('button', { name: 'Menu' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('theme toggle cycles auto, day, night, auto', async () => {
    const { user } = await renderApp({ path: '/' });
    const root = document.documentElement;
    expect(root.dataset.theme).toBeUndefined();
    await user.click(await screen.findByRole('button', { name: 'Switch to Day theme' }));
    expect(root.dataset.theme).toBe('light');
    await user.click(screen.getByRole('button', { name: 'Switch to Night theme' }));
    expect(root.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Switch to Auto theme' }));
    expect(root.dataset.theme).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Switch to Day theme' })).toBeInTheDocument();
  });

  it('Escape closes the menu and returns focus to the Menu button', async () => {
    const { user } = await renderApp({ path: '/', ...withCampaign });
    const btn = await screen.findByRole('button', { name: 'Menu' });
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await user.tab();
    await user.keyboard('{Escape}');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveFocus();
  });
});
