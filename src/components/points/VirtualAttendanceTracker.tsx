"use client";

import { useEffect, useState } from "react";
import { eventAttendancePingAction } from "@/app/(app)/rewards/actions";

// Virtual events: while a registered member has the event page open (and
// visible) during the event, ping once a minute. 10 distinct minutes marks
// them attended ("10+ minutes in a virtual room").
export function VirtualAttendanceTracker({ eventId, startsAt, endsAt }: { eventId: string; startsAt: string; endsAt: string | null }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [attended, setAttended] = useState(false);

  useEffect(() => {
    const start = new Date(startsAt).getTime() - 10 * 60 * 1000;
    const end = endsAt ? new Date(endsAt).getTime() : new Date(startsAt).getTime() + 3 * 60 * 60 * 1000;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const ping = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now < start || now > end) return;
      const res = await eventAttendancePingAction(eventId);
      if (!res.ok) {
        if (res.reason === "not_virtual" || res.reason === "not_registered") {
          stopped = true;
          if (timer) clearInterval(timer);
        }
        return;
      }
      setMinutes(res.minutes ?? 0);
      if (res.attended) {
        setAttended(true);
        stopped = true;
        if (timer) clearInterval(timer);
      }
    };

    ping();
    timer = setInterval(ping, 60 * 1000);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [eventId, startsAt, endsAt]);

  if (minutes === null && !attended) return null;
  return (
    <section className="card panel">
      <h2 className="section-title">Attendance</h2>
      <p className="meta" style={{ margin: 0 }}>
        {attended
          ? "You're marked as attended. +25 XP"
          : `${minutes} of 10 minutes in the room. Keep this page open to be counted as attending.`}
      </p>
    </section>
  );
}
