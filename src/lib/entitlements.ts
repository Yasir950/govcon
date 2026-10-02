import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Plan = "free" | "pro";

// Keep in sync with the rows seeded in
// supabase/migrations/20260924050000_plan_limits_entitlements.sql.
export type PlanLimitFeature =
  | "active_bids"
  | "saved_searches"
  | "job_applications_per_month"
  | "direct_messages_per_month"
  | "company_pages";

// Centralized, DB-backed plan limits — the single source every action
// reads from, so "Free tracks 5 active bids" only ever needs to change in
// one place (the plan_limits table) instead of being a hardcoded constant
// duplicated across opportunities/actions.ts, jobs/actions.ts, etc.
// Cached per request (React's cache()) since limits rarely change and a
// single request may check several of them.
const getPlanLimitsMap = cache(async (): Promise<Map<string, number | null>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plan_limits").select("plan, feature_key, limit_value");
  if (error) throw error;
  const map = new Map<string, number | null>();
  for (const row of data ?? []) {
    map.set(`${row.plan}:${row.feature_key}`, row.limit_value);
  }
  return map;
});

// Returns the numeric cap for a plan/feature, or null meaning unlimited.
// Throws if the (plan, feature) pair has no seeded row — a missing config
// row is a bug to fix in a migration, not a runtime state to silently
// treat as unlimited.
export async function getPlanLimit(plan: Plan, feature: PlanLimitFeature): Promise<number | null> {
  const map = await getPlanLimitsMap();
  const key = `${plan}:${feature}`;
  if (!map.has(key)) throw new Error(`No plan_limits row for ${key} — seed it in a migration.`);
  return map.get(key) ?? null;
}

export function planFromSelection(planSelection: string | null | undefined): Plan {
  return planSelection === "pro" ? "pro" : "free";
}
