"use client";

import Link from "next/link";
import { useState } from "react";
import { grantCompanyAdminAction, revokeCompanyAdminAction } from "@/app/admin/companies/admins-actions";
import { useToast } from "@/components/toast-provider";

export interface CompanyAdminRow {
  id: string;
  profilePath: string;
  name: string;
  email: string;
}

export function CompanyAdminsManager({ companyId, initialAdmins }: { companyId: string; initialAdmins: CompanyAdminRow[] }) {
  const showToast = useToast();
  const [admins, setAdmins] = useState(initialAdmins);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function grant() {
    if (!email.trim()) return;
    setPending(true);
    const result = await grantCompanyAdminAction(companyId, email);
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Access granted");
    setEmail("");
    window.location.reload();
  }

  async function revoke(id: string) {
    setAdmins((prev) => prev.filter((a) => a.id !== id));
    const result = await revokeCompanyAdminAction(id, companyId);
    if (result.error) showToast(result.error);
  }

  return (
    <div className="card panel" style={{ marginTop: 20, maxWidth: 640 }}>
      <h2 className="section-title">Authorized Job Posters</h2>
      <p className="meta">
        Members granted access here can post/edit/close jobs on behalf of this company (requires their account to also be on the Pro plan).
      </p>
      <div style={{ marginTop: 10 }}>
        {admins.length === 0 ? (
          <p className="meta">No authorized posters yet.</p>
        ) : (
          admins.map((a) => (
            <div className="list-row" key={a.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1 }}>
                <Link href={a.profilePath} className="link-btn" target="_blank">
                  {a.name}
                </Link>{" "}
                <span className="meta">({a.email})</span>
              </span>
              <button className="link-btn" style={{ color: "var(--o-muted)" }} onClick={() => revoke(a.id)}>
                Revoke
              </button>
            </div>
          ))
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input className="field" style={{ flex: 1 }} placeholder="Member email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={grant}>
          Grant Access
        </button>
      </div>
    </div>
  );
}
