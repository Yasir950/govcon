"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  BuddyPerson,
  CompanyBoard,
  NetworkCelebrations,
  ProfileSkillEndorsements,
  StreakBuddyState,
} from "@/lib/team-social-types";

// Team & social: streak buddies, company leaderboards, skill endorsements
// and congratulating connections. The RPCs authorize, validate and pay
// points; their error messages are member-facing.

export type SocialResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

function result<T>(error: { message?: string } | null, data: T, message?: string): SocialResult<T> {
  if (error) return { ok: false, error: error.message?.trim() || "Something went wrong. Please try again." };
  return { ok: true, data, message };
}

// --------------------------------------------------------- streak buddies

export async function fetchStreakBuddyAction(): Promise<StreakBuddyState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("streak_buddy_state");
  if (error) {
    console.error("fetchStreakBuddyAction failed", error);
    return null;
  }
  return data as unknown as StreakBuddyState | null;
}

export async function searchBuddyCandidatesAction(query: string): Promise<BuddyPerson[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("streak_buddy_candidates", { p_query: query.trim() || undefined });
  if (error) {
    console.error("searchBuddyCandidatesAction failed", error);
    return [];
  }
  return (data as unknown as BuddyPerson[]) ?? [];
}

// Every buddy change answers with the fresh state so the card can redraw.
async function buddyDone(error: { message?: string } | null, message: string): Promise<SocialResult<StreakBuddyState | null>> {
  if (error) return result(error, null);
  revalidatePath("/rewards");
  return { ok: true, data: await fetchStreakBuddyAction(), message };
}

export async function inviteBuddyAction(partnerId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("streak_buddy_invite", { p_partner: partnerId });
  return buddyDone(error, "Invite sent. Your buddy streak starts once they accept.");
}

export async function respondBuddyAction(id: string, accept: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("streak_buddy_respond", { p_id: id, p_accept: accept });
  return buddyDone(error, accept ? "You have a streak buddy!" : "Invite declined.");
}

export async function cancelBuddyInviteAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("streak_buddy_cancel", { p_id: id });
  return buddyDone(error, "Invite cancelled.");
}

export async function endBuddyAction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("streak_buddy_end", { p_id: id });
  return buddyDone(error, "Buddy streak ended.");
}

// ---------------------------------------------------- company leaderboard

export async function fetchCompanyBoardAction(month?: string | null): Promise<CompanyBoard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("company_leaderboard", { p_month: month ?? undefined, p_limit: 20 });
  if (error) {
    console.error("fetchCompanyBoardAction failed", error);
    return null;
  }
  return data as unknown as CompanyBoard;
}

// ------------------------------------------------------------- one-tap

export async function fetchSkillEndorsementsAction(profileId: string): Promise<ProfileSkillEndorsements | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("profile_skill_endorsements", { p_profile: profileId });
  if (error) {
    console.error("fetchSkillEndorsementsAction failed", error);
    return null;
  }
  return data as unknown as ProfileSkillEndorsements;
}

export async function setSkillEndorsementAction(
  profileId: string,
  skill: string,
  endorse: boolean,
): Promise<SocialResult<{ endorsed: boolean; count: number } | null>> {
  const supabase = await createClient();
  const { data, error } = endorse
    ? await supabase.rpc("skill_endorse", { p_profile: profileId, p_skill: skill })
    : await supabase.rpc("skill_unendorse", { p_profile: profileId, p_skill: skill });
  return result(error, (data as unknown as { endorsed: boolean; count: number }) ?? null);
}

export async function fetchCelebrationsAction(): Promise<NetworkCelebrations | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("network_celebrations");
  if (error) {
    console.error("fetchCelebrationsAction failed", error);
    return null;
  }
  return data as unknown as NetworkCelebrations;
}

export async function congratulateAction(profileId: string, key: string): Promise<SocialResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("connection_congratulate", { p_profile: profileId, p_key: key });
  return result(error, undefined);
}
