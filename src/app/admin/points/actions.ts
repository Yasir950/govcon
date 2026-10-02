"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";
import type { Json } from "@/lib/supabase/types";
import { lookupAward, type AwardMatch } from "@/lib/usaspending";

// Admin tools for Points & Rewards. Every point change goes through the
// ledger RPCs (points_admin_*), which re-check admin access themselves and
// require a reason; config edits go straight to the config tables (admin
// RLS policies).

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admin access required");
  return viewer;
}

function done(error: { message?: string } | null, message?: string): Result {
  revalidatePath("/admin/points");
  return error ? { ok: false, error: error.message || "Something went wrong." } : { ok: true, message };
}

export async function adjustPointsAction(userId: string, xp: number, rep: number, credits: number, reason: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("points_admin_adjust", { p_user: userId, p_xp: xp, p_rep: rep, p_credits: credits, p_reason: reason });
  return done(error, "Adjustment recorded.");
}

export async function reverseEventAction(eventId: string, reason: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("points_admin_reverse_event", { p_event: eventId, p_reason: reason });
  return done(error, "Event reversed.");
}

export async function reverseSourceAction(sourceType: string, sourceId: string, reason: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_admin_reverse_source", { p_source_type: sourceType, p_source_id: sourceId, p_reason: reason });
  return done(error, `${data ?? 0} point events reversed.`);
}

export async function reverseAccountAction(userId: string, since: string, reason: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_admin_reverse_account", { p_user: userId, p_since: since, p_reason: reason });
  return done(error, `${data ?? 0} point events reversed.`);
}

export async function applyPenaltyAction(userId: string, level: number, reason: string, since: string | null): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("points_admin_penalty", {
    p_user: userId,
    p_level: level,
    p_reason: reason,
    p_since: since ?? undefined,
  });
  return done(error, `Penalty level ${level} applied.`);
}

export async function liftPenaltyAction(userId: string, what: "pause" | "leaderboard" | "suspension" | "connection_xp", reason: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("points_admin_lift_penalty", { p_user: userId, p_what: what, p_reason: reason });
  return done(error, "Lifted.");
}

export async function awardBadgeAction(userId: string, code: string, communityId: string | null, note: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_admin_award_badge", {
    p_user: userId,
    p_code: code,
    p_community: communityId as string,
    p_note: note,
  });
  if (!error && data === false) return { ok: false, error: "That member already has this badge." };
  return done(error, "Badge awarded.");
}

export async function revokeBadgeAction(userBadgeId: string, reason: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("points_admin_revoke_badge", { p_user_badge: userBadgeId, p_reason: reason });
  return done(error, "Badge revoked.");
}

export async function resolveFlagAction(flagId: string, status: "resolved" | "dismissed", note: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("points_admin_resolve_flag", { p_flag: flagId, p_status: status, p_note: note });
  return done(error);
}

export async function decideRedemptionAction(id: string, approve: boolean, reason: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("points_admin_decide_redemption", { p_id: id, p_approve: approve, p_reason: reason });
  return done(error, approve ? "Marked fulfilled." : "Declined and refunded.");
}

export async function finalizeSeasonAction(seasonId: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("points_admin_finalize_season", { p_season: seasonId });
  return done(error, "Season finalized and rewards paid.");
}

// "Config, not code": the editable columns per config table.
const EDITABLE: Record<string, { pk: string; columns: string[] }> = {
  points_settings: { pk: "key", columns: ["value"] },
  point_rules: { pk: "action_type", columns: ["label", "xp", "rep", "credits", "daily_cap", "monthly_cap", "counts_for_streak", "notes", "active"] },
  point_levels: { pk: "level", columns: ["rank_name", "xp_required", "credits_reward", "pro_days", "unlocks"] },
  streak_milestones: { pk: "days", columns: ["xp", "credits", "badge_code", "multiplier", "flair"] },
  streak_buddy_milestones: { pk: "days", columns: ["xp", "credits", "badge_code"] },
  company_leaderboard_prizes: { pk: "rank", columns: ["credits_per_employee", "top_badge"] },
  quests: { pk: "id", columns: ["title", "difficulty", "target_count", "weight", "requires", "quest_set", "link_path", "active"] },
  challenge_templates: { pk: "id", columns: ["title", "description", "xp", "credits", "sort_order", "active"] },
  challenges: { pk: "id", columns: ["title", "description", "xp", "credits", "starts_at", "ends_at"] },
  badges: { pk: "id", columns: ["name", "description", "threshold", "credits", "hidden", "active"] },
  rewards: { pk: "id", columns: ["name", "description", "price", "limit_count", "limit_period", "min_level", "stock_count", "stock_period", "active"] },
  seasons: { pk: "id", columns: ["name", "theme", "featured_challenge_code", "starts_at", "ends_at"] },
  federal_holidays: { pk: "day", columns: ["name"] },
};

