"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CompanyTeamActionResult = { error?: string };

async function requireOwner(companyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isOwner: false };
  const { data } = await supabase
    .from("company_admins")
    .select("id")
    .eq("company_id", companyId)
    .eq("profile_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  return { supabase, user, isOwner: Boolean(data) };
}

// Owner-facing counterpart to admin/companies/admins-actions.ts's
// admin-only grant/revoke -- guarded by the caller actually being an
// 'owner' row for this company (also enforced server-side by RLS via
// is_company_owner(), see 20260921003100), not just a platform admin.
export async function inviteCompanyAdminAction(companyId: string, email: string, role: "admin" | "owner" = "admin"): Promise<CompanyTeamActionResult> {
  const { supabase, user, isOwner } = await requireOwner(companyId);
  if (!user) return { error: "You must be signed in." };
  if (!isOwner) return { error: "Only this company's owner can invite team members." };

  const { data: profile } = await supabase.from("profiles").select("id").eq("email", email.trim().toLowerCase()).maybeSingle();
  if (!profile) return { error: "No member found with that email." };

  const { error } = await supabase.from("company_admins").insert({ company_id: companyId, profile_id: profile.id, role });
  if (error?.code === "23505") return { error: "That member already has access to this company." };
  if (error) return { error: "Couldn't add that team member. Please try again." };

  revalidatePath(`/companies/${companyId}/manage`);
  return {};
}

export async function removeCompanyAdminAction(id: string, companyId: string): Promise<CompanyTeamActionResult> {
  const { supabase, user, isOwner } = await requireOwner(companyId);
  if (!user) return { error: "You must be signed in." };
  if (!isOwner) return { error: "Only this company's owner can remove team members." };

  const { data: target } = await supabase.from("company_admins").select("role").eq("id", id).maybeSingle();
  if (target?.role === "owner") {
    const { count } = await supabase
      .from("company_admins")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) return { error: "A company must always have at least one owner." };
  }

  const { error } = await supabase.from("company_admins").delete().eq("id", id);
  if (error) return { error: "Couldn't remove that team member. Please try again." };
  revalidatePath(`/companies/${companyId}/manage`);
  return {};
}

export type CompanyDeletionResult = { error?: string; success?: boolean };

// No hard self-delete -- flags the company for a platform admin to review
// under Companies → Deletion Requests (with a badge on the admin nav), who
// then archives it or declines. Goes through request_company_deletion()
// because owners have no UPDATE policy on companies.
export async function requestCompanyDeletionAction(companyId: string, reason: string): Promise<CompanyDeletionResult> {
  const { supabase, user, isOwner } = await requireOwner(companyId);
  if (!user) return { error: "You must be signed in." };
  if (!isOwner) return { error: "Only this company's owner can request deletion." };

  const { error } = await supabase.rpc("request_company_deletion", { target_company_id: companyId, reason });
  if (error) {
    return { error: error.message.includes("already pending") ? "A deletion request is already pending." : "Couldn't submit the deletion request. Please try again." };
  }
  revalidatePath("/admin/companies");
  return { success: true };
}
