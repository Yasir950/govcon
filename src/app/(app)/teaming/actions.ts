"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TeamingRole } from "@/lib/member-help-types";

// Member-to-member help: teaming board, contract wins, capability statement
// reviews and mentoring. The RPCs authorize, validate and pay points; their
// error messages are member-facing.

export type HelpResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

function result<T>(error: { message?: string } | null, data: T, message?: string): HelpResult<T> {
  if (error) return { ok: false, error: error.message?.trim() || "Something went wrong. Please try again." };
  revalidatePath("/teaming");
  return { ok: true, data, message };
}

function opt(v: string | null | undefined) {
  const t = v?.trim();
  return t ? t : undefined;
}

// --------------------------------------------------------------- teaming

export interface TeamingNeedInput {
  title: string;
  details: string;
  role: TeamingRole;
  setAside?: string;
  agency?: string;
  vehicle?: string;
  naics?: string;
  respondBy?: string;
}

export async function createTeamingNeedAction(input: TeamingNeedInput) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teaming_need_create", {
    p_title: input.title,
    p_details: input.details,
    p_role: input.role,
    p_set_aside: opt(input.setAside),
    p_agency: opt(input.agency),
    p_vehicle: opt(input.vehicle),
    p_naics: opt(input.naics),
    p_respond_by: opt(input.respondBy),
  });
  return result(error, data ?? "", "Your teaming need is posted.");
}

export async function closeTeamingNeedAction(needId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("teaming_need_close", { p_need: needId });
  return result(error, undefined, "Teaming need closed.");
}

export async function respondToTeamingNeedAction(needId: string, message: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teaming_respond", { p_need: needId, p_message: message });
  return result(error, data ?? "", "Response sent.");
}

export async function closeTeamingResponseAction(responseId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("teaming_response_close", { p_response: responseId });
  return result(error, undefined);
}

export async function confirmTeamingMatchAction(responseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teaming_confirm", { p_response: responseId });
  const res = (data ?? {}) as { matched?: boolean; paid?: boolean; blocked?: boolean };
  const message = !res.matched
    ? "Confirmed. We'll let them know so they can confirm too."
    : res.blocked
      ? "Match confirmed. Members from the same company or account don't earn points from each other."
      : "Match confirmed!";
  return result(error, res, message);
}

// ------------------------------------------------------------------ wins

export interface ContractWinInput {
  awardNumber: string;
  title: string;
  agency: string;
  awardee: string;
  amount?: string;
  awardDate?: string;
  setAside?: string;
  naics?: string;
  details?: string;
}

export async function postContractWinAction(input: ContractWinInput) {
  const amount = input.amount?.replace(/[$,\s]/g, "");
  if (amount && !/^\d+(\.\d{1,2})?$/.test(amount)) return { ok: false, error: "Enter the amount as a number, like 1250000." } as const;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("contract_win_post", {
    p_award_number: input.awardNumber,
    p_title: input.title,
    p_agency: input.agency,
    p_awardee: input.awardee,
    p_amount: amount ? Number(amount) : undefined,
    p_award_date: opt(input.awardDate),
    p_set_aside: opt(input.setAside),
    p_naics: opt(input.naics),
    p_details: opt(input.details),
  });
  return result(error, data ?? "", "Win posted. An admin will check it against public award data.");
}

export async function withdrawContractWinAction(winId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("contract_win_withdraw", { p_win: winId });
  return result(error, undefined, "Win withdrawn.");
}

export async function congratulateWinAction(winId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("contract_win_congratulate", { p_win: winId });
  return result(error, data ?? 0);
}

// ---------------------------------------------------- capability reviews

export async function openReviewRequestAction(note: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("capability_review_request_open", { p_note: opt(note) });
  return result(error, data ?? "", "Your statement is on the review board.");
}

export async function closeReviewRequestAction(requestId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("capability_review_request_close", { p_request: requestId });
  return result(error, undefined, "Request closed.");
}

export async function submitCapabilityReviewAction(requestId: string, strengths: string, gaps: string, fix: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("capability_review_submit", {
    p_request: requestId,
    p_strengths: strengths,
    p_gaps: gaps,
    p_fix: fix,
  });
  return result(error, data ?? "", "Review sent. Thanks for helping out!");
}

export async function markReviewHelpfulAction(reviewId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("capability_review_mark_helpful", { p_review: reviewId });
  return result(error, data, "Thanks! We let the reviewer know.");
}

// ------------------------------------------------------------- mentoring

export async function saveMentorProfileAction(topics: string[], bio: string, accepting: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mentor_profile_save", { p_topics: topics, p_bio: bio, p_accepting: accepting });
  return result(error, undefined, accepting ? "You're listed as a mentor." : "Mentor profile saved. You're not taking new protégés.");
}

export async function requestMentorshipAction(mentorId: string, message: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mentorship_request", { p_mentor: mentorId, p_message: message });
  return result(error, data ?? "", "Request sent.");
}

export async function respondMentorshipAction(mentorshipId: string, accept: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mentorship_respond", { p_mentorship: mentorshipId, p_accept: accept });
  return result(error, undefined, accept ? "Mentorship started." : "Request declined.");
}

export async function endMentorshipAction(mentorshipId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mentorship_end", { p_mentorship: mentorshipId });
  return result(error, undefined, "Mentorship ended.");
}

export async function logMentorSessionAction(mentorshipId: string, date: string, minutes: number, topic: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mentor_session_log", {
    p_mentorship: mentorshipId,
    p_date: date,
    p_minutes: minutes,
    p_topic: topic,
  });
  return result(error, data ?? "", "Session logged. Your protégé will be asked to confirm it.");
}

export async function answerMentorSessionAction(sessionId: string, confirm: boolean, note: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mentor_session_confirm", { p_session: sessionId, p_confirm: confirm, p_note: opt(note) });
  return result(error, undefined, confirm ? "Session confirmed. Thanks for the note!" : "Thanks. We've marked that session as disputed.");
}
