export type IconName =
  | 'name'
  | 'npc'
  | 'place'
  | 'twist'
  | 'treasure'
  | 'encounter'
  | 'map'
  | 'search'
  | 'moon'
  | 'sun'
  | 'lock'
  | 'unlock'
  | 'dice'
  | 'copy';

const PATHS: Record<IconName, string> = {
  name: 'M4 17 L4 5 L11 14 L18 5 L18 17',
  npc: 'M11 10 A3.5 3.5 0 1 0 11 3 A3.5 3.5 0 1 0 11 10 Z M4 19 C4 14 18 14 18 19',
  place:
    'M11 20 C6 14 4 11 4 8 A7 7 0 0 1 18 8 C18 11 16 14 11 20 Z M11 10 A2 2 0 1 0 11 6 A2 2 0 1 0 11 10',
  twist:
    'M4 7 C10 7 12 15 18 15 M15 12 L18 15 L15 18 M4 15 C7 15 8 13 9 11 M13 8 C14 7.4 16 7 18 7 M15 4 L18 7 L15 10',
  treasure: 'M3 9 L19 9 L19 18 L3 18 Z M3 9 C3 5 19 5 19 9 M11 12 L11 15',
  encounter: 'M4 18 L14 8 M14 8 L16 4 L18 6 L14 8 M6 4 L18 16 M16 18 L18 16',
  map: 'M3 5 L8 3 L14 5 L19 3 L19 17 L14 19 L8 17 L3 19 Z M8 3 L8 17 M14 5 L14 19',
  search: 'M9.5 16 A6.5 6.5 0 1 0 9.5 3 A6.5 6.5 0 1 0 9.5 16 Z M14.5 14.5 L19 19',
  moon: 'M17 13.5 A7.5 7.5 0 1 1 8.5 4 A6 6 0 0 0 17 13.5 Z',
  sun: 'M11 15 A4 4 0 1 0 11 7 A4 4 0 1 0 11 15 Z M11 1.5 L11 3.5 M11 18.5 L11 20.5 M1.5 11 L3.5 11 M18.5 11 L20.5 11 M4.3 4.3 L5.7 5.7 M16.3 16.3 L17.7 17.7 M4.3 17.7 L5.7 16.3 M16.3 5.7 L17.7 4.3',
  lock: 'M4 10 L18 10 L18 19 L4 19 Z M7 10 L7 7 A4 4 0 0 1 15 7 L15 10 M11 13.5 L11 15.5',
  unlock: 'M4 10 L18 10 L18 19 L4 19 Z M7 10 L7 7 A4 4 0 0 1 14.5 5.5 M11 13.5 L11 15.5',
  dice: 'M11 2 L19 6.5 L19 15.5 L11 20 L3 15.5 L3 6.5 Z M3 6.5 L11 11 L19 6.5 M11 11 L11 20',
  copy: 'M8 8 L18 8 L18 19 L8 19 Z M4 14 L4 3 L14 3',
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
