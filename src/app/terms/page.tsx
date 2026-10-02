import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "../(auth)/auth.css";
import "../legal.css";

export const metadata: Metadata = { title: "Terms of Use · GovConUnited" };

export default function TermsPage() {
  return (
    <div className="legal-shell">
      <div className="legal-wrap">
        <Link href="/" className="legal-back">
          ← Back to GovConUnited
        </Link>
        <h1>Terms of Use</h1>
        <p className="legal-updated">Last updated September 15, 2026</p>

        <h2>1. Acceptance of terms</h2>
        <p>
          By creating a GovConUnited account or using the GovConUnited website, you agree to
          these Terms of Use and to our <Link href="/privacy">Privacy Policy</Link>. If you do
          not agree, do not create an account or use the service.
        </p>

        <h2>2. Your account</h2>
        <p>
          You are responsible for the accuracy of the information you provide, for keeping your
          login credentials secure, and for all activity under your account. Notify us promptly
          of any unauthorized use.
        </p>

        <h2>3. Membership plans</h2>
        <p>
          GovConUnited Free is available at no cost. GovConUnited Pro is a paid subscription
          billed monthly or annually. Plan features and usage limits are described on our
          pricing page and are enforced by GovConUnited; pricing and entitlements may change
          with notice.
        </p>

        <h2>4. Acceptable use</h2>
        <p>
          You agree not to misuse the platform, including by posting false or misleading
          opportunity, company, or profile information, harassing other members, attempting to
          bypass plan limits or security controls, or scraping data without authorization.
        </p>

        <h2>5. Content</h2>
        <p>
          You retain ownership of content you submit to GovConUnited. By posting content, you
          grant GovConUnited a license to display and distribute it on the platform as necessary
          to operate the service.
        </p>

        <h2>6. Termination</h2>
        <p>
          You may close your account at any time from Account Settings. GovConUnited may suspend
          or terminate accounts that violate these terms.
        </p>

        <h2>7. Disclaimers</h2>
        <p>
          GovConUnited is a networking and discovery platform. We do not guarantee the accuracy
          of opportunity listings from third-party sources or the outcome of any teaming,
          employment, or contracting relationship formed through the platform.
        </p>

        <h2>8. Contact</h2>
        <p>Questions about these terms can be sent through our Contact Support page.</p>
      </div>
    </div>
  );
}
