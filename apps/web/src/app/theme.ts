export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'prepdesk.theme';

function defaultStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readTheme(
  storage: Pick<Storage, 'getItem'> | undefined = defaultStorage(),
): ThemeChoice {
  try {
    const v = storage?.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function writeTheme(
  choice: ThemeChoice,
  storage: Pick<Storage, 'setItem'> | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(KEY, choice);
  } catch {
    /* storage unavailable: the choice lives for this session only */
  }
}
