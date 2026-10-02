"use client";

import { useState, type CSSProperties } from "react";
import { sendConnectionRequestAction } from "@/app/(app)/network/actions";
import { toggleProfileFollowAction } from "@/app/(app)/network/profile-actions";
import { useSignInPrompt } from "@/components/sign-in-prompt-provider";
import { useToast } from "@/components/toast-provider";
import type { Viewer } from "@/lib/supabase/viewer";

export const pillBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 26,
  padding: "0 10px",
  borderRadius: 14,
  fontSize: 12,
  fontWeight: 400,
  cursor: "pointer",
  whiteSpace: "nowrap",
  background: "#fff",
};

export type RelationshipState = ReturnType<typeof useRelationshipActions>;

// The Connect/Follow state + actions on their own, so one surface can drive
// several controls from the same state (the feed post header shows pills on
// desktop but moves them into the "⋯" menu on mobile).
export function useRelationshipActions({
  memberId,
  initialFollowing,
  initialPending = false,
  viewer,
}: {
  memberId: string;
  initialFollowing: boolean;
  // A connection request already exists (either direction) — show
  // "Pending" instead of offering Connect again.
  initialPending?: boolean;
  viewer?: Viewer | null;
}) {
  const showToast = useToast();
  const promptSignIn = useSignInPrompt();
  const [connectSent, setConnectSent] = useState(initialPending);
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  async function connect() {
    if (pending) return;
    if (viewer === null) {
      promptSignIn({ message: "Sign in or create a free account to connect with other GovCon professionals." });
      return;
    }
    setPending(true);
    const result = await sendConnectionRequestAction(memberId);
    setPending(false);
    if (result.error) return showToast(result.error);
    setConnectSent(true);
    showToast("Connection request sent");
  }

  async function toggleFollow() {
    if (pending) return;
    if (viewer === null) {
      promptSignIn({ message: "Sign in or create a free account to follow other GovCon professionals." });
      return;
    }
    setPending(true);
    const result = await toggleProfileFollowAction(memberId);
    setPending(false);
    if (result.error) return showToast(result.error);
    setFollowing(result.following);
  }

  return { connectSent, following, pending, connect, toggleFollow };
}

// Compact, LinkedIn-style Connect/Follow pills — shared by the feed's post
// header, member-list popovers (who reacted/reposted), and the dashboard's
// "New members" widget, so there's exactly one real Connect/Follow
// implementation instead of one per surface.
export function RelationshipActions({
  memberId,
  isConnection,
  initialFollowing,
  initialPending,
  viewer,
  state,
}: {
  memberId: string;
  isConnection: boolean;
  initialFollowing: boolean;
  initialPending?: boolean;
  // Optional and only enforced when explicitly passed — existing callers
  // (feed post header, member-list popovers, dashboard's "New members"
  // widget) only ever render this where a viewer is already known to be
  // signed in, so they're unaffected by leaving it out. Passed as
  // `null` from a surface reachable while signed out (People You May Know
  // on the member profile page) to swap the direct action call for a
  // sign-in popup instead of letting the server action fail silently.
  viewer?: Viewer | null;
  // Externally-owned state (from useRelationshipActions) when the caller
  // also exposes these actions elsewhere and needs them kept in sync.
  state?: RelationshipState;
}) {
  const ownState = useRelationshipActions({ memberId, initialFollowing, initialPending, viewer });
  const { connectSent, following, pending, connect, toggleFollow } = state ?? ownState;

  return (
    <div style={{ display: "flex", gap: 6, flex: "none" }}>
      {!isConnection && (
        <button
          style={{ ...pillBase, border: "1px solid var(--o-blue)", color: connectSent ? "var(--o-muted)" : "var(--o-blue)" }}
          disabled={connectSent || pending}
          onClick={connect}
        >
          {connectSent ? "Pending" : "+ Connect"}
        </button>
      )}
      <button
        style={{
          ...pillBase,
          border: `1px solid ${following ? "var(--o-line)" : "var(--o-blue)"}`,
          color: following ? "var(--o-muted)" : "var(--o-blue)",
        }}
        disabled={pending}
        onClick={toggleFollow}
      >
        {following ? "Following" : "+ Follow"}
      </button>
    </div>
  );
}
