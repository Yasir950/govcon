import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NotificationPreferencesForm } from "@/components/settings/NotificationPreferencesForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notification Preferences · GovConUnited" };
export const dynamic = "force-dynamic";

const DEFAULTS = {
  connections_in_app: true,
  connections_email: true,
  posts_in_app: true,
  posts_email: false,
  messages_in_app: true,
  messages_email: true,
  events_in_app: true,
  events_email: true,
  opportunities_in_app: true,
  opportunities_email: true,
  billing_in_app: true,
  billing_email: true,
  moderation_in_app: true,
  moderation_email: true,
  security_in_app: true,
  security_email: true,
  jobs_in_app: true,
  jobs_email: false,
  teaming_in_app: true,
  teaming_email: false,
  account_in_app: true,
  account_email: true,
  following_in_app: true,
  following_email: true,
  rewards_in_app: true,
  rewards_email: true,
};

export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/notifications");

  const { data: prefs } = await supabase.from("notification_preferences").select("*").eq("profile_id", user.id).maybeSingle();

  return <NotificationPreferencesForm initialPreferences={{ ...DEFAULTS, ...(prefs ?? {}) }} />;
}
