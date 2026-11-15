import { SAFETY_VOCABULARY, serializeCard } from '@prepdesk/engine';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GENERATORS } from '../../../content/lib';
import { linedTopics, rollGenerator } from '../../../content/safety';
import { setTopicLevel } from '../../../data/repo/campaigns';
import { createEntity } from '../../../data/repo/entities';
import { renderApp } from '../../../test/renderApp';
import { seedCampaign } from '../../../test/fixtures';

/** A card, rolled with no lines, that reaches a tagged table entry; and the first topic it touches. */
function cardTouchingATopic() {
  for (const g of GENERATORS) {
    for (let n = 0; n < 60; n++) {
      const card = rollGenerator(g.id, { lines: [], veils: [] }, { seed: `detail-${n}` });
      const json = serializeCard(card);
      const topics = linedTopics(json, { lines: [...SAFETY_VOCABULARY], veils: [] });
      if (topics !== 'unreadable' && topics.length > 0) return { json, topic: topics[0] as string };
    }
  }
  throw new Error('no card touches a topic');
}

describe('entry detail: D12 notice for a saved roll that now touches a line', () => {
  it('shows the notice once a line covers it, and not before', async () => {
    const { json, topic } = cardTouchingATopic();
    let cid = '';
    let eid = '';
    const { deps, router } = await renderApp({
      path: '/placeholder',
      seed: async (d) => {
        cid = (await seedCampaign(d)).id;
        eid = (
          await createEntity(d, cid, {
            kind: 'note',
            title: 'Saved roll',
            card: json,
            origin: 'manual',
          })
        ).id;
      },
    });
    await router.navigate(`/c/${cid}/codex/${eid}`);
    expect(
      await screen.findByRole('heading', { name: 'Saved roll', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    await setTopicLevel(deps, cid, topic, 'line');
    expect(await screen.findByRole('note')).toHaveTextContent('touches one of your lines');
    // The kept text is never hidden.
    expect(screen.getByRole('heading', { name: 'Saved roll', level: 1 })).toBeInTheDocument();
  });
});
