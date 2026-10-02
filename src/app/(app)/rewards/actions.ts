"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slugify";
import type { LeaderboardBoard, LeaderboardResult, PointsSummary, PublicPointsSummary, WorthAReadEntry } from "@/lib/points-types";

// Thin wrappers around the Points & Rewards RPCs. The RPCs do their own
// authorization and validation; errors come back as the member-facing
// message the database raised.

type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

function errorMessage(err: { message?: string } | null, fallback: string) {
  return err?.message?.trim() || fallback;
}

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

// First visit of the day (+5 XP), comeback detection and today's quests.
export async function dailyCheckInAction(timezone: string | null): Promise<PointsSummary | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc("points_daily_checkin", {
    p_timezone: timezone ?? undefined,
    p_ip: (await clientIp()) ?? undefined,
  });
  if (error) {
    console.error("dailyCheckInAction failed", error);
    return null;
  }
  return data as unknown as PointsSummary;
}

export async function fetchMySummaryAction(): Promise<PointsSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_my_summary");
  if (error) return null;
  return data as unknown as PointsSummary;
}

export async function fetchPublicSummariesAction(ids: string[], communityId: string | null): Promise<PublicPointsSummary[]> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 200);
  if (unique.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("points_public_summaries", { p_ids: unique, p_community: communityId ?? undefined });
  return (data ?? []) as unknown as PublicPointsSummary[];
}

export async function fetchLeaderboardAction(
  board: LeaderboardBoard,
  communityId: string | null,
  period: string | null,
  limit = 10,
): Promise<LeaderboardResult | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_leaderboard", {
    p_board: board,
    p_community: communityId ?? undefined,
    p_period: period ?? undefined,
    p_limit: limit,
  });
  if (error) return null;
  return data as unknown as LeaderboardResult;
}

// Ids with an active paid boost (Credits store) — shown with a "Boosted" label.
export async function fetchActiveBoostIdsAction(kind: "profile" | "company" | "listing"): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("points_active_boosts", { p_kind: kind });
  return (data ?? []).map((r) => r.target_id);
}

export async function rerollQuestAction(questRowId: string): Promise<ActionResult<PointsSummary>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_reroll_quest", { p_row: questRowId });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't reroll that quest.") };
  return { ok: true, data: data as unknown as PointsSummary };
}

export async function redeemRewardAction(
  code: string,
  targetType?: string | null,
  targetId?: string | null,
): Promise<ActionResult<{ meta: Record<string, unknown>; balance: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_redeem", {
    p_code: code,
    p_target_type: targetType ?? undefined,
    p_target_id: targetId ?? undefined,
  });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't redeem that reward.") };
  const result = data as { message?: string; meta?: Record<string, unknown>; balance?: number };
  revalidatePath("/rewards");
  return { ok: true, message: result.message ?? "Redeemed.", data: { meta: result.meta ?? {}, balance: result.balance ?? 0 } };
}

// Expert reviews and calls: redeems and files the request in one step. The
// capability statement is uploaded first (store-submissions/{member id}/).
export async function requestExpertAction(input: {
  code: string;
  notes: string;
  filePath?: string | null;
  fileName?: string | null;
  link?: string | null;
  availability?: string | null;
}): Promise<ActionResult<{ balance: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("store_request_expert", {
    p_code: input.code,
    p_notes: input.notes,
    p_file_path: input.filePath ?? undefined,
    p_file_name: input.fileName ?? undefined,
    p_link: input.link ?? undefined,
    p_availability: input.availability ?? undefined,
  });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't send that request.") };
  const result = data as { message?: string; balance?: number };
  revalidatePath("/rewards");
  return { ok: true, message: result.message ?? "Sent.", data: { balance: result.balance ?? 0 } };
}

// Undo a redemption within the undo window; the RPC reverses the effect and
// refunds the Credits.
export async function undoRedemptionAction(id: string): Promise<ActionResult<{ balance: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_undo_redemption", { p_id: id });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't undo that redemption.") };
  const result = data as { message?: string; balance?: number };
  revalidatePath("/rewards");
  return { ok: true, message: result.message ?? "Undone.", data: { balance: result.balance ?? 0 } };
}

export type RewardsPreferences = Partial<{
  timezone: string;
  leaderboard_opt_out: boolean;
  notify_streak_risk: boolean;
  notify_quests_ready: boolean;
  notify_weekly_recap: boolean;
  notify_rep: boolean;
  notify_leaderboard: boolean;
  notify_season: boolean;
  profile_theme: string | null;
  profile_frame: string | null;
}>;

export async function setRewardsPreferencesAction(prefs: RewardsPreferences): Promise<ActionResult<PointsSummary>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_set_preferences", { p_prefs: prefs });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't save your preferences.") };
  revalidatePath("/settings");
  revalidatePath("/rewards");
  return { ok: true, data: data as unknown as PointsSummary };
}

export async function pinBadgeAction(userBadgeId: string, pinned: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("points_pin_badge", { p_user_badge: userBadgeId, p_pinned: pinned });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't update that badge.") };
  revalidatePath("/rewards");
  return { ok: true };
}

export async function nominateBestAnswerAction(commentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("points_nominate_best_answer", { p_comment: commentId });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't nominate that answer.") };
  return { ok: true, message: "Nominated. The author and moderators have been told." };
}

