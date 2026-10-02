import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BillingPageClient } from "@/components/billing/BillingPageClient";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing & Subscription · GovConUnited" };
export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string; error?: string }>;
}) {
  const { success, canceled, error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/billing");

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, plan_selection, stripe_customer_id, role, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const viewer = {
    id: user.id,
    firstName: profile?.first_name || user.email?.split("@")[0] || "Member",
    lastName: profile?.last_name || "",
    planSelection: profile?.plan_selection || "free",
    isAdmin: profile?.role === "admin",
    avatarUrl: profile?.avatar_url,
  };

  // Real config check, not a guess — the checkout/portal routes redirect
  // back here with ?error=not_configured if this isn't set, but the page
  // itself checks up front too so the buttons aren't a dead end to click
  // through to find that out. No price-id env vars to check anymore —
  // checkout uses inline price_data (see api/stripe/checkout/route.ts).
  const billingConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

  return (
    <BillingPageClient
      viewer={viewer}
      hasStripeCustomer={Boolean(profile?.stripe_customer_id)}
      billingConfigured={billingConfigured}
      success={success === "1"}
      canceled={canceled === "1"}
      errorCode={error}
    />
  );
}
