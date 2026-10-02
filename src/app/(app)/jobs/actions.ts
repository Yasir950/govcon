"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";
import { getPlanLimit } from "@/lib/entitlements";
import { getJobApplicationCountLastHour, getJobApplicationCountThisMonth } from "@/lib/supabase/queries";
import { clearanceEligibility } from "@/lib/clearance";

export type JobEngagementResult = { active: boolean; error?: string };

// Pro is "unlimited but rate-limited" per spec 9.4 — this hourly ceiling is
// an anti-abuse/anti-automation guard, not a plan entitlement (it isn't a
// number a plan change should ever alter), so it stays a constant rather
// than living in plan_limits.
const PRO_HOURLY_APPLICATION_LIMIT = 20;

// Real, persisted saved-job state — replaces the previous localStorage-only
// "gcuSavedJobs" set (job_saves, 20260918010900_job_engagement.sql).
export async function toggleJobSaveAction(jobId: string): Promise<JobEngagementResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { active: false, error: "You must be signed in to save jobs." };

  const { data: existing } = await supabase
    .from("job_saves")
    .select("id")
    .eq("profile_id", user.id)
    .eq("job_id", jobId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("job_saves").delete().eq("id", existing.id);
    if (error) return { active: true, error: "Couldn't remove that job from Saved. Please try again." };
    revalidatePath("/jobs");
    return { active: false };
  }

  const { error } = await supabase.from("job_saves").insert({ profile_id: user.id, job_id: jobId });
  if (error && error.code !== "23505") return { active: false, error: "Couldn't save that job. Please try again." };
  revalidatePath("/jobs");
  return { active: true };
}

export type ApplicantContactDefaults = { email: string; phone: string | null };

// Prefills the Easy Apply form's email/phone the way LinkedIn prefills its
// own contact-info page — real values from the signed-in account (auth
// email, profiles.phone), never fabricated. First/last name come from the
// already-available Viewer prop at the call site, so aren't refetched here.
export async function getApplicantContactDefaultsAction(): Promise<ApplicantContactDefaults | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle();
  return { email: user.email ?? "", phone: profile?.phone ?? null };
}

export type SubmitApplicationResult = { error?: string; applicationId?: string };

