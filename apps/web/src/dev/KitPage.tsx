import { useState } from 'react';
import {
  Button,
  Card,
  Chip,
  Clock,
  DockButton,
  Field,
  Highlight,
  Icon,
  IconButton,
  InkOutline,
  MarginNote,
  SectionLabel,
  Stamp,
  Tabs,
} from '../kit';
import type { IconName } from '../kit';

const ICONS: IconName[] = [
  'name',
  'npc',
  'place',
  'twist',
  'treasure',
  'encounter',
  'map',
  'search',
  'moon',
  'sun',
  'lock',
  'unlock',
  'dice',
  'copy',
  'auto',
];

const TABS = [
  { id: 'cast', label: 'Cast' },
  { id: 'places', label: 'Places' },
  { id: 'clues', label: 'Clues' },
];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <SectionLabel as="h3">{title}</SectionLabel>
      <div className="kit-group">{children}</div>
    </section>
  );
}

function Sample({ theme }: { theme: 'light' | 'dark' }) {
  const [tab, setTab] = useState('cast');
  const [filled, setFilled] = useState(2);
  return (
    <div className="kit-theme" data-theme={theme}>
      <h2>{theme === 'light' ? 'Light' : 'Dark'}</h2>

      <Group title="Buttons">
        <Button>Solid</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="dashed">Dashed</Button>
        <Button size="lg">Large</Button>
        <Button variant="outline" size="lg">
          Large outline
        </Button>
        <Button disabled>Disabled</Button>
        <IconButton icon="dice" label="Roll again" />
      </Group>

      <Group title="Cards">
        <Card>Plain card</Card>
        <Card variant="ruled" tilt={-0.8}>
          Ruled card
        </Card>
        <Card variant="taped" tilt={0.8}>
          Taped card
        </Card>
      </Group>

      <Group title="Chips, stamps, marks">
        <Chip>Mira</Chip>
        <Chip onRemove={() => {}} removeLabel="Remove Tobren">
          Tobren
        </Chip>
        <Stamp>Improvised · S7</Stamp>
        <Stamp tone="pencil" rotate={-4}>
          Revealed
        </Stamp>
        <Highlight>highlighted</Highlight>
        <Highlight struck>used</Highlight>
        <MarginNote arrow="right">ask about the key</MarginNote>
        <MarginNote arrow="left">remember this</MarginNote>
      </Group>

      <Group title="Ink outline">
        <div style={{ position: 'relative', width: 120, height: 44 }}>
          <InkOutline radius={8} />
        </div>
        <div style={{ position: 'relative', width: 120, height: 44 }}>
          <InkOutline radius={8} dashed />
        </div>
      </Group>

      <Group title="Tabs">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label={`Sections (${theme})`} />
      </Group>

      <Group title="Clocks">
        <Clock segments={4} filled={1} label="Four" />
        <Clock segments={6} filled={3} label="Six" />
        <Clock segments={8} filled={5} label="Eight" />
        <Clock
          segments={6}
          filled={filled}
          label="Interactive"
          onTick={() => setFilled((f) => Math.min(6, f + 1))}
        />
      </Group>

      <Group title="Fields">
        <Field label="Name" placeholder="Captain Vell" />
        <Field label="Notes" multiline hand defaultValue="They owe the harbour a favour." />
      </Group>

      <Group title="Dock">
        <DockButton icon="npc" label="NPC" />
        <DockButton icon="place" label="Place" />
        <DockButton icon="twist" label="Twist" />
      </Group>

      <Group title="Icons">
        {ICONS.map((n) => (
          <span key={n} title={n}>
            <Icon name={n} />
          </span>
        ))}
      </Group>
    </div>
  );
}

export function KitPage() {
  return (
    <main className="kit-page">
      <h1 className="kit-page__title">Kit</h1>
      <Sample theme="light" />
      <Sample theme="dark" />
    </main>
  );
}
