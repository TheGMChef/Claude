import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAFETY_VOCABULARY, askOracle, batch, generate, reroll } from '@prepdesk/engine';
import type { Card, Context } from '@prepdesk/engine';
import { lib } from '../engine';
import { ForgePreview } from '../ForgePreview';

// Seeds are the only randomness in the page: make newSeed a counter (0000-0001, 0000-0002, ...).
// The page spends seed 1 on its initial names strip, so the first Create NPC uses seed 2.
let seedCounter = 0;
vi.mock('@prepdesk/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@prepdesk/engine')>();
  return {
    ...actual,
    newSeed: vi.fn(() => `0000-${String(++seedCounter).padStart(4, '0')}`),
    askOracle: vi.fn(actual.askOracle),
    batch: vi.fn(actual.batch),
  };
});

const FIELDS = ['name', 'role', 'look', 'want', 'secret', 'voice', 'tell'];
const BAD_CODE = "That code doesn't look right. Check it and try again.";
const MARSH = 'fantasy.culture.marsh';
const seedN = (n: number) => `0000-${String(n).padStart(4, '0')}`;

/** The page's default context: marsh, the default child-harm line, no avoided names. */
const defaultContext = (): Context => ({
  cultureId: MARSH,
  safety: { lines: ['child-harm'], veils: [] },
  avoidNames: [],
});
const texts = (card: Card) => FIELDS.map((f) => card.fields[f]?.value);
const valueOf = (field: string) => screen.getByTestId(`field-value-${field}`).textContent;
const snapshot = () => FIELDS.map((f) => valueOf(f));
const shareCode = () => screen.getByTestId('share-code').textContent ?? '';

function setup() {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  render(<ForgePreview />);
  return { user, writeText };
}

/** First fixed seed whose role entry carries a safety tag: [seed, tag]. Content is fixed, so deterministic. */
function seedWithTaggedRole(): [string, string] {
  for (let i = 0; i < 500; i++) {
    const seed = `probe-${i}`;
    const card = generate(lib, 'fantasy.npc', { seed, context: defaultContext() });
    for (const src of card.fields.role?.sources ?? []) {
      const [tableId, idx] = src.split('#');
      const tag = lib.table(tableId ?? '')?.entries[Number(idx)]?.safety[0];
      if (tag && tag !== 'child-harm') return [card.seed, tag];
    }
  }
  throw new Error('no tagged role entry found in 500 seeds');
}

