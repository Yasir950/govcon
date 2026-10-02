import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSamGovSync } from "@/lib/sam-gov/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Host-agnostic scheduled trigger: no vercel.json/pg_cron dependency baked
// in here, any scheduler (Vercel Cron, GitHub Actions, a plain cron+curl
// box) can hit this route as long as it sends the shared secret. Runs with
// the service-role client since a cron request has no signed-in user.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runSamGovSync({ supabase: createAdminClient(), trigger: "cron" });
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
