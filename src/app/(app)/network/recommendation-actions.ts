"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateConversationId } from "@/app/(app)/messages/actions";
import { createNotification } from "@/lib/notifications";
import {
  getProfileRecommendations,
  type ProfileRecommendations,
  type RecommendationRelationship,
} from "@/lib/supabase/queries";

export type RecommendationResult = { error?: string };

const RELATIONSHIPS: RecommendationRelationship[] = [
  "managed_directly",
  "reported_to",
  "senior_not_managing",
  "junior_not_managed",
  "same_team",
  "different_teams",
  "client_of_author",
  "author_was_client",
  "teaming_partner",
  "mentored",
  "other",
];

// The connection requirement, approval flow and who-may-change-what are
// enforced in the database (RLS + guard triggers in
// 20260928000100_profile_recommendations.sql); the checks here only turn
// those rules into friendly errors.

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function displayName(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from("profiles").select("first_name, last_name").eq("id", id).maybeSingle();
  return `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim() || "A member";
}

async function isConnected(supabase: Awaited<ReturnType<typeof createClient>>, a: string, b: string) {
  const { data } = await supabase
    .from("connections")
    .select("id")
    .eq("status", "accepted")
    .or(`and(member_one_id.eq.${a},member_two_id.eq.${b}),and(member_one_id.eq.${b},member_two_id.eq.${a})`)
    .maybeSingle();
  return !!data;
}

function revalidateProfiles(...ids: string[]) {
  for (const id of ids) revalidatePath(`/network/${id}`);
}

// Write (or revise) a recommendation for a connection. Either way it goes
// to the recipient for approval before it's public.
export async function saveRecommendationAction(
  recipientId: string,
  input: { relationship: string; recipientPosition: string; body: string },
): Promise<RecommendationResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Sign in to write a recommendation." };
  if (user.id === recipientId) return { error: "You can't recommend yourself." };

  const body = input.body.trim();
  const recipientPosition = input.recipientPosition.trim() || null;
  if (!RELATIONSHIPS.includes(input.relationship as RecommendationRelationship)) return { error: "Choose how you know each other." };
  if (recipientPosition && recipientPosition.length > 160) return { error: "Position must be 160 characters or fewer." };
  if (!body) return { error: "Write your recommendation." };
  if (body.length > 3000) return { error: "Recommendation must be 3,000 characters or fewer." };

  if (!(await isConnected(supabase, user.id, recipientId))) {
    return { error: "You can only recommend your connections." };
  }

  const { data: existing } = await supabase
    .from("profile_recommendations")
    .select("id")
    .eq("recipient_id", recipientId)
    .eq("author_id", user.id)
    .maybeSingle();

  const fields = { relationship: input.relationship, recipient_position: recipientPosition, body };
  if (existing) {
    const { error } = await supabase.from("profile_recommendations").update(fields).eq("id", existing.id);
    if (error) return { error: "Couldn't update your recommendation. Please try again." };
  } else {
    const { error } = await supabase
      .from("profile_recommendations")
      .insert({ ...fields, recipient_id: recipientId, author_id: user.id });
    if (error) {
      console.error("saveRecommendationAction insert failed", error);
      if (error.code === "42501") return { error: "Confirm your email address before writing recommendations." };
      return { error: "Couldn't send your recommendation. Please try again." };
    }
  }

  // Writing it answers any open ask from this member.
  await supabase
    .from("profile_recommendation_requests")
    .update({ status: "fulfilled" })
    .eq("requester_id", recipientId)
    .eq("recommender_id", user.id)
    .eq("status", "pending");

  const authorName = await displayName(supabase, user.id);
  await createNotification({
    recipientId,
    actorId: user.id,
    type: "recommendation_received",
    subjectType: "connection",
    title: existing
      ? `${authorName} revised their recommendation for you`
      : `${authorName} wrote you a recommendation`,
    body: "Review it and choose whether to show it on your profile.",
    linkPath: `network/${recipientId}#recommendations`,
  });

  revalidateProfiles(recipientId, user.id);
  return {};
}

// Recipient only: show a recommendation on their profile, or hide it.
export async function setRecommendationVisibilityAction(
  recommendationId: string,
  status: "visible" | "hidden",
): Promise<RecommendationResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "You must be signed in." };

  const { data: rec } = await supabase
    .from("profile_recommendations")
    .select("id, author_id, recipient_id, status, decided_at")
    .eq("id", recommendationId)
    .maybeSingle();
  if (!rec) return { error: "That recommendation no longer exists." };
  if (rec.recipient_id !== user.id) return { error: "Only the recommended member can change this." };

  const { error } = await supabase.from("profile_recommendations").update({ status }).eq("id", recommendationId);
  if (error) return { error: "Couldn't update the recommendation. Please try again." };

  // Tell the author when it first goes live (not on every hide/show).
  if (status === "visible" && rec.status === "pending") {
    const recipientName = await displayName(supabase, user.id);
    await createNotification({
      recipientId: rec.author_id,
      actorId: user.id,
      type: "recommendation_shown",
      subjectType: "connection",
      title: `${recipientName} added your recommendation to their profile`,
      linkPath: `network/${user.id}#recommendations`,
    });
  }

  revalidateProfiles(rec.recipient_id, rec.author_id);
  return {};
}

