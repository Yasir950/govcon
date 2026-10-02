import { CommunityRightRail } from "@/components/community/CommunityRightRail";
import { getRecentlyViewedPosts } from "@/lib/supabase/queries";
import type { Community } from "@/lib/landing-data";

export async function CommunityRightRailSection({
  viewerId,
  activeCommunity,
}: {
  viewerId: string | null;
  activeCommunity: Community | null;
}) {
  const recentlyViewedPosts = viewerId ? await getRecentlyViewedPosts(viewerId) : [];
  return <CommunityRightRail activeCommunity={activeCommunity} initialRecentlyViewed={recentlyViewedPosts} />;
}
