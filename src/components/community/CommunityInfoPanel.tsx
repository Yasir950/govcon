"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  declineCommunityInviteAction,
  joinCommunityAction,
  leaveCommunityAction,
} from "@/app/(app)/communities/actions";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import type { Community, CommunityMembership } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

// The discussion detail page's right-rail "about this community" card —
// same real member/post counts and the same policy-aware Join button
// logic CommunityPageClient's page-head already has, just packaged as its
// own small client component since a server page can't own this state.
export function CommunityInfoPanel({
  community,
  initialMembership,
  viewer,
}: {
  community: Community;
  initialMembership: CommunityMembership | null;
  viewer: Viewer | null;
}) {
  const router = useRouter();
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const [membership, setMembership] = useState(initialMembership);

  async function toggleJoin() {
    const status = membership?.status ?? "none";
    if (status !== "none") {
      setMembership((m) => (m ? { ...m, status: "none" } : m));
      const result = await leaveCommunityAction(community.id);
      if (result.error) showToast(result.error);
      else showToast(status === "pending" ? "Request canceled" : `Left ${community.name}`);
    } else {
      const result = await joinCommunityAction(community.id);
      if (result.error) {
        showToast(result.error);
      } else {
        setMembership((m) => ({
          status: result.status ?? "active",
          role: m?.role ?? "member",
          isOwner: m?.isOwner ?? false,
          invited: false,
        }));
        showToast(result.status === "pending" ? "Request sent" : `Joined ${community.name}`);
      }
    }
    router.refresh();
  }

  async function declineInvite() {
    if (!membership) return;
    const result = await declineCommunityInviteAction(community.id);
    if (result.error) return showToast(result.error);
    setMembership({ ...membership, invited: false });
    showToast("Invite declined");
  }

  const status = membership?.status ?? "none";

  return (
    <section className="card panel community-about">
      <h2>
        {community.name}
        {community.visibility === "pro_only" && (
          <span className="tag" style={{ marginLeft: 8 }}>
            Pro Only
          </span>
        )}
      </h2>
      <p>{community.description}</p>
      {community.topic && (
        <p style={{ marginTop: 6 }}>
          <strong>Topic:</strong> {community.topic}
        </p>
      )}
      {community.rules && (
        <div style={{ marginTop: 6 }}>
          <strong>Rules</strong>
          <p className="meta" style={{ whiteSpace: "pre-wrap" }}>
            {community.rules}
          </p>
        </div>
      )}
      <div className="about-stats">
        <div className="about-stat">
          <b>{community.memberCount.toLocaleString()}</b>
          <span>Members</span>
        </div>
        <div className="about-stat">
          <b>{community.postCount.toLocaleString()}</b>
          <span>Posts</span>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        {(() => {
          if (status === "active" || status === "muted") {
            return (
              <button className="btn btn-outline btn-full" onClick={() => requireAuth(toggleJoin)}>
                {status === "muted" ? "Joined (Muted)" : "Joined"}
              </button>
            );
          }
          if (status === "pending") {
            return (
              <button className="btn btn-outline btn-full" onClick={() => requireAuth(toggleJoin)}>
                Requested
              </button>
            );
          }
          if (community.visibility === "pro_only" && viewer?.planSelection !== "pro") {
            return (
              <a href="/billing" className="btn btn-primary btn-full">
                Upgrade to Pro to Join
              </a>
            );
          }
          if (community.membershipPolicy === "invite_only" && !membership?.invited) {
            return (
              <button className="btn btn-outline btn-full" disabled title="This community is invite-only.">
                Invite Only
              </button>
            );
          }
          if (community.membershipPolicy === "invite_only" && membership?.invited) {
            return (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary btn-full" onClick={() => requireAuth(toggleJoin)}>
                  Accept Invite
                </button>
                <button className="btn btn-outline btn-full" onClick={() => requireAuth(declineInvite)}>
                  Decline
                </button>
              </div>
            );
          }
          return (
            <button className="btn btn-primary btn-full" onClick={() => requireAuth(toggleJoin)}>
              {community.membershipPolicy === "request" ? "Request to Join" : "Join Community"}
            </button>
          );
        })()}
      </div>
    </section>
  );
}
