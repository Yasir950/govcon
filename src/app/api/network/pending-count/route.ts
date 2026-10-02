import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnectionRequests } from "@/lib/supabase/queries";

// Backs DashboardShell's Network nav badge (pending connection requests) —
// same pattern as the Messages unread-count route.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const requests = await getConnectionRequests(user.id);
  return NextResponse.json({ count: requests.length });
}
