"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addToBidTracker } from "@/lib/bid-tracker";
import type {
  DailyMatches,
  MatchDecision,
  MatchDecisionResult,
  QuestionOfTheDay,
} from "@/lib/daily-habits-types";

// Daily work habits on Home: opportunity matches and the Question of the
// day. The RPCs authorize and validate; their messages are member-facing.

type ActionResult<T = undefined> = { ok: true; data: T; notice?: string } | { ok: false; error: string };

function errorMessage(err: { message?: string } | null, fallback: string) {
  return err?.message?.trim() || fallback;
}

export async function fetchDailyMatchesAction(): Promise<DailyMatches | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("opportunity_matches_today");
  if (error) {
    console.error("fetchDailyMatchesAction failed", error);
    return null;
  }
  return data as unknown as DailyMatches | null;
}

export async function openMatchAction(matchId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("opportunity_match_open", { p_match: matchId });
}

// "Save" also adds the opportunity to the Bid Tracker as Interested. If the
// Free plan's active-bid cap is hit, the choice still counts toward today's
// review (and teaches the matcher) — the member is told it wasn't added.
export async function decideMatchAction(
  matchId: string,
  opportunityId: string,
  decision: MatchDecision,
): Promise<ActionResult<MatchDecisionResult>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to review your matches." };

  let notice: string | undefined;
  if (decision === "save") {
    const saved = await addToBidTracker(user.id, opportunityId);
    if (saved.error) {
      notice = saved.limitReached
        ? `${saved.error} Close out a bid (Won, Lost or Not submitted) or upgrade to Pro for unlimited bids.`
        : saved.error;
    } else revalidatePath("/opportunities");
  }

  const { data, error } = await supabase.rpc("opportunity_match_decide", { p_match: matchId, p_decision: decision });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't record that. Please try again.") };
  return { ok: true, data: data as unknown as MatchDecisionResult, notice };
}

export async function fetchQuestionOfTheDayAction(): Promise<QuestionOfTheDay | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_question_today");
  if (error) {
    console.error("fetchQuestionOfTheDayAction failed", error);
    return null;
  }
  return data as unknown as QuestionOfTheDay | null;
}

export async function voteQuestionAction(optionId: string): Promise<ActionResult<QuestionOfTheDay>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_question_vote", { p_option: optionId });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't record your vote. Please try again.") };
  return { ok: true, data: data as unknown as QuestionOfTheDay };
}

export async function suggestQuestionAction(question: string, options: string[]): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("daily_question_suggest", { p_question: question, p_options: options });
  if (error) return { ok: false, error: errorMessage(error, "Couldn't send your suggestion. Please try again.") };
  return { ok: true, data: undefined };
}
