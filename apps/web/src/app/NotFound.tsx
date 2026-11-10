// Page pattern: none of the ten (a message page that sits inside the app shell). Not found is
// one sentence plus one way back.
import { Link } from 'react-router';
import { InkOutline } from '../kit';

export function NotFound({ what = 'page' }: { what?: 'page' | 'campaign' | 'entry' }) {
  const copy =
    what === 'campaign'
      ? "We can't find that campaign. It may have been deleted."
      : what === 'entry'
        ? "We can't find that entry. It may have been deleted."
        : "We can't find that page.";
  return (
    <main className="page page--message" id="main">
      <h1 className="page__title">Nothing here</h1>
      <p className="page__lede">{copy}</p>
      <Link to="/" className="key btn btn--outline btn--md">
        <InkOutline radius="var(--radius-key)" />
        Go to the desk
      </Link>
    </main>
  );
}
