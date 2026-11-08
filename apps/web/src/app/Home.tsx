// Page pattern: 4 - Dashboard / Overview (page-patterns). A read-only glance whose actions link
// out to a mode. No KPI tiles yet: it is a launcher until real status exists. See docs/ui-page-patterns.md.
import { Link } from 'react-router-dom';
import { MODES } from './modes';

export function Home() {
  return (
    <main className="shell" id="main">
      <section className="shell__panel">
        <p className="shell__eyebrow">Improv kit for tabletop GMs</p>
        <h1 className="shell__title">Prep Desk</h1>
        <p className="shell__desc">Pick a mode and get the table moving.</p>
      </section>
      <nav className="shell__others" aria-label="Modes">
        {MODES.map((m) => (
          <Link key={m.path} to={m.path} className="shell__link">
            <span className="shell__link-title">{m.title}</span>
            <span className="shell__link-desc">{m.description}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
