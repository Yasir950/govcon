# Landing page

Public marketing/home page at `/`. Renders for both signed-out visitors and
authenticated members (the header CTA and hero copy change based on session).

This doc covers the homepage itself. Each of its teaser sections also has
a full dedicated page with its own richer UI and its own doc:
[opportunities](./opportunities.md), [companies](./companies.md),
[jobs](./jobs.md), [network](./network.md), [resources](./resources.md),
[events](./events.md), [community](./community.md) — all seven built on
the shared [`.opps-app` design system](./dashboard-design-system.md).
Authentication (login/signup/reset) is documented separately in
[authentication.md](./authentication.md).

## Files

| File | Role |
| --- | --- |
| `src/app/page.tsx` | Server component for the `/` route. Fetches content and the current user, then renders `LandingPage`. |
| `src/components/landing/LandingPage.tsx` | Client component. All markup, sections, and interactive state for the homepage only (see the section docs above for the dedicated pages). |
| `src/components/landing/SiteHeader.tsx` | Nav bar, shared by the homepage and every dedicated page. Link order: Resources, Opportunities, Companies, Jobs, Network, Events, Community, Pricing — Resources is first because it's the first section after the hero on the homepage. |
| `src/components/landing/SiteFooter.tsx` | Footer, shared the same way. |
| `src/lib/landing-data.ts` | Static site content (not database-backed) and shared TypeScript types for landing content. |
| `src/lib/supabase/queries.ts` | Server-side data fetchers that turn Supabase rows into the shapes `landing-data.ts` declares. |
| `src/app/landing.css` | Page styles, imported by both the landing page and the `(auth)` route group. Also holds the `.opps-app`-scoped rules for the dedicated pages (see [dashboard-design-system.md](./dashboard-design-system.md)). |
| `src/components/landing/AdBanner.tsx` | AdSense banner rendered by `SiteFooter`, centered above the footer, gated to free/signed-out visitors only — see "Update: newsletter + ad banner" below. |
| `src/lib/avatar-tone.ts` | `toneFor(name)` — deterministic company/member avatar color, shared by every dedicated page. |

## Data flow

`src/app/page.tsx` is a Server Component with `export const dynamic = "force-dynamic"` —
it re-fetches on every request instead of being statically cached, since
opportunities/jobs/events are live database content that should reflect
changes immediately.

On each request it:

1. Calls `getLandingContent()` (`src/lib/supabase/queries.ts`), which runs
   `getCompanies`, `getOpportunities`, `getJobs`, `getJobCategories`,
   `getMembers`, `getNetworkMembers`, `getEvents`, `getPosts`,
   `getTestimonials`, and `getPlatformMetrics` against Supabase and
   shapes the rows into the `Opportunity` / `Company` / `Job` / `Member` /
   `NetworkMember` / `EventItem` / `Post` / `Testimonial` /
   `PlatformMetric` types. `getMembers` (the old seeded table) and
   `getNetworkMembers` (real accounts, via the `network_members` view)
   are both fetched — see [network.md](./network.md) for why the
   homepage needs both.
2. Calls `supabase.auth.getUser()` to check for a session. If logged in, it
   also reads `first_name`, `last_name`, `plan_selection` from `profiles`
   and builds a `Viewer` object (falls back to the email prefix as a name,
   and `"free"` as the plan, if the profile row is missing fields).
3. Renders `<LandingPage {...content} viewer={viewer} />`.

Content is split between two sources:

- **Database-backed** (via `queries.ts`): opportunities, companies, jobs,
  job categories, members, events, posts, testimonials, platform metrics.
- **Static config** (`landing-data.ts`): `featureHighlights`,
  `quickSearchTerms`, `freePlanFeatures`, `proPlanFeatures`,
  `footerColumns`. These aren't rows in the database — they're page copy
  that only changes with a code deploy.

`freePlanFeatures` / `proPlanFeatures` are marketing copy for the pricing
section. They must be kept in sync with whatever the backend actually
enforces for Free vs. Pro — a mismatch here is a launch defect, not a copy
nit.

## Page sections (`LandingPage.tsx`)

Rendered in order, each as its own `<section>`:

1. `hero` — headline ("Connect. Collaborate. Win Government Work."),
   quick-search terms, primary CTAs, live `metrics` strip
   (Opportunities/Jobs/Companies/Professionals/Events from
   `getPlatformMetrics()`).
2. `feature-strip` (`#resources`) — the five `featureHighlights` cards,
   each linking to its full dedicated page (`/opportunities`,
   `/network`, `/resources`, `/events`, `/community` — plain routes, not
   in-page anchors; see "Feature cards link to full pages" below).
3. `main` (`#opportunities`) — a short teaser: a handful of recent
   opportunities plus a Pro upsell panel. The full browsing experience
   (filters, categories, tabs, saved) lives at the dedicated
   `/opportunities` page — see [opportunities.md](./opportunities.md).