export async function updateConfigAction(table: string, pkValue: string | number, patch: Record<string, unknown>): Promise<Result> {
  await requireAdmin();
  const spec = EDITABLE[table];
  if (!spec) return { ok: false, error: "That table isn't editable." };
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (spec.columns.includes(k)) clean[k] = v === "" ? null : v;
  if (table === "points_settings" && typeof clean.value === "string") {
    try {
      clean.value = JSON.parse(clean.value as string) as Json;
    } catch {
      return { ok: false, error: "Setting values must be valid JSON (numbers, true/false, \"text\" or null)." };
    }
    clean.updated_at = new Date().toISOString();
  }
  const supabase = await createClient();
  // Dynamic table name: the whitelist above is the guard.
  const { error } = await (supabase.from(table as "point_rules") as unknown as ReturnType<typeof supabase.from>)
    .update(clean as never)
    .eq(spec.pk, pkValue as never);
  return done(error, "Saved.");
}

export async function addHolidayAction(day: string, name: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("federal_holidays").upsert({ day, name });
  return done(error, "Holiday saved.");
}

export async function deleteHolidayAction(day: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("federal_holidays").delete().eq("day", day);
  return done(error, "Holiday removed.");
}

// Start a weekly challenge from a template for the current (or next) workweek.
export async function startChallengeAction(templateId: string, weekStart: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: t } = await supabase.from("challenge_templates").select("*").eq("id", templateId).maybeSingle();
  if (!t) return { ok: false, error: "Template not found." };
  const start = new Date(weekStart);
  const end = new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000);
  const { error } = await supabase.from("challenges").insert({
    template_id: t.id,
    title: t.title,
    description: t.description,
    requirements: t.requirements,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    xp: t.xp,
    credits: t.credits,
  });
  return done(error, "Challenge scheduled.");
}

export async function deleteChallengeAction(id: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("challenges").delete().eq("id", id);
  return done(error, "Challenge removed.");
}

