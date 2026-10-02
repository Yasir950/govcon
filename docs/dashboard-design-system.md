# Dashboard-style design system (`.opps-app`)

A second visual design system layered into `src/app/landing.css`, used by
the seven dedicated content pages (opportunities, companies, jobs,
network, resources, events, community) and their detail pages. Ported
from `docs/GovConUnited-dashboard.html` — a static HTML mockup of a
logged-in member dashboard — to give these full-page views a more
polished, app-like look than the original landing-page teaser sections.

## Why a second system exists

`landing.css` already had a marketing-site design language (`.card`,
`.panel`, `.tag`, `.btn`, `.field`, `.meta`, `.stack`, …) used by the
homepage and by the older shared "detail" classes (`.company-grid`,
`.event-card`, `.listing-detail`, etc.). Reusing those bare class names
for the dashboard-style port would have redefined them in place and
broken every other page that already depends on them.

Instead, every dashboard-style rule is written as a **descendant
selector scoped under `.opps-app`** — e.g. `.opps-app .card{...}`,
`.opps-app .tag{...}` — inside `landing.css`. A page opts in by wrapping
its content in a single `<div className="opps-app">`. Outside that
wrapper, the original marketing classes are completely untouched.

```tsx
<section className="main" id="opportunities">
  <div className="wrap">
    <div className="opps-app">{/* everything dashboard-styled goes here */}</div>
  </div>
</section>
```

`.opps-app` itself also declares its own CSS custom properties
(`--o-blue`, `--o-blue-dark`, `--o-blue-soft`, `--o-red`, `--o-ink`,
`--o-muted`, `--o-line`, `--o-green`, `--o-green-soft`, `--o-radius`,
`--o-shadow`) taken from the dashboard mockup's own `:root`, rather than
reusing `landing.css`'s `--blue`/`--ink`/etc. tokens — the two palettes
are close but not identical, and keeping them separate means a change to
one system's colors can't silently drift the other's.

## Shared building blocks (all in `landing.css`, scoped under `.opps-app`)

| Class | Purpose |
| --- | --- |
| `.page-head`, `.head-actions` | Page title + subtitle row, optional action buttons on the right. |
| `.card`, `.panel`, `.panel-head`, `.section-title` | Base card container, its padded body, and a header row inside it. `.card` sets `overflow:hidden` so nothing (like an overflowing flex row) can visually escape its rounded corners. |
| `.tabs`, `.tab` | Underline-style tab row (e.g. "All Opportunities (4)" / "Saved (0)"). Only rendered when `viewer` is present — see "Signed-out visitors" below. |
| `.btn`, `.btn-primary`, `.btn-outline`, `.btn-accent`, `.btn-sm`, `.btn-full` | Button variants. `.btn-sm` is used for compact action rows inside sidebar cards; full-size `.btn` is used for page-level hero actions (e.g. company Follow/Message). `.btn-accent` (red) marks an already-active toggle state (saved, following) instead of reusing `.btn-primary` for both "off" and "on". |
| `.field`, `.select`, `.search-field` | Text input / native select styling, shared by every toolbar. |
| `.opportunity-category-strip`, `.opportunity-category-list`, `.opportunity-category` | The pill-chip filter strip reused across opportunities (category), companies (capability tag), and resources (type). Despite the name, it's generic — not opportunity-specific. |
| `.layout-wide`, `.detail-grid`, `.jobs-layout`, `.reddit-shell` | The various `main-content + sidebar` (or `sidebar + feed + sidebar`) grid layouts used by list and detail pages. |
| `.stack` | Vertical `gap`-based stack for sidebar card groups — **this is the fix for a real bug**: it was referenced in markup before its CSS rule existed, so sidebar cards rendered with zero gap between them until `.opps-app .stack{display:grid;gap:18px}` was added. |
| `.detail-hero`, `.detail-title`, `.key-grid`, `.key` | Shared detail-page hero: gradient card, avatar + title/meta row, and a fact grid below it. Reused as-is by opportunity, job, and (with its own cover/identity variant) company/member detail pages. |
| `.company-logo-avatar` (+ `.sm` / `.lg` size modifiers, `data-tone="…"`) | The colored initials badge used for companies and posting entities. See "Avatar tones" below. |
| `.person-avatar-round` (+ `.lg`) | Round photo avatar for members, used where a real photo exists instead of initials. |
| `.mini-row`, `.similar-row` | Compact linked list rows for "Open at this company" / "Similar opportunities" / "Related discussions" style sidebar lists. |
| `.opp-row`, `.job-card`, `.directory-grid` / `.directory-grid-card`, `.resource-row`, `.event-grid` / `.event-card`, `.reddit-post` / `.vote-rail` | Per-section list-item layouts — see each section's own doc. |

## Avatar tones

`src/lib/avatar-tone.ts` exports `toneFor(name: string)`, a small
deterministic hash that maps a company/member name to one of five tones
(`blue`, `red`, `green`, `purple`, `gold`). The same name always gets the
same tone everywhere it appears (opportunity list, company breakdown
sidebar, opportunity/job/company detail heroes), without needing a
stable database id threaded through every call site. Used via
`data-tone={toneFor(name)}` on `.company-logo-avatar`, which has a CSS
rule per tone (`[data-tone="red"]`, etc.) — the base rule (no attribute)
is the blue gradient.

