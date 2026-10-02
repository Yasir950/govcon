// Alias for the canonical handler at src/app/api/webhooks/stripe/route.ts.
// The live Stripe webhook endpoint (registered in the Dashboard) points at
// /api/stripe/webhook — the crewupapp naming convention — rather than
// /api/webhooks/stripe, so this route exists to actually receive those
// deliveries instead of 404ing. Update the Dashboard endpoint to
// /api/webhooks/stripe and delete this file if you'd rather have one path.
export { POST } from "@/app/api/webhooks/stripe/route";
