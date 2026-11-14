// Page pattern: 4, Dashboard / Overview.
import { Link } from 'react-router';
import { Card, EmptyState } from '../../kit';
import { useCurrentCampaign, useDeps, useLive } from '../../data/hooks';
import { campaignCounts } from '../../data/repo/campaigns';
import { Skeleton } from '../../app/Skeleton';
import '../pages.css';

export function Home() {
  const { campaign, loading } = useCurrentCampaign();
  const deps = useDeps();
  const counts = useLive(
    async () => (campaign ? campaignCounts(deps, campaign.id) : undefined),
    [deps, campaign?.id],
  );
  if (loading) return <Skeleton />;

  if (!campaign) {
    return (
      <main className="page" id="main">
        <h1 className="page__title">Prep Desk</h1>
        <EmptyState
          title="Start your first campaign"
          sentence="Give it a name and set what stays off the table. Then roll NPCs, places, rumors and more, and keep the ones you like."
          primary={
            <Link className="key btn btn--solid btn--lg" to="/campaigns/new">
              Create campaign
            </Link>
          }
        />
      </main>
    );
  }

  const base = `/c/${campaign.id}`;
  return (
    <main className="page" id="main">
      <h1 className="page__title">{campaign.name}</h1>
      <p className="page__lede">
        {counts
          ? `${counts.entities} ${counts.entities === 1 ? 'entry' : 'entries'} in your Codex.`
          : ' '}
      </p>
      <div className="tiles">
        <Card variant="plain">
          <div className="tile">
            <h2>Forge</h2>
            <p className="muted">Roll an NPC, a place, a rumor and keep what you like.</p>
            <Link className="key btn btn--solid btn--md" to={`${base}/forge`}>
              Open the Forge
            </Link>
          </div>
        </Card>
        <Card variant="plain">
          <div className="tile">
            <h2>Codex</h2>
            <p className="muted">Everything you saved, searchable.</p>
            <Link className="key btn btn--outline btn--md" to={`${base}/codex`}>
              Open the Codex
            </Link>
          </div>
        </Card>
        <Card variant="plain">
          <div className="tile">
            <h2>Settings</h2>
            <p className="muted">Safety lines, backup and restore.</p>
            <Link className="key btn btn--outline btn--md" to={`${base}/settings`}>
              Open Settings
            </Link>
          </div>
        </Card>
      </div>
      <p>
        <Link className="textlink" to="/campaigns/new">
          New campaign
        </Link>
      </p>
    </main>
  );
}
