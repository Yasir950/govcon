import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";

const PRO_MONTHLY_USD = 49;
const PRO_ANNUAL_USD = 490;

// Real Stripe Checkout session creation for the Pro plan — no fake
// "upgrade" button that just flips plan_selection client-side. Requires
// only STRIPE_SECRET_KEY to be set (see docs/billing.md for the same
// "not configured in this environment" situation authentication.md
// documents for LinkedIn OAuth and email.md documents for Resend).
//
// Same pattern as crewupapp's createCheckoutSession (src/lib/actions/billing.ts):
// inline `price_data` computed here rather than a pre-created Stripe Price
// id, so there's no separate "create these Products/Prices in Stripe first"
// step — the real price ($49/$490, the same numbers shown on /billing and
// the homepage) is sent with the session itself.
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.redirect(`${origin}/billing?error=not_configured`, { status: 303 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/billing`, { status: 303 });

  const formData = await request.formData();
  const cycle = formData.get("cycle") === "annual" ? "annual" : "monthly";
  const interval: "month" | "year" = cycle === "annual" ? "year" : "month";
  const unitAmountUsd = cycle === "annual" ? PRO_ANNUAL_USD : PRO_MONTHLY_USD;

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .maybeSingle();

  const stripe = getStripe();

  // "Managed Payments" (a newer Stripe account-level feature, enabled by
  // default on some accounts) requires a real tax_code on every line item
  // unless explicitly turned off for the session — same issue crewupapp
  // hit (see its src/lib/actions/billing.ts). This app has no tax/nexus
  // configuration to back a real tax_code, so it's turned off here too.
  const params: Stripe.Checkout.SessionCreateParams & { managed_payments?: { enabled: boolean } } = {
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `GovConUnited Pro${cycle === "annual" ? " (Annual)" : ""}`,
            description:
              "Unlimited opportunity browsing, advanced filters, alerts, tracking, unlimited messages, and private teaming groups.",
          },
          unit_amount: unitAmountUsd * 100,
          recurring: { interval },
        },
        quantity: 1,
      },
    ],
    customer: profile?.stripe_customer_id ?? undefined,
    customer_email: profile?.stripe_customer_id ? undefined : profile?.email || user.email || undefined,
    client_reference_id: user.id,
    success_url: `${origin}/billing?success=1`,
    cancel_url: `${origin}/billing?canceled=1`,
    metadata: { supabase_user_id: user.id },
    subscription_data: { metadata: { supabase_user_id: user.id } },
    managed_payments: { enabled: false },
  };

  const session = await stripe.checkout.sessions.create(params);

  if (!session.url) return NextResponse.redirect(`${origin}/billing?error=checkout_failed`, { status: 303 });
  return NextResponse.redirect(session.url, { status: 303 });
}
