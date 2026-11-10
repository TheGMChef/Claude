// Page pattern: none of the ten. A single full-page message when the whole app is unusable
// (errors skill: full-page only when the entire view is unusable). It sits outside the router.
import { Button } from '../kit';

export function StorageBlocked({ reason }: { reason: 'blocked' | 'updated' }) {
  return (
    <main className="page page--message" id="main">
      <h1 className="page__title">
        {reason === 'blocked' ? "Prep Desk can't save in this browser" : 'Prep Desk was updated'}
      </h1>
      <p className="page__lede">
        {reason === 'blocked'
          ? 'This browser is blocking storage, so nothing you make could be kept. Try another browser, or leave private browsing.'
          : 'Prep Desk was updated in another tab. Reload to keep going.'}
      </p>
      {reason === 'updated' ? (
        <Button variant="solid" onClick={() => window.location.reload()}>
          Reload
        </Button>
      ) : null}
    </main>
  );
}
