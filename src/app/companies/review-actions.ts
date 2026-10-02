"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyAudience } from "@/lib/network-notifications";
import { createNotification } from "@/lib/notifications";
import {
  getCompanyAnalytics,
  getCompanyReviews,
  type CompanyAnalytics,
  type CompanyReviewItem,
  type CompanyReviewRelationship,
} from "@/lib/supabase/queries";

export type CompanyReviewResult = { error?: string };

const RELATIONSHIPS: CompanyReviewRelationship[] = ["teaming_partner", "prime", "subcontractor", "customer", "employee", "other"];

// Who may write which column (reviewer vs. company admin) and the
// no-self-review rule are enforced in the database (RLS + the
// guard_company_review_update trigger); the checks here only produce
// friendly errors before hitting them.

export async function saveCompanyReviewAction(
  companyId: string,
  input: { rating: number; relationship: string; title: string; body: string },
): Promise<CompanyReviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to review this company." };

  const rating = Math.round(Number(input.rating));
  const title = input.title.trim();
  const body = input.body.trim();
  if (!(rating >= 1 && rating <= 5)) return { error: "Choose a rating from 1 to 5 stars." };
  if (!RELATIONSHIPS.includes(input.relationship as CompanyReviewRelationship)) return { error: "Choose how you worked with this company." };
  if (!title) return { error: "Add a short headline." };
  if (title.length > 120) return { error: "Headline must be 120 characters or fewer." };
  if (!body) return { error: "Tell others about your experience." };
  if (body.length > 4000) return { error: "Review must be 4,000 characters or fewer." };

  const [{ data: isAdmin }, { data: existing }] = await Promise.all([
    supabase.rpc("is_company_admin", { target_company_id: companyId, uid: user.id }),
    supabase.from("company_reviews").select("id").eq("company_id", companyId).eq("reviewer_id", user.id).maybeSingle(),
  ]);
  if (isAdmin) return { error: "You can't review a company you manage." };

  const fields = { rating, relationship: input.relationship, title, body };
  if (existing) {
    const { error } = await supabase.from("company_reviews").update(fields).eq("id", existing.id);
    if (error) return { error: "Couldn't update your review. Please try again." };
  } else {
    const { error } = await supabase.from("company_reviews").insert({ ...fields, company_id: companyId, reviewer_id: user.id });
    if (error) {
      if (error.code === "42501") return { error: "Confirm your email address before reviewing companies." };
      return { error: "Couldn't post your review. Please try again." };
    }

    const [{ data: adminIds }, { data: company }, { data: reviewer }] = await Promise.all([
      supabase.rpc("company_admin_profile_ids", { target_company_id: companyId }),
      supabase.from("companies").select("name, slug").eq("id", companyId).maybeSingle(),
      supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle(),
    ]);
    const reviewerName = `${reviewer?.first_name ?? ""} ${reviewer?.last_name ?? ""}`.trim() || "A member";
    if (company) {
      notifyAudience(adminIds ?? [], {
        actorId: user.id,
        type: "company_reviewed",
        subjectType: "company",
        subjectId: companyId,
        title: `${reviewerName} gave ${company.name} ${rating} star${rating === 1 ? "" : "s"}`,
        body: title,
        linkPath: `companies/${company.slug}?tab=reviews`,
      });
    }
  }

  revalidatePath("/companies", "layout");
  return {};
}

export async function deleteCompanyReviewAction(reviewId: string): Promise<CompanyReviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase.from("company_reviews").delete().eq("id", reviewId).select("id");
  if (error || !data?.length) return { error: "Couldn't delete that review." };
  revalidatePath("/companies", "layout");
  return {};
}

// A company admin's public reply to a review; an empty response removes it.
export async function respondToCompanyReviewAction(reviewId: string, response: string): Promise<CompanyReviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const trimmed = response.trim();
  if (trimmed.length > 2000) return { error: "Response must be 2,000 characters or fewer." };

  const { data: review } = await supabase
    .from("company_reviews")
    .select("id, company_id, reviewer_id, response, companies(name, slug)")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return { error: "That review no longer exists." };

  const { data: isAdmin } = await supabase.rpc("is_company_admin", { target_company_id: review.company_id, uid: user.id });
  if (!isAdmin) return { error: "Only this company's admins can respond." };

  const { error } = await supabase
    .from("company_reviews")
    .update({ response: trimmed || null })
    .eq("id", reviewId);
  if (error) return { error: "Couldn't save your response. Please try again." };

  // Only the first response (not every edit) tells the reviewer.
  if (trimmed && !review.response && review.companies) {
    await createNotification({
      recipientId: review.reviewer_id,
      actorId: user.id,
      type: "company_review_responded",
      subjectType: "company",
      subjectId: review.company_id,
      title: `${review.companies.name} responded to your review`,
      body: trimmed.length > 140 ? `${trimmed.slice(0, 140).trimEnd()}…` : trimmed,
      linkPath: `companies/${review.companies.slug}?tab=reviews`,
    });
  }

  revalidatePath("/companies", "layout");
  return {};
}

// Re-read on Realtime events (the payload lacks reviewer names).
export async function getCompanyReviewsAction(companyId: string): Promise<CompanyReviewItem[]> {
  return getCompanyReviews(companyId);
}

export async function getCompanyAnalyticsAction(companyId: string, days: number): Promise<CompanyAnalytics | null> {
  return getCompanyAnalytics(companyId, days);
}
