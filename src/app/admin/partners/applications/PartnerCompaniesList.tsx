"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { revokeCompanyPartnerAction } from "./actions";
import { PartnerBadge } from "@/components/partner-badge";
import { useToast } from "@/components/toast-provider";

export interface PartnerCompany {
  id: string;
  name: string;
  slug: string;
  partnerType: string | null;
  partnerSince: string | null;
  businessEmail: string | null;
}

export function PartnerCompaniesList({ companies }: { companies: PartnerCompany[] }) {
  const router = useRouter();
  const showToast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function revoke(c: PartnerCompany) {
    if (!window.confirm(`Remove ${c.name} as a GovConUnited Partner?`)) return;
    setPendingId(c.id);
    const result = await revokeCompanyPartnerAction(c.id);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Partner removed");
    router.refresh();
  }

  if (companies.length === 0) {
    return (
      <div className="empty">
        <strong>No Partner companies yet</strong>
        Companies appear here once their partner application is approved.
      </div>
    );
  }

  return (
    <div>
      {companies.map((c) => (
        <div className="admin-row" key={c.id}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="admin-row-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Link href={`/companies/${c.slug}`} target="_blank">
                {c.name}
              </Link>
              <PartnerBadge partnerType={c.partnerType} />
            </div>
            <div className="admin-row-meta">
              {c.partnerType ?? "Partner"}
              {c.partnerSince && ` · Partner since ${new Date(c.partnerSince).toLocaleDateString()}`}
              {c.businessEmail && (
                <>
                  {" · "}
                  <a href={`mailto:${c.businessEmail}`}>{c.businessEmail}</a>
                </>
              )}
            </div>
          </div>
          <div className="admin-row-actions">
            <Link className="btn btn-outline btn-sm" href={`/admin/companies/${c.id}/edit`}>
              Edit company
            </Link>
            <button className="btn btn-outline btn-sm" disabled={pendingId === c.id} onClick={() => revoke(c)}>
              Remove Partner
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
