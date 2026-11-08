export interface InkFilterProps {
  id?: string;
  seed?: number;
}

export function InkFilter({ id = 'ink-rough', seed = 7 }: InkFilterProps) {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="ink-filter">
      <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.035"
          numOctaves="2"
          seed={seed}
          result="noise"
        />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" />
      </filter>
    </svg>
  );
}
