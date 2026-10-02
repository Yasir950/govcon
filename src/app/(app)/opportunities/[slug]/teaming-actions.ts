"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";

export type TeamingRoleType = "prime" | "sub" | "supplier" | "consultant" | "joint_venture" | "mentor_protege";

export type TeamingActionResult = { error?: string };

// A member's teaming interests declare which roles they're open to
// (spec 9.3) — one row per role type, upserted so re-declaring the same
// role just updates it instead of creating duplicates.
export async function declareTeamingInterestAction(
  roleType: TeamingRoleType,
  fields: { naicsCodes?: string[]; locations?: string[]; certifications?: string[]; notes?: string },
): Promise<TeamingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("teaming_interests").upsert(
    {
      profile_id: user.id,
      role_type: roleType,
      naics_codes: fields.naicsCodes ?? [],
      locations: fields.locations ?? [],
      certifications: fields.certifications ?? [],
      notes: fields.notes?.trim() || null,
      active: true,
    },
    { onConflict: "profile_id,role_type" },
  );
  if (error) return { error: "Couldn't save that teaming interest. Please try again." };
  revalidatePath("/network");
  return {};
}

export async function removeTeamingInterestAction(roleType: TeamingRoleType): Promise<TeamingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("teaming_interests")
    .update({ active: false })
    .eq("profile_id", user.id)
    .eq("role_type", roleType);
  if (error) return { error: "Couldn't remove that teaming interest. Please try again." };
  revalidatePath("/network");
  return {};
}

export type SendTeamingInquiryResult = { error?: string; id?: string };

// Structured teaming inquiry (spec 9.3): opportunity reference, requested
// role, message, optional attachment. RLS (teaming_inquiries insert policy)
// independently blocks this if the recipient has blocked the sender.
export async function sendTeamingInquiryAction(fields: {
  opportunityId?: string | null;
  recipientProfileId: string;
  requestedRole: TeamingRoleType;
  message: string;
  attachmentStoragePath?: string | null;
}): Promise<SendTeamingInquiryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to send a teaming inquiry." };
  if (!fields.message.trim()) return { error: "Add a message describing what you're proposing." };
  if (user.id === fields.recipientProfileId) return { error: "You can't send a teaming inquiry to yourself." };

  const { data, error } = await supabase
    .from("teaming_inquiries")
    .insert({
      opportunity_id: fields.opportunityId ?? null,
      sender_profile_id: user.id,
      recipient_profile_id: fields.recipientProfileId,
      requested_role: fields.requestedRole,
      message: fields.message.trim(),
      attachment_storage_path: fields.attachmentStoragePath ?? null,
    })
    .select("id")
    .single();
  if (error) return { error: "Couldn't send that inquiry. The recipient may have blocked you." };

  const { data: sender } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
  await createNotification({
    recipientId: fields.recipientProfileId,
    actorId: user.id,
    type: "teaming_inquiry_received",
    subjectType: "teaming_inquiry",
    subjectId: data.id,
    title: `${sender ? `${sender.first_name} ${sender.last_name}` : "A member"} sent you a teaming inquiry`,
    body: fields.message.slice(0, 200),
    linkPath: "network?tab=teaming",
  });

  revalidatePath("/network");
  return { id: data.id };
}

export async function respondToTeamingInquiryAction(
  inquiryId: string,
  status: "accepted" | "declined",
  replyMessage?: string,
): Promise<TeamingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: inquiry, error: fetchError } = await supabase
    .from("teaming_inquiries")
    .select("sender_profile_id, requested_role")
    .eq("id", inquiryId)
    .eq("recipient_profile_id", user.id)
    .maybeSingle();
  if (fetchError || !inquiry) return { error: "Couldn't find that inquiry." };

  const { error } = await supabase
    .from("teaming_inquiries")
    .update({ status, reply_message: replyMessage?.trim() || null, responded_at: new Date().toISOString() })
    .eq("id", inquiryId)
    .eq("recipient_profile_id", user.id);
  if (error) return { error: "Couldn't update that inquiry. Please try again." };

  const { data: recipient } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
  await createNotification({
    recipientId: inquiry.sender_profile_id,
    actorId: user.id,
    type: status === "accepted" ? "teaming_inquiry_accepted" : "teaming_inquiry_declined",
    subjectType: "teaming_inquiry",
    subjectId: inquiryId,
    title: `${recipient ? `${recipient.first_name} ${recipient.last_name}` : "A member"} ${status} your teaming inquiry`,
    linkPath: "network?tab=teaming",
  });

  revalidatePath("/network");
  return {};
}

export async function withdrawTeamingInquiryAction(inquiryId: string): Promise<TeamingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("teaming_inquiries")
    .update({ status: "withdrawn" })
    .eq("id", inquiryId)
    .eq("sender_profile_id", user.id);
  if (error) return { error: "Couldn't withdraw that inquiry. Please try again." };
  revalidatePath("/network");
  return {};
}

export async function reportTeamingInquiryAction(inquiryId: string, reason: string, details?: string): Promise<TeamingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("teaming_reports")
    .insert({ inquiry_id: inquiryId, reporter_id: user.id, reason, details: details?.trim() || null });
  if (error) return { error: "Couldn't submit your report. Please try again." };
  return {};
}
