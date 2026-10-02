"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type NotificationPreferences = {
  connections_in_app: boolean;
  connections_email: boolean;
  posts_in_app: boolean;
  posts_email: boolean;
  messages_in_app: boolean;
  messages_email: boolean;
  events_in_app: boolean;
  events_email: boolean;
  opportunities_in_app: boolean;
  opportunities_email: boolean;
  billing_in_app: boolean;
  billing_email: boolean;
  moderation_in_app: boolean;
  moderation_email: boolean;
  security_in_app: boolean;
  security_email: boolean;
  jobs_in_app: boolean;
  jobs_email: boolean;
  teaming_in_app: boolean;
  teaming_email: boolean;
  account_in_app: boolean;
  account_email: boolean;
  following_in_app: boolean;
  following_email: boolean;
  rewards_in_app: boolean;
  rewards_email: boolean;
};

export type UpdatePreferencesResult = { error?: string; success?: boolean };

export async function updateNotificationPreferencesAction(prefs: NotificationPreferences): Promise<UpdatePreferencesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("notification_preferences").upsert({ profile_id: user.id, ...prefs });
  if (error) return { error: "Couldn't save your preferences. Please try again." };

  revalidatePath("/settings/notifications");
  return { success: true };
}
