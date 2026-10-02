# Events

Public listing (`/events`) and detail (`/events/[id]`) pages, plus a
member-facing **Submit Event** flow and a per-event **attendee approval**
workflow. Design ported from the dashboard mockup's `eventsPage()` /
`eventDetail()` functions onto the shared
[`.opps-app` design system](./dashboard-design-system.md).

## Files

| File | Role |
| --- | --- |
| `src/app/events/page.tsx` | Server component for the list route. Fetches upcoming events (`getEvents()`), past events (`getEvents(true)`), community "event" posts, and the viewer's per-event registration status. |
| `src/app/events/[id]/page.tsx` | Server component for the detail route. `id` is the event's `slug`. Looks the event up across both upcoming and past lists so a past event's page still resolves. |
| `src/app/events/actions.ts` | `toggleEventRegistrationAction`, `submitEventAction` (Submit Event modal), `getEventAttendeesAction` / `respondToEventRegistrationAction` (creator-only attendee management). |
| `src/components/events/EventsPageClient.tsx` | Client component: Upcoming / My Events / Past Events tabs, filters, Submit Event button, event cards. |
| `src/components/events/SubmitEventModal.tsx` | Client component: the Submit Event form (name, type, date/time in ET, `LocationAutocomplete`, description, image upload). |
| `src/components/events/EventDetailActions.tsx` | Client component: Register / Pending / Cancel button, status-aware (`pending`/`approved`/`declined`/none). |
| `src/components/events/EventAttendeesPanel.tsx` | Client component, creator/admin-only: lists an event's registrants, Approve/Decline for pending ones. |
| `src/components/events/EventHostCard.tsx` | Client component: the sidebar "Hosted by …" card. For a member-submitted event, "Contact Event Support" opens a real chat with the creator (`MemberContactPanel`); for an admin/platform event (no `created_by`) it links to `/contact`. |
| `src/components/messages/MemberContactPanel.tsx` | Client component, shared: a slide-in quick-message drawer for messaging any profile directly (used here, and by the Partners page's company contact button). |
| `src/lib/supabase/queries.ts` → `getEvents()`, `getEventRegistrationStatuses()`, `getEventAttendeesAction`'s backing RPC calls | See below. |
| `src/lib/landing-data.ts` → `EventItem`, `EventAgendaItem`, `EventSpeaker`, `EventAttendee`, `EventRegistrationStatus` | Extended type set (see below). |

## Database (2026-09-22 session)

`events` gained: `image_url text`, `agenda jsonb` (`{time, activity}[]`),
`speakers jsonb` (`{name, title, avatarUrl}[]`), `created_by uuid` (the
submitting member, null for admin/platform events). The `format` check
constraint was widened from `webinar`/`qa`/`in_person` to also allow
`virtual_conference`/`networking`/`trade_show`/`workshop`/`training`.

`event_registrations` gained a `status` column
(`pending`/`approved`/`declined`, default `approved`). A registration for
a **member-submitted** event (has `created_by`) starts `pending` unless
the registrant *is* the creator, in which case it's auto-approved — an
organizer never has to approve their own registration. A registration for
an **admin/platform** event (`created_by` is null — nobody to review it)
is always instantly `approved`, matching the original one-click behavior.
Only `approved` registrations count toward "N attending" anywhere.

Three security-definer RPCs back all of this, because a regular member
has no RLS write/read path onto rows they don't own:

- `submit_member_event(...)` — validates and inserts on the submitter's
  behalf (no RLS INSERT policy exists for `events`; only "Admins manage
  all events" does).
- `get_event_attendee_counts(event_ids[])` — returns just the aggregate
  **count** of approved registrations per event. Needed because a plain
  `select` on `event_registrations` is scoped by "Members manage their
  own event registrations" (`profile_id = auth.uid()`) — every viewer
  would otherwise only ever see *their own* registration, silently
  under-counting every event to 0 or 1 regardless of real attendance.
  This was a real bug caught and fixed mid-session, not a
  design decision — see `src/lib/supabase/queries.ts`'s comment on
  `getEvents()` for the full explanation.
- `get_event_attendees(event_id)` / `respond_to_event_registration(...)`
  — the creator/admin-only "who's registered, approve/decline" pair
  behind `EventAttendeesPanel`.

An `event-media` public storage bucket (path `<profile_id>/<uuid>.<ext>`,
company-admins-style ownership by uploader) holds Submit Event's optional
banner image.

All of the above is in `supabase/migrations/20260922010000_*.sql` through
`20260922030000_*.sql`.

## Submit Event

Any signed-in member can create a real event via the **+ Submit Event**
button on `/events` — not just admins. The form: name, type (dropdown —
the widened `format` set above), date/time (interpreted as **America/New_York**
regardless of the server's own OS timezone — see the
`etNaiveDatetimeToUtcIso` comment in `src/app/events/actions.ts` for why
a naive `new Date(str)` parse would have been silently wrong on any host
that isn't already US-Eastern), `LocationAutocomplete`, an optional
description, and an optional banner image (uploads immediately to
`event-media`, preview shown inline). On save it redirects to the new
event's real detail page.

## List page (`EventsPageClient`)

- **Tabs** — Upcoming Events / My Events (any registration status,
  pending or approved) / **Past Events** (events that have ended — a real
  tab now, not a gap).
- **Filters** — Event Type (`event.kind`, now Title Case: "Live Webinar",
  "Virtual Conference", "Networking", "Trade Show", "Workshop", …), plus
  search across title/description/location.
- **Cards** (`.event-card`) — banner shows the event's own uploaded image
  (with a dark scrim for text legibility) when present, otherwise the
  original gradient; kind tag, date badge, title, time/location, a real
  "N attending" count, and View Details / Register-or-Pending button row.

## Detail page

- **Hero** — date badge, kind tag, title, real time/location/attending
  line, banner image when present, and a status-aware Register action.
- **About This Event** — the real `description`.
- **Agenda** — only rendered when `event.agenda` is non-empty (currently
  populated by hand for specific events, not a builder UI yet — see
  Known gaps).
- **Featured Speakers** — only rendered when `event.speakers` is
  non-empty, same caveat.
- **Attendees panel** — creator/admin only. Pending-approval list with
  Approve/Decline, plus a plain Registered roster.
- **Event Details sidebar** — real date/time/location/attendee facts,
  plus a second Register action.
- **Hosted by … card** — company/member-submitted events show the real
  creator's name and a "Contact Event Support" button that opens a real
  message thread with them; platform events show "Hosted by
  GovConUnited" and link to `/contact`. Also Copy Event Link.
- **Similar Events** — up to 3 other upcoming events sharing the same
  `kind`.

## What's real vs. what was left out

Agenda and speakers are a real, structured `jsonb` data model now (not
fabricated per the earlier "intentionally not shown" stance) — but there
is still no in-app **builder UI** for them; today they're set by hand
(e.g. via SQL) per event. A dedicated admin/creator form for agenda items
and speakers is a reasonable next step, not built this pass.

## Known gaps

- No agenda/speaker builder UI (data model exists, no form yet).
- No waitlist / capacity limit.
- No `.ics` calendar export.
- Community "event" posts (the separate lightweight RSVP flow on posts
  with `post_type='event'`) are unrelated to the `events` table above and
  weren't touched.