## Signed-out visitors

Every list page (`OpportunitiesPageClient`, `JobsPageClient`,
`NetworkPageClient`, `ResourcesPageClient`, `EventsPageClient`) follows
the same pattern for the row of controls just under the page head:

```tsx
{viewer ? (
  <div className="tabs">{/* All / Saved / etc. */}</div>
) : (
  <Link href="/" className="link-btn back-link">← Back</Link>
)}
```

A "Saved" (or "My Events" / "My Connections") tab is meaningless for an
anonymous visitor, since `usePersistentSet` always returns an empty,
unwritable set when `viewer` is `null` (see `src/lib/landing-hooks.ts`,
documented in [landing-page.md](./landing-page.md)). Rather than show a
tab that can never hold anything, signed-out visitors see a simple back
link in that slot instead.

## What was deliberately left out of the port

The HTML mockup this system is ported from is a fictional demo with
invented data: attendee counts, fake per-member point totals, a
hardcoded shared cover photo, "Team members"/"Contracts won"/"Average
contract size" company stats, a fake comment/reply thread UI, and
several tabs (Team, Reviews, Performance, Services, Documents) with no
backing table. None of that was carried over — every number and section
in the real pages traces back to an actual Supabase column or a value
computed from real rows. Each section's own doc calls out its specific
omissions under a "What's real vs. what was left out" heading.

## Icon sprites

Icons are inline SVG `<symbol>` sprites (`fill:none;stroke:currentColor`,
matching the mockup's icon style), each declared once per page that
needs it — e.g. the opportunities list page defines `#i-save`, the
company profile page defines `#i-map`/`#i-brief`/`#i-file`. There's no
shared global sprite; a page that adds a new icon-using component needs
to add that symbol to its own page's sprite `<svg>` block (see any
`page.tsx` in the sections below for the pattern — it's always a hidden
`<svg width="0" height="0" style="position:absolute">` placed just
before the closing `</>`).

## Update: route-level loading states (`loading.tsx`)

Every top-level route segment (`opportunities`, `jobs`, `companies`,
`network`, `events`, `community`, `communities`, `messages`, `settings`,
`resources`, `partners`, `billing`, `notifications`, `saved`, `search`,
`admin`, `dashboard`, `(auth)`, and the root `/`) has a `loading.tsx`
rendering `src/components/PageLoadingSkeleton.tsx` — a generic shimmering
content placeholder (`.skeleton-block` in `globals.css`). Next.js nests
`loading.tsx` the same way it nests `layout.tsx`: one file at, say,
`src/app/opportunities/loading.tsx` automatically covers every nested
segment under it too (`/opportunities/[slug]`, `/opportunities/post`,
`/opportunities/tracking`, …), so ~90 page routes are covered by these 19
files without one per leaf directory.

**Deliberately chrome-agnostic.** `loading.tsx` can't know whether the
destination page will render the signed-in `DashboardShell` or the
signed-out marketing `SiteHeader`/`SiteFooter` — every page here decides
that itself, in its own `page.tsx`, based on `getViewer()` (see
[dashboard.md](./dashboard.md)'s `SiteShell` section) — so the skeleton
never tries to fake either one. Doing so would visibly mismatch and swap
out from under itself on the real page's first paint (e.g. a fake
signed-out header flashing before the real signed-in sidebar appears).
Verified with Playwright under throttled network conditions that the
skeleton actually appears mid-navigation on a dynamic route (`/jobs`) and
correctly does *not* appear for a fully static, prerendered one (`/about`)
— a static page has nothing to suspend on, so there's nothing for the
loading state to show.

## Shared React components (not CSS classes, but used the same way — once, everywhere)

| Component | Purpose |
| --- | --- |
| `src/components/LocationAutocomplete.tsx` | Drop-in replacement for a plain `<input name="location">`, backed by `/api/geocode/search`. **Real bug fixed**: it wraps the `<input>` in a `position:relative` div, which opts the input out of the CSS-grid stretch every plain `.field` sibling gets for free from `.label{display:grid}` — left unfixed, a Location field renders visibly narrower than every other field in the same form. Fixed with explicit `width:100%` on both the wrapper and the input. |
| `src/components/CompanyAutocomplete.tsx` | Same pattern for a company/organization name, backed by `/api/companies/search` (published companies only) — see [network.md](./network.md)'s "LinkedIn-parity Experience/Education forms". |
| `src/components/pro-badge.tsx` | `<ProBadge>` — see [network.md](./network.md)'s "Pro badge next to a member's name everywhere". |

## Known gap

There's no automated visual regression coverage of this design system —
changes were checked by building, running the dev server, and rendering
pages with headless Chrome. A future contributor changing shared
`.opps-app` rules should manually check at least one list page and one
detail page across desktop/tablet/mobile widths.
