// Page pattern: 3, Form (page). One job: roll a card under the campaign's safety and keep it.
import { newSeed } from '@prepdesk/engine';
import type { Card as EngineCard } from '@prepdesk/engine';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, Card, IconButton, SectionLabel, Stamp } from '../../kit';
import { GENERATORS } from '../../content/lib';
import { GENERATOR_KINDS, fieldLabel } from '../../content/fields';
import { cultureName } from '../../content/labels';
import { recheckCard, rerollCard, rollGenerator } from '../../content/safety';
import { useCampaign, useDeps } from '../../data/hooks';
import { RepoError } from '../../data/deps';
import { createEntity, entityFromCard } from '../../data/repo/entities';
import { avoidNamesFor } from '../../data/repo/names';
import { Skeleton } from '../../app/Skeleton';
import '../pages.css';

const DEFAULT_GENERATOR = 'fantasy.npc';

export function ForgePage() {
  const { cid = '' } = useParams();
  const { campaign } = useCampaign(cid);
  const deps = useDeps();
  const [generatorId, setGeneratorId] = useState(DEFAULT_GENERATOR);
  const [cultureId, setCultureId] = useState('');
  const [card, setCard] = useState<EngineCard | undefined>();
  const [held, setHeld] = useState<string[]>([]);
  const [saved, setSaved] = useState<{ id: string; title: string } | undefined>();
  const [error, setError] = useState('');

  const safetyKey = campaign ? JSON.stringify(campaign.safety) : '';
  const culture = cultureId || campaign?.cultureIds[0] || '';
  const lineCount = campaign?.safety.lines.length ?? 0;
  const veilCount = campaign?.safety.veils.length ?? 0;
  const generator = useMemo(() => GENERATORS.find((g) => g.id === generatorId), [generatorId]);

  // R63: the engine keeps the last 8 avoid-names, so give it chronological order.
  async function extras() {
    const avoid = await avoidNamesFor(deps, cid);
    return { avoidNames: avoid.reverse(), cultureId: culture };
  }

  // The campaign's CURRENT safety always applies: re-check a card on screen when it changes.
  useEffect(() => {
    if (!campaign) return;
    setCard((c) => (c ? recheckCard(c, campaign.safety) : c));
  }, [safetyKey]);

  if (!campaign) return <Skeleton />;

  async function roll() {
    if (!campaign) return;
    setError('');
    setSaved(undefined);
    setHeld([]);
    setCard(
      rollGenerator(generatorId, campaign.safety, { seed: newSeed(), extras: await extras() }),
    );
  }

  async function rollAgain() {
    if (!campaign || !card) return;
    setError('');
    setSaved(undefined);
    setCard(rerollCard(card, campaign.safety, { locks: held, extras: await extras() }));
  }

  async function save() {
    if (!campaign || !card) return;
    const kind = GENERATOR_KINDS[generatorId];
    if (!kind) return;
    const made = entityFromCard(card, kind.kind, {
      campaignId: campaign.id,
      origin: 'manual',
      ...(kind.subtype !== undefined ? { subtype: kind.subtype } : {}),
    });
    if (!made.ok) {
      setError(
        'Nothing fits your safety settings for this roll. Roll again to get a different card.',
      );
      return;
    }
    try {
      const e = await createEntity(deps, campaign.id, made.input);
      setSaved({ id: e.id, title: e.title });
    } catch (err) {
      setError(
        err instanceof RepoError ? err.message : "We couldn't save that. Try again in a moment.",
      );
    }
  }

  const toggleHold = (field: string) =>
    setHeld((h) => (h.includes(field) ? h.filter((f) => f !== field) : [...h, field]));

  return (
    <main className="page forge-page" id="main">
      <h1 className="page__title">Forge</h1>
      <p className="muted">
        Rolling under your session-zero choices: {lineCount} {lineCount === 1 ? 'line' : 'lines'},{' '}
        {veilCount} {veilCount === 1 ? 'veil' : 'veils'}.{' '}
        <Link className="textlink" to={`/c/${cid}/settings`}>
          Change them in Settings
        </Link>
      </p>

      <div className="stack">
        <div className="field">
          <label className="field__label" htmlFor="forge-gen">
            Generator
          </label>
          <select
            id="forge-gen"
            value={generatorId}
            onChange={(e) => {
              setGeneratorId(e.target.value);
              setCard(undefined);
              setSaved(undefined);
            }}
          >
            {GENERATORS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="forge-culture">
            Names from
          </label>
          <select id="forge-culture" value={culture} onChange={(e) => setCultureId(e.target.value)}>
            {campaign.cultureIds.map((id) => (
              <option key={id} value={id}>
                {cultureName(id)}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <Button size="lg" onClick={roll}>
            Roll {generator ? generator.title : ''}
          </Button>
        </div>
      </div>

      {card ? (
        <Card variant="ruled">
          <div className="fcard">
            <SectionLabel>{generator?.title ?? ''}</SectionLabel>
            <h2 className="fcard__display" data-testid="forge-display">
              {card.display}
            </h2>
            {card.flags.veiled.length > 0 ? (
              <p className="muted">
                <Stamp tone="pencil" rotate={-3}>
                  VEILED
                </Stamp>{' '}
                {card.flags.veiled.join(', ')}
              </p>
            ) : null}
            <ul className="fcard__rows" role="list">
              {Object.entries(card.fields).map(([name, f]) => (
                <li className="fcard__row" key={name}>
                  <div className="fcard__body">
                    <SectionLabel>{fieldLabel(name)}</SectionLabel>
                    <div className="fcard__value" data-testid={`forge-field-${name}`}>
                      {f.blocked ? '—' : f.value}
                    </div>
                    {f.blocked ? (
                      <Stamp tone="pencil" rotate={-3}>
                        BLOCKED
                      </Stamp>
                    ) : null}
                  </div>
                  <IconButton
                    icon={held.includes(name) ? 'lock' : 'unlock'}
                    label={`${held.includes(name) ? 'Release' : 'Hold'} ${fieldLabel(name)}`}
                    aria-pressed={held.includes(name)}
                    onClick={() => toggleHold(name)}
                  />
                </li>
              ))}
            </ul>
            <div className="row">
              <Button variant="outline" onClick={rollAgain}>
                Roll again
              </Button>
              <Button onClick={save} disabled={saved !== undefined}>
                Save to Codex
              </Button>
            </div>
            {saved ? (
              <p role="status" className="pg-ok">
                Saved “{saved.title}” to your Codex.{' '}
                <Link className="textlink" to={`/c/${cid}/codex/${saved.id}`}>
                  Open it
                </Link>
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}
      {error ? (
        <p role="alert" className="pg-error">
          {error}
        </p>
      ) : null}
    </main>
  );
}
