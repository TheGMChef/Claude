import { Button } from './Button';

export interface ClockProps {
  segments: 4 | 6 | 8;
  filled: number;
  label: string;
  onTick?: () => void;
}

const SIZE = 132;
const C = SIZE / 2;
const R = 60;

function point(i: number, n: number): [number, number] {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  return [C + R * Math.cos(a), C + R * Math.sin(a)];
}

function wedge(i: number, n: number): string {
  const [x1, y1] = point(i, n);
  const [x2, y2] = point(i + 1, n);
  return `M${C} ${C} L${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

export function Clock({ segments, filled, label, onTick }: ClockProps) {
  const count = Math.max(0, Math.min(segments, Math.round(filled)));
  const indices = Array.from({ length: segments }, (_, i) => i);
  return (
    <div className="clock">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${label}. Clock: ${count} of ${segments}`}
      >
        {indices.slice(0, count).map((i) => (
          <path key={i} d={wedge(i, segments)} className="clock__wedge" />
        ))}
        <g className="clock__ink">
          <circle cx={C} cy={C} r={R} className="clock__ring" />
          {indices.map((i) => {
            const [x, y] = point(i, segments);
            return <line key={i} x1={C} y1={C} x2={x} y2={y} className="clock__divider" />;
          })}
        </g>
      </svg>
      {onTick && (
        <Button variant="outline" onClick={onTick}>
          Tick +1
        </Button>
      )}
    </div>
  );
}
