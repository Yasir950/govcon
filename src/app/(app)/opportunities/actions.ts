"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPlanLimit, planFromSelection } from "@/lib/entitlements";
import { getSavedSearchCount } from "@/lib/supabase/queries";
import { isOpportunityClosed } from "@/lib/opportunity-status";

export type OpportunityEngagementResult = { active: boolean; error?: string };

// Real "Responses" — a member expressing interest in a company-posted
// opportunity, no plan cap (the mockup's "Responses" tab has no per-plan
// limit called out in the pricing copy the way saves/applications do).
// Listings with no GovCon company (SAM.gov notices, admin posts) are
// responded to on SAM.gov — GovConUnited doesn't record that interest.
export async function toggleOpportunityResponseAction(opportunityId: string): Promise<OpportunityEngagementResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { active: false, error: "You must be signed in to respond." };

  const { data: existing } = await supabase
    .from("opportunity_responses")
    .select("id")
    .eq("profile_id", user.id)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("opportunity_responses").delete().eq("id", existing.id);
    if (error) return { active: true, error: "Couldn't withdraw your response. Please try again." };
    revalidatePath("/opportunities");
    return { active: false };
  }

  // Also enforced by RLS (20260927000000) — this just gives a readable
  // message instead of a generic insert failure.
  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("status, response_deadline, closed_at, company_id")
    .eq("id", opportunityId)
    .maybeSingle();
  if (!opportunity) return { active: false, error: "This opportunity is no longer available." };
  if (!opportunity.company_id) {
    return { active: false, error: "Respond to this opportunity on SAM.gov." };
  }
  if (isOpportunityClosed(opportunity.status, opportunity.response_deadline, opportunity.closed_at)) {
    return {
      active: false,
      error: opportunity.closed_at
        ? "This opportunity is closed and no longer accepting responses."
        : "The response deadline for this opportunity has passed.",
    };
  }

  const { error } = await supabase
    .from("opportunity_responses")
    .insert({ profile_id: user.id, opportunity_id: opportunityId });
  if (error && error.code !== "23505") return { active: false, error: "Couldn't submit your response. Please try again." };
  revalidatePath("/opportunities");
  return { active: true };
}

export type SaveSearchResult = { error?: string; id?: string };

// Real "Save Search" — replaces the mockup's 3 hardcoded demo rows with
// each member's own saved filter combination. Free members are capped per
// plan_limits ("saved_searches"), shared across both scopes; Pro is
// unlimited (mirrors the saves/applications cap pattern above). `scope`
// keeps a member's Opportunities and Jobs saved searches from mixing —
// this same action backs the Save Search button on both pages.
export async function saveSearchAction(
  name: string,
  filters: Record<string, string>,
  scope: "opportunities" | "jobs" | "companies" = "opportunities",
): Promise<SaveSearchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to save a search." };
  if (!name.trim()) return { error: "Give this search a name." };

  const { data: profile } = await supabase.from("profiles").select("plan_selection").eq("id", user.id).maybeSingle();
  const searchLimit = await getPlanLimit(planFromSelection(profile?.plan_selection), "saved_searches");
  if (searchLimit !== null) {
    const count = await getSavedSearchCount(user.id);
    if (count >= searchLimit) {
      return {
        error: `You've reached the Free plan's ${searchLimit} saved searches. Upgrade to Pro for unlimited saved searches and alerts.`,
      };
    }
  }

  const { data, error } = await supabase
    .from("saved_searches")
    .insert({ profile_id: user.id, name: name.trim(), filters, scope })
    .select("id")
    .single();
  if (error) return { error: "Couldn't save that search. Please try again." };
  revalidatePath(`/${scope}`);
  return { id: data.id };
}

export async function deleteSavedSearchAction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("saved_searches").delete().eq("id", id).eq("profile_id", user.id);
  if (error) return { error: "Couldn't remove that saved search. Please try again." };
  // Called from both the Opportunities/Jobs pages and the combined Saved
  // page, which don't tell us which scope the removed search belonged to.
  revalidatePath("/opportunities");
  revalidatePath("/jobs");
  return {};
}

export type UpdateSavedSearchAlertResult = { error?: string };

// Pro-only alert configuration — Free members can still save/apply/delete
// searches (capped), but push alerting on new matches is a Pro feature per
// spec 9.2 ("Pro users: unlimited saved opportunities and saved searches").
export async function updateSavedSearchAlertAction(
  id: string,
  patch: { alertFrequency?: "instant" | "daily" | "weekly" | "off"; alertChannel?: "in_app" | "email" | "both"; enabled?: boolean },
): Promise<UpdateSavedSearchAlertResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: profile } = await supabase.from("profiles").select("plan_selection").eq("id", user.id).maybeSingle();
  if (profile?.plan_selection !== "pro") {
    return { error: "Saved-search alerts are a Pro feature. Upgrade to Pro to get notified about new matches." };
  }

  const { error } = await supabase
    .from("saved_searches")
    .update({
      ...(patch.alertFrequency ? { alert_frequency: patch.alertFrequency } : {}),
      ...(patch.alertChannel ? { alert_channel: patch.alertChannel } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    })
    .eq("id", id)
    .eq("profile_id", user.id);
  if (error) return { error: "Couldn't update alert settings. Please try again." };
  revalidatePath("/opportunities");
  return {};
}

export type ReportOpportunityResult = { error?: string };

export async function reportOpportunityAction(
  opportunityId: string,
  reason: "incorrect_data" | "expired" | "duplicate" | "spam" | "other",
  details?: string,
): Promise<ReportOpportunityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to report an opportunity." };

  const { error } = await supabase
    .from("opportunity_reports")
    .insert({ opportunity_id: opportunityId, reporter_id: user.id, reason, details: details?.trim() || null });
  if (error) return { error: "Couldn't submit your report. Please try again." };
  return {};
}

export type SaveNoteResult = { error?: string };

export async function saveOpportunityNoteAction(opportunityId: string, body: string): Promise<SaveNoteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to add a note." };

  if (!body.trim()) {
    const { error } = await supabase.from("opportunity_notes").delete().eq("profile_id", user.id).eq("opportunity_id", opportunityId);
    if (error) return { error: "Couldn't clear that note. Please try again." };
    return {};
  }

  const { error } = await supabase
    .from("opportunity_notes")
    .upsert({ profile_id: user.id, opportunity_id: opportunityId, body: body.trim() }, { onConflict: "profile_id,opportunity_id" });
  if (error) return { error: "Couldn't save your note. Please try again." };
  return {};
}

// Close (stop taking Express Interest) or reopen a listing — mirrors
// setJobClosedAction. Goes through the set_opportunity_closed RPC
// (20260928000500), which allows the listing's company admins and platform
// admins, without the Pro requirement on editing.
export async function setOpportunityClosedAction(opportunityId: string, closed: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.rpc("set_opportunity_closed", { target_opportunity: opportunityId, closed });
  if (error) {
    return {
      error: error.message.includes("Not authorized")
        ? "You're not authorized to manage this opportunity."
        : `Couldn't ${closed ? "close" : "reopen"} that opportunity. Please try again.`,
    };
  }

  const { data: opportunity } = await supabase.from("opportunities").select("slug").eq("id", opportunityId).maybeSingle();
  revalidatePath("/opportunities");
  if (opportunity?.slug) revalidatePath(`/opportunities/${opportunity.slug}`);
  return {};
}
