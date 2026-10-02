import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  LeaderboardBoard,
  LeaderboardResult,
  PointsHistoryEntry,
  PointsProfile,
  PointsSummary,
  PublicPointsSummary,
  RewardItem,
  RedemptionEntry,
  ExpertRequest,
  StoreStatus,
  BadgeDefinition,
  LevelDefinition,
  PointRule,
  WorthAReadEntry,
} from "@/lib/points-types";

// Server-side readers for the Points & Rewards system. Every value comes
// from the ledger-backed RPCs/tables in supabase/migrations/2026092900050x–
// 0800; nothing here computes points itself.

export async function getMyPointsSummary(): Promise<PointsSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_my_summary");
  if (error) {
    console.error("getMyPointsSummary failed", error);
    return null;
  }
  return (data as unknown as PointsSummary) ?? null;
}

export async function getPointsProfile(userId: string): Promise<PointsProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_profile", { p_user: userId });
  if (error) {
    console.error("getPointsProfile failed", error);
    return null;
  }
  return (data as unknown as PointsProfile) ?? null;
}

export async function getPublicPointsSummaries(ids: string[], communityId?: string | null): Promise<Map<string, PublicPointsSummary>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_public_summaries", {
    p_ids: unique,
    p_community: communityId ?? undefined,
  });
  if (error) {
    console.error("getPublicPointsSummaries failed", error);
    return new Map();
  }
  return new Map((data ?? []).map((row) => [row.user_id, row as unknown as PublicPointsSummary]));
}

export async function getLeaderboard(
  board: LeaderboardBoard,
  opts: { communityId?: string | null; period?: string | null; limit?: number } = {},
): Promise<LeaderboardResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("points_leaderboard", {
    p_board: board,
    p_community: opts.communityId ?? undefined,
    p_period: opts.period ?? undefined,
    p_limit: opts.limit ?? 10,
  });
  if (error) {
    console.error("getLeaderboard failed", error);
    return { rows: [], me: null, label: "", board };
  }
  return data as unknown as LeaderboardResult;
}

export async function getRewardsCatalog(): Promise<RewardItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("rewards").select("*").eq("active", true).order("sort_order");
  return (data ?? []) as RewardItem[];
}

// Availability, stock left and partner info for store rewards that have a
// fulfilment kind (20261001000800_store_rewards.sql).
export async function getStoreStatus(): Promise<StoreStatus> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("store_status");
  return (data ?? {}) as unknown as StoreStatus;
}

// The viewer's expert reviews and calls, keyed by redemption id.
export async function getMyExpertRequests(): Promise<Record<string, ExpertRequest>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("store_my_requests");
  return (data ?? {}) as unknown as Record<string, ExpertRequest>;
}

export async function getMyRedemptions(userId: string): Promise<RedemptionEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("redemptions")
    .select("id, reward_code, price, status, target_type, target_id, expires_at, meta, created_at, decline_reason, rewards(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((r) => ({
    id: r.id,
    rewardCode: r.reward_code,
    rewardName: (r.rewards as { name: string } | null)?.name ?? r.reward_code,
    price: r.price,
    status: r.status,
    targetType: r.target_type,
    targetId: r.target_id,
    expiresAt: r.expires_at,
    meta: (r.meta ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
    declineReason: r.decline_reason,
  }));
}

export async function getPointsHistory(userId: string, limit = 100): Promise<PointsHistoryEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("point_events")
    .select("id, action_type, xp, rep, credits, meta, created_at, reversed_at, reversal_reason, multiplier, point_rules(label)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((e) => ({
    id: e.id,
    actionType: e.action_type,
    label: (e.point_rules as { label: string } | null)?.label ?? e.action_type,
    xp: e.xp,
    rep: e.rep,
    credits: e.credits,
    meta: (e.meta ?? {}) as Record<string, unknown>,
    createdAt: e.created_at,
    reversedAt: e.reversed_at,
    reversalReason: e.reversal_reason,
    multiplier: Number(e.multiplier),
  }));
}

export async function getBadgeCatalog(): Promise<BadgeDefinition[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("badges")
    .select("id, code, family, name, description, category, tier, metric, threshold, hidden, manual, per_community, credits, icon, sort_order")
    .eq("active", true)
    .order("sort_order");
  return (data ?? []) as BadgeDefinition[];
}

export async function getLevels(): Promise<LevelDefinition[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("point_levels").select("*").order("level");
  return (data ?? []) as LevelDefinition[];
}

export async function getPointRules(): Promise<PointRule[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("point_rules").select("*").eq("active", true).order("sort_order");
  return (data ?? []) as PointRule[];
}

export async function getStreakMilestones() {
  const supabase = await createClient();
  const { data } = await supabase.from("streak_milestones").select("*").order("days");
  return data ?? [];
}

export async function getWorthARead(communityId: string): Promise<WorthAReadEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("points_worth_a_read", { p_community: communityId });
  return (data ?? []).map((r) => ({
    redemptionId: r.redemption_id,
    postId: r.post_id,
    slug: r.slug,
    title: r.title,
    body: r.body,
    authorId: r.author_id,
    authorName: r.author_name,
    expiresAt: r.expires_at,
  }));
}

// Ids with an active paid boost — shown first and labeled "Boosted".
export async function getActiveBoostIds(kind: "profile" | "company" | "listing"): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("points_active_boosts", { p_kind: kind });
  return new Set((data ?? []).map((r) => r.target_id));
}

export async function getSeasons() {
  const supabase = await createClient();
  const { data } = await supabase.from("seasons").select("id, code, name, theme, starts_at, ends_at, finalized_at").order("starts_at");
  return data ?? [];
}

export async function getPointsSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = await createClient();
  const { data } = await supabase.from("points_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}
