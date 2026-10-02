# Resources

Public resource library (`/resources`) — guides, templates, checklists,
workbooks, and videos for government contractors. Unlike every other
content type on the site, **this was not database-backed at all before
this feature was built** — the old `/resources` page just reused the
five `featureHighlights` cards from the homepage. Design ported from the
dashboard mockup's `resourcesPage()` function onto the shared
[`.opps-app` design system](./dashboard-design-system.md).

## Files

| File | Role |
| --- | --- |
| `supabase/migrations/20260917000000_resources.sql` | Creates the `resources` table (public-read RLS, same pattern as `companies`/`opportunities`) and seeds 10 real, curated rows. |
| `src/app/resources/page.tsx` | Server component for the route. Also declares the page's `#i-save` icon sprite. |
| `src/components/resources/ResourcesPageClient.tsx` | Client component: type filter, search, tabs, save/open actions. |
| `src/lib/supabase/queries.ts` → `getResources()` | Maps the `resources` table into the `Resource` type. |
| `src/lib/landing-data.ts` → `Resource` | `{ route, title, type, format, description, url, isPro }`. |
| `src/lib/supabase/types.ts` | Regenerated from the live Supabase project (via the Supabase MCP `generate_typescript_types` call) after the migration, so `Tables<"resources">` is available like every other table. |

## Data model

```sql
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  type text not null,        -- Guide | Template | Checklist | Workbook | Video
  format text not null,      -- PDF | DOCX | XLSX | PPTX | Video
  description text not null,
  url text not null,         -- see "Real links, not fake downloads" below
  is_pro boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Row-level security mirrors every other content table: `select` is open
to `anon, authenticated`, nothing else is granted. There is no admin UI
for managing resources yet — new rows are added via migration.

### Real links, not fake downloads

The mockup's resource rows have a `data-download="<name>.<ext>"`
attribute with no file behind it — clicking "Download" does nothing real
in the demo. Rather than port that (or invent uploaded files that don't
exist), each seeded resource's `url` points to a **real, genuinely
useful public resource** — SBA.gov, SAM.gov, acquisition.gov, GSA — e.g.
the "SBA 8(a) Business Development Certification Guide" row links to the
actual SBA program page. "View Resource" / "Watch" opens that real URL
in a new tab.

## Page (`ResourcesPageClient`)

- **"Browse by Type" strip** — chips built from `resources.type` with
  real counts (same chip pattern as opportunities/companies).
- **Tabs** — All Resources / Saved, gated behind `viewer`.
- **Search** — matches title, description, type.
- **Rows** (`.resource-row`) — icon (▶ for Video, or the format string
  e.g. "PDF" for everything else), title, description, Type/Format tags,
  a "Pro" tag when `isPro`, a bookmark save button
  (`usePersistentSet("gcuSavedResources", viewer)`), and an action
  button.
- **Real Pro gating** — `isPro` resources check the signed-in viewer's
  actual `planSelection` field (`Viewer.planSelection`, from
  `profiles.plan_selection` — see
  [authentication.md](./authentication.md)). If the resource is Pro and
  the viewer isn't (`viewer?.planSelection !== "pro"`), the button shows
  "Unlock with Pro" and prompts the upgrade toast instead of opening the
  real URL — this is real plan-based gating, not decorative.
- **Sidebar** — "Resource Library" (real total / Pro counts) and a
  "Request a Resource" card (toast-only stub — there's no request queue
  yet, so it just acknowledges the click).

## Admin → Resources

Migrations: `20261001001200_resource_delivery_kinds.sql`,
`20261002000000_resource_access_levels.sql`,
`20261002000100_resource_admin_panel.sql`. Server actions live in
`src/app/admin/resources/actions.ts`; shared admin reads in
`src/app/admin/resources/data.ts`; styles in `resources-admin.css`.

| Screen | Route | Notes |
| --- | --- | --- |
| Library | `/admin/resources` | Filter by status / category / type / access, search by title. Row actions Edit, Duplicate, Feature, Archive, Delete; bulk Publish, Archive, change category, Delete. Drag to reorder (`resource_reorder`), Featured pinned first. Delete is soft (`deleted_at`), restorable from Trash for 30 days, then purged by `/api/cron/resource-maintenance`. |
| Editor | `/admin/resources/new`, `/admin/resources/{id}/edit` | All editor fields (title 120, short description 200, Markdown body, type, category, tags, delivery kind, file/URL, thumbnail, source, access, featured, status incl. Scheduled, slug). Replacing a file/link/video keeps the id; the old one is listed under "Earlier versions" (`resource_versions`). The "Audit log" panel reads `resource_audit_log` (written by the `resources_audit` trigger). |
| Submissions | `/admin/resources/submissions`, `/admin/resources/submissions/{id}` | Pending (oldest first), waiting on member, decided in 30 days. The review page has the full editor plus Approve & publish / Request changes / Reject (reason required). Approve credits the member as source; `points_on_resource` pays 50 XP once per resource. Every outcome notifies the member. |
| Link Health | `/admin/resources/link-health` | Results of the weekly `/api/cron/resource-link-health` job: error, date found, last check, Recheck, Un-hide; toggle for auto-hide after 2 failed checks. |
| Analytics | `/admin/resources/analytics?days=7\|30\|all` | Per-resource views, downloads/clicks/plays, saves, unique members; top 10; searches with no results; Request-a-Resource topics; Pro upgrade-modal views → upgrade clicks → now Pro. |

### Member side

- **Submit a resource** (`SubmitResourceForm`): link or file upload
  (to `resource-files/submissions/{uid}/…`, then type/size/content
  checked and virus-scanned by `vetResourceUpload`), plus a category
  picker. Limits: 5 open submissions, duplicate-URL check.
- **Profile** (`MyResourceSubmissions`, owner only, anchor
  `#resource-submissions`): Under review / Changes requested (edit and
  resubmit) / Approved / Not approved, with the admin's note.
- **Detail page** `/resources/{slug}`: full description, tags, source;
  records a view.
- **Saved**: saved items that were deleted or hidden show as "No longer
  available".
- Analytics events: `/resources/{id}/download|open|watch` record a
  download / click / play; no-result library searches, Request a
  Resource, and the Pro upgrade modal are logged too.

## Known gaps

- None tracked for the admin panel. The database migrations above must
  be applied before deploying this code (and this code deployed once
  they are — older builds query `resources` with table-wide SELECT,
  which the access-levels migration revoked).
