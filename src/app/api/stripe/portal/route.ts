import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";

// Real Stripe Customer Portal session — lets an existing Pro member manage
// or cancel their subscription without a custom billing-management UI.
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.stripe_customer_id) {
    return NextResponse.redirect(`${origin}/billing?error=no_subscription`, { status: 303 });
  }

  const stripe = getStripe();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/billing`,
  });

  return NextResponse.redirect(portalSession.url, { status: 303 });
}
