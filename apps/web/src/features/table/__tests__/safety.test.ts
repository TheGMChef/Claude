import { SAFETY_VOCABULARY } from '@prepdesk/engine';
import { describe, expect, it } from 'vitest';
import { lib } from '../../../content/lib';
import { askTheOracle, drawAMove } from '../../../content/safety';

const NONE = { lines: [], veils: [] };
const ALL = { lines: [...SAFETY_VOCABULARY], veils: [] };
const SEEDS = 300;

describe('the Table oracle and move deck obey the campaign lines', () => {
  it('control: with no lines the oracle gives two real words', () => {
    const r = askTheOracle('even', NONE, { seed: 'table-1' });
    expect(r.blocked).toBe(false);
    expect(r.meaning).not.toContain('—');
  });

  it('with every line on, no meaning word carries a tag', () => {
    const tables = (lib.oracle('fantasy.oracle')?.meaning ?? []).map((id) => lib.table(id));
    const tagsOf = (word: string): string[] =>
      tables.flatMap((t) =>
        (t?.entries ?? [])
          .filter((e) => (e.ast as unknown as string[]).join('') === word)
          .flatMap((e) => e.safety ?? []),
      );
    let freeTagged = 0;
    for (let n = 0; n < SEEDS; n++) {
      const strict = askTheOracle('even', ALL, { seed: `t-${n}` });
      for (const word of strict.meaning) if (word !== '—') expect(tagsOf(word)).toEqual([]);
      const free = askTheOracle('even', NONE, { seed: `t-${n}` });
      if (free.meaning.some((w) => tagsOf(w).length > 0)) freeTagged++;
    }
    // Control: unrestricted draws do reach tagged words, so the check above is not vacuous.
    expect(freeTagged).toBeGreaterThan(0);
  });

  it.each(SAFETY_VOCABULARY.map((t) => [t]))('line %s: no drawn move carries it', (tag) => {
    const deck = lib.deck('core.gm-moves');
    const byId = new Map((deck?.cards ?? []).map((c) => [c.id, c]));
    for (let n = 0; n < SEEDS; n++) {
      const m = drawAMove({ lines: [tag], veils: [] }, { seed: `m-${n}` });
      if (m.blocked) continue;
      expect(byId.get(m.id)?.safety ?? []).not.toContain(tag);
    }
  });

  it('control: some moves carry tags, so the line check can fail', () => {
    const deck = lib.deck('core.gm-moves');
    expect((deck?.cards ?? []).filter((c) => (c.safety ?? []).length > 0).length).toBeGreaterThan(
      0,
    );
  });
});
