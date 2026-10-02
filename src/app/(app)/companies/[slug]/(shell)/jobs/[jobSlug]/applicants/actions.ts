"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";

export type ApplicantActionResult = { error?: string };

async function requireCompanyAdmin(supabase: Awaited<ReturnType<typeof createClient>>, applicationId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." } as const;

  const { data: application } = await supabase
    .from("job_applications")
    .select("id, profile_id, status, job_id, jobs(company_id, title)")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application || !application.jobs) return { error: "Application not found." } as const;

  const { data: admin } = await supabase
    .from("company_admins")
    .select("id")
    .eq("company_id", application.jobs.company_id)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!admin) return { error: "You're not authorized to manage this job's applicants." } as const;

  return { user, application } as const;
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  reviewing: "Reviewing",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export async function updateApplicationStatusAction(applicationId: string, newStatus: string, note?: string): Promise<ApplicantActionResult> {
  const supabase = await createClient();
  const ctx = await requireCompanyAdmin(supabase, applicationId);
  if ("error" in ctx) return ctx;
  const { user, application } = ctx;

  const { error } = await supabase.from("job_applications").update({ status: newStatus }).eq("id", applicationId);
  if (error) return { error: "Couldn't update status. Please try again." };

  await supabase.from("job_application_status_history").insert({
    application_id: applicationId,
    from_status: application.status,
    to_status: newStatus,
    changed_by_profile_id: user.id,
    note: note?.trim() || null,
  });

  await createNotification({
    recipientId: application.profile_id,
    actorId: user.id,
    type: "application_status_changed",
    subjectType: "job",
    subjectId: application.job_id,
    title: `Your application for ${application.jobs!.title} is now "${STATUS_LABEL[newStatus] ?? newStatus}"`,
    body: note?.trim() || null,
    linkPath: "jobs",
  });

  revalidatePath(`/companies`);
  return {};
}

export async function assignApplicationAction(applicationId: string, assigneeProfileId: string | null): Promise<ApplicantActionResult> {
  const supabase = await createClient();
  const ctx = await requireCompanyAdmin(supabase, applicationId);
  if ("error" in ctx) return ctx;

  const { error } = await supabase.from("job_applications").update({ assigned_to_profile_id: assigneeProfileId }).eq("id", applicationId);
  if (error) return { error: "Couldn't update assignment. Please try again." };
  return {};
}

export async function addApplicationNoteAction(applicationId: string, body: string): Promise<ApplicantActionResult> {
  const supabase = await createClient();
  const ctx = await requireCompanyAdmin(supabase, applicationId);
  if ("error" in ctx) return ctx;
  const { user } = ctx;
  if (!body.trim()) return { error: "Note can't be empty." };

  const { error } = await supabase.from("job_application_notes").insert({ application_id: applicationId, author_profile_id: user.id, body: body.trim() });
  if (error) return { error: "Couldn't add that note. Please try again." };
  return {};
}
