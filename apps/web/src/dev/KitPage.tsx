// Page pattern: none. Dev-only component gallery (not shipped in production builds); it does not
// map to the ten product patterns. See docs/ui-page-patterns.md.
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

      <Group title="Keys">
        <Button>Solid</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="dashed">Dashed</Button>
      </Group>

      <Group title="Large keys">
        <Button size="lg">Stuck?</Button>
        <Button variant="outline" size="lg">
          Large outline
        </Button>
        <Button variant="dashed" size="lg">
          Large dashed
        </Button>
      </Group>

      {/* .is-pressed mirrors :active so a screenshot can show the pressed state */}
      <Group title="Pressed">
        <Button className="is-pressed">Solid</Button>
        <Button variant="outline" className="is-pressed">
          Outline
        </Button>
        <Button variant="dashed" className="is-pressed">
          Dashed
        </Button>
        <IconButton icon="dice" label="Roll again (pressed)" className="is-pressed" />
      </Group>

      <Group title="Disabled">
        <Button disabled>Solid</Button>
        <Button variant="outline" disabled>
          Outline
        </Button>
        <Button variant="dashed" disabled>
          Dashed
        </Button>
        <IconButton icon="dice" label="Roll again (disabled)" disabled />
      </Group>

      <Group title="Icon keys">
        <IconButton icon="dice" label="Roll again" />
        <IconButton icon="copy" label="Copy" />
        <IconButton icon="lock" label="Unlock name" aria-pressed={true} />
        <IconButton icon="unlock" label="Lock role" aria-pressed={false} />
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
        <Clock segments={4} filled={0} label="Empty" />
        <Clock segments={4} filled={4} label="Full" />
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
