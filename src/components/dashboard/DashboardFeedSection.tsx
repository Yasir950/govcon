import { DashboardFeedClient } from "@/components/dashboard/DashboardFeedClient";
import { getFeedPosts, getPostComments, getPosts, recordPostView } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

// The heaviest of the dashboard's three columns (feed personalization +
// comments + reactions + reposts) — isolated into its own Suspense
// boundary so it doesn't hold up the left/right rails, which are each
// much cheaper on their own.
export async function DashboardFeedSection({
  viewer,
  highlightSlug,
  highlightCommentId,
}: {
  viewer: Viewer;
  highlightSlug?: string;
  highlightCommentId: string | null;
}) {
  const feed = await getFeedPosts(viewer.id, "recent", null, 10);

  // The highlighted post might not be on page 1 of the personalized feed
  // (could be old, or outside what backfill surfaces) — fetch it directly
  // by slug and prepend it so it's guaranteed to be on screen to scroll to,
  // same "find by route" pattern the Community discussion page itself uses.
  let feedPosts = feed.posts;
  let highlightPostId: string | null = null;
  let highlightComments: Awaited<ReturnType<typeof getPostComments>> | null = null;
  if (highlightSlug) {
    const allPosts = await getPosts(viewer.id);
    // Home feed posts only — a community discussion's slug in ?post= must
    // never pull that post into Home under Like/Repost reactions.
    const target = allPosts.find(
      (p) => p.communityId == null && p.route === `community/discussion/${highlightSlug}`,
    );
    if (target) {
      highlightPostId = target.id;
      if (!feedPosts.some((p) => p.id === target.id)) feedPosts = [target, ...feedPosts];
      await recordPostView(target.id, viewer.id);
      // Fetched server-side and seeded directly into that one post's card
      // rather than left to its usual on-demand client fetch, so the
      // relevant comment is guaranteed visible the instant the page loads.
      highlightComments = await getPostComments(target.id, viewer.id);
    }
  }

  return (
    <DashboardFeedClient
      viewer={viewer}
      initialFeedPosts={feedPosts}
      initialFeedCursor={feed.nextCursor}
      highlightPostId={highlightPostId}
      highlightCommentId={highlightCommentId}
      highlightComments={highlightComments}
    />
  );
}
