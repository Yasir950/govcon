import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "../(auth)/auth.css";
import "../legal.css";

export const metadata: Metadata = { title: "About · GovConUnited" };

export default function AboutPage() {
  return (
    <div className="legal-shell">
      <div className="legal-wrap">
        <Link href="/" className="legal-back">
          ← Back to GovConUnited
        </Link>
        <h1>About GovConUnited</h1>

        <p>
          GovConUnited connects government contractors, subcontractors, consultants, suppliers,
          and GovCon professionals in one collaborative government contracting network. We built
          GovConUnited around teaming, subcontracting, and more — helping members build strategic
          partnerships, find qualified subcontractors, connect with trusted industry
          professionals, discover government contracting opportunities, and grow their
          public-sector business through relationships built to compete and win together.
        </p>

        <h2>What we offer</h2>
        <p>
          A real, verified company directory; company-posted teaming and subcontracting
          opportunities; employment and contract-role job listings; events and webinars for the
          GovCon community; and a professional network built specifically for people who work in
          or around government contracting.
        </p>

        <h2>Ownership</h2>
        <p>
          GovConUnited, LLC is{" "}
          <a href="https://robbcc.com/" target="_blank" rel="noopener noreferrer">
            A Robb Industrial Co.
          </a>
        </p>

        <h2>Questions</h2>
        <p>
          Reach out through our <Link href="/contact">Contact Us</Link> page.
        </p>
      </div>
    </div>
  );
}
