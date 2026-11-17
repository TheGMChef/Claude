// Page pattern: 4, Dashboard / Overview, as a live console: tiles to tap, a stack of what you rolled.
import { newSeed } from '@prepdesk/engine';
import type { Card as EngineCard, Likelihood, MoveCard, OracleResult } from '@prepdesk/engine';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, Card, SectionLabel, Stamp } from '../../kit';
import { GENERATORS } from '../../content/lib';
import { GENERATOR_KINDS } from '../../content/fields';
import { askTheOracle, drawAMove, recheckCard, rollGenerator } from '../../content/safety';
import { useCampaign, useDeps } from '../../data/hooks';
import { RepoError } from '../../data/deps';
import { createEntity, entityFromCard } from '../../data/repo/entities';
import { avoidNamesFor } from '../../data/repo/names';
import { Skeleton } from '../../app/Skeleton';
import '../pages.css';

/** The generators worth one tap at the table, in the order a DM reaches for them. */
const QUICK: { id: string; label: string }[] = [
  { id: 'fantasy.npc', label: 'NPC' },
  { id: 'fantasy.rumor', label: 'Rumor' },
  { id: 'fantasy.complication', label: 'Complication' },
  { id: 'fantasy.encounter', label: 'Encounter' },
  { id: 'fantasy.place', label: 'Place' },
  { id: 'fantasy.tavern', label: 'Tavern' },
  { id: 'fantasy.shop', label: 'Shop' },
  { id: 'fantasy.clue', label: 'Clue' },
  { id: 'fantasy.treasure', label: 'Treasure' },
  { id: 'fantasy.trinket', label: 'Trinket' },
];

const LIKELIHOODS: { id: Likelihood; label: string }[] = [
  { id: 'unlikely', label: 'Unlikely' },
  { id: 'even', label: 'Even odds' },
  { id: 'likely', label: 'Likely' },
];

type Item =
  | { key: string; type: 'roll'; generatorId: string; card: EngineCard; saved?: string }
  | { key: string; type: 'oracle'; likelihood: Likelihood; result: OracleResult }
  | { key: string; type: 'move'; move: MoveCard };

type NewItem<T = Item> = T extends unknown ? Omit<T, 'key'> : never;

const MAX_ITEMS = 30;
const storeKey = (cid: string) => `prepdesk.table.${cid}`;

