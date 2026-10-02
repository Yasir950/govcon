import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "../(auth)/auth.css";
import "../legal.css";

export const metadata: Metadata = { title: "Blog · GovConUnited" };

export default function BlogPage() {
  return (
    <div className="legal-shell">
      <div className="legal-wrap">
        <Link href="/" className="legal-back">
          ← Back to GovConUnited
        </Link>
        <h1>Blog</h1>

        <p>We haven&rsquo;t published any blog posts yet. Check back soon.</p>

        <h2>Looking for GovCon discussion instead?</h2>
        <p>
          Visit our <Link href="/community">Community</Link> for real conversations from
          government contracting professionals, or browse our{" "}
          <Link href="/resources">Resources</Link> library for guides and templates.
        </p>
      </div>
    </div>
  );
}
