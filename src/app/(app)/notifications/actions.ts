"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getNotifications } from "@/lib/supabase/queries";
import type { NotificationItem } from "@/lib/supabase/queries";

export type NotificationActionResult = { error?: string };

// Client-callable wrapper around getNotifications — lets NotificationsPageClient
// refetch the full list (with resolved actor name/avatar) when its Realtime
// subscription sees a new row land, without duplicating the query's join logic.
export async function getNotificationsAction(limit = 20): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return getNotifications(user.id, limit);
}

export async function markNotificationReadAction(notificationId: string): Promise<NotificationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", user.id);
  if (error) return { error: "Couldn't mark that as read. Please try again." };

  revalidatePath("/notifications");
  return {};
}

export async function markAllNotificationsReadAction(): Promise<NotificationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (error) return { error: "Couldn't mark all as read. Please try again." };

  revalidatePath("/notifications");
  return {};
}
