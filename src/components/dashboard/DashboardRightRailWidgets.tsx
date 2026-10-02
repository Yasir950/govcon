"use client";

import Link from "next/link";
import { useState } from "react";
import { respondToConnectionRequestAction } from "@/app/(app)/network/actions";
import { Avatar as SharedAvatar } from "@/components/avatar";
import { RelationshipActions } from "@/components/network/RelationshipActions";
import { ProBadge } from "@/components/pro-badge";
import { useToast } from "@/components/toast-provider";
import { useOnlinePresence } from "@/components/OnlinePresenceProvider";
import type { NetworkMember } from "@/lib/landing-data";
import type { NewMemberEntry } from "@/lib/supabase/queries";

function Avatar({ name, avatarUrl, small }: { name: string; avatarUrl?: string | null; small?: boolean }) {
  return <SharedAvatar name={name} avatarUrl={avatarUrl} size={small ? 38 : 92} />;
}

// LinkedIn's "My Network" surfaces pending invitations up front instead of
// burying them in the general notification bell — this is that widget,
// sitting where a generic "Resources" promo used to be. Real pending
// requests only; accepting/declining here is the same
// respondToConnectionRequestAction the full /network Requests tab uses.
export function NetworkRequestsCard({
  initialRequests,
}: {
  initialRequests: Array<NetworkMember & { connectionId: string }>;
}) {
  const showToast = useToast();
  const [requests, setRequests] = useState(initialRequests);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const onlineIds = useOnlinePresence();

  if (requests.length === 0) return null;

  async function respond(memberId: string, connectionId: string, accept: boolean, name: string) {
    setRespondingId(memberId);
    const result = await respondToConnectionRequestAction(connectionId, accept);
    setRespondingId(null);
    if (result.error) return showToast(result.error);
    setRequests((prev) => prev.filter((r) => r.id !== memberId));
    showToast(accept ? `You're now connected with ${name}` : "Request declined");
  }

  const preview = requests.slice(0, 2);

  return (
    <section className="card panel">
      <div className="panel-head">
        <h2 className="section-title">Networks</h2>
        <Link href="/network" className="link-btn">
          See all
        </Link>
      </div>
      <div className="meta" style={{ marginBottom: 10 }}>
        {requests.length} invitation{requests.length === 1 ? "" : "s"}
      </div>
      {preview.map((r) => (
        <div key={r.id} className="home-suggested" style={{ marginBottom: 12 }}>
          <Link href={`/network/${r.id}`} style={{ position: "relative", display: "inline-flex" }}>
            <Avatar name={r.name} avatarUrl={r.avatarUrl} small />
            {onlineIds.has(r.id) && <span className="online-dot" aria-label="Online" />}
          </Link>
          <span style={{ flex: 1, minWidth: 0 }}>
            <Link href={`/network/${r.id}`} className="mini-row-title is-name" style={{ textDecoration: "none" }}>
              {r.name}
              {r.isPro && <ProBadge size={14} />}
            </Link>
            {(r.headline || r.jobTitle) && (
              <span className="meta" style={{ display: "block" }}>
                {r.headline || r.jobTitle}
              </span>
            )}
            <span className="meta" style={{ display: "block" }}>
              wants to connect
            </span>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" disabled={respondingId === r.id} onClick={() => respond(r.id, r.connectionId, true, r.name)}>
                Accept
              </button>
              <button className="btn btn-outline" disabled={respondingId === r.id} onClick={() => respond(r.id, r.connectionId, false, r.name)}>
                Ignore
              </button>
            </div>
          </span>
        </div>
      ))}
    </section>
  );
}

// Real "New members" — the most recently joined real accounts, filling
// what used to be dead space next to Upcoming Events, with real Connect/
// Follow actions instead of a promo card.
export function NewMembersCard({ members }: { members: NewMemberEntry[] }) {
  const onlineIds = useOnlinePresence();
  if (members.length === 0) return null;
  return (
    <section className="card panel">
      <div className="panel-head">
        <h2 className="section-title">New Members</h2>
        <Link href="/network" className="link-btn">
          See all
        </Link>
      </div>
      {members.map((m) => (
        <div key={m.id} className="home-suggested" style={{ marginBottom: 12 }}>
          <Link href={`/network/${m.id}`} style={{ position: "relative", display: "inline-flex" }}>
            <Avatar name={m.name} avatarUrl={m.avatarUrl} small />
            {onlineIds.has(m.id) && <span className="online-dot" aria-label="Online" />}
          </Link>
          <span style={{ flex: 1, minWidth: 0 }}>
            <Link href={`/network/${m.id}`} className="mini-row-title is-name" style={{ textDecoration: "none" }}>
              {m.name}
              {m.isPro && <ProBadge size={14} />}
            </Link>
            <span className="meta" style={{ display: "block" }}>
              {m.headline || m.jobTitle || "GovConUnited Member"}
            </span>
            <div style={{ marginTop: 8 }}>
              <RelationshipActions memberId={m.id} isConnection={m.isConnection} initialFollowing={m.isFollowing} />
            </div>
          </span>
        </div>
      ))}
    </section>
  );
}
