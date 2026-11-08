import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Button,
  Card,
  Chip,
  Highlight,
  Icon,
  IconButton,
  InkFilter,
  InkOutline,
  MarginNote,
  SectionLabel,
  Stamp,
} from '..';
import type { IconName } from '..';

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

describe('kit part 1', () => {
  it('IconButton exposes label as accessible name and tooltip', () => {
    render(<IconButton icon="dice" label="Roll again" />);
    const b = screen.getByRole('button', { name: 'Roll again' });
    expect(b).toHaveAttribute('title', 'Roll again');
  });

  it('Button sizes map to classes', () => {
    render(
      <>
        <Button size="lg">Big</Button>
        <Button>Small</Button>
        <Button variant="dashed">D</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Big' })).toHaveClass('btn--lg');
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass('btn--md', 'btn--solid');
    expect(screen.getByRole('button', { name: 'D' })).toHaveClass('btn--dashed');
  });

  it('Card clamps tilt to 1deg', () => {
    render(<Card tilt={5}>x</Card>);
    expect(screen.getByRole('article')).toHaveStyle({ transform: 'rotate(1deg)' });
  });

  it('Card tilt 0 has no transform; negative tilt clamps', () => {
    render(
      <>
        <Card>flat</Card>
        <Card tilt={-5}>neg</Card>
      </>,
    );
    const [flat, neg] = screen.getAllByRole('article');
    expect(flat?.getAttribute('style') ?? '').not.toContain('transform');
    expect(neg).toHaveStyle({ transform: 'rotate(-1deg)' });
  });

  it('outline and dashed buttons render exactly one ink outline; solid none', () => {
    render(
      <>
        <Button variant="solid">S</Button>
        <Button variant="outline">O</Button>
        <Button variant="dashed">D</Button>
      </>,
    );
    const q = (n: string) =>
      screen.getByRole('button', { name: n }).querySelectorAll('.ink-outline');
    expect(q('S')).toHaveLength(0);
    expect(q('O')).toHaveLength(1);
    expect(q('O')[0]).not.toHaveClass('ink-outline--dashed');
    expect(q('D')).toHaveLength(1);
    expect(q('D')[0]).toHaveClass('ink-outline--dashed');
  });

  it('Chip without onRemove has no remove button', () => {
    render(<Chip>Plain</Chip>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('struck Highlight announces used state', () => {
    render(<Highlight struck>word</Highlight>);
    expect(screen.getByText('(used)')).toBeInTheDocument();
  });

  it('MarginNote renders arrows', () => {
    const { container } = render(
      <>
        <MarginNote arrow="right">a</MarginNote>
        <MarginNote arrow="left">b</MarginNote>
      </>,
    );
    expect(container.textContent).toContain('a →');
    expect(container.textContent).toContain('← b');
  });

  it('Card renders variants and custom element', () => {
    render(
      <Card variant="taped" as="section">
        y
      </Card>,
    );
    expect(document.querySelector('section.card--taped')).not.toBeNull();
  });

  it('Highlight struck has class', () => {
    render(<Highlight struck>used</Highlight>);
    expect(document.querySelector('mark')).toHaveClass('hl', 'hl--struck');
  });

  it('InkOutline is aria-hidden', () => {
    const { container } = render(<InkOutline />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('InkFilter renders turbulence and displacement', () => {
    const { container } = render(<InkFilter />);
    expect(container.querySelector('filter#ink-rough')).not.toBeNull();
    expect(container.querySelector('feTurbulence')).toHaveAttribute('baseFrequency', '0.035');
    expect(container.querySelector('feDisplacementMap')).toHaveAttribute('scale', '2.6');
  });

  it.each(ICONS)('Icon %s renders an svg', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('Chip remove button calls onRemove', async () => {
    const onRemove = vi.fn();
    render(
      <Chip onRemove={onRemove} removeLabel="Remove Mira">
        Mira
      </Chip>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove Mira' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('Stamp, MarginNote, SectionLabel render', () => {
    render(
      <>
        <Stamp rotate={3}>Revealed</Stamp>
        <MarginNote arrow="right">hi</MarginNote>
        <SectionLabel as="h2">Cast</SectionLabel>
      </>,
    );
    expect(screen.getByText('Revealed')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cast' })).toBeInTheDocument();
  });
});
