import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessagesPageClient } from "@/components/messages/MessagesPageClient";
import { createClient } from "@/lib/supabase/server";
import { getConnectionIds, getConversations, getMessages, getNetworkMembers } from "@/lib/supabase/queries";
import { getOrCreateConversationId, markConversationReadAction } from "./actions";

export const metadata: Metadata = { title: "Messages · GovConUnited" };
export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; to?: string }>;
}) {
  const { c, to } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/messages");

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, plan_selection, role, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const viewer = {
    id: user.id,
    firstName: profile?.first_name || user.email?.split("@")[0] || "Member",
    lastName: profile?.last_name || "",
    planSelection: profile?.plan_selection || "free",
    isAdmin: profile?.role === "admin",
    avatarUrl: profile?.avatar_url,
  };

  // Starting a conversation from a member's profile (?to=<id>) — find or
  // create it, then land on the normal ?c=<id> URL for that thread.
  if (to) {
    const result = await getOrCreateConversationId(to);
    if (result.id) redirect(`/messages?c=${result.id}`);
  }

  const [conversations, networkMembers, connectionIds] = await Promise.all([
    getConversations(user.id),
    getNetworkMembers(),
    getConnectionIds(user.id),
  ]);
  const activeId = (c && conversations.some((conv) => conv.id === c) ? c : conversations[0]?.id) ?? null;

  const messages = activeId ? await getMessages(activeId, user.id) : [];
  // markConversationReadAction() used to call revalidatePath("/messages")
  // to refresh the just-opened thread's stale unreadCount (computed above,
  // before this mark-read runs) — Next no longer allows revalidatePath
  // during a render pass. Patching the already-fetched list in memory
  // gets the same result without it.
  if (activeId) await markConversationReadAction(activeId);
  const conversationsWithReadState = activeId
    ? conversations.map((conv) => (conv.id === activeId ? { ...conv, unreadCount: 0 } : conv))
    : conversations;

  // "New Message" people-picker excludes the viewer and anyone already in
  // the conversation list (starting a message to them belongs in that
  // existing thread, opened from the list itself).
  const existingIds = new Set(conversations.map((c) => c.otherMemberId));
  const messageableMembers = networkMembers.filter((m) => m.id !== user.id && !existingIds.has(m.id));

  return (
    <MessagesPageClient
      viewer={viewer}
      conversations={conversationsWithReadState}
      activeId={activeId}
      messages={messages}
      messageableMembers={messageableMembers}
      connectionIds={[...connectionIds]}
    />
  );
}