4. `companies-section` (`#companies`) — a small company grid teaser; full
   directory at `/companies` — see [companies.md](./companies.md).
5. `main` (`#jobs`) — a short job list teaser; full listing at `/jobs` —
   see [jobs.md](./jobs.md).
6. `network-section` (`#network`) — a small teaser of up to 4 **real**
   GovConUnited accounts (the `networkMembers` prop, from
   `getNetworkMembers()` — distinct from the `members` prop, which is
   still the seeded/fake table used only by the Community teaser below);
   full directory at `/network` — see [network.md](./network.md) for why
   these two props read from different sources.
7. `events-section` (`#events`) — an events teaser; full listing (with a
   detail page) at `/events` — see [events.md](./events.md).
8. `community` (`#community`, with nested `#posts`) — "Find your GovCon
   community": the first 5 real communities plus a "View All
   Communities →" button linking to `/community` (which shows all of
   them) — see [community.md](./community.md)'s Update sections for the
   real-communities rebuild and a bug fix where this used to also leak
   in unrelated main-feed posts.
9. `testimonials` — social proof, pulled from `getTestimonials()`.
10. `pricing` (`#pricing`) — Free vs. Pro comparison, built from
    `freePlanFeatures` / `proPlanFeatures`.
11. Footer — `footerColumns` (Company / Build Relationships / Resources /
    Partners), the third-party newsletter embed, and the AdSense banner —
    see the Updates above.