/** The stack survives leaving the page, for this tab only (sessionStorage); it is never a record. */
function loadItems(cid: string): Item[] {
  try {
    const raw = sessionStorage.getItem(storeKey(cid));
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((i): i is Item => typeof i === 'object' && i !== null && 'key' in i && 'type' in i)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function saveItems(cid: string, items: Item[]) {
  try {
    sessionStorage.setItem(storeKey(cid), JSON.stringify(items));
  } catch {
    // Storage full or blocked: the page still works, it just won't survive leaving.
  }
}

export function TablePage() {
  const { cid = '' } = useParams();
  const { campaign } = useCampaign(cid);
  const deps = useDeps();
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const counter = useRef(0);
  const saving = useRef(new Set<string>());
  const loadedFor = useRef('');

  // Restore the stack once the campaign is known, re-checking every stored roll against the
  // campaign's CURRENT lines (they may have changed since it was rolled).
  useEffect(() => {
    if (!campaign || loadedFor.current === campaign.id) return;
    loadedFor.current = campaign.id;
    const back = loadItems(campaign.id).map((i) =>
      i.type === 'roll' ? { ...i, card: recheckCard(i.card, campaign.safety) } : i,
    );
    counter.current = back.length;
    setItems(back);
  }, [campaign]);

  useEffect(() => {
    if (campaign && loadedFor.current === campaign.id) saveItems(campaign.id, items);
  }, [items, campaign]);

  if (!campaign) return <Skeleton />;
  const safety = campaign.safety;
  const push = (item: NewItem) =>
    setItems((list) =>
      [{ ...item, key: `i${Date.now().toString(36)}${++counter.current}` } as Item, ...list].slice(
        0,
        MAX_ITEMS,
      ),
    );

  async function quick(generatorId: string) {
    setError('');
    // R63: the engine keeps the last 8 avoid-names, so give it chronological order.
    const avoid = (await avoidNamesFor(deps, cid)).reverse();
    const card = rollGenerator(generatorId, safety, {
      seed: newSeed(),
      extras: { avoidNames: avoid, cultureId: campaign?.cultureIds[0] ?? '' },
    });
    push({ type: 'roll', generatorId, card });
  }

  async function save(item: Extract<Item, { type: 'roll' }>) {
    if (saving.current.has(item.key) || item.saved) return;
    const kind = GENERATOR_KINDS[item.generatorId];
    if (!kind) return;
    const made = entityFromCard(item.card, kind.kind, {
      campaignId: cid,
      origin: 'table',
      ...(kind.subtype !== undefined ? { subtype: kind.subtype } : {}),
    });
    if (!made.ok) {
      setError('Nothing fits your safety settings for that roll, so there is nothing to save.');
      return;
    }
    saving.current.add(item.key);
    try {
      const e = await createEntity(deps, cid, made.input);
      setItems((list) =>
        list.map((i) => (i.key === item.key && i.type === 'roll' ? { ...i, saved: e.id } : i)),
      );
    } catch (err) {
      saving.current.delete(item.key);
      setError(
        err instanceof RepoError ? err.message : "We couldn't save that. Try again in a moment.",
      );
    }
  }

  const title = (generatorId: string) =>
    GENERATORS.find((g) => g.id === generatorId)?.title ?? generatorId;

  return (
    <main className="page table-page" id="main">
      <h1 className="page__title">Table</h1>
      <p className="muted">
        One tap, one result. Nothing here is saved until you save it.{' '}
        <Link className="textlink" to={`/c/${cid}/settings`}>
          Safety settings
        </Link>
      </p>

      <section className="stack" aria-labelledby="quick-h">
        <h2 id="quick-h">Roll something</h2>
        <div className="row">
          {QUICK.map((q) => (
            <Button key={q.id} variant="outline" onClick={() => void quick(q.id)}>
              {q.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="stack" aria-labelledby="oracle-h">
        <h2 id="oracle-h">Ask the oracle</h2>
        <p className="muted">
          Ask a yes or no question out loud, then pick how likely you think it is.
        </p>
        <div className="row">
          {LIKELIHOODS.map((l) => (
            <Button
              key={l.id}
              variant="outline"
              onClick={() =>
                push({
                  type: 'oracle',
                  likelihood: l.id,
                  result: askTheOracle(l.id, safety, { seed: newSeed() }),
                })
              }
            >
              {l.label}
            </Button>
          ))}
          <Button
            variant="outline"
            onClick={() => push({ type: 'move', move: drawAMove(safety, { seed: newSeed() }) })}
          >
            Draw a GM move
          </Button>
        </div>
      </section>

      {error ? (
        <p role="alert" className="pg-error">
          {error}
        </p>
      ) : null}

      <section className="stack" aria-labelledby="stack-h">
        <h2 id="stack-h">On the table</h2>
        {items.length === 0 ? (
          <p className="muted">Nothing yet. Tap a roll above.</p>
        ) : (
          <ul className="table-stack" role="list" aria-live="polite">
            {items.map((item) => (
              <li key={item.key}>
                <Card variant="plain">
                  <div className="fcard">
                    {item.type === 'roll' ? (
                      <>
                        <SectionLabel>{title(item.generatorId)}</SectionLabel>
                        <p className="fcard__display" data-testid="table-roll">
                          {item.card.display}
                        </p>
                        {item.card.flags.veiled.length > 0 ? (
                          <p className="muted">
                            <Stamp tone="pencil" rotate={-3}>
                              VEILED
                            </Stamp>{' '}
                            {item.card.flags.veiled.join(', ')}
                          </p>
                        ) : null}
                        <div className="row">
                          {item.saved ? (
                            <Link
                              className="key btn btn--outline btn--md"
                              to={`/c/${cid}/codex/${item.saved}`}
                            >
                              Open in Codex
                            </Link>
                          ) : (
                            <Button size="md" onClick={() => void save(item)}>
                              Save to Codex
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            onClick={() => setItems((l) => l.filter((i) => i.key !== item.key))}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </>
                    ) : item.type === 'oracle' ? (
                      <>
                        <SectionLabel>Oracle · {item.likelihood}</SectionLabel>
                        <p className="fcard__display" data-testid="table-oracle">
                          {item.result.answer === 'yes' ? 'Yes' : 'No'}
                          {item.result.modifier ? `, ${item.result.modifier}` : ''}
                        </p>
                        <p>
                          {item.result.blocked
                            ? 'The meaning words are hidden by your safety settings.'
                            : `${item.result.meaning[0]} · ${item.result.meaning[1]}`}
                        </p>
                        {item.result.veiled.length > 0 ? (
                          <p className="muted">
                            <Stamp tone="pencil" rotate={-3}>
                              VEILED
                            </Stamp>{' '}
                            {item.result.veiled.join(', ')}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <SectionLabel>GM move</SectionLabel>
                        <p className="fcard__display" data-testid="table-move">
                          {item.move.blocked
                            ? 'No move fits your safety settings.'
                            : item.move.text}
                        </p>
                        {item.move.prompt ? <p>{item.move.prompt}</p> : null}
                      </>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
