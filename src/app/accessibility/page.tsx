import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "../(auth)/auth.css";
import "../legal.css";

export const metadata: Metadata = { title: "Accessibility · GovConUnited" };

export default function AccessibilityPage() {
  return (
    <div className="legal-shell">
      <div className="legal-wrap">
        <Link href="/" className="legal-back">
          ← Back to GovConUnited
        </Link>
        <h1>Accessibility</h1>

        <p>
          GovConUnited is committed to making our platform usable by everyone, including people
          with disabilities. We aim to follow recognized web accessibility standards across
          navigation, forms, color contrast, and keyboard operability.
        </p>

        <h2>Feedback</h2>
        <p>
          If you encounter an accessibility barrier anywhere on GovConUnited, please let us know
          through our <Link href="/contact">Contact Us</Link> page so we can address it.
        </p>
      </div>
    </div>
  );
}
