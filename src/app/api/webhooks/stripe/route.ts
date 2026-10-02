import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

// The card's fingerprint (same card = same fingerprint across customers)
// lets the points engine refuse member-to-member rewards between accounts
// paid for with the same card (member_help_same_party). Best effort: a
// failure here never fails the webhook.
async function recordPaymentFingerprint(userId: string, subscription: Stripe.Checkout.Session["subscription"]) {
  if (!subscription) return;
  try {
    const sub = await getStripe().subscriptions.retrieve(typeof subscription === "string" ? subscription : subscription.id, {
      expand: ["default_payment_method"],
    });
    const pm = sub.default_payment_method;
    const fingerprint = pm && typeof pm !== "string" ? pm.card?.fingerprint : null;
    if (!fingerprint) return;
    await createAdminClient()
      .from("account_fingerprints")
      .upsert({ profile_id: userId, payment_fingerprint: fingerprint, updated_at: new Date().toISOString() });
  } catch (err) {
    console.error("recordPaymentFingerprint failed", err);
  }
}

// Stripe requires the raw request body to verify the webhook signature.
export async function POST(request: Request) {
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 },
    );
  }

  // Uses the service-role client (see src/lib/supabase/admin.ts) because a
  // webhook request has no cookies/session — the normal RLS-scoped client
  // can't write "Users can update own profile" rows with no auth.uid().
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id || session.metadata?.supabase_user_id;
      if (userId && session.customer) {
        await createAdminClient()
          .from("profiles")
          .update({
            plan_selection: "pro",
            stripe_customer_id: String(session.customer),
            stripe_subscription_id: session.subscription ? String(session.subscription) : null,
          })
          .eq("id", userId);
        await recordPaymentFingerprint(userId, session.subscription);
        await createNotification({
          recipientId: userId,
          actorId: null,
          type: "billing_event",
          subjectType: "billing",
          title: "Welcome to GovConUnited Pro",
          body: "Your subscription is active — enjoy the full set of Pro features.",
          linkPath: "billing",
        });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const active = subscription.status === "active" || subscription.status === "trialing";
      const { data: updatedProfile } = await createAdminClient()
        .from("profiles")
        .update({
          plan_selection: active ? "pro" : "free",
          stripe_subscription_id: active ? subscription.id : null,
        })
        .eq("stripe_customer_id", String(subscription.customer))
        .select("id")
        .maybeSingle();
      if (updatedProfile) {
        await createNotification({
          recipientId: updatedProfile.id,
          actorId: null,
          type: "billing_event",
          subjectType: "billing",
          title: active ? "Your GovConUnited Pro subscription renewed" : "Your GovConUnited Pro subscription has ended",
          body: active ? "Thanks for staying with Pro." : "You've been moved to the Free plan.",
          linkPath: "billing",
        });
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
