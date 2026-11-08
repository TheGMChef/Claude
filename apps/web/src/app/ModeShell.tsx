import { Link } from 'react-router-dom';
import { MODES } from './modes';

export function ModeShell({ title, description }: { title: string; description: string }) {
  const others = MODES.filter((m) => m.title !== title);
  return (
    <main className="shell" id="main">
      <section className="shell__panel">
        <p className="shell__eyebrow">Coming together</p>
        <h1 className="shell__title">{title}</h1>
        <p className="shell__desc">{description}</p>
      </section>
      <nav className="shell__others" aria-label="Other modes">
        {others.map((m) => (
          <Link key={m.path} to={m.path} className="shell__link">
            <span className="shell__link-title">{m.title}</span>
            <span className="shell__link-desc">{m.description}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
