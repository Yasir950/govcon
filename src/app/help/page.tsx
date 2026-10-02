import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "../(auth)/auth.css";
import "../legal.css";

export const metadata: Metadata = { title: "Help & Support · GovConUnited" };

export default function HelpPage() {
  return (
    <div className="legal-shell">
      <div className="legal-wrap">
        <Link href="/" className="legal-back">
          ← Back to GovConUnited
        </Link>
        <h1>Help &amp; Support</h1>

        <h2>Account questions</h2>
        <p>
          Signed-in members can manage their profile, plan, and notification preferences from{" "}
          <Link href="/settings">Account Settings</Link>.
        </p>

        <h2>Billing questions</h2>
        <p>
          For questions about your GovConUnited Free or Pro plan, visit{" "}
          <Link href="/billing">Billing &amp; Subscription</Link> or see our{" "}
          <Link href="/#pricing">Pricing</Link> page.
        </p>

        <h2>Everything else</h2>
        <p>
          For anything not covered here, reach out through our{" "}
          <Link href="/contact">Contact Us</Link> page.
        </p>
      </div>
    </div>
  );
}
