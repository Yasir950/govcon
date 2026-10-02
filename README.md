# GovConUnited

**Professional network for government contractors, subcontractors, consultants, and suppliers.** Connect. Compete. Win.

A Robb Industrial Co. — [robbcc.com](https://robbcc.com)

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in Supabase, Stripe, Resend, SAM.gov, Sentry keys
npm run dev                  # http://localhost:3000
```

Production build: `npm run build && npm run start`. Pushes to `main` auto-deploy to Vercel.

Before linking a Supabase project, install the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Auth, Postgres, Storage, Realtime) · Stripe (Checkout, Billing, webhooks) · Resend · SAM.gov API · Vercel · Sentry

## Documentation

| Doc                                           | Contents                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [docs/landing-page.md](docs/landing-page.md)   | Public landing page: data flow, sections, interactive state, newsletter signup                |
| [docs/authentication.md](docs/authentication.md) | Auth flow: signup/login/reset, Server Actions, callback route, session refresh, redirect safety |
| [docs/dashboard.md](docs/dashboard.md) | Signed-in app shell (topbar + sidebar, used across every section page) and the dashboard home feed |
| [docs/messages.md](docs/messages.md) | Real direct-messaging inbox |
| [docs/settings.md](docs/settings.md) | Real account settings: profile, notifications, password |
| [docs/billing.md](docs/billing.md) | Real Stripe Checkout/Portal integration |
| [docs/partners.md](docs/partners.md) | Real partners page |

## Database migrations

All schema changes are version-controlled SQL migrations under
`supabase/migrations/` — no manual/ad-hoc changes against the database.

- Create a new migration: `supabase migration new <name>`
- Apply migrations locally (requires Docker, via `supabase start`):
  `supabase db reset`
- Push migrations to the linked remote project: `supabase db push`
- Generate TypeScript types from the schema:
  `supabase gen types typescript --linked > src/lib/supabase/types.ts`

Every table that needs RLS must have it enabled with explicit policies —
this is required by the project scope, not optional hardening.

## Seeding

Local/dev seed data lives in `supabase/seed.sql` and is applied automatically
by `supabase db reset`. Do not put real production or user data in seed
files.

## Testing

Test tooling is not yet configured (tracked as part of the Foundation
milestone). Once added, document the test command and coverage expectations
here.

## Deployment

Deployed on Vercel, connected to the owner-controlled GitHub repository.
Set all variables from `.env.example` in the Vercel project's Environment
Variables settings for each environment (Production/Preview/Development).
Stripe webhook and SAM.gov ingestion endpoints must be reachable from the
deployed URL — update `NEXT_PUBLIC_APP_URL` and the Stripe webhook endpoint
accordingly after each new deployment domain.

## Cron / scheduled jobs

SAM.gov opportunity ingestion runs on a schedule (Vercel Cron once the route
exists). Document each cron route's path, schedule, and purpose here as
they're added.

## Integrations

- **Stripe:** webhook handler at `src/app/api/webhooks/stripe/route.ts`,
  verifies signatures with `STRIPE_WEBHOOK_SECRET`. Register the endpoint in
  the Stripe dashboard (or `stripe listen` for local testing).
- **Resend:** server-only client at `src/lib/resend/client.ts`.
- **Supabase:** browser client (`src/lib/supabase/client.ts`), server client
  for Server Components/Actions (`src/lib/supabase/server.ts`), and session
  refresh helper (`src/lib/supabase/middleware.ts`) — see
  [docs/authentication.md](docs/authentication.md) for current wiring status.

## Admin bootstrap

No admin users exist by default — every profile starts with
`role = 'member'` (`profiles.role`, see
`supabase/migrations/20260919000000_admin_role.sql`). The `/admin` CMS
(opportunities, jobs, companies, events, community, resources,
testimonials, partners, platform metrics, notices, site settings, team) is
only reachable by an account with `role = 'admin'`.

To create the **first** admin, sign up a real account normally, then run
one SQL statement (via the Supabase SQL editor or MCP `execute_sql`):

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Every admin after that is promoted or demoted through the app itself at
`/admin/team`, gated to existing admins only.
