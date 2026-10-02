"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";
import type { EventAttendee } from "@/lib/landing-data";

const EVENT_FORMATS = ["webinar", "virtual_conference", "networking", "workshop", "training", "trade_show"] as const;

// The Submit Event modal's <input type="datetime-local"> gives a naive
// "YYYY-MM-DDTHH:mm" string with no timezone — every event in this app is
// Eastern Time, so that string is the member's intended ET wall-clock time,
// not the server process's own local time. `new Date(naive)` would parse it
// in the server's OS timezone instead (wrong on any host that isn't
// already US-Eastern), so the ET UTC offset for that date is resolved
// explicitly via Intl (DST-aware) before converting to a real UTC instant.
function etNaiveDatetimeToUtcIso(naive: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(naive);
  if (!match) return null;
  const [y, mo, d, h, mi] = match.slice(1).map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h + 5, mi));
  const offsetPart = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value;
  const offsetHours = offsetPart ? parseInt(offsetPart.replace("GMT", ""), 10) : -5;
  const result = new Date(Date.UTC(y, mo - 1, d, h - offsetHours, mi));
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

export type SubmitEventResult = { slug?: string; error?: string };

// A signed-in member submitting their own event directly (Submit Event
// modal on /events) — separate from the admin-only /admin/events catalog
// form. Goes through the submit_member_event() security-definer RPC rather
// than a direct insert: regular members have no RLS INSERT policy on
// `events` (only "Admins manage all events" exists), so the RPC does the
// authorization/validation itself and writes on the caller's behalf —
// the same pattern update_company_media() already uses for company admins
// who likewise have no direct RLS write path on `companies`.
export async function submitEventAction(formData: FormData): Promise<SubmitEventResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to submit an event." };

  const title = String(formData.get("title") ?? "").trim();
  const format = String(formData.get("format") ?? "");
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const location = String(formData.get("location") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();

  if (!title) return { error: "Event name is required." };
  if (!EVENT_FORMATS.includes(format as (typeof EVENT_FORMATS)[number])) return { error: "Choose a valid event type." };
  if (!startsAtRaw) return { error: "Event date is required." };
  const startsAtIso = etNaiveDatetimeToUtcIso(startsAtRaw);
  if (!startsAtIso) return { error: "Choose a valid event date." };

  const { data, error } = await supabase.rpc("submit_member_event", {
    p_title: title,
    p_format: format,
    p_starts_at: startsAtIso,
    p_location: location,
    p_description: description,
    p_image_url: imageUrl,
  });

  if (error) return { error: "Couldn't submit that event. Please try again." };
  revalidatePath("/events");
  return { slug: data ?? undefined };
}

export type EventRegistrationStatus = "pending" | "approved" | "declined";
export type EventEngagementResult = { active: boolean; status?: EventRegistrationStatus; error?: string };

// Real, persisted event registration state — replaces the previous
// localStorage-only "gcuEventRegistrations" set (event_registrations,
// 20260918020000_social_engagement.sql). A member-submitted event (has a
// created_by) starts a new registration as 'pending' so its creator can
// review it (see 20260922020000_event_attendee_approval.sql); an
// admin/platform event (created_by null — no single owner to review)
// stays instantly 'approved', matching the original one-click behavior.
export async function toggleEventRegistrationAction(eventId: string): Promise<EventEngagementResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { active: false, error: "You must be signed in to register for events." };

  const { data: existing } = await supabase
    .from("event_registrations")
    .select("id, status")
    .eq("profile_id", user.id)
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("event_registrations").delete().eq("id", existing.id);
    if (error) return { active: true, status: existing.status as EventRegistrationStatus, error: "Couldn't cancel that registration. Please try again." };
    revalidatePath("/events");
    return { active: false };
  }

  const { data: event } = await supabase.from("events").select("created_by").eq("id", eventId).maybeSingle();
  // Pending-approval only applies when someone OTHER than the organizer is
  // registering — an event's own creator (or an admin event with no single
  // owner) is auto-approved; there's no one who'd need to review it.
  const status: EventRegistrationStatus = event?.created_by && event.created_by !== user.id ? "pending" : "approved";

  const { error } = await supabase
    .from("event_registrations")
    .insert({ profile_id: user.id, event_id: eventId, status });
  if (error && error.code !== "23505") return { active: false, error: "Couldn't register for that event. Please try again." };
  revalidatePath("/events");
  return { active: true, status };
}

export type EventAttendeesResult = { attendees?: EventAttendee[]; error?: string };

// The creator-only "who's registered" view (see EventAttendeesPanel) —
// backed by get_event_attendees(), which does its own authorization check
// (creator or admin) since regular members have no RLS read access beyond
// their own registration row.
export async function getEventAttendeesAction(eventId: string): Promise<EventAttendeesResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_event_attendees", { p_event_id: eventId });
  if (error) return { error: "Couldn't load attendees for this event." };
  return {
    attendees: (data ?? []).map((r) => ({
      registrationId: r.registration_id,
      profileId: r.profile_id,
      status: r.status as EventRegistrationStatus,
      registeredAt: r.registered_at,
      name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "GovConUnited Member",
      avatarUrl: r.avatar_url,
      headline: r.headline,
      jobTitle: r.job_title,
    })),
  };
}

export type RespondToRegistrationResult = { success?: boolean; error?: string };

// Approve/decline one attendee — same authorization check as above, via
// respond_to_event_registration().
export async function respondToEventRegistrationAction(
  eventId: string,
  profileId: string,
  status: "approved" | "declined",
): Promise<RespondToRegistrationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_event_registration", {
    p_event_id: eventId,
    p_profile_id: profileId,
    p_status: status,
  });
  if (error) return { error: "Couldn't update that registration. Please try again." };
  revalidatePath("/events");
  return { success: true };
}

export type InviteToEventResult = { success?: boolean; error?: string };

// A connection explicitly inviting another connection to a specific event
// — distinct from "event actions" (reminders on events you're already
// registered for). Limited to real connections, not arbitrary members.
export async function inviteToEventAction(eventId: string, inviteeId: string): Promise<InviteToEventResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to invite someone." };
  if (user.id === inviteeId) return { error: "You can't invite yourself." };

  const { data: connection } = await supabase
    .from("connections")
    .select("id")
    .eq("status", "accepted")
    .or(`and(member_one_id.eq.${user.id},member_two_id.eq.${inviteeId}),and(member_one_id.eq.${inviteeId},member_two_id.eq.${user.id})`)
    .maybeSingle();
  if (!connection) return { error: "You can only invite your connections." };

  const { error } = await supabase.from("event_invitations").insert({ event_id: eventId, inviter_id: user.id, invitee_id: inviteeId });
  if (error && error.code !== "23505") return { error: "Couldn't send that invitation. Please try again." };

  const { data: event } = await supabase.from("events").select("title").eq("id", eventId).maybeSingle();
  const { data: inviterProfile } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
  const inviterName = `${inviterProfile?.first_name ?? ""} ${inviterProfile?.last_name ?? ""}`.trim() || "A connection";
  await createNotification({
    recipientId: inviteeId,
    actorId: user.id,
    type: "event_invitation",
    subjectType: "event",
    subjectId: eventId,
    title: `${inviterName} invited you to ${event?.title ?? "an event"}`,
    linkPath: `events/${eventId}`,
  });

  revalidatePath("/events");
  return { success: true };
}
