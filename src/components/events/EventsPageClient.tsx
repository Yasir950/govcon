"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toggleEventRegistrationAction, type EventRegistrationStatus } from "@/app/(app)/events/actions";
import { toggleEventRsvpAction, type EventRsvpStatus } from "@/app/(app)/communities/actions";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { SubmitEventModal } from "@/components/events/SubmitEventModal";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import type { EventItem, Post } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

const ALL = "All";

// A single member-created "Event" post — same Interested/Going toggle as the
// feed's event cards, but this component owns its own state since it's used
// on a page the feed never renders on.
function CommunityEventCard({ event, requireAuth }: { event: Post; requireAuth: (fn: () => void) => void }) {
  const showToast = useToast();
  const [interestedCount, setInterestedCount] = useState(event.interestedCount);
  const [goingCount, setGoingCount] = useState(event.goingCount);
  const [myRsvp, setMyRsvp] = useState(event.myRsvp);

  async function rsvp(status: EventRsvpStatus) {
    const prevRsvp = myRsvp;
    const prevInterested = interestedCount;
    const prevGoing = goingCount;
    let nextInterested = interestedCount;
    let nextGoing = goingCount;
    if (prevRsvp === "interested") nextInterested -= 1;
    if (prevRsvp === "going") nextGoing -= 1;
    const turningOff = prevRsvp === status;
    if (!turningOff) {
      if (status === "interested") nextInterested += 1;
      else nextGoing += 1;
    }
    setMyRsvp(turningOff ? null : status);
    setInterestedCount(nextInterested);
    setGoingCount(nextGoing);

    const result = await toggleEventRsvpAction(event.id, status);
    if (result.error) {
      showToast(result.error);
      setMyRsvp(prevRsvp);
      setInterestedCount(prevInterested);
      setGoingCount(prevGoing);
      return;
    }
    if (typeof result.interestedCount === "number") setInterestedCount(result.interestedCount);
    if (typeof result.goingCount === "number") setGoingCount(result.goingCount);
  }

  const date = event.eventStartsAt ? new Date(event.eventStartsAt) : null;

  return (
    <article className="card event-card">
      <div className="event-body">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          {event.authorProfileId ? (
            <Link href={`/network/${event.authorProfileId}`}>
              <Avatar name={event.author} avatarUrl={event.authorAvatarUrl} size={28} />
            </Link>
          ) : (
            <Avatar name={event.author} avatarUrl={event.authorAvatarUrl} size={28} />
          )}
          <div style={{ minWidth: 0 }}>
            {event.authorProfileId ? (
              <Link href={`/network/${event.authorProfileId}`} className="mini-row-title is-name" style={{ textDecoration: "none", display: "block" }}>
                {event.author}
              </Link>
            ) : (
              <span className="mini-row-title is-name">{event.author}</span>
            )}
          </div>
        </div>
        <h3 style={{ margin: "0 0 6px" }}>{event.title}</h3>
        {event.body && <p className="meta" style={{ margin: "0 0 8px" }}>{event.body}</p>}
        <div className="event-meta">
          <span>
            {date ? date.toLocaleString() : ""}
            {event.eventEndsAt ? ` – ${new Date(event.eventEndsAt).toLocaleString()}` : ""}
          </span>
          <span>{event.eventLocation || "Online"}</span>
        </div>
        <div className="event-card-actions">
          <button
            className={`btn${myRsvp === "interested" ? "" : " btn-outline"}`}
            onClick={() => requireAuth(() => rsvp("interested"))}
          >
            ⭐ Interested{interestedCount > 0 ? ` (${interestedCount})` : ""}
          </button>
          <button className={`btn${myRsvp === "going" ? "" : " btn-outline"}`} onClick={() => requireAuth(() => rsvp("going"))}>
            ✅ Going{goingCount > 0 ? ` (${goingCount})` : ""}
          </button>
        </div>
      </div>
    </article>
  );
}

