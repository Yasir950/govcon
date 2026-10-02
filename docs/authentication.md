# Authentication

Email/password authentication via Supabase Auth, backed by Next.js Server
Actions and Route Handlers, plus Google and Facebook OAuth. See
[landing-page.md](./landing-page.md) for the homepage this shell shares
copy and styling with.

## Files

| File | Role |
| --- | --- |
| `src/app/(auth)/layout.tsx` | Shared split-screen shell (visual panel + form card) for all auth pages. |
| `src/app/(auth)/actions.ts` | Server Actions: `signUpAction`, `signInAction`, `forgotPasswordAction`, `resetPasswordAction`, `signOutAction`, `signInWithGoogleAction`, `signInWithFacebookAction`, `signInWithLinkedInAction`. |
| `src/app/(auth)/auth-types.ts` | `AuthActionState` shape (`error` / `success` / `email`) shared by all auth forms via `useActionState`. |
| `src/app/(auth)/auth.css` | Auth-page-specific styles (loaded alongside `landing.css`), including the password show/hide toggle. |
| `src/app/(auth)/testimonial-carousel.tsx` | `TestimonialCarousel` — auto-advancing (7s) rotating testimonial with dot indicators, shown on the visual panel. |
| `src/app/(auth)/login/{page.tsx,LoginForm.tsx}` | Login route + client form. |
| `src/app/(auth)/signup/{page.tsx,SignupForm.tsx}` | Signup route + client form. |
| `src/app/(auth)/forgot-password/{page.tsx,ForgotPasswordForm.tsx}` | Request a password-reset email. |
| `src/app/(auth)/reset-password/{page.tsx,ResetPasswordForm.tsx}` | Set a new password after following the reset link. |
| `src/app/auth/callback/route.ts` | Exchanges a Supabase `code` for a session; OAuth only (Google/Facebook/LinkedIn) — see "Callback route" below. |
| `src/app/(auth)/auth/confirm/page.tsx` | Click-through confirmation page for email-verification and password-recovery links (lives under the `(auth)` group so it shares its layout, but resolves to `/auth/confirm`). Renders a button; does **not** verify on load. |
| `confirmEmailAction` (in `actions.ts`) | Server Action the confirm button submits: calls `supabase.auth.verifyOtp({ type, token_hash })`, then runs the same welcome-notification/onboarding-gate logic the callback route runs for OAuth. |
| `src/lib/password-rules.ts` | `PASSWORD_HINT` + `validateNewPassword()` — the shared password complexity rule (see "Password rules" below). |
| `src/components/auth/eye-icon.tsx` | `EyeIcon` / `EyeOffIcon` — inline SVG icons for the password show/hide toggle (no external icon library dependency). |
| `src/components/auth/google-icon.tsx`, `facebook-icon.tsx`, `linkedin-icon.tsx` | OAuth button icons. |
| `src/lib/supabase/client.ts` | Browser Supabase client (for Client Components). |
| `src/lib/supabase/server.ts` | Server Supabase client (for Server Components, Server Actions, Route Handlers) — cookie-backed, must be created fresh per request. |
| `src/lib/supabase/middleware.ts` | `updateSession()` — refreshes the Supabase session cookie. |

## Pattern: Server Action + `useActionState`

Every auth form follows the same shape: a `"use client"` form component
calls `useActionState(someAction, initialAuthState)`, submits via the
returned `formAction`, and renders `state.error` / `state.success` /
`pending`. The actual Supabase call and all validation happen server-side
in `actions.ts` — forms never talk to Supabase directly.

### Sign up (`signUpAction`)

1. Validates: first/last name present, email contains `@`, password
   passes `validateNewPassword()` (see "Password rules" below),
   `password === confirmPassword`, `termsAccepted` checkbox is set.
2. Calls `supabase.auth.signUp()` with `emailRedirectTo:
   ${origin}/auth/confirm?next=<sanitized next>` and stores
   `first_name`, `last_name`, `plan_selection` (`"free"` or `"pro"`,
   from a hidden `plan` field), `referral_source`, and
   `marketing_consent` in the Supabase Auth user's metadata.
3. If email confirmation is required (the normal case — Supabase returns
   no session yet), the form switches to a "check your email" state
   showing the submitted address. Otherwise it redirects to `next`.
4. If the visitor picked the Pro plan on the pricing section before
   signing up, the form shows a note that they'll complete Stripe billing
   from the dashboard after verifying — signup itself never touches
   Stripe.

