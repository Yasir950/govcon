import { NextRequest, NextResponse } from "next/server";
import { getPostReposters } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

// Backs the feed's "N reposts" click — who reposted this (canonical
// original) post, and what they said if it was a quote repost. `postId`
// here must be the canonical original id, same contract as repostAction.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const viewer = await getViewer();
  const reposters = await getPostReposters(postId, viewer?.id ?? null);
  return NextResponse.json({ reposters });
}