Section IDs (`#opportunities`, `#jobs`, etc.) are in-page anchors used by
internal same-page links (e.g. the nav's "Pricing" link is `/#pricing`).
The nav bar itself (`SiteHeader.tsx`) links to the dedicated pages, not
these anchors — see "Feature cards link to full pages" below.

### Feature cards link to full pages, not anchors

`featureHighlights` (`landing-data.ts`) hrefs are plain routes
(`/opportunities`, `/network`, `/resources`, `/events`, `/community`),
not `#anchor` links — clicking "Explore resources →" navigates to the
full `/resources` page rather than scrolling to the homepage's own
`#resources` feature-strip section. This was verified by fetching each
destination route and confirming its `<h1>` matches (all 200 OK).

### Resources is a real, database-backed section now

Before this work, `/resources` had no backing data — it just re-rendered
the same five `featureHighlights` cards as the homepage's feature strip.
It's now a full page over a real `resources` table with its own list UI
— see [resources.md](./resources.md). The `feature-strip`/`#resources`
section on the homepage itself is unchanged (still the 5 static
`featureHighlights` cards); only the destination the "Access Resources"
card links to changed from "nothing new" to "a real page."

## Interactive state

- **No modal system** — each teaser section links straight to its
  dedicated page (see "Feature cards link to full pages" above) rather
  than opening an in-page detail modal.
- **Toasts** — `useToast()` (`src/components/toast-provider.tsx`), shown
  after actions like newsletter signup, saving/following/registering,
  and voting. Used by every section's client components, not just this
  page.
- **Real community voting** — the community teaser section
  (`#community`/`#posts`) renders live, calls the same
  `castVoteAction()` Server Action as the dedicated `/community` page
  (see [community.md](./community.md)), and is seeded with
  `votedPostIds` so a signed-in visitor's prior votes already show as
  cast.
- **Search** — the hero's search card doesn't filter anything in place;
  submitting (or clicking a quick-search chip) navigates to
  `/opportunities?q=<query>`, which pre-fills the real search field
  there. The Location field uses the shared `LocationAutocomplete`
  (real geocode suggestions, not a plain text box); its value is folded
  into the same `q` string on submit rather than a separate URL param,
  since `/opportunities`'s own search already matches against an
  opportunity's location field among others. **2026-09-22 fixes:**
  before this session the location input wasn't wired to anything at all
  (uncontrolled, ignored by the search button); and once wired, its
  suggestion dropdown was invisible — rendered in the DOM with real
  results, but clipped to zero height by the shared `.field{overflow:
  hidden}` class its wrapping `<div>` uses for the icon+input row layout
  everywhere else in the app. Fixed with `overflow: visible` scoped to
  just that one wrapper.
- **Pricing toggle** — `billingCycle` (`"monthly" | "annual"`) switches
  the displayed price between `proMonthly` ($49) and `proAnnual` ($490).
- **Saved / followed items** — `usePersistentSet(key)` reads and writes a
  `Set<string>` of ids to `localStorage`. Used for things like saved
  opportunities/jobs and followed members on the public landing page.
  **This is client-side only** — it does not call the database, is not
  tied to the signed-in account, and does not sync across devices or
  survive clearing site data. It's a UI convenience for anonymous/casual
  browsing, not the real "saved opportunities" feature for authenticated
  members (which must be a server-persisted, per-user, plan-limited
  entity — see the dashboard implementation, not this page).
- **Session-aware CTAs** — when `viewer` is non-null, header/hero CTAs
  switch from "Sign up" to the member's name / dashboard link, and
  `signOutAction` (from `src/app/(auth)/actions.ts`) is wired to a sign-out
  control.

## Update: newsletter signup replaced with a third-party embed

The footer used to have its own `subscribeNewsletterAction` Server Action
(insert into `newsletter_subscribers`, best-effort Resend confirmation
email — see [email.md](./email.md)'s prior revision for the retired
`newsletterWelcomeEmailHtml` template). It's now a vendor form-embed
script instead: `SiteFooter.tsx` loads
`https://eomail5.com/form/a9b51abe-b529-11f1-b8ec-d3e0a308e6cd.js` via
`next/script`. **This script does not render inline where the `<script>`
tag sits** — it injects its own floating widget fixed to a viewport
corner — which is why the old custom `<form>`, `subscribeNewsletterAction`,
`newsletter-actions.ts`/`newsletter-types.ts`, and the now-unused
`newsletterWelcomeEmailHtml` email template were all removed rather than
left running alongside it as a second, duplicate subscribe box.
`public/ads.txt` (`google.com, pub-7474005029572115, DIRECT,
f08c47fec0942fa0`) was added at the same time for the AdSense integration
below, since both changes touched the footer.

## Update: AdSense banner for free/signed-out visitors

`src/components/landing/AdBanner.tsx` — loads `adsbygoogle.js` and one ad
unit, rendered by `SiteFooter` centered directly above the footer (outside
the footer's own dark background). Gated in `SiteFooter` via an optional
`viewer` prop: `showAd = !viewer || viewer.planSelection !== "pro"`. Every
`<SiteFooter>` call site that can be reached by a signed-in user
(`DashboardShell`, `SiteShell`, `LandingPage`, `/partners`) now passes
`viewer` through so a Pro member's page never even requests
`adsbygoogle.js` — verified directly (zero ad-related script/DOM on a Pro
member's dashboard). An empty ad slot on localhost/pre-launch is expected
AdSense behavior for an unreviewed domain, not a bug.

## Update: fixed a sitewide double-scrollbar bug

`html, body { overflow-x: hidden }` in `globals.css` set `overflow-x` on
*both* elements without pairing an explicit `overflow-y` — per the CSS
overflow spec, setting only one axis to non-`visible` forces the browser
to compute the other axis as `auto` too, and since this was set on `html`
**and** `body` independently, each became its own separate scroll
container instead of `body`'s overflow propagating to the single viewport
scrollbar (the normal `html`/`body` behavior). The visible symptom was two
stacked scrollbar tracks. Fixed by removing the rule from `html` and
keeping it only on `body`, letting the standard propagation apply.

## Fonts and styling

The whole application — this page, every dedicated section page, the
`(auth)` route group, and `/dashboard` — is set in a single typeface,
**Helvetica Neue**: `body{font-family:"Helvetica Neue",Helvetica,Arial,
sans-serif}` in both `landing.css` and `src/app/globals.css` (the root
layout's own stylesheet, for routes that don't import `landing.css`).
Helvetica Neue is a licensed system font, not something Google Fonts
hosts — it renders as the real typeface on macOS/iOS (where it ships
with the OS) and falls back to Helvetica/Arial/the browser's default
sans-serif everywhere else.

Body text is normal weight (400) — **bold is used only where the
existing CSS already calls for it**: headings (`h1`–`h6` get bold from
the browser's own default stylesheet, unaffected by `body`'s weight,
which only sets what's inherited), and every element that already
declares its own `font-weight` (buttons, tags, nav links, stat numbers,
etc. — the vast majority of emphasis in this codebase). An earlier pass
set `body{font-weight:700}` directly, which bolded plain paragraph text
too; that's been reverted, since bold paragraph copy everywhere hurts
readability and wasn't what was wanted once the visual result was seen
plainly.

This replaced an earlier Google Fonts–loaded **Manrope** (the
`<link rel="preconnect">`/stylesheet tags that loaded it from
`page.tsx` and `(auth)/layout.tsx` were removed along with it) and an
unused **Geist**/**Geist Mono** (`next/font/google`, loaded in the root
`layout.tsx` but never actually referenced by any `font-family` value —
dead weight, removed for the same "one real font, nothing else fetched"
reason). Nothing in the app loads a webfont over the network anymore;
Helvetica Neue is either already on the visitor's system or the
fallback chain silently takes over.

## Known gaps

- Saved/followed state on this page is `localStorage`-only (see above) —
  it needs a server-persisted equivalent wired to the authenticated
  user's account before it can be considered a real feature rather than a
  landing-page demo affordance.
- Pricing copy (`freePlanFeatures` / `proPlanFeatures`) is hand-maintained
  in `landing-data.ts` and must be audited against actual server-side
  plan-limit enforcement whenever either changes.