### Log in (`signInAction`)

- Requires email + password. If the password is under 8 characters, it
  returns `PASSWORD_HINT` immediately (see "Password rules" below)
  without calling Supabase at all — a password that short can never
  belong to a real account, since both signup and reset-password enforce
  8+ characters, so it's always a mistyped entry worth a specific hint
  rather than a generic error.
- Otherwise calls `supabase.auth.signInWithPassword()`. On failure
  returns the generic `"Incorrect email or password."` — deliberately
  does not reveal whether the account exists, and deliberately does
  **not** re-run the full letter/number/special-character check here
  (Supabase is the real authority on whether a correctly-sized password
  matches the account — see "Password rules").
- On success, redirects to the sanitized `next` (defaults to `/`).
- `LoginPage` also reads a `reset=success` query param (set after a
  password reset) to show a one-time confirmation banner.

### Google / Facebook / LinkedIn OAuth

`signInWithGoogleAction`, `signInWithFacebookAction`,
`signInWithLinkedInAction`:

- All three call a shared `oauthRedirectAction(provider, formData)`,
  which calls `supabase.auth.signInWithOAuth({ provider, options: {
  redirectTo: ... } })` and redirects the browser straight to the
  provider-hosted consent screen. There's no client-side Supabase call —
  these are plain `<form action={signInWithGoogleAction}>` submissions,
  consistent with every other auth form on this site using a Server
  Action rather than a browser Supabase client.
