# Jobs

Job board (`/jobs`, `/jobs/[slug]`) matching the dashboard mockup's richer
`jobsPage()`/`jobCard()` design — real workplace/experience-level/clearance
fields, and real persisted saves/applications backing an actual "N
applicants" count and the Free plan's real 10-applications-per-month limit.

## Files

| File | Role |
| --- | --- |
| `supabase/migrations/20260918010900_job_engagement.sql` | Adds `jobs.workplace`/`experience_level`/`clearance` (editorial catalog fields, seeded with real values for the 4 existing postings), plus `job_saves`/`job_applications` tables and the public `job_application_counts` aggregate view. |
| `src/app/jobs/actions.ts` | `toggleJobSaveAction`, `toggleJobApplicationAction` — real Server Actions, RLS-scoped to the caller. |
| `src/components/jobs/JobsPageClient.tsx` | List page: All/Recommended/Saved/Applied tabs, type/workplace/level filters, real job-search stats. |
| `src/components/jobs/JobDetailActions.tsx` | Detail-page Save/Quick Apply, same real actions. |
| `src/lib/supabase/queries.ts` → `getJobs()`, `getJobSaveIds()`, `getJobApplicationIds()`, `getJobApplicationCountThisMonth()` | Real data fetchers. |
| `supabase/migrations/20260927000500_profile_clearance.sql` | Adds `profiles.clearance` (self-declared, same pattern as `headline`/`skills`/etc.) and exposes it on `network_members`. |
| `src/lib/clearance.ts` | `JOB_CLEARANCE_LEVELS`/`PROFILE_CLEARANCE_LEVELS` option lists, `clearanceRank()`, `meetsClearance()` — shared rank logic used by both the jobs filter and the application-time check below. |

## What's real vs. what was simplified

- **Saves and applications are real and persisted** (`job_saves`/
  `job_applications`), replacing the previous `localStorage`-only
  `gcuSavedJobs`/`gcuAppliedJobs` sets. The "N applicants" shown on every
  job card is a real aggregate count (`job_application_counts`), 0 when
  nobody's applied yet — never a fabricated number.
- **The Free plan's "Apply to up to 10 jobs per month" limit is real and
  enforced** (`toggleJobApplicationAction`, checked against
  `getJobApplicationCountThisMonth`) — this is the same pricing copy
  already on the site (`freePlanFeatures`/`proPlanFeatures` in
  `landing-data.ts`), not an invented restriction. Pro members
  (`plan_selection === "pro"`) are unlimited.
- **"Recommended" is a real but simple heuristic** — jobs whose tags
  overlap with the viewer's own real job title/company text, the same
  "real signal, not a true model" tradeoff `getPeopleAlsoViewed()` already
  makes elsewhere in this codebase.
- **"Profile strength"** reuses the real `completenessPct` already
  computed for the member profile page — never a fabricated percentage.
- **No "Post a Job" / employer posting flow.** The pricing copy already
  advertises "Post jobs — Pro members only," and the mockup has a header
  button for it, but building it would mean designing a whole new
  content-ownership model (who can edit/delete a posting, moderation,
  what a Pro member's "company" even is when `companies` isn't tied to any
  account) — a distinct, larger feature, not a page-design port. `jobs`
  stays admin-seeded catalog content, the same category as `opportunities`/
  `companies`/`resources`.
- **No "Pro-exclusive jobs" concept** (the mockup's "♛ Pro Jobs" tab) —
  there's no real per-job visibility gate in the schema, and inventing one
  without a real posting flow behind it would just be a fake badge.

## Update: clearance is now actually checked

Previously `jobs.clearance` was a purely decorative badge — shown on every
job card and detail page but never compared against anything. Two real
checks were added against it:

- **Filter** — `JobsPageClient` gained a Clearance `<select>` (same
  dynamically-derived-from-data pattern as the existing type/workplace/
  level filters), and it's now part of a saved search's filters like the
  others.
- **Application-time check** — members can now declare a clearance they
  hold on their own profile (`profiles.clearance`, editable in "Edit
  Profile Details" next to Experience, shown on the profile page under
  "Professional Details"). `JobApplicationForm` compares it against the
  job's requirement (`meetsClearance()` in `src/lib/clearance.ts`, a
  simple rank comparison: None < Public Trust < Secret < Top Secret) and,
  on a shortfall, shows a warning with a required "I currently hold the
  required clearance" checkbox before the form can submit.
  `submitJobApplicationAction` re-runs the same check server-side against
  the real `profiles`/`jobs` rows (never trusting the client-supplied
  clearance) and rejects the submission if that checkbox wasn't sent.

**This is a confirm-to-proceed gate, not identity verification** — like
every other self-declared field in this app (headline, skills, "Pro"
plan), there's no clearance-verification integration, so the check is
only as honest as what the applicant/company each typed into their own
profile/listing. That's consistent with the rest of the app's "real but
simple" signals (see `getPeopleAlsoViewed()`) rather than inventing a fake
verification flow.

## Known gaps

- No employer job-posting flow (see above).
- "Recommended" only checks title/company text overlap, not real skills
  matching (skills exist on `profiles` but aren't cross-referenced yet).
- Clearance is self-declared on both sides (job requirement and profile),
  not independently verified — see "Update: clearance is now actually
  checked" above.
