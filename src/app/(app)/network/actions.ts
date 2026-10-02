"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";

export type ConnectionActionResult = { error?: string; connectionId?: string };

// Real request/accept connections — replaces the previous immediate
// connect/disconnect toggle (see connections.status,
// 20260918010800_connection_requests.sql) with the mockup's actual
// "Connection Requests" model: sending a request creates a pending row
// only the *other* participant can accept or decline.
export async function sendConnectionRequestAction(otherId: string): Promise<ConnectionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to connect." };
  if (user.id === otherId) return { error: "You can't connect with yourself." };

  const { data: blockRow } = await supabase
    .from("profile_blocks")
    .select("id")
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${user.id})`,
    )
    .maybeSingle();
  if (blockRow) return { error: "You can't connect with this member." };

  const [a, b] = [user.id, otherId].sort();
  const { data, error } = await supabase
    .from("connections")
    .insert({ member_one_id: a, member_two_id: b, requested_by: user.id, status: "pending" })
    .select("id")
    .single();
  if (error && error.code !== "23505") {
    return { error: "Couldn't send that connection request. Please try again." };
  }

  if (data) {
    const { data: requesterProfile } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
    const requesterName = `${requesterProfile?.first_name ?? ""} ${requesterProfile?.last_name ?? ""}`.trim() || "A member";
    await createNotification({
      recipientId: otherId,
      actorId: user.id,
      type: "connection_request",
      subjectType: "connection",
      subjectId: data.id,
      title: `${requesterName} sent you a connection request`,
      linkPath: "network?tab=requests",
    });
  }

  revalidatePath("/network");
  revalidatePath("/dashboard");
  return { connectionId: data?.id };
}

// Accept or decline a pending request sent *to* the signed-in user. RLS
// only allows the non-requester to move a row from pending to accepted, so
// a requester can't accept their own request even if they call this directly.
export async function respondToConnectionRequestAction(
  connectionId: string,
  accept: boolean,
): Promise<ConnectionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  if (accept) {
    const { data: connection } = await supabase
      .from("connections")
      .select("member_one_id, member_two_id, requested_by")
      .eq("id", connectionId)
      .maybeSingle();

    const { error } = await supabase
      .from("connections")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", connectionId);
    if (error) return { error: "Couldn't accept that request. Please try again." };

    if (connection) {
      const { data: accepterProfile } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
      const accepterName = `${accepterProfile?.first_name ?? ""} ${accepterProfile?.last_name ?? ""}`.trim() || "A member";
      await createNotification({
        recipientId: connection.requested_by,
        actorId: user.id,
        type: "connection_accepted",
        subjectType: "connection",
        subjectId: connectionId,
        title: `${accepterName} accepted your connection request`,
        linkPath: `network/${user.id}`,
      });
    }
  } else {
    const { error } = await supabase.from("connections").delete().eq("id", connectionId);
    if (error) return { error: "Couldn't decline that request. Please try again." };
  }
  revalidatePath("/network");
  revalidatePath("/dashboard");
  return {};
}

// Cancel a request you sent, or remove an existing connection — either
// participant can delete a connections row regardless of status.
export async function removeConnectionAction(connectionId: string): Promise<ConnectionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("connections").delete().eq("id", connectionId);
  if (error) return { error: "Couldn't remove that. Please try again." };
  revalidatePath("/network");
  revalidatePath("/dashboard");
  return {};
}
