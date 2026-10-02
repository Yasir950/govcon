import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "./ContactForm";
import "../landing.css";
import "../(auth)/auth.css";
import "../legal.css";

export const metadata: Metadata = { title: "Contact Us · GovConUnited" };

export default function ContactPage() {
  return (
    <div className="legal-shell">
      <div className="legal-wrap">
        <Link href="/" className="legal-back">
          ← Back to GovConUnited
        </Link>
        <h1>Contact Us</h1>
        <p>Send us a message and we&rsquo;ll get back to you.</p>
        <ContactForm />
      </div>
    </div>
  );
}
