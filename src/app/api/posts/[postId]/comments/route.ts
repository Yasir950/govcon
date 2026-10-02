import { NextRequest, NextResponse } from "next/server";
import { getPostComments } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

// Backs the feed's inline "Comment" expand — loaded on demand the first
// time a post's thread is opened, instead of fetching every post's
// comments up front on every feed page.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const viewer = await getViewer();
  const comments = await getPostComments(postId, viewer?.id ?? null);
  return NextResponse.json({ comments });
}
