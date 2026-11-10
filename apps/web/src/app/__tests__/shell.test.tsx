import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../../test/renderApp';
import { seedCampaign } from '../../test/fixtures';
import { getSetting } from '../../data/repo/settings';

const h1 = (name: string) => screen.findByRole('heading', { level: 1, name });
const topbar = () => within(screen.getByRole('banner'));

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('first run (no campaign)', () => {
  it('shows the Prep Desk h1 and a TopBar with no campaign keys', async () => {
    await renderApp({ path: '/' });
    await h1('Prep Desk');
    for (const name of ['Forge', 'Codex', 'Settings']) {
      expect(topbar().queryByRole('link', { name })).toBeNull();
    }
    expect(topbar().queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(topbar().getByRole('button', { name: /theme/ })).toBeInTheDocument();
  });

  it.each([
    ['/codex', '/campaigns/new'],
    ['/forge', '/campaigns/new'],
    ['/prep', '/'],
    ['/table', '/'],
  ])('%s lands on %s', async (from, to) => {
    const { router } = await renderApp({ path: from });
    await waitFor(() => expect(router.state.location.pathname).toBe(to));
  });
});

describe('with a campaign', () => {
  it('redirects /codex and /forge to the current campaign', async () => {
    let cid = '';
    const first = await renderApp({
      path: '/codex',
      seed: async (d) => {
        cid = (await seedCampaign(d)).id;
      },
    });
    await waitFor(() => expect(first.router.state.location.pathname).toBe(`/c/${cid}/codex`));
  });

  it('redirects /forge to the current campaign forge', async () => {
    let cid = '';
    const { router } = await renderApp({
      path: '/forge',
      seed: async (d) => {
        cid = (await seedCampaign(d)).id;
      },
    });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${cid}/forge`));
  });

  it('/c/<cid> sets currentCampaignId and lands on /', async () => {
    let second = '';
    let firstId = '';
    const { router, deps } = await renderApp({
      path: '/',
      seed: async (d) => {
        firstId = (await seedCampaign(d, { name: 'First' })).id;
        second = (await seedCampaign(d, { name: 'Second' })).id;
      },
    });
    // seedCampaign made "Second" current; point the setting elsewhere, then visit /c/<first>
    expect(await getSetting(deps, 'currentCampaignId')).toBe(second);
    await router.navigate(`/c/${firstId}`);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await getSetting(deps, 'currentCampaignId')).toBe(firstId);
  });

  it('shows Forge, Codex and Settings, and marks the active key', async () => {
    let cid = '';
    const { router } = await renderApp({
      path: '/',
      seed: async (d) => {
        cid = (await seedCampaign(d)).id;
      },
    });
    const forge = await topbar().findByRole('link', { name: 'Forge' });
    const codex = topbar().getByRole('link', { name: 'Codex' });
    const settings = topbar().getByRole('link', { name: 'Settings' });
    expect(forge).toHaveAttribute('href', `/c/${cid}/forge`);
    expect(codex).toHaveAttribute('href', `/c/${cid}/codex`);
    expect(settings).toHaveAttribute('href', `/c/${cid}/settings`);
    expect(codex).not.toHaveAttribute('aria-current');
    await router.navigate(`/c/${cid}/codex`);
    await waitFor(() => expect(codex).toHaveAttribute('aria-current', 'page'));
    expect(forge).not.toHaveAttribute('aria-current');
    expect(settings).not.toHaveAttribute('aria-current');
  });

  it('uses the Forge and Codex modes only in the nav list (no Prep or Table)', async () => {
    await renderApp({
      path: '/',
      seed: async (d) => {
        await seedCampaign(d);
      },
    });
    await topbar().findByRole('link', { name: 'Forge' });
    expect(topbar().queryByRole('link', { name: 'Prep' })).toBeNull();
    expect(topbar().queryByRole('link', { name: 'Table' })).toBeNull();
  });
});

describe('not found', () => {
  it('an unknown campaign id says so and offers Go to the desk', async () => {
    await renderApp({ path: '/c/cmp_UNKNOWN0000000000/settings' });
    expect(
      await screen.findByText("We can't find that campaign. It may have been deleted."),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the desk' })).toHaveAttribute('href', '/');
  });

  it('an unknown path says so', async () => {
    await renderApp({ path: '/nope/not/here' });
    expect(await screen.findByText("We can't find that page.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the desk' })).toBeInTheDocument();
  });
});

describe('campaign routes (stubs with their final h1)', () => {
  const CASES: [string, string][] = [
    ['/campaigns/new', 'Create a campaign'],
    ['/forge', 'Forge'],
    ['/codex', 'Codex'],
    ['/codex/new', 'Create an entry'],
    ['/codex/ent_X/edit', 'Edit entry'],
    ['/codex/ent_X', 'Entry'],
    ['/settings', 'Campaign settings'],
  ];
  it.each(CASES)('%s renders %s', async (sub, title) => {
    let cid = '';
    await renderApp({
      path: sub.startsWith('/campaigns') ? sub : `/placeholder`,
      seed: async (d) => {
        cid = (await seedCampaign(d)).id;
      },
    }).then(async ({ router }) => {
      if (!sub.startsWith('/campaigns')) await router.navigate(`/c/${cid}${sub}`);
    });
    await h1(title);
  });
});
