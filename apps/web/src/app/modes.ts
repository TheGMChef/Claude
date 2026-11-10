export interface Mode {
  /** Path under /c/:cid */
  path: string;
  title: string;
}

/** The campaign-scoped keys in the TopBar (M-D2). */
export const MODES: readonly Mode[] = [
  { path: 'forge', title: 'Forge' },
  { path: 'codex', title: 'Codex' },
];

export const SETTINGS_MODE: Mode = { path: 'settings', title: 'Settings' };
