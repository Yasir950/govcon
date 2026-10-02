import { NextRequest, NextResponse } from "next/server";
import { runDigest, sendDigestPreview, type DigestKind } from "@/lib/network-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KINDS: DigestKind[] = ["weekly_trends", "top_posts"];

// Network digest emails (see src/lib/network-digest.ts). Vercel Cron
// (vercel.json) calls ?kind=weekly_trends on Monday mornings and
// ?kind=top_posts daily, with the same CRON_SECRET bearer as the other
// /api/cron routes. Adding &preview=<profileId>&to=<email> renders that
// member's digest and sends it only to <email>, without logging it.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const kind = params.get("kind") as DigestKind | null;
  if (!kind || !KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of: ${KINDS.join(", ")}` }, { status: 400 });
  }

  try {
    const previewId = params.get("preview");
    const to = params.get("to");
    if (previewId) {
      if (!to) return NextResponse.json({ error: "preview needs a to= address" }, { status: 400 });
      return NextResponse.json(await sendDigestPreview(kind, previewId, to));
    }
    return NextResponse.json(await runDigest(kind));
  } catch (err) {
    console.error("[network-digests] run failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Digest run failed" }, { status: 500 });
  }
}
