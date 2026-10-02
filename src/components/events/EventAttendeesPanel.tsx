"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getEventAttendeesAction, respondToEventRegistrationAction } from "@/app/(app)/events/actions";
import { getEventAttendanceAction, markAttendanceAction } from "@/app/(app)/rewards/actions";
import { Avatar } from "@/components/avatar";
import { useToast } from "@/components/toast-provider";
import type { EventAttendee } from "@/lib/landing-data";

// Creator-only "who's registered" view — only rendered on the event detail
// page when the signed-in viewer is the event's creator (or an admin).
// Pending registrations need an explicit Approve/Decline; approved ones
// are just a roster.
export function EventAttendeesPanel({ eventId }: { eventId: string }) {
  const showToast = useToast();
  const [attendees, setAttendees] = useState<EventAttendee[] | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  // Attendance (Points & Rewards: attending pays 25 XP) — QR check-in,
  // 10+ minutes in a virtual room, or marked here by the host.
  const [attendance, setAttendance] = useState<Map<string, { attendedAt: string | null; method: string | null; minutes: number }>>(new Map());
  const [markingId, setMarkingId] = useState<string | null>(null);

  async function loadAttendance() {
    const rows = await getEventAttendanceAction(eventId);
    setAttendance(new Map(rows.map((r) => [r.profileId, r])));
  }

  async function toggleAttended(profileId: string, attended: boolean) {
    setMarkingId(profileId);
    const result = await markAttendanceAction(eventId, profileId, attended);
    setMarkingId(null);
    if (!result.ok) return showToast(result.error);
    await loadAttendance();
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getEventAttendeesAction(eventId);
      loadAttendance();
      if (cancelled) return;
      if (result.error) {
        showToast(result.error);
        setAttendees([]);
        return;
      }
      setAttendees(result.attendees ?? []);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function respond(attendee: EventAttendee, status: "approved" | "declined") {
    setRespondingId(attendee.registrationId);
    const result = await respondToEventRegistrationAction(eventId, attendee.profileId, status);
    setRespondingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setAttendees((prev) => (prev ?? []).map((a) => (a.registrationId === attendee.registrationId ? { ...a, status } : a)));
  }

  if (attendees === null) {
    return (
      <section className="card panel">
        <h2 className="section-title">Attendees</h2>
        <p className="meta">Loading…</p>
      </section>
    );
  }

  const pending = attendees.filter((a) => a.status === "pending");
  const approved = attendees.filter((a) => a.status === "approved");

  return (
    <section className="card panel">
      <h2 className="section-title">Attendees</h2>

      {attendees.length === 0 ? (
        <p className="meta">No one has registered yet.</p>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: ".86rem", color: "var(--o-muted)" }}>
                Pending approval ({pending.length})
              </h3>
              <div style={{ display: "grid", gap: 8 }}>
                {pending.map((a) => (
                  <div key={a.registrationId} className="attendee-row">
                    <Link href={`/network/${a.profileId}`} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, textDecoration: "none" }}>
                      <Avatar name={a.name} avatarUrl={a.avatarUrl} size={36} />
                      <span style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", fontSize: ".86rem", color: "var(--o-ink)" }}>{a.name}</strong>
                        <span className="meta" style={{ display: "block" }}>{a.headline || a.jobTitle || "GovConUnited Member"}</span>
                      </span>
                    </Link>
                    <div style={{ display: "flex", gap: 6, flex: "none" }}>
                      <button
                        className="btn btn-outline"
                        disabled={respondingId === a.registrationId}
                        onClick={() => respond(a, "declined")}
                      >
                        Decline
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={respondingId === a.registrationId}
                        onClick={() => respond(a, "approved")}
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: pending.length > 0 ? 16 : 12 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: ".86rem", color: "var(--o-muted)" }}>
              Registered ({approved.length})
            </h3>
            {approved.length === 0 ? (
              <p className="meta">No approved attendees yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {approved.map((a) => {
                  const att = attendance.get(a.profileId);
                  return (
                    <div key={a.registrationId} className="attendee-row">
                      <Link
                        href={`/network/${a.profileId}`}
                        style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, textDecoration: "none" }}
                      >
                        <Avatar name={a.name} avatarUrl={a.avatarUrl} size={36} />
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ display: "block", fontSize: ".86rem", color: "var(--o-ink)" }}>{a.name}</strong>
                          <span className="meta" style={{ display: "block" }}>
                            {att?.attendedAt
                              ? `Attended (${att.method === "qr" ? "QR check-in" : att.method === "virtual" ? "virtual room" : "marked by host"})`
                              : att?.minutes
                                ? `${att.minutes} min in the virtual room`
                                : a.headline || a.jobTitle || "GovConUnited Member"}
                          </span>
                        </span>
                      </Link>
                      {att !== undefined && (
                        <button
                          className={`btn ${att.attendedAt ? "btn-outline" : "btn-primary"}`}
                          style={{ flex: "none" }}
                          disabled={markingId === a.profileId}
                          onClick={() => toggleAttended(a.profileId, !att.attendedAt)}
                        >
                          {att.attendedAt ? "Unmark" : "Mark attended"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
