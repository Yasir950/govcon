import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "../(auth)/auth.css";
import "../legal.css";

export const metadata: Metadata = { title: "Privacy Policy · GovConUnited" };

export default function PrivacyPage() {
  return (
    <div className="legal-shell">
      <div className="legal-wrap">
        <Link href="/" className="legal-back">
          ← Back to GovConUnited
        </Link>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated September 15, 2026</p>

        <h2>1. Information we collect</h2>
        <p>
          When you register, we collect your name, email address, password, and the plan you
          select. As you use GovConUnited, we collect the profile, company, opportunity, job,
          content, and connection information you choose to add, plus usage data needed to
          operate features such as saved items, messaging, and notifications.
        </p>

        <h2>2. How we use information</h2>
        <p>
          We use your information to operate your account, personalize your dashboard, enforce
          Free and Pro plan limits, process payments through Stripe, send transactional email
          through our email provider, and improve the platform.
        </p>

        <h2>3. Sharing</h2>
        <p>
          We do not sell your personal information. We share information with service providers
          who help us operate GovConUnited (hosting, database, authentication, payments,
          email), and with other members only as your visibility settings allow.
        </p>

        <h2>4. Your choices</h2>
        <p>
          You can edit or delete your profile and company information, control marketing email
          preferences, and request account deletion from Account Settings at any time.
        </p>

        <h2>5. Security</h2>
        <p>
          We use row-level security, encrypted connections, and access controls to protect your
          data. No method of transmission or storage is completely secure, but we work to
          protect your information.
        </p>

        <h2>6. Contact</h2>
        <p>Questions about this policy can be sent through our Contact Support page.</p>
      </div>
    </div>
  );
}