export function EventsPageClient({
  events,
  pastEvents,
  communityEvents,
  viewer,
  initialStatuses,
}: {
  events: EventItem[];
  pastEvents: EventItem[];
  communityEvents: Post[];
  viewer: Viewer | null;
  initialStatuses: Record<string, EventRegistrationStatus>;
}) {
  const router = useRouter();
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const [statuses, setStatuses] = useState<Record<string, EventRegistrationStatus>>(initialStatuses);
  const eventRegistrations = useMemo(() => new Set(Object.keys(statuses)), [statuses]);
  // Own copy of the submit-event modal, separate from EventsHeader's — this
  // one only needs to exist for the "no events yet" empty state's CTA, so
  // it isn't worth lifting shared state/context just for that.
  const [submitOpen, setSubmitOpen] = useState(false);

  async function toggleRegistration(ev: EventItem) {
    const result = await toggleEventRegistrationAction(ev.dbId);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setStatuses((prev) => {
      const next = { ...prev };
      if (result.active && result.status) next[ev.dbId] = result.status;
      else delete next[ev.dbId];
      return next;
    });
    showToast(
      !result.active
        ? "Registration canceled"
        : result.status === "pending"
          ? `Your registration for ${ev.title} is pending approval`
          : `You are registered for ${ev.title}`,
    );
  }

  const [tab, setTab] = useState<"upcoming" | "registered" | "past">("upcoming");
  const [kind, setKind] = useState(ALL);
  const [query, setQuery] = useState("");

  const kinds = useMemo(() => Array.from(new Set(events.map((e) => e.kind))).sort(), [events]);

  // A registration for a PAST event only ever shows up here — `events` is
  // upcoming-only, so filtering just that list left the "My Events" tab
  // empty for exactly the case its own badge count (eventRegistrations.size,
  // which covers every registration regardless of date) was promising.
  const base =
    tab === "registered"
      ? [...events, ...pastEvents].filter((e) => eventRegistrations.has(e.dbId))
      : tab === "past"
        ? pastEvents
        : events;
  const filtered = base.filter((e) => {
    if (kind !== ALL && e.kind !== kind) return false;
    if (query && !`${e.title} ${e.description} ${e.location}`.toLowerCase().includes(query.toLowerCase()))
      return false;
    return true;
  });

  return (
    <>
          <div className="tabs">
            <button className={`tab${tab === "upcoming" ? " active" : ""}`} onClick={() => setTab("upcoming")}>
              Upcoming Events ({events.length})
            </button>
            {viewer && (
              <button
                className={`tab${tab === "registered" ? " active" : ""}`}
                onClick={() => requireAuth(() => setTab("registered"))}
              >
                My Events ({eventRegistrations.size})
              </button>
            )}
            <button className={`tab${tab === "past" ? " active" : ""}`} onClick={() => setTab("past")}>
              Past Events
            </button>
          </div>

          <section className="card panel">
            <div className="toolbar">
              <input
                className="field search-field"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events..."
              />
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value={ALL}>All Event Types</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-summary">
              <span className="meta">
                {filtered.length} event{filtered.length === 1 ? "" : "s"} found
              </span>
            </div>
          </section>

          {filtered.length === 0 ? (
            <div className="card empty" style={{ marginTop: 12 }}>
              {(() => {
                const isFiltered = query.trim() !== "" || kind !== ALL;
                if (tab === "registered") {
                  return (
                    <>
                      <strong>You haven&apos;t registered for any events yet</strong>
                      Register for an event to find it here.
                    </>
                  );
                }
                if (tab === "past") {
                  return (
                    <>
                      <strong>No past events yet</strong>
                      Events move here once they&apos;ve ended.
                    </>
                  );
                }
                if (isFiltered) {
                  return (
                    <>
                      <strong>No events match this search</strong>
                      Try a different keyword or event type.
                    </>
                  );
                }
                return (
                  <>
                    <strong>No upcoming events</strong>
                    <p style={{ margin: "4px 0 12px" }}>Check back soon, or be the first to submit one.</p>
                    <button className="btn btn-primary" onClick={() => requireAuth(() => setSubmitOpen(true))}>
                      + Submit an Event
                    </button>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="event-grid" style={{ marginTop: 12 }}>
              {filtered.map((ev, i) => {
                const status = statuses[ev.dbId];
                const registered = status === "pending" || status === "approved";
                const isPast = tab === "past";
                return (
                  <article className="card event-card" key={ev.id}>
                    <div
                      className={`event-banner${ev.imageUrl ? "" : i % 3 === 1 ? " red" : ""}`}
                      style={
                        ev.imageUrl
                          ? {
                              backgroundImage: `linear-gradient(rgba(6,20,45,.45), rgba(6,20,45,.45)), url(${ev.imageUrl})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }
                          : undefined
                      }
                    >
                      <span className="tag" style={{ background: "#fff", color: "var(--o-blue-dark)" }}>
                        {ev.kind}
                      </span>
                      <div className="event-date-badge">
                        {ev.month} {ev.day}
                      </div>
                    </div>
                    <div className="event-body">
                      <Link href={`/events/${ev.id}`} style={{ textDecoration: "none" }}>
                        <h3>{ev.title}</h3>
                      </Link>
                      <div className="event-meta">
                        <span>{ev.time}</span>
                        <span>{ev.location}</span>
                        <span>{ev.attendingCount} attending</span>
                      </div>
                      <div className="event-card-actions">
                        <Link href={`/events/${ev.id}`} className="btn btn-outline">
                          View Details
                        </Link>
                        {!isPast && (
                          <button
                            className={`btn${registered ? " btn-outline" : " btn-primary"}`}
                            onClick={() => requireAuth(() => toggleRegistration(ev))}
                          >
                            {status === "pending" ? "Pending" : registered ? "Registered" : ev.cta}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {communityEvents.length > 0 && (
            <section style={{ marginTop: 28 }}>
              <div className="page-head">
                <div>
                  <h2>From the community</h2>
                  <p>Events members have created and shared through their posts.</p>
                </div>
              </div>
              <div className="event-grid" style={{ marginTop: 12 }}>
                {communityEvents.map((event) => (
                  <CommunityEventCard key={event.id} event={event} requireAuth={requireAuth} />
                ))}
              </div>
            </section>
          )}

          {submitOpen && viewer && (
            <SubmitEventModal
              viewer={viewer}
              onClose={() => setSubmitOpen(false)}
              onSubmitted={(slug) => {
                setSubmitOpen(false);
                router.push(`/events/${slug}`);
              }}
            />
          )}
    </>
  );
}
