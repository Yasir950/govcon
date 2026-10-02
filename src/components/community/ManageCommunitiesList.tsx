"use client";

import { useState } from "react";
import Link from "next/link";
import { leaveCommunityAction } from "@/app/(app)/communities/actions";
import { useToast } from "@/components/toast-provider";
import type { MyMembershipRow } from "@/lib/supabase/queries";

export function ManageCommunitiesList({ memberships }: { memberships: MyMembershipRow[] }) {
  const showToast = useToast();
  const [rows, setRows] = useState(memberships);

  async function handleLeave(row: MyMembershipRow) {
    setRows((prev) => prev.filter((r) => r.communityId !== row.communityId));
    const result = await leaveCommunityAction(row.communityId);
    if (result.error) {
      setRows((prev) => [...prev, row]);
      showToast(result.error);
      return;
    }
    showToast(row.status === "pending" ? "Request canceled" : `Left ${row.communityName}`);
  }

  if (rows.length === 0) {
    return (
      <section className="card empty">
        <strong>No communities yet</strong>
        Join a community from the Community page to see it here.
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => (
        <section key={row.communityId} className="card panel" style={{ display: "flex", alignItems: "center", gap: 12, padding: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link href={`/communities/${row.communitySlug}`} style={{ fontWeight: 700 }}>
              {row.communityName}
            </Link>
            <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="tag">{row.status === "active" ? "Active" : row.status === "pending" ? "Pending" : "Muted"}</span>
              {(row.role === "moderator" || row.isOwner) && <span className="tag">{row.isOwner ? "Owner" : "Moderator"}</span>}
            </div>
          </div>
          {(row.role === "moderator" || row.isOwner) && (
            <Link href={`/communities/${row.communitySlug}`} className="btn btn-outline">
              Manage →
            </Link>
          )}
          <button type="button" className="btn btn-outline" onClick={() => handleLeave(row)}>
            {row.status === "pending" ? "Cancel Request" : "Leave"}
          </button>
        </section>
      ))}
    </div>
  );
}
