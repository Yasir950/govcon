# Companies

Public directory (`/companies`) and profile (`/companies/[slug]`) pages.
Design ported from the dashboard mockup's `companiesPage()` /
`companyDetail()` functions onto the shared
[`.opps-app` design system](./dashboard-design-system.md).

## Files

| File | Role |
| --- | --- |
| `src/app/companies/page.tsx` | Server component for the directory route. |
| `src/app/companies/[slug]/page.tsx` | Server component for the profile route. Fetches the company, its open opportunities and jobs, similar companies, and declares the page's `#i-map`/`#i-brief`/`#i-file` icon sprite. |
| `src/components/companies/CompaniesPageClient.tsx` | Client component: directory grid/list toggle, search, capability filter. |
| `src/components/companies/FollowCompanyButton.tsx` | Client component: Follow + Message buttons, used on the profile hero. |
| `src/components/companies/ShareProfileButton.tsx` | Client component: copies the profile URL to the clipboard. |
| `src/lib/supabase/queries.ts` → `getCompanies()` | Maps the `companies` table into the `Company` type. |
| `src/lib/landing-data.ts` → `Company` | `{ route, name, type, location, capabilities, certifications, summary, logo, verified, tags[] }`. |

## Directory page (`CompaniesPageClient`)

- **"Browse by Capability" strip** — chips built from `companies.tags`
  with real counts, same chip pattern as the opportunities category
  strip.
- **Grid / List view toggle** — client-side only, no query param.
  - Grid: `.directory-grid-card` — avatar, "Verified" tag if applicable,
    name, type/location, tag chips, and a small View Profile / Follow
    button row.
  - List: reuses `.mini-row` (avatar + name + type/location).
- **Search** — matches name, type, location, tags.
- **Sidebar** — real "Total Companies" / "Verified" counts (no fake
  1,248-company breakdown from the mockup).

## Profile page

- **Cover** — a tone-colored gradient banner (via `toneFor(company.name)`)
  with the company's tags as an uppercase tagline. **Not** the mockup's
  actual cover: that's one hardcoded stock photo (a Capitol-dome JPEG,
  several hundred KB, base64-embedded in the HTML) shared by every
  company in the demo. Inlining that per page, or per company, would
  either bloat every page load or require a real per-company banner-image
  field this app doesn't have — the gradient is the honest substitute.
- **Identity block** — large avatar (overlapping the cover, `margin-top:
  -38px`), verified checkmark, a facts row (location / type / cert
  count, each with an icon), and an Industry/Certifications two-column
  block. Certifications are `company.certifications` (a `" · "`-joined
  string) split into a real list; capabilities are `company.capabilities`
  (a comma-joined string) split into a real bullet list.
- **Actions row** — `FollowCompanyButton` (real, `localStorage`-tracked
  follow toggle via `usePersistentSet("gcuFollowedCompanies", viewer)`)
  + `ShareProfileButton` (real clipboard copy). "Message" is a
  toast-only stub ("Messages are coming soon") — there is no messaging
  feature yet.
- **Metrics strip** — 2 real numbers: this company's count of open
  `Opportunities` and open `Jobs` (computed client-side by filtering the
  fetched lists by `company === company.name`).
- **"Open at `<company>`"** — combined list of the company's own
  opportunities and jobs, each a `.mini-row` linking to its detail page.
- **Similar Companies** — up to 4 other companies sharing a tag.

## What's real vs. what was left out

The mockup's `companyDetail()` shows founded year, employee count,
contract/connection counts, a star rating, a "Company Insights" sidebar
(profile views, followers, average contract size — all fake per-company
mock numbers hardcoded by company id), a Contact Information card
(email/phone/website), NAICS codes, and a 9-tab profile (Overview,
Services, Opportunities, Past Performance, Team, Certifications,
Reviews, Events, Documents). None of that exists as real columns on the
`companies` table, so none of it was ported — this profile is
single-view (no tabs) and only surfaces what's actually in the database.

## Known gaps

