"use client";

import Link from "next/link";
import { useState } from "react";
import {
  inviteCompanyAdminAction,
  removeCompanyAdminAction,
} from "@/app/companies/admin-actions";
import { useToast } from "@/components/toast-provider";

export interface CompanyTeamRow {
  id: string;
  profilePath: string;
  name: string;
  email: string;
  role: "owner" | "admin";
}

// Owner-facing counterpart to admin/CompanyAdminsManager.tsx — the same
// grant/revoke shape, but backed by inviteCompanyAdminAction/
// removeCompanyAdminAction (owner-gated, not platform-admin-gated).
export function OwnerCompanyAdminsManager({
  companyId,
  initialTeam,
}: {
  companyId: string;
  initialTeam: CompanyTeamRow[];
}) {
  const showToast = useToast();
  const [team, setTeam] = useState(initialTeam);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function invite() {
    if (!email.trim()) return;
    setPending(true);
    const result = await inviteCompanyAdminAction(companyId, email, "admin");
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Team member added");
    setEmail("");
    window.location.reload();
  }

  async function remove(id: string) {
    setTeam((prev) => prev.filter((a) => a.id !== id));
    const result = await removeCompanyAdminAction(id, companyId);
    if (result.error) showToast(result.error);
  }

  return (
    <div className="card panel">
      <h2 className="section-title">Team & Access</h2>
      <p className="meta">
        Members added here can manage this company's profile, jobs,
        opportunities, and past performance.
      </p>
      <div style={{ marginTop: 10 }}>
        {team.length === 0 ? (
          <p className="meta">No team members yet.</p>
        ) : (
          team.map((a) => (
            <div
              className="list-row"
              key={a.id}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <span style={{ flex: 1 }}>
                <Link href={a.profilePath} className="link-btn">
                  {a.name}
                </Link>{" "}
                <span className="meta">
                  ({a.email}) — {a.role === "owner" ? "Owner" : "Admin"}
                </span>
              </span>
              {a.role !== "owner" && (
                <button
                  className="link-btn"
                  style={{ color: "var(--o-muted)" }}
                  onClick={() => remove(a.id)}
                >
                  Remove
                </button>
              )}
            </div>
          ))
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <input
          className="field"
          style={{ flex: 1 }}
          placeholder="Member email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={invite}
        >
          Add to Team
        </button>
      </div>
    </div>
  );
}
