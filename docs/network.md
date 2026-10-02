# Network

Public member directory (`/network`) and profile (`/network/[id]`)
pages, plus the homepage's "People you may want to connect with" teaser
(`LandingPage.tsx`, `#network`). Design ported from the dashboard
mockup's `network()` / `personCard()` functions onto the shared
[`.opps-app` design system](./dashboard-design-system.md).

**This section shows real signed-up accounts, not seeded demo people** —
see "Real accounts, not the seeded `members` table" below for why that's
a distinct data source from the rest of this doc's dashboard-design-system
siblings, and from Community's own "Top Members," which still uses the
seeded table on purpose.

## Files

| File | Role |
| --- | --- |
| `supabase/migrations/20260917010000_network_members_view.sql` | Creates `public.network_members`, a view over `profiles` exposing only `id`, `first_name`, `last_name`, `created_at` — see below for why a view, not the table. |
| `src/app/network/page.tsx` | Server component for the directory route. |
| `src/app/network/[id]/page.tsx` | Server component for the profile route. `id` is the real account's `profiles.id` (a uuid), not a slug. |
| `src/components/network/NetworkPageClient.tsx` | Client component: directory search, Find People / My Connections tabs. |
| `src/components/network/ConnectButton.tsx` | Client component: Connect + Message buttons, used on the profile page. |
| `src/lib/supabase/queries.ts` → `getNetworkMembers()` | Queries the `network_members` view, maps to `NetworkMember`. |
| `src/lib/landing-data.ts` → `NetworkMember` | `{ id, name, initials }` — deliberately thin; see below. |
| `src/lib/avatar-tone.ts` → `toneFor()` | Same deterministic color-per-name used everywhere else in `.opps-app`, reused here for the initials avatar since real accounts have no photo. |
| `src/components/pro-badge.tsx` | `<ProBadge>` — the real Pro-plan badge (`/Icons/pro.png` — note the capital "I", see the case-sensitivity bug below), rendered next to a name anywhere `isPro` is true across the app, not just here. |
| `src/components/CompanyAutocomplete.tsx` | Company/organization autocomplete for the Add Experience form, backed by `/api/companies/search`. |
| `src/components/SkillsChipInput.tsx` | LinkedIn-style "+ Add skill" chip entry, shared by the Experience and Education forms. |
| `src/lib/date-options.ts` | `MONTH_OPTIONS`, `yearOptions()`, `formatMonthYear()` — the Month/Year `<select>` pairs on the Experience/Education forms. |
| `src/app/api/companies/search/route.ts` | Published-companies name search backing `CompanyAutocomplete`. |

## Real accounts, not the seeded `members` table

This used to read from the same seeded `members` table
(`getMembers()`/`Member`) that Community's "Top Members" sidebar and post
authorship still use (5 fake rows: Angela Morris, Marcus Lee, …). Once
real accounts existed, showing fake people under "connect with" on the
public homepage stopped making sense, so this section — the homepage
teaser, the `/network` directory, and `/network/[id]` — was switched to
real data. **Community's Top Members and post authorship were
deliberately left on the seeded table** — that's a separate, wider
change (it would also mean deciding what "community points"/leaderboard
even means for a real account with no activity yet) that wasn't part of
this request.

`profiles` (the real-accounts table) has RLS that only lets a signed-in
user read their own row — by design, since it also stores email
addresses (see [authentication.md](./authentication.md)). A public
"who to connect with" list needs to show *other* people's names, which
that RLS can't allow directly. Rather than add a public-read policy on
`profiles` itself (which would expose every column, including email, to
any anonymous visitor), the migration creates a narrow view,
`network_members`, selecting only `id`/`first_name`/`last_name`/
`created_at`. A Postgres view runs with its **owner's** privileges by
default, not the querying role's RLS — the standard, documented pattern
for exposing a safe subset of an RLS-protected table — so `grant select
on network_members to anon, authenticated` is what actually makes it
visible, as a deliberate, narrow, separate step from `profiles`'s own
RLS. Verified directly against the anon key (`curl
.../rest/v1/network_members` with the anon apikey) before wiring up any
application code, confirming it returns names but never email.

## `NetworkMember` is intentionally thin

```ts
export interface NetworkMember {
  id: string;
  name: string;
  initials: string;
}
```

Real accounts have no role/title, no uploaded avatar photo, no cred
points, and no real mutual-connections count (connections are
`localStorage`-only — see below) — so unlike the old `Member` type, none
of that is here to begin with, rather than being present-but-fake.
`initials` drives a colored avatar badge (`.company-logo-avatar`, tone
via `toneFor(name)`) everywhere a photo would have gone. Every card and
profile shows a plain, honest "GovConUnited Member" instead of a
fabricated role.

