import { useMemo, useState } from 'react';
import {
  DEFAULT_LINES,
  SAFETY_VOCABULARY,
  askOracle,
  batch,
  cardFromShare,
  cardToShare,
  drawMove,
  generate,
  newSeed,
  reroll,
} from '@prepdesk/engine';
import type { Card, Context, Likelihood, NameResult } from '@prepdesk/engine';
import {
  Button,
  Card as KitCard,
  Field,
  IconButton,
  MarginNote,
  SectionLabel,
  Stamp,
  Tabs,
} from '../kit';
import { lib } from './engine';
import './forge.css';

const GENERATOR = 'fantasy.npc';
const ORACLE = 'fantasy.oracle';
const DECK = 'core.gm-moves';
const BAD_CODE = "That code doesn't look right. Check it and try again.";
const COPY_FAILED = "Couldn't copy — select the code instead.";

const CULTURES = [
  { id: 'fantasy.culture.marsh', label: 'Marsh-folk' },
  { id: 'fantasy.culture.highland', label: 'Highland' },
  { id: 'fantasy.culture.imperial', label: 'Imperial coast' },
];

const LIKELIHOODS: { id: Likelihood; label: string }[] = [
  { id: 'certain', label: 'Certain' },
  { id: 'likely', label: 'Likely' },
  { id: 'even', label: 'Even' },
  { id: 'unlikely', label: 'Unlikely' },
  { id: 'remote', label: 'Remote' },
];

const toggle = (list: string[], tag: string, on: boolean): string[] =>
  on ? (list.includes(tag) ? list : [...list, tag]) : list.filter((t) => t !== tag);

const lockedNames = (card: Card): string[] =>
  Object.keys(card.fields).filter((k) => card.fields[k]?.locked === true);

function NpcCard({ card, onToggleLock }: { card: Card; onToggleLock: (field: string) => void }) {
  return (
    <KitCard variant="ruled">
      <SectionLabel>{lib.culture(String(card.context.cultureId))?.name ?? ''}</SectionLabel>
      <h2 className="forge__display">{card.display}</h2>
      {card.flags.veiled.length > 0 && (
        <p className="forge__flags">
          <Stamp tone="pencil" rotate={-3}>
            VEILED
          </Stamp>{' '}
          <span className="forge__muted">{card.flags.veiled.join(', ')}</span>
        </p>
      )}
      <ul className="forge__fields" role="list">
        {Object.entries(card.fields).map(([name, f]) => (
          <li className="forge__row" key={name}>
            <div className="forge__row-body" role="group" aria-labelledby={`field-label-${name}`}>
              <div id={`field-label-${name}`}>
                <SectionLabel>{name}</SectionLabel>
              </div>
              <div
                data-testid={`field-value-${name}`}
                className={name === 'voice' ? 'forge__value forge__value--hand' : 'forge__value'}
              >
                {f.blocked ? '—' : f.value}
              </div>
              {f.blocked && (
                <Stamp tone="pencil" rotate={-3}>
                  BLOCKED
                </Stamp>
              )}
            </div>
            <IconButton
              icon={f.locked ? 'lock' : 'unlock'}
              label={f.locked ? `Unlock ${name}` : `Lock ${name}`}
              aria-pressed={f.locked}
              onClick={() => onToggleLock(name)}
            />
          </li>
        ))}
      </ul>
    </KitCard>
  );
}

