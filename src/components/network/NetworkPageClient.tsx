"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { removeConnectionAction, respondToConnectionRequestAction } from "@/app/(app)/network/actions";
import { Avatar } from "@/components/avatar";
import { ConnectButton } from "@/components/network/ConnectButton";
import { AvatarStack, PeopleNames } from "@/components/network/PeopleStack";
import { ProBadge } from "@/components/pro-badge";
import { LeaderboardCard } from "@/components/points/LeaderboardCard";
import { useToast } from "@/components/toast-provider";
import type { ConnectionState } from "@/lib/supabase/queries";
import type { NetworkMember } from "@/lib/landing-data";
import { OPEN_TO_GROUPS } from "@/lib/open-to";
import type { Viewer } from "@/lib/supabase/viewer";

type Tab = "connections" | "requests" | "find";

function NetworkStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="network-stat">
      <div className="stat-value">{value}</div>
      <div className="meta">{label}</div>
    </div>
  );
}

function memberSubtitle(member: NetworkMember) {
  return member.headline || `${member.jobTitle || "GovConUnited Member"}${member.companyName ? ` at ${member.companyName}` : ""}`;
}

function NetworkPersonCard({
  member,
  viewer,
  state,
  onChange,
  mutualCount,
  mutuals = [],
}: {
  member: NetworkMember;
  viewer: Viewer | null;
  state: ConnectionState | null;
  onChange: (next: ConnectionState | null) => void;
  mutualCount?: number;
  mutuals?: NetworkMember[];
}) {
  const boosted = (member as NetworkMember & { boosted?: boolean }).boosted;
  return (
    <article className="network-person-card">
      <Link href={`/network/${member.id}`} className="network-person-avatar">
        <Avatar name={member.name} avatarUrl={member.avatarUrl} size={58} />
      </Link>
      <Link href={`/network/${member.id}`} className="network-person-name">
        {member.name} {member.isPro && <ProBadge size={14} />}
        {boosted && <span className="points-boosted">Boosted</span>}
      </Link>
      <span className="network-person-role">{memberSubtitle(member)}</span>
      {mutuals.length > 0 ? (
        <span className="network-mutual has-people">
          <AvatarStack members={mutuals} max={3} size={20} />
          <span>
            <PeopleNames members={mutuals.slice(0, 1)} />
            {mutuals.length > 1 ? ` and ${mutuals.length - 1} other mutual connection${mutuals.length === 2 ? "" : "s"}` : " is a mutual connection"}
          </span>
        </span>
      ) : (
        <span className="network-mutual">
          {mutualCount != null ? `${mutualCount} mutual connection${mutualCount === 1 ? "" : "s"}` : memberSubtitle(member)}
        </span>
      )}
      <div className="network-person-actions">
        <ConnectButton memberId={member.id} memberName={member.name} viewer={viewer} connectionState={state} onChange={onChange} showMessage={false} />
      </div>
    </article>
  );
}

function NetworkConnectionRow({ member, onMore }: { member: NetworkMember; onMore: (member: NetworkMember) => void }) {
  return (
    <div className="network-connection-row">
      <Link href={`/network/${member.id}`} className="network-person-summary">
        <Avatar name={member.name} avatarUrl={member.avatarUrl} size={42} />
        <span><strong>{member.name}</strong><small>{memberSubtitle(member)}</small></span>
      </Link>
      <Link href={`/messages?to=${member.id}`} className="btn btn-outline">Message</Link>
      <button type="button" className="network-more" aria-label={`More actions for ${member.name}`} onClick={() => onMore(member)}>
        •••
      </button>
    </div>
  );
}

