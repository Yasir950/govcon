import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { EventAttendeesPanel } from "@/components/events/EventAttendeesPanel";
import { EventDetailActions } from "@/components/events/EventDetailActions";
import { EventHostCard } from "@/components/events/EventHostCard";
import { getEventRegistrationStatuses, getEvents } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import { createClient } from "@/lib/supabase/server";
import { EventCheckinHostCard } from "@/components/points/EventCheckinHostCard";
import { VirtualAttendanceTracker } from "@/components/points/VirtualAttendanceTracker";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [upcoming, past] = await Promise.all([getEvents(), getEvents(true)]);
  const event = [...upcoming, ...past].find((e) => e.id === id);
  if (!event) return { title: "Event · GovConUnited" };

  const title = `${event.title} · GovConUnited`;
  const description = `${event.title} — ${event.when}. ${event.description}`.slice(0, 200);
  return {
    title,
    description,
    alternates: { canonical: `/events/${event.id}` },
    openGraph: { title, description, url: `/events/${event.id}`, type: "article" },
  };
}

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [upcoming, past, viewer] = await Promise.all([getEvents(), getEvents(true), getViewer()]);
  const events = [...upcoming, ...past];
  const event = events.find((e) => e.id === id);
  if (!event) notFound();

  const statusMap = viewer ? await getEventRegistrationStatuses(viewer.id) : new Map();
  const initialStatus = statusMap.get(event.dbId) ?? null;
  const isPast = past.some((e) => e.id === event.id);
  const isCreator = viewer ? viewer.id === event.createdBy || viewer.isAdmin : false;

  const similar = upcoming.filter((e) => e.id !== event.id && e.kind === event.kind).slice(0, 3);

  // Virtual attendance (10+ minutes in the room) for registered members.
  const supabase = await createClient();
  const { data: timing } = await supabase.from("events").select("starts_at, ends_at, format, location").eq("id", event.dbId).maybeSingle();
  const isVirtual =
    !!timing && (["webinar", "virtual_conference"].includes(timing.format) || /virtual|online|zoom|teams|webex|google meet|remote/i.test(timing.location ?? ""));

  return (
      <section className="main" id="event-detail">
          <div className="wrap">
            <div className="opps-app compact-btns">
              <Link href="/events" className="link-btn back-link">
                ← Back to events
              </Link>

              <section
                className="card event-detail-hero"
                style={
                  event.imageUrl
                    ? {
                        backgroundImage: `linear-gradient(120deg, rgba(0,79,134,.88), rgba(0,113,188,.88)), url(${event.imageUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              >
                <div className="event-detail-date">
                  {event.month}
                  <br />
                  {event.day}
                </div>
                <div>
                  <span className="tag" style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}>
                    {event.kind}
                  </span>
                  <h1>{event.title}</h1>
                  <div style={{ color: "rgba(255,255,255,.85)", fontSize: ".84rem" }}>
                    {event.time} · {event.location} · {event.attendingCount} attending
                  </div>
                </div>
                {!isPast && (
                  <div style={{ minWidth: 180 }}>
                    <EventDetailActions eventId={event.dbId} eventTitle={event.title} viewer={viewer} initialStatus={initialStatus} />
                  </div>
                )}
              </section>

              <div className="detail-grid">
                <div className="stack">
                  <section className="card panel">
                    <h2 className="section-title">About This Event</h2>
                    <p className="meta">{event.description}</p>
                  </section>

                  {event.agenda.length > 0 && (
                    <section className="card panel">
                      <h2 className="section-title">Agenda</h2>
                      <div style={{ marginTop: 10 }}>
                        {event.agenda.map((item, i) => (
                          <div className="agenda-row" key={i}>
                            <strong>{item.time}</strong>
                            <span className="meta">{item.activity}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {event.speakers.length > 0 && (
                    <section className="card panel">
                      <h2 className="section-title">Featured Speakers</h2>
                      <div className="speaker-grid">
                        {event.speakers.map((speaker, i) => (
                          <div className="speaker-card" key={i}>
                            <Avatar name={speaker.name} avatarUrl={speaker.avatarUrl} size={64} />
                            <strong>{speaker.name}</strong>
                            <span className="meta">{speaker.title}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {viewer && isVirtual && initialStatus === "approved" && timing && (
                    <VirtualAttendanceTracker eventId={event.dbId} startsAt={timing.starts_at} endsAt={timing.ends_at} />
                  )}

                  {isCreator && <EventCheckinHostCard eventId={event.dbId} />}

                  {isCreator && <EventAttendeesPanel eventId={event.dbId} />}
                </div>

                <aside className="stack">
                  <section className="card panel">
                    <h2 className="section-title">Event Details</h2>
                    <div style={{ marginTop: 10 }}>
                      <div className="event-fact">
                        <span>
                          <strong>{event.date}</strong>
                          <span className="meta" style={{ display: "block" }}>
                            {event.time}
                          </span>
                        </span>
                      </div>
                      <div className="event-fact">
                        <span>
                          <strong>{event.location}</strong>
                          <span className="meta" style={{ display: "block" }}>
                            {event.location === "Online"
                              ? "Secure access link sent after registration"
                              : "Venue details provided after registration"}
                          </span>
                        </span>
                      </div>
                      <div className="event-fact">
                        <span>
                          <strong>{event.attendingCount} attendees</strong>
                          <span className="meta" style={{ display: "block" }}>
                            Contractors, agencies, and partners
                          </span>
                        </span>
                      </div>
                    </div>
                    {!isPast && (
                      <div style={{ marginTop: 12 }}>
                        <EventDetailActions eventId={event.dbId} eventTitle={event.title} viewer={viewer} initialStatus={initialStatus} />
                      </div>
                    )}
                  </section>

                  <EventHostCard
                    creatorId={event.createdBy}
                    creatorName={event.creatorName}
                    creatorAvatarUrl={event.creatorAvatarUrl}
                    viewer={viewer}
                  />

                  {similar.length > 0 && (
                    <section className="card panel">
                      <h2 className="section-title">Similar Events</h2>
                      {similar.map((e) => (
                        <Link href={`/events/${e.id}`} key={e.id} className="similar-row">
                          <b>{e.title}</b>
                          <span className="meta">
                            {e.time} · {e.location}
                          </span>
                        </Link>
                      ))}
                    </section>
                  )}
                </aside>
              </div>
            </div>
          </div>
        </section>
  );
}