## Directory page (`NetworkPageClient`)

- **Tabs** — "Find People" (all real members) / "My Connections"
  (filtered to `connections.has(m.id)`), gated behind `viewer`. Same as
  before, there's no "Connection Requests" tab — connecting is an
  immediate `usePersistentSet("gcuConnections", viewer)` toggle, not a
  request/accept flow.
- **Empty state** — if `network_members` has zero rows (a fresh
  deploy, before anyone signs up), shows "No GovConUnited members yet /
  Be one of the first to join" instead of an empty grid.
- **Sidebar — "Network Overview"** — 2 real numbers: total real members
  and the viewer's own connection count.

## Profile page

- **Hero** — initials avatar (`.company-logo-avatar.lg`), name, "real
  account" facts. No verified checkmark, community-points key-grid, or
  mutual-connections count — none of that exists for a real account.
- **About** — the same generic templated paragraph as before (no real
  bio/experience data model yet).
- **Actions card** (`ConnectButton`) — unchanged: Connect is real,
  Message is a toast-only stub.
- **People You May Know** — up to 4 other real members.

## Homepage teaser (`LandingPage.tsx`, `#network`)

Same switch: `members.slice(0, 4)` (fake) → `networkMembers.slice(0, 4)`
(real), photo `<img>` → `.initials-avatar` (a plain, unscoped equivalent
of `.company-logo-avatar` for pages outside `.opps-app`, in
`landing.css`), and an empty state ("No GovConUnited members yet — be
one of the first to join") instead of an empty grid. `getLandingContent()`
now fetches both `getMembers()` (still needed for the Community teaser
section further down the same page) and `getNetworkMembers()`.

## Update: connections and messaging are now real

Connection state is now server-persisted (`connections` table,
`20260918000500_connections.sql`, real select/insert/delete RLS) instead of
the `localStorage`-only set described above. Messaging is also real now —
see [messages.md](./messages.md). Real profile fields (job title, location,
company, photo) and a real "Profile viewers" count were also added; see
[dashboard.md](./dashboard.md)'s "From omitted to real tracking" section
for the full list and the migrations behind them.

## Update: real request/accept connections

Connecting is no longer an immediate toggle — `connections` now has a real
`status` (`pending`/`accepted`) and `requested_by`
(`20260918010800_connection_requests.sql`), matching the design's
"Connection Requests" tab:

- **`ConnectButton`** (`src/components/network/ConnectButton.tsx`) reflects
  4 real states per person: no relation (**Connect**), a request you sent
  (**Pending**, click to cancel), a request you received (**Accept**/
  **Decline**), or an accepted connection (**Connected**, click to remove).
- **`src/app/network/actions.ts`** — `sendConnectionRequestAction`,
  `respondToConnectionRequestAction`, `removeConnectionAction`. RLS
  enforces the real rule this models: only the *other* participant can
  accept a pending request (`20260918010800_connection_requests.sql`'s
  update policy) — a requester can't accept their own request even by
  calling the action directly.
- **Network page** gained a real **"Connection Requests (N)"** tab
  (`getConnectionRequests()`), alongside "My Connections" (accepted only)
  and "Find People". `connection_counts` and every dashboard/profile stat
  that used to count all connection rows now filters to `status =
  'accepted'` — a pending request isn't a connection yet.

## Update: full member-profile page (`/network/[id]`)

The profile page (`MemberProfilePageClient.tsx`) was rebuilt into a full
LinkedIn-style profile matching a design reference — real cover photo +
avatar upload, headline/pronouns/bio/specialty/availability/relationship
goals, skills and certifications (tag lists), contact links (phone/website/
LinkedIn/languages), a real connection count, and real Experience/Education
history with full add/delete (`work_experiences`/`education_records`
tables, `20260918000800_profile_details.sql`) — all editable in place by
the profile's own owner, all `null`/`[]`/hidden when unset rather than
showing invented placeholder text.

**Real per-profile analytics** (owner-only, shown on their own profile):
Profile views (existing `profile_views`), Post impressions (existing
`post_views` on the owner's real posts), and a new **Search appearances**
count (`profile_search_impressions` — incremented every time `/api/search`
returns that profile as a result). A real **completeness percentage**
(`computeCompletenessPct` in `queries.ts`) checks the same fields the page
actually renders — never a fabricated "95% complete."

**A real public connection count needed a new view.** `connections`' RLS
only returns rows where the *querying* user is a participant — correct for
"my connections," but it means a profile page can't sum someone *else's*
connections that way (every row would be invisible to a third-party
viewer). `connection_counts` (`20260918000900_connection_counts_view.sql`)
is a view exposing only the aggregate count per profile, never the actual
connection list, safe to make public the same way a real network site
shows "500+ connections" without exposing who they are.

**"People Also Viewed"** is real signal, not a true recommendation engine:
`getPeopleAlsoViewed()` ranks other members by how many real `profile_views`
they've received (excluding the profile being looked at), standing in for
collaborative filtering this app's data volume doesn't support.
**"Companies You May Like"** reuses the existing `companies` table and the
existing (still `localStorage`-based) `FollowCompanyButton` — that button's
own real/local-storage status is unchanged by this pass.

### Deliberate simplifications vs. the design reference

- **One consolidated "Edit Profile" form**, not five separate inline
  gear-icon editors per section (About / Professional Details / Skills /
  Certifications / Contact) — same real fields, same real
  `updateProfileDetailsAction`, just one entry point instead of five.
- **No follower count** — the reference design's "50 followers" has no
  real backing (following a *person*, distinct from connecting, doesn't
  exist as a concept in this schema) and wasn't invented.
- **No vanity profile URL** (e.g. `governconunited.com/in/sarah-adams`) —
  profiles are keyed by UUID; "Public profile & URL" shows the real current
  `/network/[id]` path instead of a fabricated slug. Adding real vanity
  URLs would need a new unique, user-editable slug column — out of scope
  here.
- **"Profile language"** card omitted — the app has exactly one language
  (English) and no real language-preference setting, so a card with an
  edit affordance for a setting that doesn't exist would be misleading.
- **Comments tab** shows an honest empty state rather than a non-functional
  reply UI — there's still no real comment/reply table (see
  [community.md](./community.md)).

## Update: Pro badge next to a member's name everywhere

A real "Pro" badge (`src/components/pro-badge.tsx`, `<img src="/Icons/pro.png">`)
renders next to a member's name anywhere it appears — profile hero, feed
posts and comments (including the "People you may want to connect with"
landing-page teaser), the directory grid, "New Members"/"Suggested for
You"/connection-request widgets, and the viewer's own name in the
dashboard topbar and sidebar. It's driven by a real `plan_selection`
column, not a guess: `network_members` (`20260921003700_network_members_plan_selection.sql`)
now exposes `plan_selection` (append-only, same pattern as every prior
extension of this view), and `getAuthorMap()`/`getNetworkMembers()`/
`getTopContributors()`/`getPublicProfile()`/`getConnections()`/
`getConnectionRequests()`/`getNewMembers()` all resolve it into a real
`isPro: boolean` on `NetworkMember`/`Member`/`Post`/`PostComment`. Every
place a member name renders inside a `display:grid`/`display:flex` name
element had to put the badge *inside* that element (not as a sibling
after it) — a name element with `display:block` (`.mini-row-title`) or a
narrow flex row (the profile dropdown, the sidebar member row) would
otherwise either wrap the badge onto its own line, or — for a long name —
hide it off the edge of a fixed-width container entirely, since a flex
child's default minimum width is its own content size. The fix in the
narrow-container cases is `minWidth: 0` on the truncating name `<span>`
so its `overflow:hidden`/`text-overflow:ellipsis` can actually engage,
leaving room for the badge on the same line.

**Real bug found in production**: the asset lives at `public/Icons/pro.png`
(capital "I" — pre-existing before this feature, not renamed for it), but
the component originally referenced it as `/icons/pro.png` lowercase.
Windows' case-insensitive filesystem serves both spellings identically in
local dev, silently hiding the mismatch; Linux production filesystems
(where this is actually deployed from) are case-sensitive, so the badge
404'd and rendered as a broken-image icon everywhere in production while
looking correct in every local check during development. Fixed by
matching the component's `src` to the asset's actual committed casing.

**Real bug fixed — badge blown up to 78px on the landing page**: the
badge's size was set via plain HTML `width`/`height` attributes, which a
CSS stylesheet rule always outranks. The landing page's "People you may
want to connect with" teaser has a generic `.connection-card img{width:78px;
height:78px;border-radius:50%;...}` rule for its own avatar photo, which
was silently applying to the badge `<img>` too, blowing it up to the same
78×78 circular size as the avatar and breaking the card layout. Fixed by
setting `width`/`height` again via inline `style` (which always wins over
an external stylesheet selector), not just as attributes.

**Real bug fixed — badge missing from the dashboard's own profile
summary card**: `DashboardPageClient.tsx` has its own small "who am I"
card (avatar, name, "GovConUnited Pro member", "View public profile") at
the top of the left column, separate from `DashboardShell`'s topbar/
sidebar — this one had never had `<ProBadge>` wired in at all.

## Update: LinkedIn-parity Experience/Education forms

The "Add experience"/"Add education" forms (in `MemberProfilePageClient.tsx`)
were rebuilt to match LinkedIn's real field set instead of a handful of
plain text inputs:

- **Company/organization autocomplete** — `src/components/CompanyAutocomplete.tsx`,
  backed by a new `src/app/api/companies/search/route.ts` (published
  companies only, `ilike` on name, capped at 8). Picking a suggestion
  stores a real `company_id` FK (`work_experiences.company_id`, added in
  `20260921003600_profile_experience_education_linkedin_parity.sql`);
  typing a name with no match still submits fine as plain text with no
  `company_id`, matching LinkedIn's own behavior for an unlisted employer.
  A matched entry's logo (`companies.logo_url`) now renders on the saved
  experience row instead of always falling back to initials.
- **Structured dates** — Month + Year `<select>` pairs (`src/lib/date-options.ts`)
  replace the old single freeform "Jan 2019"-style text input for both
  Start and End dates on both forms. The server actions
  (`addWorkExperienceAction`/`addEducationAction` in
  `src/app/network/profile-actions.ts`) compose the stored `start_label`/
  `end_label` strings from the selected month/year server-side, so the
  display/read path (`{exp.startLabel} – {exp.endLabel}`) needed no changes.
- **"I currently work here"** checkbox (`work_experiences.is_current`) hides
  the End date fields and forces `end_label = 'Present'`.
- **Skills** — `src/components/SkillsChipInput.tsx`, a LinkedIn-style "+ Add
  skill" chip entry that still submits a single comma-joined hidden field,
  so the existing comma-splitting server-side logic didn't need to change.
  `education_records` gained its own `skills text[]` column (previously
  only `work_experiences` had one), plus new `grade`/`description` columns,
  all added in the same migration above.
- **Real bug found while wiring this up**: both forms closed themselves
  right after submit *regardless of whether the save succeeded* — an
  `async (formData) => { await experienceAction(formData); setAdding...(false); }`
  wrapper ran the close unconditionally, so a failed save silently
  discarded the form and its inline error message with zero feedback.
  Fixed by watching the `useActionState` result in an effect-like pattern
  (comparing the previous/current state object, mirroring
  `PostComposer.tsx`'s own `postState` diffing) and only closing on
  `state.success`.

## Update: fixed a profile-card overflow bug hiding the "More options" menu

The member-profile hero card's outer `<section className="card">` carried
an inline `overflow: "hidden"` (redundant with `.opps-app .card`'s own
default) intended for nothing in particular — but it clipped any content
that visually extended past the card's own box, including the "•••" more-
options dropdown (Share/Save/Report/Block) and the Connect button's box-
shadow. The dropdown wasn't just visually clipped, it was **completely
invisible when opened** — a real, previously-unnoticed functional bug,
not just cosmetic. Fixed by changing the card to `overflow: "visible"`,
since the cover photo it was ostensibly protecting already rounds its own
top corners via `.member-cover`'s own `border-radius` and doesn't need the
parent to clip anything. A separate, unrelated `overflowX: "auto"` on the
Connect/Message/Follow/••• button row itself had the same root cause
(setting only `overflow-x` forces the browser to compute `overflow-y` as
`auto` too, clipping vertical content) — removed in favor of the sitewide
default `flex-wrap: wrap` every other action row already uses.

## Known gaps

- "People Also Viewed" and "People You May Know" are real but simple
  heuristics, not true recommendation models.
- New migrations (`work_experiences`, `education_records`,
  `profile_search_impressions`, `connection_counts`, and the extended
  `profiles` columns) are **not yet applied to the live database** — see
  [dashboard.md](./dashboard.md)'s Known Gaps for why and what breaks
  until `supabase db push` is run.
- Anyone who signs up appears here immediately, with their real name,
  to any anonymous visitor — there's no opt-in/opt-out or "feature me"
  control yet. That was an acceptable tradeoff for the 3 real accounts
  this was built against (the site owner's own test accounts), but
  before real public users start signing up, this needs either a
  visibility-consent flag on `profiles` (checked by `network_members`)
  or a decision that this is intentional and disclosed in the Terms/
  Privacy pages.
