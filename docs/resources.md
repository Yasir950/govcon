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

## Known gaps

- No admin/CMS flow for adding resources — new rows require a migration.
- "Request a Resource" doesn't persist anything; it's a toast
  acknowledgment only.
- Saved-resource state is `localStorage`-only, not server-persisted per
  account.
