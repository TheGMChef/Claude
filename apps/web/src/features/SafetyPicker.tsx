import { SAFETY_VOCABULARY } from '@prepdesk/engine';
import { TOPIC_GROUPS, TOPIC_LABELS } from '../content/labels';
import type { Safety } from '../data/schema';

type Level = 'ok' | 'veil' | 'line';

const levelOf = (s: Safety, topic: string): Level =>
  s.lines.includes(topic) ? 'line' : s.veils.includes(topic) ? 'veil' : 'ok';

function withLevel(s: Safety, topic: string, level: Level): Safety {
  const lines = s.lines.filter((t) => t !== topic);
  const veils = s.veils.filter((t) => t !== topic);
  if (level === 'line') lines.push(topic);
  if (level === 'veil') veils.push(topic);
  return { lines, veils };
}

/**
 * Session zero in one list: for each topic, "Fine", "Veil" (it can happen off-screen, never in
 * detail) or "Line" (never appears at all). Native selects, so the keyboard and screen readers work.
 */
export function SafetyPicker({
  value,
  onChange,
}: {
  value: Safety;
  onChange: (next: Safety) => void;
}) {
  const known = new Set(SAFETY_VOCABULARY);
  return (
    <div className="safety">
      {TOPIC_GROUPS.map((g) => (
        <fieldset key={g.id} className="safety__group">
          <legend>{g.label}</legend>
          {g.topics
            .filter((t) => known.has(t))
            .map((topic) => (
              <div key={topic} className="safety__topic">
                <label htmlFor={`safety-${topic}`}>{TOPIC_LABELS[topic] ?? topic}</label>
                <select
                  id={`safety-${topic}`}
                  value={levelOf(value, topic)}
                  onChange={(e) => onChange(withLevel(value, topic, e.target.value as Level))}
                >
                  <option value="ok">Fine</option>
                  <option value="veil">Veil it</option>
                  <option value="line">Line: never</option>
                </select>
              </div>
            ))}
        </fieldset>
      ))}
    </div>
  );
}
