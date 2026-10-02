"use client";

import { useState } from "react";
import { sendTeamingInquiryAction, type TeamingRoleType } from "@/app/(app)/opportunities/[slug]/teaming-actions";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import { toneFor } from "@/lib/avatar-tone";
import type { RecommendedPartner } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

const ROLE_LABEL: Record<string, string> = {
  prime: "Prime",
  sub: "Subcontractor",
  supplier: "Supplier",
  consultant: "Consultant",
  joint_venture: "Joint Venture",
  mentor_protege: "Mentor-Protégé",
};

export function OpportunityRecommendedPartners({
  opportunityId,
  partners,
  viewer,
}: {
  opportunityId: string;
  partners: RecommendedPartner[];
  viewer: Viewer | null;
}) {
  const requireAuth = useRequireAuth(viewer);
  const showToast = useToast();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [role, setRole] = useState<TeamingRoleType>("sub");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (partners.length === 0) return null;

  async function send(recipientProfileId: string) {
    setSending(true);
    const result = await sendTeamingInquiryAction({ opportunityId, recipientProfileId, requestedRole: role, message });
    setSending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setOpenFor(null);
    setMessage("");
    showToast("Teaming inquiry sent");
  }

  return (
    <section className="card panel">
      <h2 className="section-title">Recommended Teaming Partners</h2>
      <p className="meta">Members whose capabilities match this opportunity.</p>
      <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
        {partners.map((p) => (
          <div key={p.profileId} className="list-row" style={{ display: "block" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="company-logo-avatar sm" data-tone={toneFor(p.name)} role="img" aria-label={p.name}>
                {p.name.slice(0, 2).toUpperCase()}
              </span>
              <div style={{ flex: 1 }}>
                <strong style={{ display: "block", fontSize: ".86rem" }}>{p.name}</strong>
                <span className="meta">{p.companyName ?? "Independent"}</span>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => requireAuth(() => setOpenFor(openFor === p.profileId ? null : p.profileId))}>
                Request Teaming
              </button>
            </div>
            <div style={{ marginTop: 6 }}>
              {p.matchReasons.map((r) => (
                <span className="tag" key={r}>
                  {r}
                </span>
              ))}
            </div>
            {openFor === p.profileId && (
              <div className="card panel" style={{ marginTop: 8, display: "grid", gap: 8 }}>
                <select className="select" value={role} onChange={(e) => setRole(e.target.value as TeamingRoleType)}>
                  {Object.entries(ROLE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      Requesting: {label}
                    </option>
                  ))}
                </select>
                <textarea
                  className="textarea"
                  placeholder="Introduce your capabilities and what role you're proposing..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary btn-sm" disabled={sending} onClick={() => send(p.profileId)}>
                    {sending ? "Sending…" : "Send Inquiry"}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => setOpenFor(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
