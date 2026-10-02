"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateConversationId } from "@/app/(app)/messages/actions";
import { sendConnectionRequestAction } from "@/app/(app)/network/actions";
import { notifyAudience } from "@/lib/network-notifications";

export type CompanyEngagementResult = { active: boolean; error?: string };

// No company inbox/connection concept exists in this schema (conversations
// and connections are strictly profile-to-profile) -- "Message this
// company" / "Request connection or teaming" resolve to the company's
// preferred contact (its 'owner', falling back to the first admin, per
// company_admin_profile_ids' own ordering) and reuse the existing 1:1
// actions unmodified. A true shared multi-admin company inbox is out of
// scope for this pass.
async function resolveCompanyContactProfileId(companyId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("company_admin_profile_ids", { target_company_id: companyId }).limit(1);
  return data?.[0] ?? null;
}

export type CompanyContactResult = { error?: string; conversationId?: string };

export async function startCompanyConversationAction(companyId: string): Promise<CompanyContactResult> {
  const contactId = await resolveCompanyContactProfileId(companyId);
  if (!contactId) return { error: "This company hasn't set up a contact yet." };
  const result = await getOrCreateConversationId(contactId);
  if (result.error || !result.id) return { error: result.error ?? "Couldn't start a conversation. Please try again." };
  return { conversationId: result.id };
}

export type CompanyConnectResult = { error?: string; success?: boolean };

export async function requestCompanyConnectionAction(companyId: string): Promise<CompanyConnectResult> {
  const contactId = await resolveCompanyContactProfileId(companyId);
  if (!contactId) return { error: "This company hasn't set up a contact yet." };
  const result = await sendConnectionRequestAction(contactId);
  if (result.error) return { error: result.error };
  return { success: true };
}

export type ReportCompanyResult = { error?: string };

export async function reportCompanyAction(
  companyId: string,
  reason: "fraudulent" | "duplicate" | "inaccurate" | "inappropriate" | "spam" | "other",
  details?: string,
): Promise<ReportCompanyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to report a company." };

  // One open report per member per company — a repeat submission would only
  // pad the admin queue with duplicates of the same complaint.
  const { data: existing } = await supabase
    .from("company_reports")
    .select("id")
    .eq("company_id", companyId)
    .eq("reporter_id", user.id)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (existing) return { error: "You've already reported this company. Our team is reviewing it." };

  const { error } = await supabase
    .from("company_reports")
    .insert({ company_id: companyId, reporter_id: user.id, reason, details: details?.trim() || null });
  if (error) return { error: "Couldn't submit your report. Please try again." };
  return {};
}

// Real, persisted company follow state — replaces the previous
// localStorage-only "gcuFollowedCompanies" set (company_follows,
// 20260918020000_social_engagement.sql).
export async function toggleCompanyFollowAction(companyId: string): Promise<CompanyEngagementResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { active: false, error: "You must be signed in to follow companies." };

  const { data: existing } = await supabase
    .from("company_follows")
    .select("id")
    .eq("profile_id", user.id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("company_follows").delete().eq("id", existing.id);
    if (error) return { active: true, error: "Couldn't unfollow that company. Please try again." };
    // "layout" so the company's own profile (/companies/[slug]) refreshes
    // its follower count/avatars too, not just the directory.
    revalidatePath("/companies", "layout");
    return { active: false };
  }

  const { error } = await supabase.from("company_follows").insert({ profile_id: user.id, company_id: companyId });
  if (error && error.code !== "23505") return { active: false, error: "Couldn't follow that company. Please try again." };

  // A genuinely new follow (not a duplicate-insert race) tells the
  // company's admins, the same way profile_followed tells a member.
  if (!error) {
    const [{ data: adminIds }, { data: company }, { data: follower }] = await Promise.all([
      supabase.rpc("company_admin_profile_ids", { target_company_id: companyId }),
      supabase.from("companies").select("name, slug").eq("id", companyId).maybeSingle(),
      supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle(),
    ]);
    const followerName = `${follower?.first_name ?? ""} ${follower?.last_name ?? ""}`.trim() || "A member";
    if (company) {
      notifyAudience(adminIds ?? [], {
        actorId: user.id,
        type: "company_followed",
        subjectType: "company",
        subjectId: companyId,
        title: `${followerName} started following ${company.name}`,
        linkPath: `companies/${company.slug}`,
      });
    }
  }

  revalidatePath("/companies", "layout");
  return { active: true };
}
