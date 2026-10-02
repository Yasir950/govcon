import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUnreadNotificationCount } from "@/lib/supabase/queries";

// Backs the bell badge in DashboardShell/SiteHeader — same pattern as the
// existing /api/messages/unread-count.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const count = await getUnreadNotificationCount(user.id);
  return NextResponse.json({ count });
}
