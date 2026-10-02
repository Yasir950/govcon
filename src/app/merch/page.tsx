import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "../(auth)/auth.css";
import "../legal.css";

export const metadata: Metadata = { title: "Merch · GovConUnited" };

export default function MerchPage() {
  return (
    <div className="legal-shell">
      <div className="legal-wrap">
        <Link href="/" className="legal-back">
          ← Back to GovConUnited
        </Link>
        <h1>Merch</h1>

        <p>GovConUnited merchandise isn&rsquo;t available yet. Check back later.</p>
      </div>
    </div>
  );
}
