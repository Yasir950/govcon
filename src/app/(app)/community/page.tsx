import type { Metadata } from "next";
import { Suspense } from "react";
import { CommunityLoadingSkeleton } from "@/components/community/CommunityLoadingSkeleton";
import { CommunityPageClient } from "@/components/community/CommunityPageClient";
import { CommunityRightRailSection } from "@/components/community/CommunityRightRailSection";
import { CommunityRightRailSkeleton } from "@/components/community/CommunityRightRailSkeleton";
import {
  getCommunities,
  getCommunityFavoriteIds,
  getDiscussionSaveIds,
  getMyCommunityIds,
  getModeratedCommunityIds,
  getMyCustomFeeds,
  getMyPostVoteDirections,
  getPostFollowIds,
  getPosts,
  getTopContributors,
} from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import type { Viewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = {
  title: "Community · GovConUnited",
  description: "Conversations and advice from government contracting professionals on GovConUnited.",
};

export const dynamic = "force-dynamic";

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const viewer = await getViewer();

  // rightRail is built here (before the heavy fetch below even starts) and
  // handed down as a prop — its own Suspense boundary lets React start
  // that fetch in parallel with CommunityMain's, rather than waiting for
  // the much slower posts fetch to finish first.
  const rightRail = (
    <Suspense fallback={<CommunityRightRailSkeleton />}>
      <CommunityRightRailSection viewerId={viewer?.id ?? null} activeCommunity={null} />
    </Suspense>
  );

  return (
    <Suspense fallback={<CommunityLoadingSkeleton />}>
      <CommunityMain viewer={viewer} sort={sort} rightRail={rightRail} />
    </Suspense>
  );
}

async function CommunityMain({
  viewer,
  sort,
  rightRail,
}: {
  viewer: Viewer | null;
  sort?: string;
  rightRail: React.ReactNode;
}) {
  const [
    posts,
    members,
    communities,
    savedIds,
    myCommunityIds,
    voteDirections,
    favoriteCommunityIds,
    customFeeds,
    followedPostIds,
    moderatedCommunityIds,
  ] = await Promise.all([
    getPosts(viewer?.id ?? null),
    getTopContributors("communities", 5),
    getCommunities(),
    viewer ? getDiscussionSaveIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer ? getMyCommunityIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer ? getMyPostVoteDirections(viewer.id) : Promise.resolve(new Map<string, "up" | "down">()),
    viewer ? getCommunityFavoriteIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer ? getMyCustomFeeds(viewer.id) : Promise.resolve([]),
    viewer ? getPostFollowIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer ? getModeratedCommunityIds(viewer.id) : Promise.resolve(new Set<string>()),
  ]);

  return (
    <CommunityPageClient
      posts={posts}
      members={members}
      viewer={viewer}
      voteDirections={Object.fromEntries(voteDirections)}
      initialSavedIds={[...savedIds]}
      initialFollowedPostIds={[...followedPostIds]}
      communities={communities}
      myCommunityIds={[...myCommunityIds]}
      initialFavoriteCommunityIds={[...favoriteCommunityIds]}
      moderatedCommunityIds={[...moderatedCommunityIds]}
      initialCustomFeeds={customFeeds}
      rightRail={rightRail}
      initialSort={sort === "top" ? "top" : "new"}
    />
  );
}