export function NetworkPageClient({
  members,
  suggestedMembers = [],
  viewer,
  initialConnectionStates,
  initialConnectionRequests,
  initialMutualConnections,
  includeCareers = false,
}: {
  members: NetworkMember[];
  suggestedMembers?: Array<NetworkMember & { mutualCount: number }>;
  viewer: Viewer | null;
  initialConnectionStates: [string, ConnectionState][];
  initialConnectionRequests: Array<NetworkMember & { connectionId: string }>;
  initialMutualConnections: Record<string, NetworkMember[]>;
  // Verified company accounts can also filter by Careers "open to" choices.
  includeCareers?: boolean;
}) {
  const showToast = useToast();

  // Used to silently copy the generic /network URL — not the member's own
  // profile, and with no feedback, so it looked like nothing happened.
  async function shareProfile() {
    if (!viewer) return;
    const url = `${window.location.origin}/network/${viewer.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${viewer.firstName} ${viewer.lastName} on GovConUnited`.trim(), url });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Profile link copied");
    } catch {
      showToast("Couldn't copy the link — open your profile and copy it from the address bar instead");
    }
  }
  const router = useRouter();
  const pathname = usePathname();
  const [states, setStates] = useState(() => new Map(initialConnectionStates));
  const [requests, setRequests] = useState(initialConnectionRequests);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab = tabParam === "requests" ? "requests" : tabParam === "find" ? "find" : "connections";
  function setTab(next: Tab) {
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  }
  const [query, setQuery] = useState("");
  const [memberFilter, setMemberFilter] = useState<"all" | "pro">("all");
  const [openToFilter, setOpenToFilter] = useState("");
  const [selectedConnection, setSelectedConnection] = useState<NetworkMember | null>(null);
  const [removingConnection, setRemovingConnection] = useState(false);

  function setState(memberId: string, next: ConnectionState | null) {
    setStates((prev) => {
      const copy = new Map(prev);
      if (next) copy.set(memberId, next);
      else copy.delete(memberId);
      return copy;
    });
  }

  async function respond(memberId: string, connectionId: string, accept: boolean, name: string) {
    setRespondingId(memberId);
    const result = await respondToConnectionRequestAction(connectionId, accept);
    setRespondingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }

    setRequests((prev) => prev.filter((r) => r.id !== memberId));
    if (accept) setState(memberId, { connectionId, status: "accepted", requestedByMe: false });
    showToast(accept ? `You're now connected with ${name}` : "Request declined");
  }

  async function removeSelectedConnection() {
    if (!selectedConnection) return;
    const state = states.get(selectedConnection.id);
    if (!state || state.status !== "accepted") return;
    setRemovingConnection(true);
    const result = await removeConnectionAction(state.connectionId);
    setRemovingConnection(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setState(selectedConnection.id, null);
    setSelectedConnection(null);
    showToast("Connection removed");
  }

  const connections = members.filter((m) => states.get(m.id)?.status === "accepted");
  // All of a member's "open to" choices are searchable, not just the 5 shown as tags.
  const findResults = members.filter(
    (m) =>
      (!query || `${m.name} ${m.jobTitle ?? ""} ${m.companyName ?? ""} ${(m.openTo ?? []).join(" ")}`.toLowerCase().includes(query.toLowerCase())) &&
      (memberFilter !== "pro" || m.isPro) &&
      (!openToFilter || (m.openTo ?? []).includes(openToFilter)),
  );
  const connectionResults = connections.filter((m) => !query || `${m.name} ${m.jobTitle ?? ""} ${m.companyName ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const peopleYouMayKnow = suggestedMembers.length > 0 ? suggestedMembers : members.filter((m) => !states.has(m.id)).slice(0, 4).map((m) => ({ ...m, mutualCount: 0 }));
  const mutualCounts = new Map(Object.entries(initialMutualConnections).map(([id, mutuals]) => [id, mutuals.length]));
  const companyCount = new Set(members.map((m) => m.companyName).filter(Boolean)).size;
  const proCount = members.filter((m) => m.isPro).length;
  const pendingCount = requests.length;

  return (
    <>
          {viewer && (
            <div className="network-tabs">
              <button className={tab === "connections" ? "active" : ""} onClick={() => setTab("connections")}>My Connections</button>
              <button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>Connection Requests {pendingCount > 0 && `(${pendingCount})`}</button>
              <button className={tab === "find" ? "active" : ""} onClick={() => setTab("find")}>Find People</button>
            </div>
          )}

          <div className="network-layout">
              <main className="network-main">
                {tab === "connections" && (
                  <>
                    <section className="card panel network-suggestion-panel">
                      <div className="network-section-heading"><h2 className="section-title">People You May Know</h2><button className="link-btn" onClick={() => setTab("find")}>View all</button></div>
                      {peopleYouMayKnow.length === 0 ? (
                        <div className="empty"><strong>No new suggestions right now</strong>You&apos;re already connected with everyone we&apos;d recommend — check Find People to browse everyone.</div>
                      ) : (
                        <div className="network-person-grid">
                          {peopleYouMayKnow.map((m) => <NetworkPersonCard key={m.id} member={m} mutualCount={mutualCounts.get(m.id) ?? m.mutualCount} mutuals={initialMutualConnections[m.id]} viewer={viewer} state={states.get(m.id) ?? null} onChange={(next) => setState(m.id, next)} />)}
                        </div>
                      )}
                    </section>
                    <section className="card panel">
                      <div className="network-section-heading"><h2 className="section-title">My Connections ({connections.length})</h2><input className="field network-inline-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search connections..." /></div>
                      <div className="network-connection-list">
                        {connectionResults.map((m) => <NetworkConnectionRow key={m.id} member={m} onMore={setSelectedConnection} />)}
                        {connectionResults.length === 0 && <div className="empty"><strong>You haven&apos;t connected with anyone yet</strong>Connect with people from Find People to build your network.</div>}
                      </div>
                    </section>
                  </>
                )}

                {tab === "requests" && (
                  <section className="card panel">
                    <div className="network-section-heading"><h2 className="section-title">Connection Requests</h2>{pendingCount > 0 && <span className="network-pending-badge">{pendingCount} pending</span>}</div>
                    <div className="network-request-list">
                      {requests.map((r) => (
                        <div className="network-request-row" key={r.id}>
                          <Link href={`/network/${r.id}`} className="network-person-summary"><Avatar name={r.name} avatarUrl={r.avatarUrl} size={48} /><span><strong>{r.name}</strong><small>{memberSubtitle(r)}</small></span></Link>
                          <span className="network-mutual">Request received</span>
                          <div className="network-action-group"><button className="btn btn-primary" disabled={respondingId === r.id} onClick={() => respond(r.id, r.connectionId, true, r.name)}>Accept</button><button className="btn btn-outline" disabled={respondingId === r.id} onClick={() => respond(r.id, r.connectionId, false, r.name)}>Decline</button></div>
                        </div>
                      ))}
                      {requests.length === 0 && <div className="empty"><strong>No pending connection requests</strong>Requests other members send you will show up here.</div>}
                    </div>
                  </section>
                )}

                {tab === "find" && (
                  <section className="card panel">
                    <div className="network-find-toolbar"><input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search professionals..." /><select className="field" aria-label="Filter members" value={memberFilter} onChange={(e) => setMemberFilter(e.target.value as "all" | "pro")}><option value="all">All members</option><option value="pro">Pro members</option></select><select className="field" aria-label="Filter by open to" value={openToFilter} onChange={(e) => setOpenToFilter(e.target.value)}><option value="">Open to: anything</option>{OPEN_TO_GROUPS.filter((g) => includeCareers || !("careers" in g)).map((g) => <optgroup key={g.label} label={g.label}>{g.options.map((o) => <option key={o} value={o}>{o}</option>)}</optgroup>)}</select></div>
                    <div className="network-person-grid network-find-grid">{findResults.map((m) => <NetworkPersonCard key={m.id} member={m} mutualCount={mutualCounts.get(m.id)} mutuals={initialMutualConnections[m.id]} viewer={viewer} state={states.get(m.id) ?? null} onChange={(next) => setState(m.id, next)} />)}{findResults.length === 0 && <div className="empty"><strong>No professionals match this search</strong>Try a different name or filter.</div>}</div>
                  </section>
                )}
              </main>

              <aside className="network-sidebar">
                <section className="card panel"><h2 className="section-title">Network Overview</h2><div className="network-stat-grid"><NetworkStat value={connections.length} label="Total connections" /><NetworkStat value={members.length} label="Network members" /><NetworkStat value={pendingCount} label="Pending requests" /><NetworkStat value={proCount} label="Pro members" /><NetworkStat value={companyCount} label="Companies represented" /><NetworkStat value={findResults.length} label="People discoverable" /></div></section>
                <section className="card panel network-grow-panel"><h2 className="section-title">Grow Your Network</h2><button className="link-btn" onClick={() => setTab("find")}>Find people</button><button className="link-btn" onClick={shareProfile}>Share your profile</button></section>
                <LeaderboardCard board="network" title="Network builders" subtitle="Accepted connections and active invitees this month" unit="pts" />
              </aside>
          </div>
      {selectedConnection && (
        <div className="network-modal-backdrop" role="presentation" onClick={() => setSelectedConnection(null)}>
          <section className="network-connection-modal" role="dialog" aria-modal="true" aria-labelledby="connection-options-title" onClick={(event) => event.stopPropagation()}>
            <header className="network-modal-header">
              <h2 id="connection-options-title">{selectedConnection.name} — Connection Options</h2>
              <button type="button" className="network-modal-close" aria-label="Close connection options" onClick={() => setSelectedConnection(null)}>×</button>
            </header>
            <div className="network-modal-body">
              <div className="network-modal-detail"><span>Headline</span><strong>{memberSubtitle(selectedConnection)}</strong></div>
              <div className="network-modal-detail"><span>Company</span><strong>{selectedConnection.companyName || "GovConUnited"}</strong></div>
              <div className="network-modal-detail">
                <span>Mutual connections</span>
                <strong>{initialMutualConnections[selectedConnection.id]?.length ?? 0}</strong>
                {!!initialMutualConnections[selectedConnection.id]?.length && (
                  <div className="network-mutual-list">
                    {initialMutualConnections[selectedConnection.id].map((mutual) => (
                      <Link href={`/network/${mutual.id}`} className="network-mutual-person" key={mutual.id} onClick={() => setSelectedConnection(null)}>
                        <Avatar name={mutual.name} avatarUrl={mutual.avatarUrl} size={32} />
                        <span>{mutual.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <footer className="network-modal-actions">
              <Link href={`/network/${selectedConnection.id}`} className="btn btn-outline" onClick={() => setSelectedConnection(null)}>View Profile</Link>
              <Link href={`/messages?to=${selectedConnection.id}`} className="btn btn-outline" onClick={() => setSelectedConnection(null)}>Message</Link>
              <button type="button" className="btn btn-danger" disabled={removingConnection} onClick={removeSelectedConnection}>Remove Connection</button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
