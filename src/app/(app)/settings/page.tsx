import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsPageClient } from "@/components/settings/SettingsPageClient";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account Settings · GovConUnited" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "first_name, last_name, plan_selection, marketing_consent, email, job_title, location, company_name, avatar_url, role",
    )
    .eq("id", user.id)
    .maybeSingle();

  const viewer = {
    id: user.id,
    firstName: profile?.first_name || user.email?.split("@")[0] || "Member",
    lastName: profile?.last_name || "",
    planSelection: profile?.plan_selection || "free",
    jobTitle: profile?.job_title,
    location: profile?.location,
    companyName: profile?.company_name,
    avatarUrl: profile?.avatar_url,
    isAdmin: profile?.role === "admin",
  };

  return (
    <SettingsPageClient
      viewer={viewer}
      email={profile?.email || user.email || ""}
      marketingConsent={profile?.marketing_consent ?? false}
      initialTab={tab === "rewards" ? "rewards" : "profile"}
    />
  );
}
