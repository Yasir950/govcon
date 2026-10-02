import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "./auth.css";
import { getPlatformMetrics, getTestimonials } from "@/lib/supabase/queries";
import { TestimonialCarousel } from "./testimonial-carousel";

export const metadata: Metadata = {
  title: "GovConUnited",
};

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [testimonials, metrics] = await Promise.all([getTestimonials(), getPlatformMetrics()]);
  const metricByLabel = Object.fromEntries(metrics.map((m) => [m.label, m.value]));

  // Real row counts from the database, not fixed marketing numbers — see
  // getPlatformMetrics() for why.
  const visualFeatures = [
    `${metricByLabel.Opportunities ?? 0} Government contracting opportunities`,
    `${metricByLabel.Companies ?? 0} Verified companies`,
    `${metricByLabel.Professionals ?? 0} GovCon professionals`,
    `${metricByLabel.Jobs ?? 0} Jobs`,
    `${metricByLabel.Events ?? 0} Events`,
  ];

  return (
    <div className="auth-shell">
      <aside
        className="auth-visual"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(6,26,73,.55) 0%, rgba(6,26,73,.72) 45%, rgba(6,26,73,.94) 100%), url(/images/Team.png)",
        }}
      >
        <div className="auth-visual-glow" aria-hidden="true" />

        <Link href="/" className="auth-visual-logo" aria-label="GovConUnited home">
          <img src="/images/logo.svg" alt="GovConUnited" />
        </Link>

        <div className="auth-visual-copy">
          <h1>
            Connect. Collaborate.
            <br />
            <span className="accent">Win Government Work.</span>
          </h1>
          <p>
            GovConUnited connects government contractors, subcontractors, consultants,
            suppliers, and GovCon professionals in one collaborative government
            contracting network. Build strategic teaming partnerships, find qualified
            subcontractors, connect with trusted industry professionals, discover
            government contracting opportunities, and grow your public-sector business
            through relationships built to compete and win together.
          </p>
          <ul className="auth-visual-features">
            {visualFeatures.map((feature) => (
              <li key={feature}>
                <svg className="check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="m8 12.5 2.5 2.5L16 9.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {feature}
              </li>
            ))}
          </ul>

          <TestimonialCarousel testimonials={testimonials} />
        </div>

        <div className="auth-visual-footer">
          © 2026 GovConUnited, LLC.{" "}
          <a href="https://robbcc.com/" target="_blank" rel="noopener noreferrer">
            A Robb Industrial Co.
          </a>
        </div>
      </aside>

      <div className="auth-panel">
        <div className="auth-card">
          <Link href="/" className="auth-logo" aria-label="GovConUnited home">
            <img src="/images/logo-black.svg" alt="GovConUnited" />
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
