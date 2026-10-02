# Partners

Real partners page (`/partners`) — ported from the mockup's `partnersPage()`
function, which the sidebar already linked to but no route existed for.

## Files

| File | Role |
| --- | --- |
| `supabase/migrations/20260918000200_partner_inquiries.sql` | `partner_inquiries` table (insert-only RLS — see "Apply to Become a Partner" below). |
| `src/app/partners/page.tsx` | Server component. Public (no auth required) — signed-in visitors get `DashboardShell`, signed-out visitors get `SiteHeader`/`SiteFooter`, same as every other `.opps-app` page (see [dashboard.md](./dashboard.md)). |
| `src/app/partners/actions.ts` | `submitPartnerInquiryAction` — real, persisted form submission. |
| `src/components/partners/PartnersPageClient.tsx` | Hero, real metrics, benefits, featured partners grid, and the application form. |

## What's real vs. what the mockup faked

- **Metrics** — the mockup hardcodes "42 Active Partners", "18 Technology
  Partners", etc. with no data behind any of them. Replaced with two real
  counts from the `companies` table: total companies and verified
  companies.
- **Featured Partners** — the mockup picks the same seeded companies
  (Apex, Beacon, Blue Ridge, CTI, Delta Star) plus one entirely fictional
  "Federal Solutions Group" with no backing row. This page shows real
  `companies` rows instead (the same ones `/companies` lists — reusing the
  seeded table as "real" here is the same call already made for
  Community's Top Members, see [network.md](./network.md)'s "Real accounts,
  not the seeded members table" for the distinction), each linking to its
  real `/companies/[slug]` profile. No fictional partner was carried over.
- **"Apply to Become a Partner"** — a real form, not a decorative button:
  submissions insert into `partner_inquiries`. There's no admin dashboard
  yet (see `README.md`'s "Admin bootstrap" section), so reading submissions
  back happens directly in the Supabase dashboard for now, not in-app —
  the table's RLS only grants `insert`, deliberately, since nothing in the
  app currently has a legitimate reason to `select` from it.

## Known gaps

- No way to browse/manage partner inquiries in-app (see above).
- "Featured Partners" isn't a distinct concept from "Companies" — there's
  no `is_partner` flag or separate partner tier; it's simply a curated
  slice of the same `companies` table with a search box over it.

## 2026-09-22 session: design fixes, benefits modal, real per-partner messaging

- **Shell moved to a real `layout.tsx`** — `src/app/partners/page.tsx`
  used to hand-roll its own signed-in/signed-out shell branching (instead
  of the shared `SiteShell`), which meant its `loading.tsx` skeleton
  replaced the *entire page* (header/sidebar included) on navigation
  instead of just the content area, and it was missing the notice banner
  / settings-aware footer every other `.opps-app` page gets. Now
  `src/app/partners/layout.tsx` renders `SiteShell`, matching every other
  section.
- **Fixed a real broken section** — the "Bring your expertise to
  GovConUnited" CTA banner had a `.opps-app .partner-cta` class in the
  JSX with **no matching base CSS rule at all** (only a `max-width:620px`
  media-query override existed). It rendered as a bare white block with
  invisible white-on-white heading text; only the button's own text was
  visible. Added the missing flat-red banner styling.
- **Fixed another real bug** — `.partner-modal-actions` used a semantic
  `<footer>` tag, which was unintentionally catching this app's global
  bare-tag `footer{background:#06142b;...}` rule (meant for the page's
  actual site-wide footer), producing a dark navy bar behind the
  Cancel/Submit buttons inside the modal. Changed to `<div>`.
- **Cards narrowed, small buttons** — `.opps-app.compact-btns` applied
  to the whole page; `.partner-logo-grid` moved from 3 to a design
  matching the reference mockup card proportions.
- **Hero**: "Browse Companies" replaced with **Partner Benefits**, which
  opens a new benefits modal (visibility / community / programs / growth
  tiles) → **Apply Now** hands off into the existing application modal.
- **Real per-partner contact** — `src/components/companies/CompanyContactPanel.tsx`
  (new): clicking **Contact** on a featured-partner card opens a slide-in
  message drawer addressed to that company's real contact
  (`startCompanyConversationAction` → `getOrCreateConversationId`), not a
  `mailto:` link. Reuses the same chat CSS as `/messages`. The location
  field in the "Become a Partner" application form was also switched from
  a plain text input to the shared `LocationAutocomplete`.
