import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAFETY_VOCABULARY } from '@prepdesk/engine';
import { ForgePreview } from '../ForgePreview';

const FIELDS = ['name', 'role', 'look', 'want', 'secret', 'voice', 'tell'];
const BAD_CODE = "That code doesn't look right. Check it and try again.";

const valueOf = (field: string) => screen.getByTestId(`field-value-${field}`).textContent;
const snapshot = () => FIELDS.map((f) => valueOf(f));

function setup() {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  render(<ForgePreview />);
  return { user, writeText };
}

const shareCode = () => screen.getByTestId('share-code').textContent ?? '';

describe('ForgePreview', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('locks the name, rerolls, and keeps the name while another field changes', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'New NPC' }));
    const before = snapshot();
    const lock = screen.getByRole('button', { name: 'Lock name' });
    await user.click(lock);
    expect(screen.getByRole('button', { name: 'Unlock name' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Reroll' }));
    const after = snapshot();
    expect(after[0]).toBe(before[0]);
    expect(after.slice(1)).not.toEqual(before.slice(1));
  });

  it('copies the share code, and pasting it into a new card restores the earlier card', async () => {
    const { user, writeText } = setup();
    await user.click(screen.getByRole('button', { name: 'New NPC' }));
    const earlier = snapshot();
    const code = shareCode();
    await user.click(screen.getByRole('button', { name: 'Copy share code' }));
    expect(writeText).toHaveBeenCalledWith(code);

    await user.click(screen.getByRole('button', { name: 'New NPC' }));
    expect(snapshot()).not.toEqual(earlier);
    await user.type(screen.getByLabelText('Paste a code'), code);
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(snapshot()).toEqual(earlier);
  });

  it('says so quietly when the clipboard is unavailable', async () => {
    const { user, writeText } = setup();
    writeText.mockRejectedValue(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'New NPC' }));
    await user.click(screen.getByRole('button', { name: 'Copy share code' }));
    expect(await screen.findByText("Couldn't copy — select the code instead.")).toBeInTheDocument();
  });

  it('forgives whitespace around a pasted code and rejects an invalid code without losing the card', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'New NPC' }));
    const input = screen.getByLabelText('Paste a code');

    await user.type(input, '  k7q2m9xd  ');
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(shareCode()).toContain('K7Q2-M9XD');
    const loaded = snapshot();

    await user.clear(input);
    await user.type(input, 'nonsense code');
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.getByRole('alert')).toHaveTextContent(BAD_CODE);
    expect(snapshot()).toEqual(loaded);
  });

  it('survives a Line on every vocabulary tag, and shows blocked fields', async () => {
    const { user } = setup();
    for (const tag of SAFETY_VOCABULARY) {
      await user.click(screen.getByRole('checkbox', { name: `Line ${tag}` }));
    }
    await user.click(screen.getByRole('button', { name: 'New NPC' }));
    for (const f of FIELDS) expect(screen.getByTestId(`field-value-${f}`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reroll' }));
    await user.click(screen.getByRole('button', { name: 'More names' }));
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.click(screen.getByRole('button', { name: 'Draw a move' }));
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

  it('shows ten names and the culture voice, and an oracle answer and a move', async () => {
    const { user } = setup();
    const strip = screen.getByTestId('names-strip');
    expect(within(strip).getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByTestId('names-voice')).toHaveTextContent('slow vowels');
    await user.click(screen.getByRole('tab', { name: 'Highland' }));
    expect(screen.getByTestId('names-voice')).toHaveTextContent('clipped');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByTestId('oracle-answer').textContent).toMatch(/^(Yes|No)/);
    await user.click(screen.getByRole('button', { name: 'Draw a move' }));
    expect(screen.getByTestId('move-text').textContent).not.toBe('');
  });
});
