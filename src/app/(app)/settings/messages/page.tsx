import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessageSettingsForm } from "@/components/settings/MessageSettingsForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messaging Settings · GovConUnited" };
export const dynamic = "force-dynamic";

export default async function MessageSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/messages");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan_selection, away_message, away_message_enabled")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <MessageSettingsForm
      isPro={(profile?.plan_selection || "free") === "pro"}
      initialEnabled={profile?.away_message_enabled ?? false}
      initialMessage={profile?.away_message ?? ""}
    />
  );
}
