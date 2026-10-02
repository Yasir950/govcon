"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admin access required");
  return viewer;
}

export type CompanyAdminActionResult = { error?: string };

// company_admins grants are admin-only (no self-service "claim your
// company" flow) -- consistent with the existing all-content-is-admin-gated
// model for jobs/opportunities.
export async function grantCompanyAdminAction(companyId: string, email: string): Promise<CompanyAdminActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("id").eq("email", email.trim().toLowerCase()).maybeSingle();
  if (!profile) return { error: "No member found with that email." };

  const { error } = await supabase.from("company_admins").insert({ company_id: companyId, profile_id: profile.id });
  if (error && error.code !== "23505") return { error: "Couldn't grant company admin access. Please try again." };
  if (error?.code === "23505") return { error: "That member is already an admin for this company." };

  revalidatePath(`/admin/companies/${companyId}/edit`);
  return {};
}

export async function revokeCompanyAdminAction(id: string, companyId: string): Promise<CompanyAdminActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("company_admins").delete().eq("id", id);
  if (error) return { error: "Couldn't revoke that access. Please try again." };
  revalidatePath(`/admin/companies/${companyId}/edit`);
  return {};
}
