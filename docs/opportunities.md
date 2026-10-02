# Opportunities

Subcontracting/teaming opportunity board (`/opportunities`,
`/opportunities/[slug]`) matching the dashboard mockup's `opportunitiesPage()`
design — real persisted saves and responses, and a real "Save Search"
feature replacing the mockup's hardcoded demo rows.

## Files

| File | Role |
| --- | --- |
| `supabase/migrations/20260918011000_opportunity_engagement.sql` | `opportunity_saves`, `opportunity_responses`, and `saved_searches` tables, all owner-scoped RLS. |
| `src/app/opportunities/actions.ts` | `toggleOpportunitySaveAction`, `toggleOpportunityResponseAction`, `saveSearchAction`, `deleteSavedSearchAction`. |
| `src/components/opportunities/OpportunitiesPageClient.tsx` | List page: All/Federal/Saved/Responses/Archived tabs, company/category/location filters, real Save Search. |
| `src/components/opportunities/OpportunityDetailActions.tsx` | Detail-page Save/Express Interest, same real actions. |
| `src/components/opportunities/CompanyOpportunityPostForm.tsx` | Company-admin opportunity posting form (`/companies/[slug]/opportunities/new`) — its `LocationAutocomplete` field is the shared component documented in `dashboard-design-system.md`. |
| `src/lib/supabase/queries.ts` → `getOpportunitySaveIds()`, `getOpportunityResponseIds()`, `getSavedSearches()` | Real data fetchers. |

## What's real vs. what was simplified

- **Saves and responses are real and persisted**, replacing the previous
  `localStorage`-only `gcuSavedOpportunities` set. The Free plan's real
  "Save up to 10 opportunities" per month limit (`freePlanFeatures`/
  `proPlanFeatures` in `landing-data.ts`) is enforced in
  `toggleOpportunitySaveAction`; Pro members are unlimited.
- **"Save Search" is real** — the mockup's 3 hardcoded demo rows ("IT
  Subcontracting," "Small-Business Teaming," "Construction Partners") are
  replaced with each member's own saved filter combinations
  (`saved_searches`), clickable to re-apply.
- **"Opportunity Categories" and "Opportunities by Company"** were already
  computed from real live data before this pass (tag counts and
  per-company counts over the actual `opportunities` table) and are
  unchanged.
- **"Archived" tab exists but is always empty** — there's no archiving
  feature, which matches the mockup's *own* demo behavior exactly (its
  `opportunitiesPage()` sets `items = []` unconditionally for that tab
  too), not a simplification below the design.
- **No "Create Opportunity" posting flow** — same reasoning as Jobs'
  omitted "Post a Job": the pricing copy doesn't advertise an
  opportunity-posting feature the way it does for jobs, and `opportunities`
  stays admin-seeded catalog content.

## Update: real SAM.gov federal ingestion (previously undocumented)

`opportunities.source` (`"manual" | "sam_gov"`) distinguishes admin/company-
posted opportunities from ones synced automatically from SAM.gov's public
Opportunities API. This was built in an earlier pass and is substantial
enough to warrant its own record here since it had none before:

| File | Role |
| --- | --- |
| `src/lib/sam-gov/client.ts` | Paginated fetch against the SAM.gov API, with retry/rate-limit handling. |
| `src/lib/sam-gov/parse.ts` | Normalizes a raw SAM.gov record into the app's `opportunities` shape. |
| `src/lib/sam-gov/sync.ts` | `runSamGovSync()` — the actual sync run: dedup by SAM.gov's own notice id, update-vs-create detection via a content hash (`content_hash`), and archiving (`ARCHIVE_AFTER_MS`, 48h) of rows not seen in a sync for that long. Never overwrites a member's own saved/response/notes state during a sync. |
| `src/app/api/cron/sam-gov-sync/route.ts` | Scheduled entry point. |
| `src/app/admin/opportunities/sync/page.tsx`, `sync/[runId]/page.tsx` | Admin job log — run time, records created/updated/skipped/failed, per-run error detail. |
| `src/app/admin/opportunities/sync-actions.ts`, `src/components/admin/SyncNowButton.tsx` | Manual "Sync Now" trigger for admins, same `runSamGovSync()` path as the cron. |

`opportunities` also carries the source-attribution columns this needs:
`notice_id`, `solicitation_number`, `content_hash`, `last_synced_at`,
`last_seen_in_sync_at`, `source_url` — preserved across syncs, never
regenerated from scratch.

## Update: "Federal" tab on the member-facing Opportunities page

Added a 5th tab — All Opportunities / **Federal** / Saved / Responses /
Archived — filtering to `o.source === "sam_gov"` (`OpportunitiesPageClient.tsx`).
Previously the only way to tell a SAM.gov notice apart from a manually-
posted one was a subtle inline "· Federal Notice" text label; this makes
it a real, countable filter alongside the others, with its own empty-state
copy pointing at the sync schedule rather than the generic "clear a filter"
message.

## Known gaps

- The "Archived" tab now reflects real SAM.gov-driven archiving (see
  above) — the earlier "always empty" note here is resolved.