// Real job application (spec 9.4): resume upload, cover note, consent,
// duplicate prevention (unique profile_id+job_id, re-applying after a
// withdrawal re-opens the same row rather than erroring), confirmation,
// and a notification to the hiring company's authorized admins. Replaces
// the previous one-click boolean "Quick Apply" toggle.
export async function submitJobApplicationAction(formData: FormData): Promise<SubmitApplicationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to apply." };

  const jobId = String(formData.get("jobId") || "");
  if (!jobId) return { error: "Missing job reference." };
  if (formData.get("consent") !== "on") return { error: "You must consent to share your application with the hiring company." };

  // LinkedIn Easy Apply-style contact info, captured as a real snapshot of
  // what was submitted rather than read live off the profile later.
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!firstName || !lastName) return { error: "Add your first and last name." };
  if (!email) return { error: "Add an email address." };
  if (!phone) return { error: "Add a phone number." };
  const streetAddress = String(formData.get("streetAddress") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const stateRegion = String(formData.get("stateRegion") || "").trim() || null;
  const postalCode = String(formData.get("postalCode") || "").trim() || null;

  const resume = formData.get("resume");
  if (!(resume instanceof File) || resume.size === 0) return { error: "Attach a resume to apply." };
  if (resume.size > 5 * 1024 * 1024) return { error: "Resume must be smaller than 5MB." };
  const allowedTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if (!allowedTypes.includes(resume.type)) return { error: "Resume must be a PDF or Word document." };

  const coverNote = String(formData.get("coverNote") || "").trim();

  const { data: existing } = await supabase
    .from("job_applications")
    .select("id, status")
    .eq("profile_id", user.id)
    .eq("job_id", jobId)
    .maybeSingle();
  if (existing && existing.status !== "withdrawn") {
    return { error: "You've already applied to this job." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan_selection, clearance, clearance_status")
    .eq("id", user.id)
    .maybeSingle();

  const { data: jobClearanceRow } = await supabase.from("jobs").select("clearance, closed_at").eq("id", jobId).maybeSingle();
  if (jobClearanceRow?.closed_at) return { error: "This job is no longer accepting applications." };
  if (jobClearanceRow) {
    const eligibility = clearanceEligibility(profile?.clearance, profile?.clearance_status, jobClearanceRow.clearance);
    if (!eligibility.ok) {
      return {
        error:
          eligibility.reason === "level"
            ? `This role requires ${jobClearanceRow.clearance} clearance. Add it to your profile and upload proof to apply.`
            : `This role requires a verified ${jobClearanceRow.clearance} clearance. Upload proof on your profile and wait for it to be verified before applying.`,
      };
    }
  }

  const isPro = profile?.plan_selection === "pro";
  if (!isPro) {
    const applicationLimit = await getPlanLimit("free", "job_applications_per_month");
    if (applicationLimit !== null) {
      const countThisMonth = await getJobApplicationCountThisMonth(user.id);
      if (countThisMonth >= applicationLimit) {
        return {
          error: `You've reached the Free plan's ${applicationLimit} applications this month. Upgrade to Pro for unlimited applications.`,
        };
      }
    }
  } else {
    const countLastHour = await getJobApplicationCountLastHour(user.id);
    if (countLastHour >= PRO_HOURLY_APPLICATION_LIMIT) {
      return { error: `You've submitted ${PRO_HOURLY_APPLICATION_LIMIT} applications in the last hour. Please wait and try again.` };
    }
  }

  const extension = resume.name.split(".").pop() || "pdf";
  const resumePath = `${user.id}/${jobId}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("resumes").upload(resumePath, resume, { upsert: true, contentType: resume.type });
  if (uploadError) return { error: "Couldn't upload your resume. Please try again." };

  const contactFields = {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    street_address: streetAddress,
    city,
    state_region: stateRegion,
    postal_code: postalCode,
  };

  let applicationId: string;
  if (existing) {
    const { error } = await supabase
      .from("job_applications")
      .update({
        status: "new",
        resume_storage_path: resumePath,
        cover_note: coverNote || null,
        consent_at: new Date().toISOString(),
        ...contactFields,
      })
      .eq("id", existing.id);
    if (error) return { error: "Couldn't submit that application. Please try again." };
    applicationId = existing.id;
    await supabase.from("job_application_status_history").insert({ application_id: applicationId, from_status: "withdrawn", to_status: "new", changed_by_profile_id: user.id });
  } else {
    const { data, error } = await supabase
      .from("job_applications")
      .insert({ profile_id: user.id, job_id: jobId, resume_storage_path: resumePath, cover_note: coverNote || null, ...contactFields })
      .select("id")
      .single();
    if (error) return { error: "Couldn't submit that application. Please try again." };
    applicationId = data.id;
    await supabase.from("job_application_status_history").insert({ application_id: applicationId, from_status: null, to_status: "new", changed_by_profile_id: user.id });
  }

  const { data: job } = await supabase.from("jobs").select("title, company_id, slug, companies(slug)").eq("id", jobId).maybeSingle();
  if (job?.company_id && job.companies) {
    // company_admins' own RLS only shows a member their own grant -- an
    // applicant reading who else administers this company goes through
    // the company_admin_profile_ids() RPC (security definer) instead.
    const { data: adminIds } = await supabase.rpc("company_admin_profile_ids", { target_company_id: job.company_id });
    const { data: applicant } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
    for (const adminId of adminIds ?? []) {
      await createNotification({
        recipientId: adminId,
        actorId: user.id,
        type: "job_application_received",
        subjectType: "job",
        subjectId: jobId,
        title: `${applicant ? `${applicant.first_name} ${applicant.last_name}` : "A member"} applied to ${job.title}`,
        linkPath: `companies/${job.companies.slug}/jobs/${job.slug}/applicants`,
      });
    }
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${job?.slug ?? ""}`);
  return { applicationId };
}

export async function withdrawJobApplicationAction(jobId: string): Promise<JobEngagementResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { active: true, error: "You must be signed in." };

  const { data: existing } = await supabase
    .from("job_applications")
    .select("id")
    .eq("profile_id", user.id)
    .eq("job_id", jobId)
    .maybeSingle();
  if (!existing) return { active: false };

  const { error } = await supabase.from("job_applications").update({ status: "withdrawn" }).eq("id", existing.id);
  if (error) return { active: true, error: "Couldn't withdraw that application. Please try again." };
  await supabase.from("job_application_status_history").insert({ application_id: existing.id, to_status: "withdrawn", changed_by_profile_id: user.id });
  revalidatePath("/jobs");
  return { active: false };
}

export type ReportJobResult = { error?: string };

export async function reportJobAction(
  jobId: string,
  reason: "fraudulent" | "expired" | "duplicate" | "spam" | "inappropriate" | "other",
  details?: string,
): Promise<ReportJobResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to report a job." };

  const { error } = await supabase.from("job_reports").insert({ job_id: jobId, reporter_id: user.id, reason, details: details?.trim() || null });
  if (error) return { error: "Couldn't submit your report. Please try again." };
  return {};
}
