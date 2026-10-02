# Transactional email

Real outbound email via [Resend](https://resend.com), for application-triggered
emails — separate from Supabase Auth's own signup/password-reset emails,
which are configured entirely through Supabase's dashboard SMTP settings
and aren't reachable from application code.

Modeled directly on crewupapp's `src/lib/email.ts` — same `sendEmail()` +
`emailShell()` + per-notification-template shape, same escaping
discipline for user-controlled content, recolored to GovConUnited's own
brand.

## Files

| File | Role |
| --- | --- |
| `src/lib/email.ts` | `sendEmail()` (the Resend wrapper), `emailShell()` (the shared branded HTML template), and one email-specific template function per triggered email. |
| `src/lib/notifications.ts` | `createNotification()` handles app-side notification inserts. Database-side notifications are emailed by the notification cron worker. |

## Configuration

One env var:

```
RESEND_API_KEY=       # https://resend.com/api-keys
```

`govconunited.com` is a verified sending domain in the Resend account, so
the from-address is hardcoded in `email.ts` (`GovConUnited
<noreply@govconunited.com>`) rather than read from an env var — same
reasoning crewupapp uses for its own hardcoded `FROM` constant: an env
var that's easy to leave blank silently no-ops every send (this actually
happened here — `RESEND_FROM_EMAIL` sat blank in `.env.local` and every
`sendEmail()` call quietly returned `{ ok: false }` until this was
caught).

`sendEmail()` checks `RESEND_API_KEY` before attempting a send and
returns `{ ok: false, error: "Email is not configured." }` (logging the
reason) if it's unset — **it never throws**, and callers never let that
failure propagate into a user-facing error for the action the email is
attached to.

`EMAIL_SITE_URL` (`https://govconunited.com`, hardcoded in `email.ts`)
supplies both the logo image URL and every link embedded in email
bodies — deliberately not built from `NEXT_PUBLIC_APP_URL`, since that's
`http://localhost:3000` in local dev and would produce a broken logo
image and dead links in a real inbox regardless of which environment
triggered the send.

## Branding

`emailShell()` — GovConUnited's own colors (matching `--o-red` /
`.nav-join` / `.btn.brand-red` in `src/app/landing.css`): a `#ed1c24`
(brand red) header holding `/logos/GCU Logotype White.png`, a white
content card, `#ed1c24` CTA buttons, and a footer reading "© 2026
GovConUnited, LLC. A Robb Industrial Co." — same table-based structure
as crewupapp's `emailShell()` (email clients, especially Outlook
desktop, need `<table>` layout and inline styles), recolored rather than
reused since the two products are visually distinct under the same
parent company.

## Templates

- `notificationEmailHtml({ recipientName, title, body, ctaUrl, ctaLabel })`
  — one shared template for all persisted in-app notifications, including
  points, badges, streaks, learning, and teaming. App-side inserts attempt
  an immediate send; `/api/cron/notification-emails` drains database-side
  inserts and retries unclaimed or failed sends up to five times.
  Notifications respect the member's in-app category preference; email
  follows that preference.

It is best-effort: a failed send is swallowed and logged, never
surfaced as a user-facing error.

## Update: post engagement (like/comment/repost) now emails

`post_liked`, `post_commented`, and `post_reposted` were added to email
delivery per explicit request — a member gets emailed when someone
engages with their post, not just the in-app bell. Email delivery now
covers all persisted in-app notification types, including
`comment_reply` and `mention`, and follows the member's in-app category
preference in Settings → Notifications.

The CTA label for these (and `comment_reply`/`mention`) is **"View
Post"**, not the previous **"View in Community"** — a feed post isn't a
Community post just because its permalink happens to be
`community/discussion/[slug]` (implementation detail, not something that
should leak into copy shown to the recipient).

**Real bug fixed**: `post_reposted` had been missing from the
`notifications` table's `type` CHECK constraint since
`20260921000600_notifications_widen_types.sql` rebuilt that constraint's
list from one that predated `post_reposted` being added the day before,
silently dropping it. Every repost notification since then failed the
constraint on insert — swallowed by `createNotification()`'s own
non-fatal catch/log, so a repost always appeared to succeed with no
visible error, it just never notified anyone, in-app or by email. Fixed
in `20260921003800_notifications_fix_post_reposted_type.sql`.

The `linkPath` these post-engagement notifications carry now also
matters more than it used to: see
[community.md](./community.md)'s "Update: a feed-origin post never
renders this page" and [dashboard.md](./dashboard.md)'s "Update:
arriving from a notification" — a comment-triggered notification's
`linkPath` carries `?comment=<id>` so the recipient lands with that exact
comment highlighted, not just the post.

## Update: points and daily streak activity now notify

Every nonzero XP, Rep, or Credits ledger change now creates a Rewards
notification with the action label and exact amounts. This includes learning
and teaming actions that award points, as well as point reversals or
adjustments. The notification cron sends the matching email. A workday streak
advancing also creates a notification/email each day, in addition to existing
streak milestone, freeze, risk, and end notifications.

## Known gaps / natural next steps

- No dedicated internal-notice template yet (crewupapp's
  `contactSubmissionEmailHtml` equivalent) for a future real "Request a
  Resource" flow (`/resources` — see [resources.md](./resources.md)),
  which currently just shows a toast with no persisted record.
- A post-signup welcome email once email verification completes would
  need a Supabase Auth webhook or a check in `/auth/callback` (more
  infrastructure than this pass added) — separate from the in-app
  "welcome" notification type, which already sends via
  `sendWelcomeNotificationIfNew()`.

## Pending: point Supabase Auth's own emails at Resend too

Supabase Auth's signup-verification and password-reset emails (see
[authentication.md](./authentication.md)) don't go through `email.ts` at
all — they're sent by Supabase's **default built-in email service**,
which is explicitly not meant for production use: it only delivers to
addresses on the project's own team, and caps out at a small number of
messages per hour that Supabase can change without notice.

The fix is to configure a **custom SMTP provider** for the whole Supabase
project — pointing it at the same Resend account, so both Supabase's own
auth emails and this app's `email.ts` sends go through one place. This
is project-level Supabase configuration, not application code, and
needs to be done either in the dashboard or via the Management API with
a personal access token.

**Once ready**, this needs:

1. Configure Supabase Auth's custom SMTP — via **Dashboard**
   (Authentication → Emails → SMTP Settings) or the **Management API**:
   ```bash
   curl -X PATCH "https://api.supabase.com/v1/projects/mghndaeanzxnpwlyqedt/config/auth" \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "external_email_enabled": true,
       "smtp_host": "smtp.resend.com",
       "smtp_port": 465,
       "smtp_user": "resend",
       "smtp_pass": "<the RESEND_API_KEY value>",
       "smtp_admin_email": "noreply@govconunited.com",
       "smtp_sender_name": "GovConUnited"
     }'
   ```
   (`SUPABASE_ACCESS_TOKEN` is a personal access token from
   https://supabase.com/dashboard/account/tokens — different from
   `SUPABASE_SERVICE_ROLE_KEY`, which can't be used for this endpoint.)
2. Confirm by testing signup/login several times in a row without
   hitting a rate limit.
