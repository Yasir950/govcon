"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";
import { getPlanLimit, planFromSelection } from "@/lib/entitlements";
import { getConversations, getDirectMessageStartCountThisMonth, getMessages } from "@/lib/supabase/queries";
import type { Conversation, MessageItem } from "@/lib/landing-data";

export type StartConversationResult = { id?: string; error?: string };

// Client-callable wrapper around getConversations — for surfaces outside
// the /messages page itself (the global floating chat dock in
// DashboardShell) that need the conversation list without a full
// server-rendered page. RLS on `conversations` (not a client-supplied id)
// is what actually scopes this to the caller's own conversations.
export async function getConversationsAction(): Promise<Conversation[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return getConversations(user.id);
}

// Finds the existing conversation between the signed-in user and `otherId`,
// or creates one. Real, persisted (conversations table) — not a client-only
// stub. Pair order is normalized (smaller uuid first) so a lookup always
// matches regardless of who started it — see conversations_unique_pair_idx.
export async function getOrCreateConversationId(otherId: string): Promise<StartConversationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to send messages." };
  if (user.id === otherId) return { error: "You can't start a conversation with yourself." };

  const { data: blockRow } = await supabase
    .from("profile_blocks")
    .select("id")
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${user.id})`,
    )
    .maybeSingle();
  if (blockRow) return { error: "You can't message this member." };

  const [a, b] = [user.id, otherId].sort();
  const pairFilter = `and(member_one_id.eq.${a},member_two_id.eq.${b}),and(member_one_id.eq.${b},member_two_id.eq.${a})`;

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .or(pairFilter)
    .maybeSingle();
  if (existing) return { id: existing.id };

  // Free plan's "10 new conversation starts per month" cap — only applies
  // here, to an actual new conversation; replying within an existing one
  // (the `existing` branch above) never hits this.
  const { data: profile } = await supabase.from("profiles").select("plan_selection").eq("id", user.id).maybeSingle();
  const messageLimit = await getPlanLimit(planFromSelection(profile?.plan_selection), "direct_messages_per_month");
  if (messageLimit !== null) {
    const startedThisMonth = await getDirectMessageStartCountThisMonth(user.id);
    if (startedThisMonth >= messageLimit) {
      return { error: `You've reached the Free plan's ${messageLimit} new conversations this month. Upgrade to Pro for unlimited messaging.` };
    }
  }

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ member_one_id: a, member_two_id: b, created_by: user.id })
    .select("id")
    .single();

  if (error) {
    // Unique-index violation (both people opened the thread at once) —
    // the row already exists now, so just look it up.
    if (error.code === "23505") {
      const { data: raced } = await supabase.from("conversations").select("id").or(pairFilter).maybeSingle();
      if (raced) return { id: raced.id };
    }
    return { error: "Couldn't start that conversation. Please try again." };
  }

  return { id: created.id };
}

// Client-callable wrapper around getMessages — for surfaces outside the
// /messages page itself (e.g. the company-contact side panel) that need a
// conversation's history without a full server-rendered page. RLS on the
// `messages` table (not a client-supplied id) is what actually keeps this
// scoped to conversations the caller is part of.
export async function getConversationMessagesAction(conversationId: string): Promise<MessageItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return getMessages(conversationId, user.id);
}

export type SendMessageResult = { success?: boolean; error?: string };

export async function sendMessageAction(conversationId: string, body: string, imageUrl?: string): Promise<SendMessageResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to send messages." };

  const trimmed = body.trim();
  if (!trimmed && !imageUrl) return { error: "Message can't be empty." };
  if (trimmed.length > 4000) return { error: "Message is too long." };

  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, body: trimmed, image_url: imageUrl || null });
  // RLS silently returns no rows (not an error) for a conversation this
  // user isn't part of — `error` here only covers real failures.
  if (error) return { error: "Couldn't send that message. Please try again." };

  const { data: conversation } = await supabase
    .from("conversations")
    .select("member_one_id, member_two_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (conversation) {
    const recipientId = conversation.member_one_id === user.id ? conversation.member_two_id : conversation.member_one_id;
    const { data: senderProfile } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
    const senderName = `${senderProfile?.first_name ?? ""} ${senderProfile?.last_name ?? ""}`.trim() || "A member";
    await createNotification({
      recipientId,
      actorId: user.id,
      type: "message_received",
      subjectType: "message",
      subjectId: conversationId,
      title: `New message from ${senderName}`,
      body: trimmed ? trimmed.slice(0, 140) : "📷 Photo",
      linkPath: "messages",
    });
  }

  revalidatePath("/messages");
  return { success: true };
}

// Only ever called from src/app/messages/page.tsx's own render (not a
// client-triggered action), which patches its already-fetched
// conversations list in memory afterward — a revalidatePath() call here
// used to exist for the same purpose, but Next no longer allows
// revalidatePath during a render pass.
export async function markConversationReadAction(conversationId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", user.id)
    .is("read_at", null);
}