- No real messaging feature — the "Message" button is a stub.
- Follow state is `localStorage`-only, same caveat as saved
  opportunities (see [landing-page.md](./landing-page.md#interactive-state)).
- No real per-company banner image, employee count, founded date,
  contract history, or rating — would need new columns/tables before any
  of that could be shown honestly.

---

> **Everything above this line describes an earlier, single-view (no
> tabs) version of the profile page and predates real messaging.** Both
> claims are now stale — the profile page has a 10-tab layout
> (`CompanyProfileTabs.tsx`: Overview, Capabilities, Services, Past
> Performance, Team, Posts, Opportunities, Documents, Reviews, Analytics)
> and real per-profile messaging exists (`CompanyContactPanel.tsx`,
> `MemberContactPanel.tsx`) from work done in earlier sessions this doc
> was never updated for. Not corrected here — out of scope for this pass,
> which only documents what changed on 2026-09-22 below.

## 2026-09-22 session: Manage page expansion + real company Posts/Documents

The company **Manage** page (`/companies/[slug]/manage`) previously only
covered logo/cover, certifications, team/admin access, and a deletion
request. This pass added everything else a company owner needs day to
day, plus made two previously read-only profile tabs (Posts, Documents)
actually work.

### Files added/changed

| File | Role |
| --- | --- |
| `src/components/companies/CompanyProfileManager.tsx` | New. Manage-page form for tagline, overview, website, business email, phone, year founded, business size, ownership, services, keywords, service areas, agencies served, contract vehicles, NAICS/PSC codes — fields that were previously **platform-admin-only** (`src/app/admin/companies/[id]/edit`), with zero owner-facing edit path at all. |
| `src/app/companies/profile-actions.ts` | New. `updateCompanyProfileAction` → `update_company_profile()` RPC. |
| `src/app/companies/post-actions.ts` | New. `createCompanyPostAction` / `deleteCompanyPostAction` — a post authored **as the company page** rather than a personal update. |
| `src/app/companies/document-actions.ts` | New. `saveCompanyDocumentAction` / `deleteCompanyDocumentAction` / `setCompanyDocumentVisibilityAction` / `getCompanyDocumentDownloadUrlAction`. |
| `src/components/companies/CompanyProfileTabs.tsx` | The **Posts** tab was a hardcoded stub ("Posts by this company's team members will appear here.") with no query behind it at all; now a real composer (text + optional image) and list, backed by real `posts` rows. The **Documents** tab was read-only display with no working download link (a `getCompanyDocumentSignedUrl` helper existed but was never called from anywhere); now has upload, download (real signed URL), an internal/public visibility toggle, and delete. |
| `src/lib/supabase/queries.ts` → `getCompanyPosts()` | New. |

### Database

- `posts` gained `company_id uuid` (nullable, FK → `companies`).
  `author_profile_id` is still always the real poster (a `company_admins`
  member) and is what RLS's existing "Members can create their own
  posts" policy checks — `company_id` is purely a display/filter
  attribute, so **no new RLS policy was needed** for company posts to
  work.
- `companies` had no RLS UPDATE policy for a `company_admins` member at
  all (only a platform admin could write to it directly, plus the
  narrow `update_company_media()` RPC for just the two image columns).
  `update_company_profile(...)` is the same pattern, generalized: a
  security-definer function that re-checks `company_admins` membership
  itself and writes only the whitelisted profile columns.
- The `company-documents` storage bucket (added in an earlier session)
  had a `company_admins`-only storage policy and **no public SELECT
  policy at all** — meaning `company_documents.is_public = true` had no
  actual effect; a signed URL request for a "public" document would
  still fail for anyone but an admin. A new storage policy grants
  `select` specifically for objects whose `company_documents` row has
  `is_public = true`.

All three pieces are in
`supabase/migrations/20260922040000_company_manage_expansion.sql`.

### Manage page additions

- **Company Profile Details** — the form above.
- **Quick Actions** — one-click links to Post an Opportunity, Post a
  Job, Add Past Performance Record, Post a Company Update (jumps to the
  profile's Posts tab), and Manage Documents (jumps to the Documents
  tab). These destination routes already existed; they just weren't
  linked from Manage before.

### Known gaps (this pass)

- Company posts are a lighter model than personal posts — no
  reactions/comments, just body + optional image + delete-by-original-poster.
  Deleting relies on the existing "Authors can delete their own posts"
  RLS policy, so one company admin can't delete a colleague admin's
  company post.
- No draft/review queue for company posts or profile edits — every
  change is live immediately, same as the rest of this app's
  self-service content.