// "Share to feed" from the level-up and badge modals — a normal feed post.
export async function shareAchievementAction(text: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  const body = text.trim().slice(0, 1000);
  if (!body) return { ok: false, error: "Nothing to share." };
  const { error } = await supabase.from("posts").insert({
    slug: slugify("achievement", "post"),
    title: "Update",
    body,
    category: "General",
    author_profile_id: user.id,
    post_type: "update",
    audience: "public",
    status: "published",
    posted_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: "Couldn't share that. Please try again." };
  revalidatePath("/dashboard");
  return { ok: true, message: "Shared to your feed." };
}

export async function eventCheckInAction(code: string): Promise<ActionResult<{ title: string; eventId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_event_checkin", { p_code: code });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't check you in.") };
  const result = data as { title: string; event_id: string };
  revalidatePath("/events");
  return { ok: true, data: { title: result.title, eventId: result.event_id } };
}

export async function eventAttendancePingAction(eventId: string): Promise<{ ok: boolean; minutes?: number; attended?: boolean; reason?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_event_ping", { p_event: eventId });
  if (error) return { ok: false };
  return data as { ok: boolean; minutes?: number; attended?: boolean; reason?: string };
}

export async function markAttendanceAction(eventId: string, profileId: string, attended: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("points_mark_attendance", { p_event: eventId, p_profile: profileId, p_attended: attended });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't update attendance.") };
  return { ok: true };
}

export async function getEventAttendanceAction(
  eventId: string,
): Promise<{ profileId: string; attendedAt: string | null; method: string | null; minutes: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("points_event_attendance", { p_event: eventId });
  return (data ?? []).map((r) => ({ profileId: r.profile_id, attendedAt: r.attended_at, method: r.attendance_method, minutes: r.minutes }));
}

export async function getEventCheckinCodeAction(eventId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("event_checkin_codes").select("code").eq("event_id", eventId).maybeSingle();
  return data?.code ?? null;
}

export async function decideHighlightAction(redemptionId: string, approve: boolean, reason?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("points_decide_highlight", {
    p_redemption: redemptionId,
    p_approve: approve,
    p_reason: reason ?? undefined,
  });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't update that highlight.") };
  revalidatePath("/communities");
  return { ok: true };
}

// A community's "Worth a read" rail (highlights bought with Credits) and
// whether the viewer moderates it (moderators can decline, refunding them).
export async function fetchWorthAReadAction(communityId: string): Promise<{ entries: WorthAReadEntry[]; canModerate: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data }, modRes] = await Promise.all([
    supabase.rpc("points_worth_a_read", { p_community: communityId }),
    user
      ? supabase.rpc("is_community_moderator", { target_community_id: communityId, target_profile_id: user.id })
      : Promise.resolve({ data: false }),
  ]);
  return {
    canModerate: Boolean(modRes.data),
    entries: (data ?? []).map((r) => ({
      redemptionId: r.redemption_id,
      postId: r.post_id,
      slug: r.slug,
      title: r.title,
      body: r.body,
      authorId: r.author_id,
      authorName: r.author_name,
      expiresAt: r.expires_at,
    })),
  };
}

// Targets a member can pick for targeted store items.
export async function getRedeemTargetsAction(
  kind: "post" | "company" | "listing" | "event" | "official_event",
): Promise<{ id: string; label: string; type?: string }[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  // The free ticket covers GovConUnited's own events, not member-submitted ones.
  if (kind === "official_event") {
    const { data } = await supabase.rpc("store_ticket_events");
    return ((data ?? []) as { id: string; title: string; starts_at: string }[]).map((e) => ({
      id: e.id,
      label: `${e.title} · ${new Date(e.starts_at).toLocaleDateString()}`,
    }));
  }
  if (kind === "post") {
    const { data } = await supabase
      .from("posts")
      .select("id, title, body, communities(name)")
      .eq("author_profile_id", user.id)
      .not("community_id", "is", null)
      .eq("status", "published")
      .is("hidden_at", null)
      .order("created_at", { ascending: false })
      .limit(30);
    return (data ?? []).map((p) => ({
      id: p.id,
      label: `${p.title || p.body.slice(0, 60)} · ${(p.communities as { name: string } | null)?.name ?? "Community"}`,
    }));
  }
  const { data: adminRows } = await supabase.from("company_admins").select("company_id").eq("profile_id", user.id);
  const companyIds = (adminRows ?? []).map((r) => r.company_id);
  if (kind === "company") {
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .eq("status", "published")
      .or(`submitted_by.eq.${user.id}${companyIds.length ? `,id.in.(${companyIds.join(",")})` : ""}`);
    return (data ?? []).map((c) => ({ id: c.id, label: c.name }));
  }
  if (kind === "listing") {
    if (companyIds.length === 0) return [];
    const [jobs, opps] = await Promise.all([
      supabase.from("jobs").select("id, title").in("company_id", companyIds).eq("status", "published").limit(30),
      supabase.from("opportunities").select("id, title").in("company_id", companyIds).eq("status", "published").limit(30),
    ]);
    return [
      ...(jobs.data ?? []).map((j) => ({ id: j.id, label: `Job · ${j.title}`, type: "job" })),
      ...(opps.data ?? []).map((o) => ({ id: o.id, label: `Opportunity · ${o.title}`, type: "opportunity" })),
    ];
  }
  const { data } = await supabase
    .from("events")
    .select("id, title, starts_at")
    .eq("status", "published")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(30);
  return (data ?? []).map((e) => ({ id: e.id, label: `${e.title} · ${new Date(e.starts_at).toLocaleDateString()}` }));
}