export async function addQuestAction(input: {
  code: string;
  title: string;
  difficulty: "easy" | "medium" | "contribution" | "bonus";
  targetCount: number;
  actionTypes: string[];
  filters: string;
  linkPath: string;
}): Promise<Result> {
  await requireAdmin();
  let filters: Json = {};
  try {
    filters = input.filters.trim() ? (JSON.parse(input.filters) as Json) : {};
  } catch {
    return { ok: false, error: "Filters must be valid JSON." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("quests").insert({
    code: input.code,
    title: input.title,
    difficulty: input.difficulty,
    target_count: input.targetCount,
    action_types: input.actionTypes,
    filters,
    link_path: input.linkPath || null,
  });
  return done(error, "Quest added to the pool.");
}

// ------------------------------------------------------ Surprise bonuses

// p_local is an Eastern wall-clock time ("YYYY-MM-DDTHH:mm" from a
// datetime-local input); the RPC converts it.
export async function scheduleDoubleXpAction(local: string, minutes: number): Promise<Result> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return { ok: false, error: "Pick a start date and time." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("double_xp_admin_schedule", { p_local: `${local}:00`, p_minutes: minutes });
  return done(error, "Double XP hour scheduled. Members only see it once it starts.");
}

export async function cancelDoubleXpAction(id: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("double_xp_admin_cancel", { p_id: id });
  return done(error, "Double XP hour cancelled.");
}

// ------------------------------------------------- Question of the day

// The question day is site-wide, in Eastern time (daily_question_day()).
function pastDayError(day: string | null): string | null {
  if (!day) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  return day < today ? "Pick today or a later day." : null;
}

function cleanOptions(options: string[]) {
  return options.map((o) => o.trim()).filter(Boolean);
}

function validateQuestion(question: string, options: string[]): string | null {
  if (question.trim().length < 10 || question.trim().length > 200) return "Questions need 10 to 200 characters.";
  if (options.length < 2 || options.length > 5) return "Give 2 to 5 answer options.";
  if (options.some((o) => o.length > 80)) return "Answer options can be up to 80 characters.";
  return null;
}

async function replaceOptions(supabase: Awaited<ReturnType<typeof createClient>>, questionId: string, options: string[]) {
  const { error } = await supabase.from("daily_question_options").delete().eq("question_id", questionId);
  if (error) return error;
  const { error: insertError } = await supabase
    .from("daily_question_options")
    .insert(options.map((label, i) => ({ question_id: questionId, label, sort_order: i + 1 })));
  return insertError;
}

// Admin-written questions go straight into the queue (approved). With a
// day they run that day; otherwise they run when their turn comes.
export async function createQuestionAction(question: string, rawOptions: string[], day: string | null): Promise<Result> {
  const viewer = await requireAdmin();
  const options = cleanOptions(rawOptions);
  const invalid = validateQuestion(question, options) ?? pastDayError(day);
  if (invalid) return { ok: false, error: invalid };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_questions")
    .insert({ question: question.trim(), status: "approved", day: day || null, reviewed_by: viewer.id, reviewed_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) return done(error.code === "23505" ? { message: "Another question is already scheduled for that day." } : error);
  return done(await replaceOptions(supabase, data.id, options), "Question added to the queue.");
}

// Approving a member's suggestion can tidy its wording and answers first.
// The suggester is paid when it goes live, not on approval.
export async function reviewQuestionAction(
  id: string,
  approve: boolean,
  edits: { question: string; options: string[] } | null,
  reason: string | null,
): Promise<Result> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  if (!approve) {
    const { error } = await supabase
      .from("daily_questions")
      .update({ status: "rejected", reject_reason: reason?.trim() || null, reviewed_by: viewer.id, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending");
    return done(error, "Suggestion declined.");
  }
  if (edits) {
    const options = cleanOptions(edits.options);
    const invalid = validateQuestion(edits.question, options);
    if (invalid) return { ok: false, error: invalid };
    const { error } = await supabase.from("daily_questions").update({ question: edits.question.trim() }).eq("id", id);
    if (error) return done(error);
    const optionsError = await replaceOptions(supabase, id, options);
    if (optionsError) return done(optionsError);
  }
  const { error } = await supabase
    .from("daily_questions")
    .update({ status: "approved", reviewed_by: viewer.id, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  return done(error, "Approved and queued.");
}

export async function scheduleQuestionAction(id: string, day: string | null): Promise<Result> {
  await requireAdmin();
  const pastDay = pastDayError(day);
  if (pastDay) return { ok: false, error: pastDay };
  const supabase = await createClient();
  const { error } = await supabase.from("daily_questions").update({ day: day || null }).eq("id", id).eq("status", "approved");
  if (error?.code === "23505") return { ok: false, error: "Another question is already scheduled for that day." };
  return done(error, day ? "Scheduled." : "Back in the queue.");
}

export async function deleteQuestionAction(id: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("daily_questions").delete().eq("id", id).neq("status", "published");
  return done(error, "Question removed.");
}

// ------------------------------------------------------- contract wins

export async function lookupAwardAction(awardNumber: string): Promise<{ ok: true; matches: AwardMatch[] } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    return { ok: true, matches: await lookupAward(awardNumber) };
  } catch (err) {
    console.error("lookupAwardAction failed", err);
    return { ok: false, error: "USAspending didn't answer. Try again, or search it on usaspending.gov." };
  }
}

export async function reviewWinAction(winId: string, verified: boolean, note: string, award: AwardMatch | null): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("contract_win_review", {
    p_win: winId,
    p_verified: verified,
    p_note: note.trim() || undefined,
    p_award_data: award ? (award as unknown as Json) : undefined,
  });
  revalidatePath("/teaming");
  return done(error, verified ? "Win verified. The member earned their Rep." : "Marked false. Points reversed and Rep penalty applied.");
}

// ------------------------------------------------------ store fulfilment
// Downloads, partner perks and the expert pool (20261001000800_store_rewards.sql).

// The file itself is uploaded from the browser to the private store-files
// bucket (admin storage policy); this records which file a reward hands out.
export async function setStoreFileAction(rewardId: string, path: string | null, name: string | null): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("store_admin_set_file", { p_reward: rewardId, p_path: path ?? "", p_name: name ?? "" });
  revalidatePath("/rewards");
  return done(error, path ? "File attached. Members can buy it now." : "File removed.");
}

export interface PerkInput {
  id: string | null;
  name: string;
  description: string;
  price: number;
  limitCount: number | null;
  limitPeriod: string | null;
  partnerCompanyId: string | null;
  partnerUrl: string;
  sharedCode: string;
  instructions: string;
  active: boolean;
}

export async function savePerkAction(input: PerkInput): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("store_admin_save_perk", {
    p_id: input.id,
    p_name: input.name,
    p_description: input.description,
    p_price: input.price,
    p_limit_count: input.limitCount,
    p_limit_period: input.limitCount ? input.limitPeriod || "ever" : null,
    p_partner_company: input.partnerCompanyId,
    p_partner_url: input.partnerUrl,
    p_shared_code: input.sharedCode,
    p_instructions: input.instructions,
    p_active: input.active,
  });
  revalidatePath("/rewards");
  return done(error, input.id ? "Perk saved." : "Perk added to the store.");
}

export async function addPerkCodesAction(rewardId: string, codes: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("store_admin_add_codes", { p_reward: rewardId, p_codes: codes });
  revalidatePath("/rewards");
  return done(error, `${data ?? 0} new code${data === 1 ? "" : "s"} added.`);
}

// Adds or updates a member in the expert pool, found by email.
export async function setExpertAction(
  email: string | null,
  profileId: string | null,
  reviews: boolean,
  calls: boolean,
  active: boolean,
  note: string,
): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  let id = profileId;
  if (!id) {
    const { data } = await supabase.from("profiles").select("id").ilike("email", (email ?? "").trim()).maybeSingle();
    if (!data) return { ok: false, error: "No member with that email." };
    id = data.id;
  }
  const { error } = await supabase.rpc("store_admin_set_expert", {
    p_profile: id,
    p_reviews: reviews,
    p_calls: calls,
    p_active: active,
    p_note: note,
  });
  revalidatePath("/rewards");
  revalidatePath("/expert-queue");
  return done(error, "Expert pool updated.");
}
