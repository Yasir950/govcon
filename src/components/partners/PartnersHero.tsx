"use client";

import { usePartnerModal } from "@/components/partners/PartnerModalProvider";

// Split out of PartnersPageClient so this static marketing hero renders
// immediately — it never has to wait on the companies fetch below it.
export function PartnersHero() {
  const { openApplication, openBenefits } = usePartnerModal();

  return (
    <section className="card partners-hero">
      <div className="partners-hero-copy">
        <span className="partners-eyebrow">GovConUnited Partner Network</span>
        <h1 style={{ color: "#fff" }}>Build stronger partnerships. Win bigger opportunities.</h1>
        <p style={{ color: "rgba(255,255,255,.88)" }}>
          Connect with trusted technology providers, service firms, and government contracting experts who help
          members grow.
        </p>
        <div className="head-actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn" onClick={openApplication} style={{ background: "#fff", color: "var(--o-blue-dark)" }}>
            Become a Partner
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={openBenefits}
            style={{ borderColor: "rgba(255,255,255,.75)", color: "#fff", background: "transparent" }}
          >
            Partner Benefits
          </button>
        </div>
      </div>
    </section>
  );
}