export function ForgePreview() {
  const [cultureId, setCultureId] = useState(CULTURES[0]?.id ?? '');
  const [lines, setLines] = useState<string[]>(DEFAULT_LINES);
  const [veils, setVeils] = useState<string[]>([]);
  const [avoidText, setAvoidText] = useState('');
  const [nameSeed, setNameSeed] = useState(() => newSeed());
  const [likelihood, setLikelihood] = useState<Likelihood>('even');
  const [oracleSeed, setOracleSeed] = useState<string | null>(null);
  const [moveSeed, setMoveSeed] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const avoidNames = useMemo(
    () =>
      avoidText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [avoidText],
  );
  const context = useMemo<Context>(
    () => ({ cultureId, safety: { lines, veils }, avoidNames }),
    [cultureId, lines, veils, avoidNames],
  );

  const [card, setCard] = useState<Card | null>(null);

  const names = useMemo(
    () => batch(lib, [{ cultureId, count: 10 }], { seed: nameSeed, context }) as NameResult[],
    [cultureId, nameSeed, context],
  );
  const voice = lib.culture(cultureId)?.voice.summary ?? '';

  const oracle = useMemo(
    () =>
      oracleSeed === null
        ? null
        : askOracle(lib, ORACLE, likelihood, {
            seed: oracleSeed,
            safety: context.safety ?? { lines: [], veils: [] },
          }),
    [oracleSeed, likelihood, context.safety],
  );
  const move = useMemo(
    () => (moveSeed === null ? null : drawMove(lib, DECK, { seed: moveSeed })),
    [moveSeed],
  );

  const newNpc = () => {
    setCard(generate(lib, GENERATOR, { seed: newSeed(), context }));
    setPasteError(false);
    setCopyFailed(false);
    setCopied(false);
  };

  const toggleLock = (field: string) => {
    if (!card) return;
    const f = card.fields[field];
    if (!f) return;
    setCard({ ...card, fields: { ...card.fields, [field]: { ...f, locked: !f.locked } } });
  };

  const rerollCard = () => {
    if (card) setCard(reroll(lib, card, { locks: lockedNames(card), context }));
  };

  const setSafety = (nextLines: string[], nextVeils: string[]) => {
    setLines(nextLines);
    setVeils(nextVeils);
    // Lines override locks (R22), so re-apply to the card on screen straight away.
    if (card) {
      const safety = { lines: nextLines, veils: nextVeils };
      setCard(reroll(lib, card, { locks: lockedNames(card), context: { ...context, safety } }));
    }
  };

  const code = card ? cardToShare(lib, card) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyFailed(false);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  };

  const load = () => {
    const res = cardFromShare(lib, GENERATOR, pasted, context);
    if (res.ok) {
      setCard(res.card);
      setCopied(false);
      setPasteError(false);
    } else {
      setPasteError(true);
    }
  };

  return (
    <main className="forge">
      <h1 className="forge__title">Forge preview</h1>
      <div className="forge__cols">
        <section className="forge__col" aria-labelledby="forge-npc">
          <h2 id="forge-npc" className="forge__heading">
            NPC
          </h2>
          <Tabs tabs={CULTURES} value={cultureId} onChange={setCultureId} label="Culture" />
          <div className="forge__actions">
            <Button onClick={newNpc}>New NPC</Button>
            <Button variant="outline" onClick={rerollCard} disabled={!card}>
              Reroll
            </Button>
          </div>
          {card ? (
            <>
              <NpcCard card={card} onToggleLock={toggleLock} />
              <div className="forge__share">
                <SectionLabel>Share code</SectionLabel>
                <div className="forge__code-row">
                  <code className="forge__code" data-testid="share-code">
                    {code}
                  </code>
                  <IconButton icon="copy" label="Copy share code" onClick={() => void copy()} />
                </div>
                {copyFailed && <p className="forge__muted">{COPY_FAILED}</p>}
                {copied && (
                  <p role="status" className="forge__muted">
                    Copied
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="forge__muted">
              <MarginNote>press New NPC to begin</MarginNote>
            </p>
          )}
          <form
            className="forge__paste"
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
          >
            <Field
              label="Paste a code"
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                setPasteError(false);
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" variant="outline">
              Load
            </Button>
          </form>
          {pasteError && (
            <p role="alert" className="forge__error">
              {BAD_CODE}
            </p>
          )}
        </section>

        <div className="forge__col">
          <section aria-labelledby="forge-names">
            <h2 id="forge-names" className="forge__heading">
              Names
            </h2>
            <ul className="forge__names" data-testid="names-strip">
              {names.map((n, i) => (
                <li key={`${i}-${n.name}`}>{n.name}</li>
              ))}
            </ul>
            <p className="forge__voice" data-testid="names-voice">
              <MarginNote>{voice}</MarginNote>
            </p>
            <Field
              label="Avoid names"
              value={avoidText}
              onChange={(e) => setAvoidText(e.target.value)}
              placeholder="Comma, separated"
              autoComplete="off"
            />
            <Button variant="outline" onClick={() => setNameSeed(newSeed())}>
              More names
            </Button>
          </section>

          <section aria-labelledby="forge-oracle">
            <h2 id="forge-oracle" className="forge__heading">
              Oracle
            </h2>
            <Tabs
              tabs={LIKELIHOODS}
              value={likelihood}
              onChange={(id) => setLikelihood(id as Likelihood)}
              label="Likelihood"
            />
            <Button onClick={() => setOracleSeed(newSeed())}>Ask</Button>
            {oracle && (
              <p className="forge__result">
                <strong data-testid="oracle-answer">
                  {oracle.answer === 'yes' ? 'Yes' : 'No'}
                  {oracle.modifier ? `, ${oracle.modifier}…` : ''}
                </strong>{' '}
                <span data-testid="oracle-meaning">
                  {oracle.meaning[0]} / {oracle.meaning[1]}
                </span>
              </p>
            )}
          </section>

          <section aria-labelledby="forge-moves">
            <h2 id="forge-moves" className="forge__heading">
              Moves
            </h2>
            <Button onClick={() => setMoveSeed(newSeed())}>Draw a move</Button>
            {move && (
              <p className="forge__result">
                <strong data-testid="move-text">{move.text}</strong>
                <br />
                <span data-testid="move-prompt">{move.prompt}</span>
              </p>
            )}
          </section>

          <section aria-labelledby="forge-safety">
            <h2 id="forge-safety" className="forge__heading">
              Safety
            </h2>
            <ul className="forge__safety">
              {SAFETY_VOCABULARY.map((tag) => (
                <li key={tag} className="forge__tag">
                  <span className="forge__tag-name">{tag}</span>
                  <label className="forge__check">
                    <input
                      type="checkbox"
                      checked={lines.includes(tag)}
                      onChange={(e) =>
                        setSafety(toggle(lines, tag, e.target.checked), toggle(veils, tag, false))
                      }
                    />
                    <span aria-hidden="true">Line</span>
                    <span className="forge__sr"> Line {tag}</span>
                  </label>
                  <label className="forge__check">
                    <input
                      type="checkbox"
                      checked={veils.includes(tag)}
                      onChange={(e) =>
                        setSafety(toggle(lines, tag, false), toggle(veils, tag, e.target.checked))
                      }
                    />
                    <span aria-hidden="true">Veil</span>
                    <span className="forge__sr"> Veil {tag}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
