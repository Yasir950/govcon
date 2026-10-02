"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slugify";
import { notifyFollowersOfCompanyListing } from "@/lib/network-notifications";

export type CompanyOpportunityActionResult = { error?: string };

// Self-service opportunity posting for an authorized company admin,
// mirroring createCompanyJobAction exactly. Both the Pro check and the
// company_admins membership check are independently enforced by the
// opportunities RLS policy (20260921001900) -- this is the friendly error
// path, not the real security boundary.
export async function createCompanyOpportunityAction(companyId: string, formData: FormData): Promise<CompanyOpportunityActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: profile } = await supabase.from("profiles").select("plan_selection").eq("id", user.id).maybeSingle();
  if (profile?.plan_selection !== "pro") return { error: "Posting an opportunity requires a Pro plan." };

  const { data: admin } = await supabase.from("company_admins").select("id").eq("company_id", companyId).eq("profile_id", user.id).maybeSingle();
  if (!admin) return { error: "You're not an authorized poster for this company." };

  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Give the opportunity a title." };
  const description = String(formData.get("description") || "").trim();
  if (!description) return { error: "Add a description." };

  const { data: company } = await supabase.from("companies").select("slug, name").eq("id", companyId).maybeSingle();

  const responseDeadline = String(formData.get("responseDeadline") || "");

  const { data: opportunity, error } = await supabase
    .from("opportunities")
    .insert({
      company_id: companyId,
      title,
      slug: slugify(title, "opportunity"),
      location: String(formData.get("location") || "").trim() || "Remote",
      naics_code: String(formData.get("naicsCode") || "").trim() || "000000",
      description,
      response_deadline: responseDeadline ? new Date(responseDeadline).toISOString() : null,
      tags: String(formData.get("tags") || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      source: "manual",
      posted_date: new Date().toISOString().slice(0, 10),
      posted_by_profile_id: user.id,
      status: "published",
    })
    .select("id, slug")
    .single();
  if (error) return { error: "Couldn't create that opportunity. Please try again." };

  await notifyFollowersOfCompanyListing("opportunity", opportunity.id, user.id);

  revalidatePath("/opportunities");
  revalidatePath(`/companies/${company?.slug}`);
  redirect(`/opportunities/${opportunity.slug}`);
}

// Editing a posted opportunity's details from the member side. Same Pro +
// company_admins gates as creating one (both also enforced by RLS). The
// slug is kept as-is so existing links and notifications keep working.
export async function updateCompanyOpportunityAction(
  opportunityId: string,
  companyId: string,
  formData: FormData,
): Promise<CompanyOpportunityActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: profile } = await supabase.from("profiles").select("plan_selection").eq("id", user.id).maybeSingle();
  if (profile?.plan_selection !== "pro") return { error: "Editing an opportunity requires a Pro plan." };

  const { data: admin } = await supabase.from("company_admins").select("id").eq("company_id", companyId).eq("profile_id", user.id).maybeSingle();
  if (!admin) return { error: "You're not an authorized poster for this company." };

  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Give the opportunity a title." };
  const description = String(formData.get("description") || "").trim();
  if (!description) return { error: "Add a description." };

  const responseDeadline = String(formData.get("responseDeadline") || "");

  const { data: opportunity, error } = await supabase
    .from("opportunities")
    .update({
      title,
      location: String(formData.get("location") || "").trim() || "Remote",
      naics_code: String(formData.get("naicsCode") || "").trim() || "000000",
      description,
      response_deadline: responseDeadline ? new Date(responseDeadline).toISOString() : null,
      tags: String(formData.get("tags") || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    })
    .eq("id", opportunityId)
    .eq("company_id", companyId)
    .select("slug, companies(slug)")
    .maybeSingle();
  if (error || !opportunity) return { error: "Couldn't save your changes. Please try again." };

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunity.slug}`);
  if (opportunity.companies?.slug) revalidatePath(`/companies/${opportunity.companies.slug}`);
  redirect(`/opportunities/${opportunity.slug}`);
}

export async function updateCompanyOpportunityStatusAction(
  opportunityId: string,
  companyId: string,
  status: "published" | "draft" | "archived",
): Promise<CompanyOpportunityActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: admin } = await supabase.from("company_admins").select("id").eq("company_id", companyId).eq("profile_id", user.id).maybeSingle();
  if (!admin) return { error: "You're not an authorized poster for this company." };

  const { error } = await supabase
    .from("opportunities")
    .update({ status, ...(status === "archived" ? { archived_at: new Date().toISOString() } : {}) })
    .eq("id", opportunityId)
    .eq("company_id", companyId);
  if (error) return { error: "Couldn't update that opportunity. Please try again." };
  if (status === "published") await notifyFollowersOfCompanyListing("opportunity", opportunityId, user.id);

  revalidatePath("/opportunities");
  return {};
}

// Removes a responder from an opportunity's list. RLS ("Company admins
// delete responses to their opportunities" / "Admins delete any
// opportunity response", 20260927000700) is the real gate — a disallowed
// delete matches zero rows rather than erroring.
export async function deleteOpportunityResponseAction(responseId: string): Promise<CompanyOpportunityActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase.from("opportunity_responses").delete().eq("id", responseId).select("id");
  if (error) return { error: "Couldn't remove that response. Please try again." };
  if (!data?.length) return { error: "You don't have permission to remove this response." };
  return {};
}
