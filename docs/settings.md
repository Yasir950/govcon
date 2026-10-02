# Account Settings

Real settings page (`/settings`) — the mockup's topbar dropdown and sidebar
both link to "Account Settings"; this is a genuine implementation over
real `profiles` columns and Supabase Auth, not a stub.

## Files

| File | Role |
| --- | --- |
| `src/app/settings/page.tsx` | Server component. Requires auth, fetches the viewer's profile (name, email, `marketing_consent`). |
| `src/app/settings/actions.ts` | `updateProfileNameAction`, `updateMarketingConsentAction`, `changePasswordAction`, `uploadAvatarAction` — real Server Actions. |
| `src/app/settings/settings-types.ts` | Shared `SettingsActionState` type + initial value — split into its own file because a `"use server"` module can only export async functions (see `authentication.md`'s equivalent `auth-types.ts` pattern). |
| `src/components/settings/SettingsPageClient.tsx` | Client component: Profile / Notifications / Security tabs, matching the mockup's `.settings-nav`/`.setting-row`/`.toggle` classes. |

## What each tab actually does

- **Profile** — edits `profiles.first_name`/`last_name`/`job_title`/
  `location`/`company_name` for real (all added in
  `20260918000300_profile_fields_and_avatar.sql`, all optional — blank
  fields stay `null`, never a placeholder). Email is shown but not editable
  (changing an account's login email is a separate, higher-risk flow this
  doesn't attempt). A real photo upload (`uploadAvatarAction`) goes to a
  Supabase Storage `avatars` bucket (public read, owner-only write) and
  updates `profiles.avatar_url`; no photo uploaded still shows the same
  initials avatar used everywhere else in the app.
- **Notifications** — one real toggle: `profiles.marketing_consent`, the
  same column the signup form's checkbox writes. The mockup has several
  other toggles (SMS, push, "new opportunity alerts", …) with no
  corresponding column anywhere in the schema — only the one real field is
  exposed here rather than wiring fake toggles that don't persist.
- **Security** — a real password change via `supabase.auth.updateUser()`,
  gated behind re-verifying the *current* password first
  (`signInWithPassword` with the entered current password) — Supabase's
  `updateUser()` alone doesn't require the current password, so this is
  the app's own "prove you still know it" check before allowing a live
  session to change the account password.

## Known gaps

- No account deletion, email change, or 2FA — none of these exist in the
  schema/auth config yet.
- No notification-preference columns beyond `marketing_consent`.
