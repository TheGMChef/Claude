// Page pattern: 4, Dashboard / Overview. Stub: M4 replaces the contents, never grows this one.
import { useCurrentCampaign } from '../../data/hooks';

export function Home() {
  const { campaign } = useCurrentCampaign();
  return (
    <main className="page" id="main">
      <h1 className="page__title">{campaign ? campaign.name : 'Prep Desk'}</h1>
    </main>
  );
}
