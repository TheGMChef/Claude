import { useEffect } from 'react';
import { Navigate, Outlet, useParams } from 'react-router';
import { useCampaign, useCurrentCampaign, useDeps, useSetting } from '../data/hooks';
import { setSetting } from '../data/repo/settings';
import { NotFound } from './NotFound';
import { Skeleton } from './Skeleton';

/** `/forge` and `/codex`: the current campaign's page, else the create-campaign page. */
export function ToCurrentCampaign({ section }: { section: 'forge' | 'codex' }) {
  const { campaign, loading } = useCurrentCampaign();
  if (loading) return <Skeleton />;
  return <Navigate to={campaign ? `/c/${campaign.id}/${section}` : '/campaigns/new'} replace />;
}

/** `/prep` and `/table` were placeholders; they land on the desk. */
export function ToDesk() {
  return <Navigate to="/" replace />;
}

/**
 * The `/c/:cid` layout: loads the campaign, shows not-found when it is gone, and makes it the
 * current campaign (the single writer of that setting for visits by URL).
 */
export function CampaignScope() {
  const { cid = '' } = useParams();
  const { loading, missing } = useCampaign(cid);
  const deps = useDeps();
  const current = useSetting('currentCampaignId');

  const valid = !loading && !missing;
  const needsSet = valid && !current.loading && current.value !== cid;
  useEffect(() => {
    if (needsSet) void setSetting(deps, 'currentCampaignId', cid).catch(() => {});
  }, [needsSet, deps, cid]);

  if (loading) return <Skeleton />;
  if (missing) return <NotFound what="campaign" />;
  return <Outlet />;
}

/** `/c/:cid` itself: once it is the current campaign, go to the desk. */
export function CampaignEntry() {
  const { cid = '' } = useParams();
  const current = useSetting('currentCampaignId');
  if (current.loading || current.value !== cid) return <Skeleton />;
  return <Navigate to="/" replace />;
}