describe('ForgePreview', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    seedCounter = 0;
    vi.mocked(askOracle).mockClear();
    vi.mocked(batch).mockClear();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('locks the name and rerolls: the name stays and the rest matches the engine exactly', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Create NPC' }));
    const first = generate(lib, 'fantasy.npc', { seed: seedN(2), context: defaultContext() });
    expect(snapshot()).toEqual(texts(first));

    await user.click(screen.getByRole('button', { name: 'Lock name' }));
    expect(screen.getByRole('button', { name: 'Unlock name' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Reroll' }));
    const expected = reroll(lib, first, { locks: ['name'], context: defaultContext() });
    expect(texts(expected)[0]).toBe(texts(first)[0]);
    expect(texts(expected)).not.toEqual(texts(first));
    expect(snapshot()).toEqual(texts(expected));
  });

  it('copies the share code; pasting it into a later card restores the earlier card', async () => {
    const { user, writeText } = setup();
    await user.click(screen.getByRole('button', { name: 'Create NPC' }));
    const earlier = texts(
      generate(lib, 'fantasy.npc', { seed: seedN(2), context: defaultContext() }),
    );
    expect(snapshot()).toEqual(earlier);
    const code = shareCode();
    expect(code).toBe(seedN(2));
    await user.click(screen.getByRole('button', { name: 'Copy share code' }));
    expect(writeText).toHaveBeenCalledWith(code);
    expect(await screen.findByRole('status')).toHaveTextContent('Copied');

    await user.click(screen.getByRole('button', { name: 'Create NPC' }));
    const later = texts(
      generate(lib, 'fantasy.npc', { seed: seedN(3), context: defaultContext() }),
    );
    expect(later).not.toEqual(earlier);
    expect(snapshot()).toEqual(later);
    await user.type(screen.getByLabelText('Paste a code'), code);
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(snapshot()).toEqual(earlier);
  });

  it('says so quietly when the clipboard is unavailable', async () => {
    const { user, writeText } = setup();
    writeText.mockRejectedValue(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Create NPC' }));
    await user.click(screen.getByRole('button', { name: 'Copy share code' }));
    expect(await screen.findByText("Couldn't copy — select the code instead.")).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('forgives whitespace around a pasted code; an invalid one alerts, keeps the card, and clears on edit', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Create NPC' }));
    const input = screen.getByLabelText('Paste a code');

    await user.type(input, '  k7q2m9xd  ');
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(shareCode()).toBe('K7Q2-M9XD');
    const loaded = snapshot();
    expect(loaded).toEqual(
      texts(generate(lib, 'fantasy.npc', { seed: 'K7Q2-M9XD', context: defaultContext() })),
    );

    await user.clear(input);
    await user.type(input, 'nonsense code');
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.getByRole('alert')).toHaveTextContent(BAD_CODE);
    expect(snapshot()).toEqual(loaded);

    await user.type(input, 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('validates the pasted code on blur, stays quiet while typing, clears on focus, ignores an empty field', async () => {
    const { user } = setup();
    const input = screen.getByLabelText('Paste a code');

    await user.type(input, 'nonsense code');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent(BAD_CODE);

    await user.click(input);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.clear(input);
    await user.tab();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a Line blocks the field whose entry carries the tag, even when that field is locked', async () => {
    const [seed, tag] = seedWithTaggedRole();
    const { user } = setup();
    await user.type(screen.getByLabelText('Paste a code'), seed);
    await user.click(screen.getByRole('button', { name: 'Load' }));
    const role = valueOf('role');
    expect(role).not.toBe('—');
    expect(screen.queryByText('BLOCKED')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lock role' }));
    expect(valueOf('role')).toBe(role);
    await user.click(screen.getByRole('checkbox', { name: `Line ${tag}` }));
    expect(valueOf('role')).toBe('—');
    expect(screen.getByRole('button', { name: 'Unlock role' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('BLOCKED')).toBeInTheDocument();
  });

  it('a Veil keeps the value and stamps the card VEILED', async () => {
    const [seed, tag] = seedWithTaggedRole();
    const { user } = setup();
    await user.type(screen.getByLabelText('Paste a code'), seed);
    await user.click(screen.getByRole('button', { name: 'Load' }));
    const role = valueOf('role');
    expect(screen.queryByText('VEILED')).not.toBeInTheDocument();
    // Safety changes reroll unlocked fields, so lock the role to keep the tagged entry in place.
    await user.click(screen.getByRole('button', { name: 'Lock role' }));
    await user.click(screen.getByRole('checkbox', { name: `Veil ${tag}` }));
    expect(screen.getByText('VEILED')).toBeInTheDocument();
    expect(valueOf('role')).toBe(role);
  });

  it('feeds the safety settings and avoided names to the oracle and the names strip', async () => {
    const { user } = setup();
    expect(screen.getByRole('checkbox', { name: 'Line child-harm' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Line violence' }));
    await user.click(screen.getByRole('checkbox', { name: 'Veil gore' }));
    await user.type(screen.getByLabelText('Avoid names'), 'Ilsa, Moss');

    expect(batch).toHaveBeenLastCalledWith(
      lib,
      [{ cultureId: MARSH, count: 10 }],
      expect.objectContaining({
        context: expect.objectContaining({
          cultureId: MARSH,
          safety: { lines: ['child-harm', 'violence'], veils: ['gore'] },
          avoidNames: ['Ilsa', 'Moss'],
        }),
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(askOracle).toHaveBeenLastCalledWith(
      lib,
      'fantasy.oracle',
      'even',
      expect.objectContaining({
        seed: seedN(2),
        safety: { lines: ['child-harm', 'violence'], veils: ['gore'] },
      }),
    );
  });

  it('a tag cannot be both Line and Veil', async () => {
    const { user } = setup();
    const line = screen.getByRole('checkbox', { name: 'Line violence' });
    const veil = screen.getByRole('checkbox', { name: 'Veil violence' });
    await user.click(line);
    expect(line).toBeChecked();
    await user.click(veil);
    expect(veil).toBeChecked();
    expect(line).not.toBeChecked();
  });

  it('survives a Line on every vocabulary tag', async () => {
    const { user } = setup();
    for (const tag of SAFETY_VOCABULARY) {
      const box = screen.getByRole('checkbox', { name: `Line ${tag}` });
      if (!(box as HTMLInputElement).checked) await user.click(box);
    }
    await user.click(screen.getByRole('button', { name: 'Create NPC' }));
    for (const f of FIELDS) expect(screen.getByTestId(`field-value-${f}`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reroll' }));
    await user.click(screen.getByRole('button', { name: 'Show more names' }));
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.click(screen.getByRole('button', { name: 'Draw a move' }));
    expect(screen.getByTestId('move-text')).toBeInTheDocument();
  });

  it('shows ten names and the voice, labels the card culture truthfully, and answers the oracle and moves', async () => {
    const { user } = setup();
    expect(within(screen.getByTestId('names-strip')).getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByTestId('names-voice')).toHaveTextContent('slow vowels');
    await user.click(screen.getByRole('button', { name: 'Create NPC' }));
    const article = screen.getByRole('article');
    expect(within(article).getByText('Marsh-folk')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Highland' }));
    expect(screen.getByTestId('names-voice')).toHaveTextContent('clipped');
    expect(within(article).getByText('Marsh-folk')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reroll' }));
    expect(within(screen.getByRole('article')).getByText('Highland')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const ans = vi.mocked(askOracle).mock.results.at(-1)?.value as ReturnType<typeof askOracle>;
    expect(screen.getByTestId('oracle-answer').textContent).toMatch(
      new RegExp(`^${ans.answer === 'yes' ? 'Yes' : 'No'}`),
    );
    expect(screen.getByTestId('oracle-meaning')).toHaveTextContent(ans.meaning[0]);
    await user.click(screen.getByRole('button', { name: 'Draw a move' }));
    expect(screen.getByTestId('move-text').textContent).not.toBe('');
  });

  it('oracle: a blocked meaning word shows the marker with BLOCKED and VEILED stamps (I7)', async () => {
    const { user } = setup();
    const oracle = screen.getByRole('region', { name: 'Oracle' });
    vi.mocked(askOracle).mockImplementationOnce((...args) => ({
      ...vi.mocked(askOracle).getMockImplementation()!(...args),
      meaning: ['—', 'storm'],
      blocked: true,
      veiled: ['fire'],
    }));
    await user.click(within(oracle).getByRole('button', { name: 'Ask' }));
    expect(within(oracle).getByTestId('oracle-meaning')).toHaveTextContent('— / storm');
    expect(within(oracle).getByText('BLOCKED')).toBeInTheDocument();
    expect(within(oracle).getByText('VEILED')).toBeInTheDocument();
    expect(within(oracle).getByText('fire')).toBeInTheDocument();
  });

  it('oracle: an ordinary answer shows no stamps', async () => {
    const { user } = setup();
    const oracle = screen.getByRole('region', { name: 'Oracle' });
    await user.click(within(oracle).getByRole('button', { name: 'Ask' }));
    const ans = vi.mocked(askOracle).mock.results.at(-1)?.value as ReturnType<typeof askOracle>;
    expect(ans).toMatchObject({ blocked: false, veiled: [] });
    expect(within(oracle).queryByText('BLOCKED')).toBeNull();
    expect(within(oracle).queryByText('VEILED')).toBeNull();
  });

  it('field rows are a valid list: no <dl> whose rows hold buttons (axe dlitem/definition-list)', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Create NPC' }));
    const article = screen.getByRole('article');
    expect(article.querySelector('dl, dt, dd')).toBeNull();
    expect(within(article).getAllByRole('listitem')).toHaveLength(FIELDS.length);
    expect(within(article).getByRole('group', { name: 'role' })).toHaveTextContent(
      valueOf('role') ?? '',
    );
  });
});
