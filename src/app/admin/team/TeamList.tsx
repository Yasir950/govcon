"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  setCommunityModeratorAction,
  setMemberPlanAction,
  setMemberRoleAction,
} from "@/app/admin/actions";
import { useToast } from "@/components/toast-provider";
import { ModeratorEligibility } from "@/components/points/ModeratorEligibility";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
  moderatorCommunities: { id: string; name: string }[];
}

export function TeamList({
  members,
  viewerId,
  communities,
}: {
  members: Member[];
  viewerId: string;
  communities: { id: string; name: string }[];
}) {
  const router = useRouter();
  const showToast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [modPickerFor, setModPickerFor] = useState<string | null>(null);
  const [modCommunityId, setModCommunityId] = useState("");

  async function setRole(id: string, role: "member" | "admin") {
    setPendingId(id);
    const result = await setMemberRoleAction(id, role);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(role === "admin" ? "Promoted to admin" : "Removed admin access");
    router.refresh();
  }

  async function setPlan(id: string, plan: "free" | "pro") {
    setPendingId(id);
    const result = await setMemberPlanAction(id, plan);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(plan === "pro" ? "Assigned Pro" : "Removed Pro");
    router.refresh();
  }

  async function addModerator(memberId: string, communityId: string) {
    if (!communityId) return;
    setPendingId(memberId);
    const result = await setCommunityModeratorAction(memberId, communityId, true);
    setPendingId(null);
    setModPickerFor(null);
    setModCommunityId("");
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Assigned as community moderator");
    router.refresh();
  }

  async function removeModerator(memberId: string, communityId: string) {
    setPendingId(memberId);
    const result = await setCommunityModeratorAction(memberId, communityId, false);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Removed moderator status");
    router.refresh();
  }

  return (
    <div>
      {members.map((m) => {
        const modCommunityIds = new Set(m.moderatorCommunities.map((c) => c.id));
        const availableCommunities = communities.filter((c) => !modCommunityIds.has(c.id));
        return (
          <div className="admin-row" key={m.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="admin-row-title is-name">
                  {m.name} {m.id === viewerId && <span className="admin-row-meta">(you)</span>} <ModeratorEligibility userId={m.id} />
                </div>
                <div className="admin-row-meta">{m.email}</div>
              </div>
              <div className="admin-row-actions">
                <span className={`admin-status-pill ${m.role === "admin" ? "admin-status-published" : "admin-status-draft"}`}>
                  {m.role === "admin" ? "Admin" : "Member"}
                </span>
                {m.role === "admin" ? (
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={pendingId === m.id || m.id === viewerId}
                    onClick={() => setRole(m.id, "member")}
                  >
                    Remove admin
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={pendingId === m.id} onClick={() => setRole(m.id, "admin")}>
                    Make admin
                  </button>
                )}
                {m.plan === "pro" ? (
                  <button className="btn btn-outline btn-sm" disabled={pendingId === m.id} onClick={() => setPlan(m.id, "free")}>
                    Remove Pro
                  </button>
                ) : (
                  <button className="btn btn-outline btn-sm" disabled={pendingId === m.id} onClick={() => setPlan(m.id, "pro")}>
                    Assign Pro
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              {m.moderatorCommunities.map((c) => (
                <span key={c.id} className="tag" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  Mod · {c.name}
                  <button
                    type="button"
                    aria-label={`Remove moderator status for ${c.name}`}
                    disabled={pendingId === m.id}
                    onClick={() => removeModerator(m.id, c.id)}
                    style={{ border: 0, background: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {modPickerFor === m.id ? (
                <>
                  <select
                    className="field"
                    style={{ width: "auto", padding: "4px 8px", fontSize: ".82rem" }}
                    value={modCommunityId}
                    onChange={(e) => setModCommunityId(e.target.value)}
                  >
                    <option value="">Choose a community…</option>
                    {availableCommunities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={!modCommunityId || pendingId === m.id}
                    onClick={() => addModerator(m.id, modCommunityId)}
                  >
                    Assign
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setModPickerFor(null);
                      setModCommunityId("");
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button className="btn btn-outline btn-sm" onClick={() => setModPickerFor(m.id)}>
                  + Make moderator
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
