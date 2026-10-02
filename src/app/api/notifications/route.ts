import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNotifications } from "@/lib/supabase/queries";

// Backs NotificationsBell's dropdown.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ notifications: [] }, { status: 401 });

  const limit = Number(request.nextUrl.searchParams.get("limit")) || 10;
  const notifications = await getNotifications(user.id, limit);
  return NextResponse.json({ notifications });
}
