import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFeedPosts, type FeedCursor } from "@/lib/supabase/queries";

// Backs FeedList's "Load more" — real cursor pagination through
// getFeedPosts, replacing the old fixed posts.slice(0,4) home feed.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ posts: [], nextCursor: null }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const sort = searchParams.get("sort") === "recent" ? "recent" : "top";
  const cursorParam = searchParams.get("cursor");
  let cursor: FeedCursor | null = null;
  if (cursorParam) {
    try {
      cursor = JSON.parse(cursorParam);
    } catch {
      cursor = null;
    }
  }

  const result = await getFeedPosts(user.id, sort, cursor, 10);
  return NextResponse.json(result);
}
