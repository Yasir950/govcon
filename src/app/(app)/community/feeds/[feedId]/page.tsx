import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { CommunityLoadingSkeleton } from "@/components/community/CommunityLoadingSkeleton";
import { CommunityPageClient } from "@/components/community/CommunityPageClient";
import { CommunityRightRailSection } from "@/components/community/CommunityRightRailSection";
import { CommunityRightRailSkeleton } from "@/components/community/CommunityRightRailSkeleton";
import {
  getCommunities,
  getCommunityFavoriteIds,
  getCustomFeedById,
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
  title: "Custom Feed · GovConUnited",
};

export const dynamic = "force-dynamic";

export default async function CustomFeedPage({ params }: { params: Promise<{ feedId: string }> }) {
  const { feedId } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/community/feeds/${feedId}`);

  const feed = await getCustomFeedById(feedId, viewer.id);
  if (!feed) notFound();

  const rightRail = (
    <Suspense fallback={<CommunityRightRailSkeleton />}>
      <CommunityRightRailSection viewerId={viewer.id} activeCommunity={null} />
    </Suspense>
  );

  return (
    <Suspense fallback={<CommunityLoadingSkeleton />}>
      <CustomFeedMain viewer={viewer} feed={feed} rightRail={rightRail} />
    </Suspense>
  );
}

async function CustomFeedMain({
  viewer,
  feed,
  rightRail,
}: {
  viewer: Viewer;
  feed: NonNullable<Awaited<ReturnType<typeof getCustomFeedById>>>;
  rightRail: React.ReactNode;
}) {
  const [posts, members, communities, voteDirections, savedIds, followedPostIds, myCommunityIds, favoriteCommunityIds, customFeeds, moderatedCommunityIds] =
    await Promise.all([
      getPosts(viewer.id),
      getTopContributors("communities", 5),
      getCommunities(),
      getMyPostVoteDirections(viewer.id),
      getDiscussionSaveIds(viewer.id),
      getPostFollowIds(viewer.id),
      getMyCommunityIds(viewer.id),
      getCommunityFavoriteIds(viewer.id),
      getMyCustomFeeds(viewer.id),
      getModeratedCommunityIds(viewer.id),
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
      initialCustomFeeds={customFeeds}
      rightRail={rightRail}
      moderatedCommunityIds={[...moderatedCommunityIds]}
      activeCustomFeed={feed}
    />
  );
}
