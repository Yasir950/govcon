import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "../(auth)/auth.css";
import "../legal.css";

export const metadata: Metadata = { title: "Press · GovConUnited" };

export default function PressPage() {
  return (
    <div className="legal-shell">
      <div className="legal-wrap">
        <Link href="/" className="legal-back">
          ← Back to GovConUnited
        </Link>
        <h1>Press</h1>

        <p>There&rsquo;s no press coverage to share yet. Check back as GovConUnited grows.</p>

        <h2>Media inquiries</h2>
        <p>
          For press or media inquiries, please reach out through our{" "}
          <Link href="/contact">Contact Us</Link> page.
        </p>
      </div>
    </div>
  );
}
