import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";
import {
  getActiveNotice,
  getCompanyFollowIds,
  getConnectionStates,
  getDiscussionSaveIds,
  getEventRegistrationIds,
  getJobSaveIds,
  getLandingContent,
  getMyCommunityIds,
  getTrackedOpportunityIds,
  getSiteSettings,
  getVotedPostIds,
  type ConnectionState,
} from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import "./landing.css";

export const metadata: Metadata = {
  title: "GovConUnited — Connect. Compete. Win.",
  description:
    "GovConUnited connects government contractors, subcontractors, consultants, suppliers, and GovCon professionals with opportunities, trusted relationships, resources, and events.",
};

// Re-fetch on every request rather than caching a static build: this is
// live marketing content (opportunities, jobs, events) that should reflect
// database changes immediately, not just at the next deploy.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [content, viewer, siteSettings, activeNotice] = await Promise.all([
    getLandingContent(),
    getViewer(),
    getSiteSettings(),
    getActiveNotice(),
  ]);

  const [votedPostIds, savedOpportunityIds, savedJobIds, connectionStates, followedCompanyIds, registeredEventIds, savedDiscussionIds, myCommunityIds] =
    viewer
      ? await Promise.all([
          getVotedPostIds(viewer.id),
          getTrackedOpportunityIds(viewer.id),
          getJobSaveIds(viewer.id),
          getConnectionStates(viewer.id),
          getCompanyFollowIds(viewer.id),
          getEventRegistrationIds(viewer.id),
          getDiscussionSaveIds(viewer.id),
          getMyCommunityIds(viewer.id),
        ])
      : [new Set<string>(), new Set<string>(), new Set<string>(), new Map<string, ConnectionState>(), new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];

  const networkMembers = viewer
    ? content.networkMembers.filter((m) => m.id !== viewer.id)
    : content.networkMembers;

  return (
    <LandingPage
      {...content}
      networkMembers={networkMembers}
      viewer={viewer}
      votedPostIds={votedPostIds}
      savedOpportunityIds={[...savedOpportunityIds]}
      savedJobIds={[...savedJobIds]}
      connectionStates={Object.fromEntries(connectionStates)}
      followedCompanyIds={[...followedCompanyIds]}
      registeredEventIds={[...registeredEventIds]}
      savedDiscussionIds={[...savedDiscussionIds]}
      myCommunityIds={[...myCommunityIds]}
      siteSettings={siteSettings}
      activeNotice={activeNotice}
    />
  );
}
