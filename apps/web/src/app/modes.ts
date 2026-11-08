export interface Mode {
  path: string;
  title: string;
  description: string;
}

export const MODES: readonly Mode[] = [
  { path: '/prep', title: 'Prep', description: 'A six-step interview that loads tonight’s tools.' },
  {
    path: '/table',
    title: 'Table',
    description: 'Your Pocket, the scene, and the Ledger — live at the table.',
  },
  { path: '/codex', title: 'Codex', description: 'Everything your campaign knows, linked.' },
  { path: '/forge', title: 'Forge', description: 'Every generator, plus your own tables.' },
];
