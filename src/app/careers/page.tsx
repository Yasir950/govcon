import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "../(auth)/auth.css";
import "../legal.css";

export const metadata: Metadata = { title: "Careers · GovConUnited" };

export default function CareersPage() {
  return (
    <div className="legal-shell">
      <div className="legal-wrap">
        <Link href="/" className="legal-back">
          ← Back to GovConUnited
        </Link>
        <h1>Careers at GovConUnited</h1>

        <p>
          We&rsquo;re not currently hiring for any open roles. Check back here for updates, or
          follow our social channels for announcements.
        </p>

        <h2>Looking for GovCon jobs instead?</h2>
        <p>
          If you&rsquo;re looking for a role with a government contractor rather than with
          GovConUnited itself, browse real, company-posted openings on our{" "}
          <Link href="/jobs">Jobs</Link> page.
        </p>
      </div>
    </div>
  );
}
