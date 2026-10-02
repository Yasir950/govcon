"use client";

import { useState } from "react";
import { PostComposer } from "@/components/composer/PostComposer";
import { FeedList } from "@/components/dashboard/FeedList";
import type { FeedCursor } from "@/lib/supabase/queries";
import type { Post, PostComment } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

// Split out of the old monolithic DashboardPageClient — just the
// interactive slice (composer + feed refresh-on-post signal) that needs
// client state, fed by DashboardFeedSection's server-side fetch.
export function DashboardFeedClient({
  viewer,
  initialFeedPosts,
  initialFeedCursor,
  highlightPostId,
  highlightCommentId,
  highlightComments,
}: {
  viewer: Viewer;
  initialFeedPosts: Post[];
  initialFeedCursor: FeedCursor | null;
  highlightPostId?: string | null;
  highlightCommentId?: string | null;
  highlightComments?: PostComment[] | null;
}) {
  // Bumped by PostComposer's onPosted so the feed re-fetches page 1
  // automatically after a new post — previously required a manual reload.
  const [feedRefreshSignal, setFeedRefreshSignal] = useState(0);

  return (
    <main className="home-feed">
      <PostComposer viewer={viewer} onPosted={() => setFeedRefreshSignal((s) => s + 1)} />
      <FeedList
        viewer={viewer}
        initialPosts={initialFeedPosts}
        initialCursor={initialFeedCursor}
        refreshSignal={feedRefreshSignal}
        highlightPostId={highlightPostId}
        highlightCommentId={highlightCommentId}
        highlightComments={highlightComments}
      />
    </main>
  );
}
