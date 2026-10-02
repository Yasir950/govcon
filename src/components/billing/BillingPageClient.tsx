"use client";

import { useState } from "react";
import { freePlanFeatures, proPlanFeatures } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Billing isn't connected yet on this deployment — Stripe keys haven't been configured.",
  checkout_failed: "Couldn't start checkout. Please try again.",
  no_subscription: "No active subscription found to manage.",
};

export function BillingPageClient({
  viewer,
  hasStripeCustomer,
  billingConfigured,
  success,
  canceled,
  errorCode,
}: {
  viewer: Viewer;
  hasStripeCustomer: boolean;
  billingConfigured: boolean;
  success: boolean;
  canceled: boolean;
  errorCode?: string;
}) {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const isPro = viewer.planSelection === "pro";

  return (
    <section className="main" id="billing">
      <div className="wrap">
        <div className="opps-app">
          <div className="page-head">
            <div>
              <h1>Billing &amp; Subscription</h1>
              <p>Manage your GovConUnited plan and payment method.</p>
            </div>
          </div>

          {success && (
            <div className="card panel" style={{ marginBottom: 16, borderColor: "#a8d8bd", background: "#f1faf4" }}>
              Payment completed — your Pro access activates as soon as Stripe confirms the subscription.
            </div>
          )}
          {canceled && (
            <div className="card panel" style={{ marginBottom: 16 }}>
              Checkout was canceled — you weren&rsquo;t charged.
            </div>
          )}
          {errorCode && (
            <div className="card panel" style={{ marginBottom: 16, borderColor: "#f3b0b4", background: "#fff5f5" }}>
              {ERROR_MESSAGES[errorCode] ?? "Something went wrong."}
            </div>
          )}
          {!billingConfigured && !errorCode && (
            <div className="card panel" style={{ marginBottom: 16 }}>
              <strong>Billing isn&rsquo;t connected yet.</strong>
              <p className="meta" style={{ marginTop: 6 }}>
                This deployment doesn&rsquo;t have Stripe keys configured, so upgrading isn&rsquo;t available here yet.
              </p>
            </div>
          )}

          <section className="card panel" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <div>
                <h2 className="section-title">Current Plan</h2>
                <div className="meta">Signed in as {viewer.firstName} {viewer.lastName}</div>
              </div>
              <span className={`tag${isPro ? " green" : ""}`}>
                {isPro ? "GovConUnited Pro" : "GovConUnited Free"}
              </span>
            </div>
            {isPro && hasStripeCustomer && billingConfigured && (
              <form action="/api/stripe/portal" method="POST" style={{ marginTop: 6 }}>
                <button className="btn btn-outline" type="submit">
                  Manage Billing
                </button>
              </form>
            )}
          </section>

          {!isPro && (
            <section className="card panel">
              <div className="panel-head">
                <h2 className="section-title">Upgrade to Pro</h2>
                <div className="billing-toggle" style={{ display: "flex", gap: 4, border: "1px solid var(--o-line)", borderRadius: 10, padding: 4 }}>
                  <button
                    type="button"
                    className={`btn${cycle === "monthly" ? " btn-primary" : " btn-outline"}`}
                    onClick={() => setCycle("monthly")}
                  >
                    Monthly · $49
                  </button>
                  <button
                    type="button"
                    className={`btn${cycle === "annual" ? " btn-primary" : " btn-outline"}`}
                    onClick={() => setCycle("annual")}
                  >
                    Annual · $490
                  </button>
                </div>
              </div>

              <div className="grid-2" style={{ marginTop: 14 }}>
                <div>
                  <h3 style={{ marginTop: 0 }}>Free includes</h3>
                  <ul style={{ margin: 0, paddingLeft: 18, color: "var(--o-muted)", fontSize: ".86rem", lineHeight: 1.8 }}>
                    {freePlanFeatures.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 style={{ marginTop: 0 }}>Pro adds</h3>
                  <ul style={{ margin: 0, paddingLeft: 18, color: "var(--o-muted)", fontSize: ".86rem", lineHeight: 1.8 }}>
                    {proPlanFeatures.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <form action="/api/stripe/checkout" method="POST" style={{ marginTop: 18 }}>
                <input type="hidden" name="cycle" value={cycle} />
                <button className="btn btn-primary" type="submit" disabled={!billingConfigured}>
                  Upgrade Now — {cycle === "annual" ? "$490/year" : "$49/month"}
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
