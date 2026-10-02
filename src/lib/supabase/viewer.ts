import { createClient } from "@/lib/supabase/server";

export interface Viewer {
  id: string;
  firstName: string;
  lastName: string;
  planSelection: string;
  // Real profile-completeness fields (see 20260918000300_profile_fields_and_avatar.sql)
  // — optional because a member may never have filled them in. Never
  // invented when absent; callers show nothing instead of a placeholder.
  headline?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  companyName?: string | null;
  avatarUrl?: string | null;
  coverImageUrl?: string | null;
  // profiles.clearance (20260927000500_profile_clearance.sql) — self-
  // declared, checked against a job's posted clearance requirement at
  // apply time. Null/undefined means "not set", not "no clearance".
  clearance?: string | null;
  // profiles.clearance_status — only "verified" satisfies a job's
  // clearance requirement (see clearanceEligibility in lib/clearance.ts).
  clearanceStatus?: string | null;
  // profiles.role (20260919000000_admin_role.sql) — gates /admin. Every
  // profile is 'member' unless promoted; never inferred from anything else.
  isAdmin: boolean;
}

// Shared by every page's header/personalization needs. Returns null for an
// anonymous visitor rather than redirecting — pages that require a signed-in
// user (like /dashboard) handle that themselves.
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("first_name, last_name, plan_selection, headline, job_title, location, company_name, avatar_url, cover_image_url, clearance, clearance_status, role")
    .eq("id", user.id)
    .maybeSingle();
  // A failed read (e.g. a column this select names not existing yet) would
  // otherwise silently render every member as an email-named Free non-admin.
  if (error) console.error("getViewer: profile read failed", error);

  return {
    id: user.id,
    firstName: profile?.first_name || user.email?.split("@")[0] || "Member",
    lastName: profile?.last_name || "",
    planSelection: profile?.plan_selection || "free",
    headline: profile?.headline,
    jobTitle: profile?.job_title,
    location: profile?.location,
    companyName: profile?.company_name,
    avatarUrl: profile?.avatar_url,
    coverImageUrl: profile?.cover_image_url,
    clearance: profile?.clearance,
    clearanceStatus: profile?.clearance_status,
    isAdmin: profile?.role === "admin",
  };
}
