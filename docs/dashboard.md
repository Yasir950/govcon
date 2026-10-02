# Dashboard

Signed-in member home (`/dashboard`). Design ported from the dashboard
mockup's `home()` function (content) and its `.topbar`/`.sidebar` chrome
(shell), onto the shared [`.opps-app` design system](./dashboard-design-system.md).
Previously this route was a placeholder ("the full dashboard is being built
next"); this is the first real implementation of it.

## Files

| File | Role |
| --- | --- |
| `src/app/dashboard/page.tsx` | Server component. Requires auth (redirects to `/login?next=/dashboard` otherwise), fetches the viewer's profile plus real posts/events/network members, and picks a suggested connection. |
| `src/components/dashboard/DashboardShell.tsx` | Client component: the dashboard's own signed-in app shell — fixed topbar (logo, search, notifications/messages stubs, profile dropdown) and persistent left sidebar nav, ported from the mockup's chrome. Renders `SiteFooter` at the bottom of its content area. |
| `src/components/dashboard/DashboardPageClient.tsx` | Client component: the 3-column home layout, feed sort, and real upvoting. |
| `src/lib/supabase/queries.ts` → `getPosts()`, `getEvents()`, `getNetworkMembers()`, `getVotedPostIds()` | Same real data fetchers used by Community/Events/Network — see their own docs. |

## Shell (`DashboardShell`) — exact port, used on every `.opps-app` page

`DashboardShell` is a 1:1 port of the mockup's actual `.topbar`/`.sidebar`
chrome (values taken directly from `docs/GovConUnited-dashboard.html`, see
the comment above `.dash-shell` in `landing.css`) — not a simplified
reinterpretation. It's rendered for every signed-in visitor to any
`.opps-app` page via `src/components/SiteShell.tsx`:

```tsx
export function SiteShell({ viewer, children }) {
  if (viewer) return <DashboardShell viewer={viewer}>{children}</DashboardShell>;
  return <><SiteHeader viewer={viewer} /><main>{children}</main><SiteFooter /></>;
}
```

A signed-out visitor to the same routes (`/opportunities`, `/network`,
`/companies`, `/jobs`, `/resources`, `/events`, `/community`, `/partners`,
and their detail pages) still gets the marketing `SiteHeader`/`SiteFooter` —
unchanged from before. Only `/dashboard`, `/messages`, `/settings`, and
`/billing` require a session outright, so they render `DashboardShell`
directly rather than through `SiteShell`.

- **Topbar** (`.dash-topbar`, fixed, 82px) — logo (see "Logo asset" below), a
  live search box (see "Search" below), then real icon-button actions: Home
  and Network (hidden below 980px, same as the mockup's `.optional` class),
  Messages (real unread badge), Saved (real `usePersistentSet` count), and a
  profile trigger opening a dropdown with exactly the mockup's 5 items: My
  Profile, Dashboard, Saved Opportunities, Billing & Subscription, Account
  Settings — Notifications/Messages/Log Out are deliberately **not**
  duplicated into this dropdown, since the mockup gives them their own
  topbar icon buttons (Log Out lives only in the sidebar bottom). The
  viewer's own name in the trigger, the dropdown header, and the sidebar
  member row all show a real Pro badge when `viewer.planSelection === "pro"`
  — see [network.md](./network.md)'s "Pro badge" update for the full
  system and a `minWidth:0` alignment fix needed for long names.
- **Sidebar** (`.dash-sidebar`, fixed, 278px) — the mockup's exact order:
  Home, Profile (→ the viewer's own `/network/[id]`), Jobs, Network,
  Opportunities, Companies, Partners, Community, Events, Messages (real
  unread badge), Resources — then an "Upgrade Your Plan" card (free plan
  only), a member card, and Settings/Log Out.
- **Desktop icon-rail collapse** — the hamburger is always visible (not
  mobile-only) and toggles `.sidebar-collapsed` on the shell root at any
  width above 980px: the sidebar shrinks to an 82px icon-only rail
  (`font-size:0` hides the label text while the fixed-size `<svg>` icon still
  renders — the same CSS trick the mockup uses) and the bottom
  plan/member/settings block hides.
- **Mobile** (≤980px) — the *same* hamburger instead opens `.dash-sidebar`
  as a slide-in drawer with a click-outside overlay; the search box hides in
  favor of it. `DashboardShell` picks which behavior the click means by
  checking `window.innerWidth`, since the two are mutually exclusive by
  breakpoint.

### Search

The topbar search box is real, not decorative: typing debounces into
`GET /api/search?q=`, which queries `opportunities`/`companies`/
`network_members` directly (`ilike` on title/name, capped at 4 rows each)
and renders up to 8 live results in a dropdown; clicking one or pressing
Enter navigates to the real detail page.

### Real badges, not fabricated counts

The mockup hardcodes badge numbers (`messageBadge`, `savedBadge`,
`noticeBadge`). Here, the Messages badge is fetched client-side from
`GET /api/messages/unread-count` (so no page that renders the shell needs to
fetch/pass it itself) and the Saved badge reads the same
`usePersistentSet("gcuSavedOpportunities", …)` count `/opportunities`
already uses. There's no real notifications model, so no notifications
badge is shown at all — not a fake fixed number.

### Logo asset

`logo.svg` (used by `SiteHeader`) renders "United" in white — correct on
the marketing nav's dark navy background, invisible on this topbar's white
one. `DashboardShell` uses `logo-black.svg` instead, the existing light-
background variant already in `public/images/`.

## Sign-in now lands on `/dashboard`

`sanitizeNext()` (in both `src/app/(auth)/actions.ts` and
`src/app/auth/callback/route.ts`) now defaults to `/dashboard` instead of
`/` when no `next` value is present — so a plain login, a plain signup, an
OAuth sign-in, and an email-confirmation link with no explicit destination
all land the member in their signed-in home instead of back on the public
marketing page. Any call site that already passes an explicit `next` (e.g.
`useRequireAuth`'s "sign up to do X" redirects, which pass the current
page) is unaffected — this only changes the fallback.

## Layout (`.network-home`, inside the shell)

Pixel-matched against a screenshot of the mockup's home view (not just the
raw HTML), including elements the first pass of this page had deliberately
left out as "no real data behind them" — see "From omitted to real tracking"
below for why that changed.

- **Left rail** — profile card (real photo or initials, name, job title,
  location, company — all real `profiles` columns, blank when unset rather
  than invented), a real stats row (Profile viewers / Post impressions /
  Network growth), a quick-links card (Saved, Categories, Community,
  Events), and an "Upgrade Your Plan" card (free plan only, → `/billing`).
- **Center feed** — a real composer (create a real post — see "Real post
  creation" below), a Top/Recent sort control, and real `posts` rendered as
  feed cards with Like/Comment (no visible counts, matching the design).
- **Right rail** — Upcoming Events (real), a "GovConUnited Resource"
  spotlight card (real `resources` row, replacing the mockup's fake
  sponsor-ad PDF), "Community Highlights" (real posts not already in the
  main feed, replacing the mockup's fake "GovCon News" list), and a
  Suggested Connection card with a real mutual-connections count.

## From omitted to real tracking

The first pass of this page (see git history) dropped several mockup
elements outright — profile viewer/impression/growth stats, the news and
promoted-ad cards, mutual connections, and job title/location/company/photo
— because nothing in the schema backed them. When asked to match the design
exactly, the choice was between faking that data or building the tracking
to make it real; real tracking was chosen. What that added:

- **`profiles.job_title` / `location` / `company_name` / `avatar_url`**
  (`20260918000300_profile_fields_and_avatar.sql`) — real, optional profile
  fields, editable on [Settings](./settings.md), shown blank (never
  invented) when a member hasn't filled them in. `avatar_url` is a real
  upload to a Supabase Storage `avatars` bucket (same migration), publicly
  readable, writable only to the owner's own folder.
- **`profile_views`** (`20260918000400_profile_views.sql`) — one row per
  real visit to another member's `/network/[id]`; "Profile viewers" is a
  real `count()` of rows where `viewed_profile_id` is the viewer. RLS only
  lets a member see views of their *own* profile — there's no "who viewed
  me" list exposed about anyone else.
- **`connections`** (`20260918000500_connections.sql`) — replaces the
  previous `localStorage`-only "gcuConnections" set used by `ConnectButton`/
  `NetworkPageClient`/this page's Suggested Connection card (a known gap
  `network.md` used to list). "Network growth" is a real percentage:
  connections made in the last 30 days vs. before that (`null`/"New" shown
  instead of a divide-by-zero fake number when there's no prior baseline).
  Mutual-connection counts (`getMutualConnectionCount`) are a real
  intersection of two members' connection sets.
- **Real post authorship** (`20260918000600_real_post_authorship.sql`) —
  `posts.author_id` (the seeded `members` FK) is now nullable, and a new
  `author_profile_id` lets a real account author a post for real
  (`createPostAction`, used by this page's composer). "Post impressions"
  sums real `post_views` rows (recorded on every discussion-detail page
  visit) across the viewer's own real posts — a member with no real posts
  yet honestly shows 0.
- **"GovCon News" → "Community Highlights"** and **the promoted ad card →
  a Resource Spotlight** — these two specifically couldn't be made real by
  *tracking* anything (there's no way to track a real external news
  article or sponsor into existence). Each was replaced with a real
  equivalent that fills the same visual slot instead: real posts not shown
  in the main feed, and a real row from the `resources` table.

## Composer — what's real, what's a stub

Clicking "Start a post" expands a real title + body form
(`createPostAction`); Video and Photo buttons show a "coming soon" toast
(no media-upload pipeline exists for post attachments — a materially
different, larger feature than the rest of this pass) — "Write article"
opens the same real text-post form rather than a separate long-form editor.
"Like"/"Comment" on feed cards use the same real, persisted
`castVoteAction` (`post_votes` table) Community uses; "Comment" links to
the real discussion detail page rather than opening a reply box, since
there's still no comment/reply table (see [community.md](./community.md)).

## Update: arriving from a notification highlights the post/comment

Clicking a "View Post" link (email or in-app notification for a like,
comment, reply, or repost on a main-feed post) lands on `/dashboard?post=
<slug>` (plus `&comment=<id>` for a comment-specific notification) —
never a separate detail page, matching how LinkedIn opens a notification
straight into the feed itself. See [community.md](./community.md)'s
"Update: a feed-origin post never renders this page" for the redirect
that produces this URL.

- **`src/app/dashboard/page.tsx`** reads `searchParams.post`/`.comment`.
  If the highlighted post isn't already on page 1 of the personalized
  feed (`getFeedPosts`), it's fetched directly by slug via `getPosts()`
  and prepended — same "find by route" pattern the Community discussion
  page itself uses — so it's guaranteed to be on screen. Its comments are
  also fetched server-side (`getPostComments`) and passed down, rather
  than left to `PostCard`'s usual on-demand client fetch for that one
  post — see "Real bug fixed" below for why.
- **`FeedList`** scrolls `#post-<id>` into view on mount when a
  `highlightPostId` is given.
- **`PostCard`** (now exported, previously private to `FeedList`) takes
  `highlighted` (a persistent blue ring around the card — no timer, it
  just stays until the viewer navigates elsewhere), `initialCommentsOpen`
  (auto-expands the thread when there's a specific comment to show), and
  `initialComments` (seeds its `comments` state instead of starting at
  `null`).
- **`PostCommentThread`**/`CommentRow` take `highlightCommentId` — the
  matching comment (top-level or a reply) gets a yellow background/ring
  and is scrolled into view once rendered.

**Real bug fixed**: the very first version of this fetched the
highlighted post's comments the normal way (`PostCard`'s existing
on-mount `useEffect` → `GET /api/posts/[id]/comments`) and it worked
correctly on a direct visit to `/dashboard?post=...`, but silently never
returned when arriving via the `redirect()` from
`community/discussion/[slug]` — the request left the browser (confirmed
via a `request` event) but never completed (no `requestfinished` or
`requestfailed`), so the thread stayed stuck on "No comments yet." Root
cause not fully isolated (something about that specific redirect chain
in Next dev), but rather than depend on a client fetch racing a redirect
at all, the fix fetches the highlighted post's comments **server-side**
in `dashboard/page.tsx` and seeds them directly — no client fetch, no
race, for this one path.

## Known gaps

- No media upload for posts (Video/Photo composer buttons) — text posts
  only.
- ~~No real comment/reply system~~ — superseded, `post_comments` is now a
  real table with likes/replies/image attachments, inline on feed cards
  via the same `PostCommentThread` Community uses; see
  [community.md](./community.md)'s "Update: real comments".
- Suggested Connection picks the most recently joined non-connected member
  — real data, but not a real recommendation model.
- Sort ("Top"/"Recent") is a client-side re-order of the same fetched
  `posts` array — "Recent" isn't backed by a real timestamp comparison
  since `Post` only exposes a pre-formatted `postedAgo` string.
- No real notifications model — the topbar/sidebar have no notifications
  entry point at all (removed rather than left as a dead stub).
- **New migrations are not yet applied to the live database** — this
  environment has no `SUPABASE_SERVICE_ROLE_KEY`/linked CLI to run
  `supabase db push`. Until that's run, `/dashboard`, `/network/[id]`,
  `/settings`, and anywhere `ConnectButton` appears will error (the
  `connections`/`profile_views`/`post_views`/new `profiles` columns don't
  exist yet on the remote database). This must be pushed before deploying
  this change.

## Sibling docs for the rest of what "build everything real" covered

The dashboard mockup's sidebar/topbar reference several destinations that
didn't exist as real pages before this pass. Each got a real, database-backed
implementation rather than a "coming soon" stub — see:

- [messages.md](./messages.md) — real direct-messaging inbox.
- [settings.md](./settings.md) — real profile/notification/password settings.
- [billing.md](./billing.md) — real Stripe Checkout/Portal integration.
- [partners.md](./partners.md) — real partners page (real companies as
  featured partners, real counts, a real persisted application form).
