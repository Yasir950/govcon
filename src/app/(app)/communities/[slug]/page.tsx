import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CommunityLoadingSkeleton } from "@/components/community/CommunityLoadingSkeleton";
import { CommunityPageClient } from "@/components/community/CommunityPageClient";
import { CommunityRightRailSection } from "@/components/community/CommunityRightRailSection";
import { CommunityRightRailSkeleton } from "@/components/community/CommunityRightRailSkeleton";
import {
  getCommunities,
  getCommunityBySlug,
  getCommunityFavoriteIds,
  getCommunityMembers,
  getCommunityMembership,
  getDiscussionSaveIds,
  getMyCommunityIds,
  getModeratedCommunityIds,
  getMyCustomFeeds,
  getMyPostVoteDirections,
  getPostFollowIds,
  getPostModerationLog,
  getPosts,
  getTopContributors,
} from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import type { Community, CommunityMembership, CommunityMemberEntry } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const community = await getCommunityBySlug(slug);
  if (!community) return { title: "Community · GovConUnited" };
  return {
    title: `${community.name} · GovConUnited`,
    description: community.description,
  };
}

export const dynamic = "force-dynamic";

export default async function CommunityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { slug } = await params;
  const { sort } = await searchParams;
  const community = await getCommunityBySlug(slug);
  if (!community) notFound();

  const viewer = await getViewer();

  const rightRail = (
    <Suspense fallback={<CommunityRightRailSkeleton />}>
      <CommunityRightRailSection viewerId={viewer?.id ?? null} activeCommunity={community} />
    </Suspense>
  );

  return (
    <Suspense fallback={<CommunityLoadingSkeleton />}>
      <CommunityDetailMain viewer={viewer} community={community} sort={sort} rightRail={rightRail} />
    </Suspense>
  );
}

async function CommunityDetailMain({
  viewer,
  community,
  sort,
  rightRail,
}: {
  viewer: Viewer | null;
  community: Community;
  sort?: string;
  rightRail: React.ReactNode;
}) {
  const [
    posts,
    members,
    communities,
    voteDirections,
    savedIds,
    followedPostIds,
    myCommunityIds,
    favoriteCommunityIds,
    customFeeds,
    myMembership,
    moderatedCommunityIds,
  ] = await Promise.all([
    getPosts(viewer?.id ?? null),
    getTopContributors(community.id, 5),
    getCommunities(),
    viewer ? getMyPostVoteDirections(viewer.id) : Promise.resolve(new Map<string, "up" | "down">()),
    viewer ? getDiscussionSaveIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer ? getPostFollowIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer ? getMyCommunityIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer ? getCommunityFavoriteIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer ? getMyCustomFeeds(viewer.id) : Promise.resolve([]),
    viewer ? getCommunityMembership(community.id, viewer.id) : Promise.resolve(null as CommunityMembership | null),
    viewer ? getModeratedCommunityIds(viewer.id) : Promise.resolve(new Set<string>()),
  ]);

  // Only fetched for a moderator/owner (or a site admin, who gets real
  // moderator access to every community — see is_community_moderator()) —
  // the members panel (with pending requests + remove/mute/promote) is
  // moderator-only UI, so there's no reason to pull every member's profile
  // for a plain visitor's page load.
  const canModerate = viewer?.isAdmin || myMembership?.isOwner || myMembership?.role === "moderator";
  const [communityMembers, moderationLog]: [CommunityMemberEntry[], Awaited<ReturnType<typeof getPostModerationLog>>] = canModerate
    ? await Promise.all([getCommunityMembers(community.id), getPostModerationLog(community.id)])
    : [[], []];

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
      initialSort={sort === "top" ? "top" : "new"}
      activeCommunity={community}
      myMembership={myMembership}
      communityMembers={communityMembers}
      moderationLog={moderationLog}
      moderatedCommunityIds={[...moderatedCommunityIds]}
    />
  );
}
