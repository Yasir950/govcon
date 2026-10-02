"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SearchHistoryResult = { error?: string };

// Recorded only on explicit submit/navigation to the results page (never
// per debounced keystroke), with a short per-profile cooldown as pragmatic
// abuse/bloat prevention given this stack has no Redis/edge KV — the real
// risk at this app's scale is history-table bloat from rapid typing, not
// backend load from the (indexed, small-table) ilike search queries
// themselves.
export async function recordSearchAction(query: string): Promise<SearchHistoryResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data: recent } = await supabase
    .from("search_history")
    .select("created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 2000) return {};

  await supabase
    .from("search_history")
    .upsert({ profile_id: user.id, query: trimmed, created_at: new Date().toISOString() }, { onConflict: "profile_id,query" });

  revalidatePath("/search");
  return {};
}

export async function clearSearchHistoryAction(): Promise<SearchHistoryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("search_history").delete().eq("profile_id", user.id);
  if (error) return { error: "Couldn't clear your search history. Please try again." };

  revalidatePath("/search");
  return {};
}

export async function removeSearchHistoryItemAction(query: string): Promise<SearchHistoryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("search_history").delete().eq("profile_id", user.id).eq("query", query);
  if (error) return { error: "Couldn't remove that search. Please try again." };

  revalidatePath("/search");
  return {};
}