- LinkedIn's provider id is `"linkedin_oidc"`, not `"linkedin"` —
  LinkedIn retired the older OAuth 2.0 surface Supabase's original
  `linkedin` provider used; Supabase removed that provider id entirely
  in favor of `linkedin_oidc` ("Sign In with LinkedIn using OpenID
  Connect"). Using the old string will fail outright.
- The provider redirects back to `/auth/callback`, which exchanges the
  code exactly like an email-verification or password-recovery link (see
  "Callback route" below). `backfillOAuthProfile()`'s `given_name`/
  `family_name` lookup works unchanged for LinkedIn — OIDC providers
  return those as standard claims, same as Google.
- On failure to even obtain an authorize URL, redirects to
  `/login?error=oauth_failed`.
- Both the signup and login forms render "Continue with Google" /
  "Continue with Facebook" / "Continue with LinkedIn" buttons above the
  email/password form, separated by an "or" divider.
  `src/components/auth/linkedin-icon.tsx` follows the same
  plain-inline-SVG pattern as `google-icon.tsx`/`facebook-icon.tsx`.

**Before LinkedIn login will actually work**, the provider must be
enabled in the Supabase dashboard with real credentials from a LinkedIn
OAuth app — this is account-level configuration this session can't do
(same category of blocker as the pending Resend SMTP wiring in
[email.md](./email.md)):

1. Create an app at the
   [LinkedIn Developer Dashboard](https://www.linkedin.com/developers/apps),
   add the **"Sign In with LinkedIn using OpenID Connect"** product, and
   set its Authorized Redirect URL to this project's Supabase callback
   (`https://<project-ref>.supabase.co/auth/v1/callback`).
2. In the Supabase dashboard: Authentication → Providers → **LinkedIn
   (OIDC)** → enable it and paste in the Client ID/Secret. Or via the
   Management API:
   ```bash
   curl -X PATCH "https://api.supabase.com/v1/projects/mghndaeanzxnpwlyqedt/config/auth" \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "external_linkedin_oidc_enabled": true,
       "external_linkedin_oidc_client_id": "<your LinkedIn Client ID>",
       "external_linkedin_oidc_secret": "<your LinkedIn Client Secret>"
     }'
   ```
   (Google and Facebook are presumably already enabled this same way,
   since those two already work.)

### Forgot password (`forgotPasswordAction`)

- Validates the email shape only, then calls
  `supabase.auth.resetPasswordForEmail(email, { redirectTo:
  ${origin}/auth/confirm?next=/reset-password })`.
- **Always** returns `{ success: true, email }`, regardless of whether an
  account exists for that address — this is intentional, not an
  oversight, to avoid leaking account existence.

### Reset password (`resetPasswordAction`)

- Runs after the visitor has followed the email link through
  `/auth/confirm`, which has already verified the recovery token and
  established a live session.
- Validates password length and confirmation match, calls
  `supabase.auth.updateUser({ password })`, then redirects to
  `/login?reset=success`.

### Sign out (`signOutAction`)

- Calls `supabase.auth.signOut()` and redirects to `/`. Wired from the
  landing page header when `viewer` is present.

## Callback route (`/auth/callback`)

`src/app/auth/callback/route.ts` is the landing point for **Google/
Facebook/LinkedIn OAuth** redirects only (from `oauthRedirectAction`). It
reads `code` and `next` from the query string, calls
`supabase.auth.exchangeCodeForSession(code)`, and redirects to `next` on
success or to `/login?error=auth_callback_failed` on failure.

It also runs `backfillOAuthProfile()`: `signInWithOAuth()` (unlike
`signUp()`) has no way to pass our own `first_name`/`last_name`/
`plan_selection` metadata, so the `handle_new_user()` database trigger
still creates a `profiles` row but with those fields at their defaults.
This function fills in `first_name`/`last_name` from the provider's own
profile data (`given_name`/`family_name`, falling back to splitting
`full_name`/`name`) and sets `plan_selection` to `"pro"` if a `plan=pro`
query param came through the OAuth redirect — but **only when the
profile doesn't already hold a real value**, so a returning user's edited
name or already-purchased plan can never be silently overwritten by
stale provider data or a stray query param on a later login.

Email verification and password-recovery links do **not** go through
this route (see below) — they used to, but a bare GET straight to
Supabase's verify endpoint (or straight to this route with a `code`) is
vulnerable to email link-scanners silently consuming the one-time token
before the recipient clicks, which was causing the intermittent "That
link is invalid or has expired" reports.

## Confirm route (`/auth/confirm`)

`src/app/(auth)/auth/confirm/page.tsx` (URL `/auth/confirm` — it's a
plain folder nested inside the `(auth)` route group, so it shares that
group's split-screen layout without adding `auth` to any of the other
pages' paths) is the landing point for:

- **Email verification** links (from `signUpAction`'s `emailRedirectTo`).
- **Password recovery** links (from `forgotPasswordAction`'s
  `redirectTo`, which points here with `next=/reset-password`).

Both links now carry `token_hash` + `type` (`signup` or `recovery`)
instead of Supabase's own `{{ .ConfirmationURL }}` — see the header
comment in `supabase/email-templates/confirm-signup.html` for the full
reasoning. Crucially, **loading this page does not verify anything**: it
just renders a "Confirm Email Address" / "Continue" button. Verification
only happens when `confirmEmailAction` (in `actions.ts`) is submitted —
it calls `supabase.auth.verifyOtp({ type, token_hash })`, then runs the
same welcome-notification-and-onboarding-gate logic `/auth/callback`
already ran for OAuth, and redirects to `next` (or
`/onboarding/experience` first, same first-entry gate as the callback
route) on success, or `/login?error=auth_callback_failed` on failure.

This matters because email providers and corporate security scanners
(Outlook Safe Links, Microsoft Defender, some Gmail link-checking, etc.)
automatically fetch every link in an inbound email to scan it for
malware — a plain `GET` to a one-time-use verification endpoint gets
silently consumed by that prefetch, so by the time the real recipient
clicks, the token is already spent and they land on "invalid or
expired" for a link they never actually used. Scanners fetch pages but
don't submit forms, so gating the real `verifyOtp` call behind a Server
Action click makes the token immune to this.

## Open-redirect protection

Both `actions.ts` and `callback/route.ts` define their own
`sanitizeNext(next)` that only accepts values starting with a single `/`
(rejects `//host/evil`-style protocol-relative URLs and anything
absolute). Every redirect target that originates from user input
(`next` form field or query param) goes through this before being used —
never pass a raw `next` value to `redirect()` or `NextResponse.redirect()`.

## Session refresh middleware

`src/lib/supabase/middleware.ts` exports `updateSession(request)`, which
creates a Supabase server client bound to the request/response cookies and
calls `supabase.auth.getUser()` so the session cookie gets refreshed
before it expires.

**Known gap:** there is currently no root `middleware.ts` (neither at the
project root nor `src/middleware.ts`) that calls `updateSession` from
Next.js's middleware pipeline. The function exists but isn't invoked on
every request yet — until it's wired up via a root `middleware.ts` with a
matcher, sessions rely solely on the Supabase client refreshing tokens
opportunistically inside Server Components/Actions, which is not the same
guarantee. This needs to be added; don't assume session refresh is
handled just because the helper exists.

## Password rules

`src/lib/password-rules.ts` exports two things, shared by every form that
touches a password:

```ts
export const PASSWORD_HINT =
  "Use 8+ characters with a letter, number, and special character (@, #, $, %).";

export function validateNewPassword(password: string): string | null {
  // 8+ chars, at least one letter, one number, one of @ # $ %
  // returns a specific message for whichever check fails first, or null if valid
}
```

**Where the full check applies vs. where it doesn't** — this is a
deliberate distinction, not an oversight:

- **Signup** (`signUpAction`) and **reset-password**
  (`resetPasswordAction`) both call `validateNewPassword()` server-side —
  these are the two places a password is actually being *set*, so the
  full rule (length + letter + number + special character) applies.
- **Login** (`signInAction`) does **not** re-run the full rule. Enforcing
  a complexity rule at login time would risk locking a real user out if
  their account's actual stored password predates the rule, or was
  created before it existed — Supabase itself is the only real authority
  on whether a login password is correct. Login only checks that the
  entered password is at least 8 characters (returning `PASSWORD_HINT`
  if not), since a password shorter than that can never belong to a real
  account in the first place, given the length rule signup/reset already
  enforce.

Both `SignupForm` and `ResetPasswordForm` show `PASSWORD_HINT` as static
helper text under the password field (`.auth-password-hint`) in addition
to it appearing as the error message on a failed submission.

### Password show/hide toggle

Every password field (login, signup's Password + Confirm password,
reset-password's New password + Confirm new password) has an eye-icon
button (`EyeIcon`/`EyeOffIcon` from `src/components/auth/eye-icon.tsx`,
plain inline SVGs — no icon library dependency) that toggles the field's
`type` between `"password"` and `"text"` via local `useState`. Each field
has its own independent toggle. Styled via `.auth-password-wrap` /
`.auth-password-toggle` in `auth.css` — the input gets `padding-right`
to make room, and the button is absolutely positioned inside a
`position: relative` wrapper around just the `<input>` (not the whole
`.auth-field`, which also contains the `<label>` above it).

## Other account rules

- Terms acceptance is required at signup (`termsAccepted` checkbox),
  linking to `/terms` and `/privacy`.
- Marketing consent is a separate, optional checkbox stored as
  `marketing_consent` in user metadata.
- Login and forgot-password both avoid account-enumeration by returning
  generic responses regardless of whether the email is registered.

## Layout / shell

`src/app/(auth)/layout.tsx` renders a split-screen shell shared by every
auth page (hidden below 900px — the form gets full width on phones and
tablets, see `.auth-visual` in `auth.css`):

- **Left visual panel** — a background photo, the "Connect. Collaborate.
  Win Government Work." headline and its paragraph (the same copy as the
  homepage hero), a 4-item checklist, a rotating testimonial
  (`TestimonialCarousel`, all of `getTestimonials()` — not just the
  first result, it auto-advances through each one), and a
  "© 2026 GovConUnited, LLC. A [Robb Industrial Co.](https://robbcc.com/)"
  footer.
- **Right panel** — the page's form (`{children}`).

It imports both `landing.css` and `auth.css`, and renders in the same
Helvetica Neue typeface as the rest of the app — see
[landing-page.md](./landing-page.md#fonts-and-styling).

### Checklist — real platform metrics, not fixed marketing copy

The 4-item checklist is built from `getPlatformMetrics()` (the same real
row-count query the homepage hero's metrics strip uses — see
[landing-page.md](./landing-page.md)), not hardcoded numbers:

```tsx
const visualFeatures = [
  `${metricByLabel.Opportunities ?? 0} Government contracting opportunities`,
  `${metricByLabel.Companies ?? 0} Verified companies`,
  `${metricByLabel.Professionals ?? 0} GovCon professionals`,
  `${metricByLabel.Events ?? 0} Events`,
];
```

This previously read `"12,845+ government contracting opportunities"`,
`"8,732+ verified companies and contractors"`, and a third line about
direct messaging — all fixed marketing copy unrelated to the real
database. Fetching real counts here follows the same principle
`getPlatformMetrics()` was already built for: never show a number on the
page that doesn't trace back to an actual row count.

### Copy block width

`.auth-visual-copy` (and its `p`) are capped at `560px`/`540px`
max-width. This was widened from an original `420px`/`400px` specifically
because the longer paragraph (see above) was wrapping to 9 lines in the
narrower box; the wider cap brings it down to ~6 lines so the panel still
comfortably fits the checklist and testimonial card beneath it without
scrolling, at normal desktop widths.
