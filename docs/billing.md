# Billing & Subscription

Real Stripe integration (`/billing`) — replaces the previous `/#pricing`
anchor every "Upgrade"/"Billing" link pointed at with an actual Checkout
and Customer Portal flow.

## Files

| File | Role |
| --- | --- |
| `supabase/migrations/20260918000000_stripe_billing.sql` | Adds `profiles.stripe_customer_id` (unique) and `profiles.stripe_subscription_id`. |
| `src/lib/supabase/admin.ts` | `createAdminClient()` — service-role Supabase client. Only ever used server-side, and only where there's no signed-in session to scope a write to (the webhook has no request cookies at all). |
| `src/app/api/stripe/checkout/route.ts` | Creates a real Stripe Checkout session for the Pro plan (monthly or annual, `$49`/`$490`) and redirects the browser to it. Uses Checkout's inline `price_data` rather than a pre-created Stripe Price id — same pattern as crewupapp's `createCheckoutSession` (`src/lib/actions/billing.ts`) — so no "create these Products/Prices in Stripe first" step is needed. |
| `src/app/api/stripe/portal/route.ts` | Creates a real Stripe Customer Portal session for an existing subscriber to manage/cancel. |
| `src/app/api/webhooks/stripe/route.ts` | Handles `checkout.session.completed` (sets `plan_selection: "pro"` + stores the Stripe IDs) and `customer.subscription.updated`/`.deleted` (syncs `plan_selection` to the subscription's real status). |
| `src/app/api/stripe/webhook/route.ts` | Thin re-export of the handler above. The live Stripe webhook endpoint (Dashboard → Developers → Webhooks) is registered at `/api/stripe/webhook` — the crewupapp naming convention — rather than `/api/webhooks/stripe`, so this alias exists to actually receive those deliveries. Update the Dashboard endpoint to `/api/webhooks/stripe` and delete this file if you'd rather have one canonical path. |
| `src/app/billing/page.tsx` + `src/components/billing/BillingPageClient.tsx` | The billing page itself: current plan, Free-vs-Pro comparison (reuses `freePlanFeatures`/`proPlanFeatures`), and the real upgrade/manage forms. |

## Configuration

Only `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and
`STRIPE_WEBHOOK_SECRET` are needed — no price-id env vars, since checkout
computes the $49/$490 price inline rather than referencing a pre-created
Stripe Price. `/billing` checks `Boolean(process.env.STRIPE_SECRET_KEY)`
up front and shows "Billing isn't connected yet" instead of a dead button
when it's missing, rather than letting someone click through to find that
out; the checkout/portal routes make the same check and redirect back to
`/billing?error=not_configured` if hit directly without a key configured.

A webhook endpoint must be registered in the Stripe dashboard pointing at
the deployed `/api/stripe/webhook` (or `/api/webhooks/stripe` if the
Dashboard endpoint above is repointed) with its signing secret set as
`STRIPE_WEBHOOK_SECRET`.

## Known gaps

- No proration/plan-switch UI beyond what Stripe's own Customer Portal
  provides — "Manage Billing" hands off to Stripe entirely rather than
  building a custom subscription-management screen.
- No invoice history shown in-app (also available via the Customer Portal
  link).
- Downgrade-on-cancellation relies on the webhook firing; there's no
  polling fallback if a webhook delivery is missed (standard Stripe retry
  behavior applies, but this app doesn't add its own reconciliation job).
