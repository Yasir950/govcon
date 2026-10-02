"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { revokeCompanyVerificationAction } from "./actions";
import { useToast } from "@/components/toast-provider";
import { VerifiedBadge } from "@/components/verified-badge";

interface VerifiedCompany {
  id: string;
  name: string;
  slug: string;
  type: string;
  reviewedAt: string | null;
  reviewer: string | null;
}

export function VerifiedCompaniesList({ companies }: { companies: VerifiedCompany[] }) {
  const router = useRouter();
  const showToast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function revoke(company: VerifiedCompany) {
    if (!window.confirm(`Remove the verified badge from ${company.name}?`)) return;
    setPendingId(company.id);
    const result = await revokeCompanyVerificationAction(company.id);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Verification revoked");
    router.refresh();
  }

  if (companies.length === 0) {
    return (
      <div className="empty">
        <strong>No verified companies yet</strong>
        Approved verification requests will appear here.
      </div>
    );
  }

  return (
    <div>
      {companies.map((c) => (
        <div className="admin-row" key={c.id}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="admin-row-title">
              <Link href={`/companies/${c.slug}`} target="_blank">
                {c.name}
              </Link>
              <VerifiedBadge />
            </div>
            <div className="admin-row-meta">
              {c.type}
              {c.reviewedAt && ` · Verified ${new Date(c.reviewedAt).toLocaleDateString()}`}
              {c.reviewer && ` by ${c.reviewer}`}
            </div>
          </div>
          <div className="admin-row-actions">
            <Link className="btn btn-outline btn-sm" href={`/admin/companies/${c.id}/edit`}>
              Edit
            </Link>
            <button className="btn btn-outline btn-sm" disabled={pendingId === c.id} onClick={() => revoke(c)}>
              Revoke
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
