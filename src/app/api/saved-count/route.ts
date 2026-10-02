import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSavedCount } from "@/lib/supabase/queries";

// Backs DashboardShell's "Saved" badge — a real total across every saved
// entity type, replacing the old localStorage-only opportunity-only count.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const count = await getSavedCount(user.id);
  return NextResponse.json({ count });
}
