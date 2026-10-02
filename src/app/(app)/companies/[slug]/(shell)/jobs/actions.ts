"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeJobClearance } from "@/lib/clearance";
import { slugify } from "@/lib/slugify";
import { normalizeUrl } from "@/lib/url";
import { notifyFollowersOfCompanyListing } from "@/lib/network-notifications";

export type CompanyJobActionResult = { error?: string };

// Self-service job posting for an authorized company admin (spec 9.4):
// "Only authenticated Pro users with authorized company permissions may
// create/edit/publish/pause/close/renew/archive a job." Both the Pro check
// and the company_admins membership check are independently enforced by
// the jobs RLS policy (20260921000400) -- this is the friendly error path,
// not the real security boundary.
export async function createCompanyJobAction(companyId: string, formData: FormData): Promise<CompanyJobActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: profile } = await supabase.from("profiles").select("plan_selection").eq("id", user.id).maybeSingle();
  if (profile?.plan_selection !== "pro") return { error: "Posting a job requires a Pro plan." };

  const { data: admin } = await supabase.from("company_admins").select("id").eq("company_id", companyId).eq("profile_id", user.id).maybeSingle();
  if (!admin) return { error: "You're not an authorized job poster for this company." };

  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Give the job a title." };

  const applicationType = String(formData.get("applicationType") || "internal") === "external" ? "external" : "internal";
  const applicationUrl = normalizeUrl(String(formData.get("applicationUrl") || ""));
  if (applicationType === "external") {
    if (!applicationUrl) return { error: "Add the URL candidates should apply at." };
    try {
      new URL(applicationUrl);
    } catch {
      return { error: "That application URL doesn't look valid." };
    }
  }

  const { data: company } = await supabase.from("companies").select("slug, name").eq("id", companyId).maybeSingle();

  const categoryId = String(formData.get("categoryId") || "").trim() || null;

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      company_id: companyId,
      title,
      slug: slugify(title, "job"),
      category_id: categoryId,
      location: String(formData.get("location") || "").trim() || "Remote",
      employment_type: String(formData.get("employmentType") || "Full-time"),
      workplace: String(formData.get("workplace") || "On-site"),
      experience_level: String(formData.get("experienceLevel") || "Mid-level"),
      clearance: normalizeJobClearance(String(formData.get("clearance") || "")),
      compensation: String(formData.get("compensation") || "").trim() || "Compensation not disclosed",
      description: String(formData.get("description") || "").trim(),
      tags: String(formData.get("tags") || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      source: "company",
      posted_by_profile_id: user.id,
      status: "published",
      application_type: applicationType,
      application_url: applicationType === "external" ? applicationUrl : null,
    })
    .select("id, slug, location")
    .single();
  if (error) return { error: "Couldn't create that job posting. Please try again." };

  await notifyFollowersOfCompanyListing("job", job.id, user.id);

  revalidatePath("/jobs");
  revalidatePath(`/companies/${company?.slug}`);
  redirect(`/jobs/${job.slug}`);
}

// Editing a posted job's details from the member side, mirroring
// updateCompanyOpportunityAction. Same Pro + company_admins gates as
// creating one (both also enforced by RLS). The slug is kept as-is so
// existing links, saves, and applications keep pointing at the same job.
export async function updateCompanyJobAction(jobId: string, companyId: string, formData: FormData): Promise<CompanyJobActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: profile } = await supabase.from("profiles").select("plan_selection").eq("id", user.id).maybeSingle();
  if (profile?.plan_selection !== "pro") return { error: "Editing a job requires a Pro plan." };

  const { data: admin } = await supabase.from("company_admins").select("id").eq("company_id", companyId).eq("profile_id", user.id).maybeSingle();
  if (!admin) return { error: "You're not an authorized job poster for this company." };

  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "Give the job a title." };

  const applicationType = String(formData.get("applicationType") || "internal") === "external" ? "external" : "internal";
  const applicationUrl = normalizeUrl(String(formData.get("applicationUrl") || ""));
  if (applicationType === "external") {
    if (!applicationUrl) return { error: "Add the URL candidates should apply at." };
    try {
      new URL(applicationUrl);
    } catch {
      return { error: "That application URL doesn't look valid." };
    }
  }

  const categoryId = String(formData.get("categoryId") || "").trim() || null;

  const { data: job, error } = await supabase
    .from("jobs")
    .update({
      title,
      category_id: categoryId,
      location: String(formData.get("location") || "").trim() || "Remote",
      employment_type: String(formData.get("employmentType") || "Full-time"),
      workplace: String(formData.get("workplace") || "On-site"),
      experience_level: String(formData.get("experienceLevel") || "Mid-level"),
      clearance: normalizeJobClearance(String(formData.get("clearance") || "")),
      compensation: String(formData.get("compensation") || "").trim() || "Compensation not disclosed",
      description: String(formData.get("description") || "").trim(),
      tags: String(formData.get("tags") || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      application_type: applicationType,
      application_url: applicationType === "external" ? applicationUrl : null,
    })
    .eq("id", jobId)
    .eq("company_id", companyId)
    .select("slug, companies(slug)")
    .maybeSingle();
  if (error || !job) return { error: "Couldn't save your changes. Please try again." };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${job.slug}`);
  if (job.companies?.slug) revalidatePath(`/companies/${job.companies.slug}`);
  redirect(`/jobs/${job.slug}`);
}

export async function updateCompanyJobStatusAction(jobId: string, companyId: string, status: "published" | "draft" | "archived"): Promise<CompanyJobActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: admin } = await supabase.from("company_admins").select("id").eq("company_id", companyId).eq("profile_id", user.id).maybeSingle();
  if (!admin) return { error: "You're not an authorized job poster for this company." };

  const { error } = await supabase
    .from("jobs")
    .update({ status, ...(status === "archived" ? { archived_at: new Date().toISOString() } : {}) })
    .eq("id", jobId)
    .eq("company_id", companyId);
  if (error) return { error: "Couldn't update that job. Please try again." };
  if (status === "published") await notifyFollowersOfCompanyListing("job", jobId, user.id);

  revalidatePath("/jobs");
  return {};
}

// Removes an applicant from a job's list. RLS ("Company admins delete
// applications to their jobs" / "Admins delete any job application",
// 20260927000700) is the real gate — a disallowed delete matches zero rows
// rather than erroring, so the returned row count is what's checked.
export async function deleteJobApplicationAction(applicationId: string): Promise<CompanyJobActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase.from("job_applications").delete().eq("id", applicationId).select("id");
  if (error) return { error: "Couldn't remove that applicant. Please try again." };
  if (!data?.length) return { error: "You don't have permission to remove this applicant." };
  return {};
}

// Close (stop accepting applications) or reopen a listing. Goes through
// the set_job_closed RPC (20260927000900_job_closing.sql), which allows the
// job's company admins and platform admins — without the Pro requirement
// the jobs UPDATE policy puts on editing.
export async function setJobClosedAction(jobId: string, closed: boolean): Promise<CompanyJobActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.rpc("set_job_closed", { target_job: jobId, closed });
  if (error) {
    return {
      error: error.message.includes("Not authorized")
        ? "You're not authorized to manage this job."
        : `Couldn't ${closed ? "close" : "reopen"} that job. Please try again.`,
    };
  }

  const { data: job } = await supabase.from("jobs").select("slug, companies(slug)").eq("id", jobId).maybeSingle();
  revalidatePath("/jobs");
  if (job?.slug) revalidatePath(`/jobs/${job.slug}`);
  if (job?.companies?.slug) revalidatePath(`/companies/${job.companies.slug}`);
  return {};
}
