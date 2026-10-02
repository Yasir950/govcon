import { NextRequest, NextResponse } from "next/server";
import { getPostReactors } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

// Backs the feed's "N reactions" click — who reacted, and with what.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const viewer = await getViewer();
  const reactors = await getPostReactors(postId, viewer?.id ?? null);
  return NextResponse.json({ reactors });
}
