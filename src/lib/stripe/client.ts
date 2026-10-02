import Stripe from "stripe";

// Server-only. Never import this from a Client Component.
// Lazily constructed so that importing this module doesn't require
// STRIPE_SECRET_KEY to be set at build time (e.g. static page data
// collection) — only when a Stripe call is actually made.
let _stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      typescript: true,
    });
  }
  return _stripe;
}