// Author withdraws, or recipient declines/removes.
export async function deleteRecommendationAction(recommendationId: string): Promise<RecommendationResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("profile_recommendations")
    .delete()
    .eq("id", recommendationId)
    .select("author_id, recipient_id");
  if (error || !data?.length) return { error: "Couldn't remove that recommendation." };
  revalidateProfiles(data[0].recipient_id, data[0].author_id);
  return {};
}

// "Ask for a recommendation" from a connection.
export async function requestRecommendationAction(
  recommenderId: string,
  input: { recipientPosition: string; message: string },
): Promise<RecommendationResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "You must be signed in." };
  if (user.id === recommenderId) return { error: "You can't ask yourself." };

  const recipientPosition = input.recipientPosition.trim() || null;
  const message = input.message.trim() || null;
  if (recipientPosition && recipientPosition.length > 160) return { error: "Position must be 160 characters or fewer." };
  if (message && message.length > 1000) return { error: "Message must be 1,000 characters or fewer." };

  if (!(await isConnected(supabase, user.id, recommenderId))) {
    return { error: "You can only ask your connections." };
  }

  const { data: request, error } = await supabase
    .from("profile_recommendation_requests")
    .insert({ requester_id: user.id, recommender_id: recommenderId, recipient_position: recipientPosition, message })
    .select("id")
    .single();
  if (error) {
    console.error("requestRecommendationAction insert failed", error);
    if (error.code === "23505") return { error: "You've already asked this person — waiting on their reply." };
    if (error.code === "42501") return { error: "Confirm your email address before asking for recommendations." };
    return { error: "Couldn't send your request. Please try again." };
  }

  // Delivered as a direct message, like LinkedIn: the request lands in the
  // pair's conversation as a card with a "Write recommendation" action.
  // If the thread can't be opened (e.g. a block or the Free plan's
  // new-conversation cap) the request still stands and shows on both
  // profiles; the notification then links there instead.
  const conversation = await getOrCreateConversationId(recommenderId);
  let conversationId: string | null = null;
  if (conversation.id) {
    const text = [
      recipientPosition ? `Position: ${recipientPosition}` : null,
      message ?? "Would you be willing to write me a recommendation?",
    ]
      .filter(Boolean)
      .join("\n\n");
    const { error: messageError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: user.id,
      body: text,
      recommendation_request_id: request.id,
    });
    if (messageError) console.error("requestRecommendationAction message failed", messageError);
    else conversationId = conversation.id;
  }

  const requesterName = await displayName(supabase, user.id);
  await createNotification({
    recipientId: recommenderId,
    actorId: user.id,
    type: "recommendation_requested",
    subjectType: conversationId ? "message" : "connection",
    subjectId: conversationId,
    title: `${requesterName} asked you for a recommendation`,
    body: message ? (message.length > 140 ? `${message.slice(0, 140).trimEnd()}…` : message) : null,
    linkPath: conversationId ? `messages?c=${conversationId}` : `network/${user.id}#recommendations`,
  });

  revalidateProfiles(user.id, recommenderId);
  if (conversationId) revalidatePath("/messages");
  return {};
}

// The person asked declines. Silent to the requester, as on LinkedIn.
export async function declineRecommendationRequestAction(requestId: string): Promise<RecommendationResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("profile_recommendation_requests")
    .update({ status: "declined" })
    .eq("id", requestId)
    .eq("recommender_id", user.id)
    .select("requester_id, recommender_id");
  if (error || !data?.length) return { error: "Couldn't decline that request." };
  revalidateProfiles(data[0].requester_id, data[0].recommender_id);
  return {};
}

// The requester takes an unanswered ask back.
export async function withdrawRecommendationRequestAction(requestId: string): Promise<RecommendationResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("profile_recommendation_requests")
    .delete()
    .eq("id", requestId)
    .select("requester_id, recommender_id");
  if (error || !data?.length) return { error: "Couldn't withdraw that request." };
  revalidateProfiles(data[0].requester_id, data[0].recommender_id);
  return {};
}

// Re-read on Realtime events and after each change.
export async function getProfileRecommendationsAction(profileId: string): Promise<ProfileRecommendations> {
  return getProfileRecommendations(profileId);
}
