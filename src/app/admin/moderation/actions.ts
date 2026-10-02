"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";
import { getViewer } from "@/lib/supabase/viewer";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admin access required");
  return viewer;
}

export type ModerationResult = { error?: string };

export async function resolveReportAction(reportId: string): Promise<ModerationResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("post_reports")
    .update({ status: "resolved", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) return { error: "Couldn't resolve that report. Please try again." };
  revalidatePath("/admin/moderation");
  return {};
}

export async function dismissReportAction(reportId: string): Promise<ModerationResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("post_reports")
    .update({ status: "dismissed", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) return { error: "Couldn't dismiss that report. Please try again." };
  revalidatePath("/admin/moderation");
  return {};
}

// Removes the reported content itself (archives the post, or marks the
// comment removed) and resolves the report in the same action — a real
// moderation outcome, not just a queue dismissal.
export async function removeReportedContentAction(
  reportId: string,
  target: { postId?: string | null; commentId?: string | null },
): Promise<ModerationResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();

  if (target.postId) {
    const { data: post } = await supabase.from("posts").select("author_profile_id, title").eq("id", target.postId).maybeSingle();
    const { error } = await supabase
      .from("posts")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", target.postId);
    if (error) return { error: "Couldn't remove that post. Please try again." };
    if (post?.author_profile_id) {
      await createNotification({
        recipientId: post.author_profile_id,
        actorId: viewer.id,
        type: "moderation_action",
        subjectType: "report",
        subjectId: reportId,
        title: "Your post was removed for violating community guidelines",
        body: post.title,
        linkPath: "community",
      });
    }
  } else if (target.commentId) {
    const { data: comment } = await supabase.from("post_comments").select("author_profile_id").eq("id", target.commentId).maybeSingle();
    const { error } = await supabase.from("post_comments").update({ status: "removed" }).eq("id", target.commentId);
    if (error) return { error: "Couldn't remove that comment. Please try again." };
    if (comment?.author_profile_id) {
      await createNotification({
        recipientId: comment.author_profile_id,
        actorId: viewer.id,
        type: "moderation_action",
        subjectType: "report",
        subjectId: reportId,
        title: "Your comment was removed for violating community guidelines",
        linkPath: "community",
      });
    }
  }

  const { error } = await supabase
    .from("post_reports")
    .update({ status: "resolved", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) return { error: "Content removed, but couldn't update the report. Please refresh." };

  revalidatePath("/admin/moderation");
  revalidatePath("/community");
  return {};
}

// ------------------------------------------------------- opportunity reports

export async function resolveOpportunityReportAction(reportId: string): Promise<ModerationResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunity_reports")
    .update({ status: "resolved", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) return { error: "Couldn't resolve that report. Please try again." };
  revalidatePath("/admin/moderation");
  return {};
}

export async function dismissOpportunityReportAction(reportId: string): Promise<ModerationResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunity_reports")
    .update({ status: "dismissed", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) return { error: "Couldn't dismiss that report. Please try again." };
  revalidatePath("/admin/moderation");
  return {};
}

export async function removeReportedOpportunityAction(reportId: string, opportunityId: string): Promise<ModerationResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();

  const { error: archiveError } = await supabase
    .from("opportunities")
    .update({ status: "archived", archived_at: new Date().toISOString(), archived_reason: "Removed by admin moderation" })
    .eq("id", opportunityId);
  if (archiveError) return { error: "Couldn't remove that listing. Please try again." };

  const { error } = await supabase
    .from("opportunity_reports")
    .update({ status: "resolved", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) return { error: "Listing removed, but couldn't update the report. Please refresh." };

  revalidatePath("/admin/moderation");
  revalidatePath("/opportunities");
  return {};
}

// -------------------------------------------------------------- job reports

export async function resolveJobReportAction(reportId: string): Promise<ModerationResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("job_reports")
    .update({ status: "resolved", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) return { error: "Couldn't resolve that report. Please try again." };
  revalidatePath("/admin/moderation");
  return {};
}

export async function dismissJobReportAction(reportId: string): Promise<ModerationResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("job_reports")
    .update({ status: "dismissed", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) return { error: "Couldn't dismiss that report. Please try again." };
  revalidatePath("/admin/moderation");
  return {};
}

// Removes a fraudulent listing (spec 9.4) without exposing private
// application material — only the job's own status changes here, never
// job_applications rows or resumes.
export async function removeReportedJobAction(reportId: string, jobId: string): Promise<ModerationResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();

  const { error: archiveError } = await supabase.from("jobs").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", jobId);
  if (archiveError) return { error: "Couldn't remove that listing. Please try again." };

  const { error } = await supabase
    .from("job_reports")
    .update({ status: "resolved", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) return { error: "Listing removed, but couldn't update the report. Please refresh." };

  revalidatePath("/admin/moderation");
  revalidatePath("/jobs");
  return {};
}

// ---------------------------------------------------------- company reports

export async function resolveCompanyReportAction(reportId: string): Promise<ModerationResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_reports")
    .update({ status: "resolved", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) return { error: "Couldn't resolve that report. Please try again." };
  revalidatePath("/admin/moderation");
  return {};
}

export async function dismissCompanyReportAction(reportId: string): Promise<ModerationResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_reports")
    .update({ status: "dismissed", resolved_by: viewer.id, resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) return { error: "Couldn't dismiss that report. Please try again." };
  revalidatePath("/admin/moderation");
  return {};
}

// Archives the reported company page (it drops out of the public directory,
// which only lists published companies) and closes every open report on it,
// since several members often flag the same fraudulent/duplicate listing.
export async function removeReportedCompanyAction(companyId: string): Promise<ModerationResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();

  const { error: archiveError } = await supabase
    .from("companies")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", companyId);
  if (archiveError) return { error: "Couldn't remove that company. Please try again." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("company_reports")
    .update({ status: "resolved", resolved_by: viewer.id, resolved_at: now })
    .eq("company_id", companyId)
    .eq("status", "open");
  if (error) return { error: "Company removed, but couldn't update the reports. Please refresh." };

  revalidatePath("/admin/moderation");
  revalidatePath("/admin/companies");
  revalidatePath("/companies");
  return {};
}
