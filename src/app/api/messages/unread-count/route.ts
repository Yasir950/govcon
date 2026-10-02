import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUnreadMessageCount } from "@/lib/supabase/queries";

// Backs DashboardShell's Messages badge — fetched client-side so any page
// that renders the shell gets a real count without having to fetch/pass it
// itself. Returns 0 for a signed-out request rather than erroring, since
// the shell only ever renders for a signed-in viewer anyway.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const count = await getUnreadMessageCount(user.id);
  return NextResponse.json({ count });
}
