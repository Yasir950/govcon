"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { ProBadge } from "@/components/pro-badge";
import type { NetworkMember } from "@/lib/landing-data";

// Overlapping row of real member avatars (photo or initials), e.g. the
// "followed by" strip on a company profile. Each avatar links to the
// member's profile.
export function AvatarStack({ members, max = 5, size = 28 }: { members: NetworkMember[]; max?: number; size?: number }) {
  if (members.length === 0) return null;
  const shown = members.slice(0, max);
  return (
    <span className="avatar-stack" aria-label={`${members.length} member${members.length === 1 ? "" : "s"}`}>
      {shown.map((m) => (
        <Link key={m.id} href={`/network/${m.id}`} className="avatar-stack-item" title={m.name}>
          <Avatar name={m.name} avatarUrl={m.avatarUrl} size={size} />
        </Link>
      ))}
    </span>
  );
}

// "Jane Doe", "Jane Doe and John Roe", "Jane Doe, John Roe and 3 others".
export function namesSummary(members: NetworkMember[], noun = "other"): string {
  if (members.length === 0) return "";
  if (members.length === 1) return members[0].name;
  if (members.length === 2) return `${members[0].name} and ${members[1].name}`;
  const rest = members.length - 2;
  return `${members[0].name}, ${members[1].name} and ${rest} ${noun}${rest === 1 ? "" : "s"}`;
}

// Same wording as namesSummary, but each named member links to their
// profile. The "N others" tail stays plain text.
export function PeopleNames({ members, noun = "other" }: { members: NetworkMember[]; noun?: string }) {
  if (members.length === 0) return null;
  const link = (m: NetworkMember) => (
    <Link key={m.id} href={`/network/${m.id}`} className="people-name-link">
      {m.name}
    </Link>
  );
  if (members.length === 1) return link(members[0]);
  if (members.length === 2)
    return (
      <>
        {link(members[0])} and {link(members[1])}
      </>
    );
  const rest = members.length - 2;
  return (
    <>
      {link(members[0])}, {link(members[1])} and {rest} {noun}
      {rest === 1 ? "" : "s"}
    </>
  );
}

// Linked member rows (avatar, name, headline) shared by the sidebar card and
// the profile's connections/followers popup.
export function PeopleRows({
  members,
  highlightIds,
  highlightLabel,
}: {
  members: NetworkMember[];
  highlightIds?: Set<string>;
  highlightLabel?: string;
}) {
  return (
    <div className="stack" style={{ marginTop: 10, gap: 0 }}>
      {members.map((m) => (
        <Link href={`/network/${m.id}`} key={m.id} className="mini-row people-panel-row">
          <Avatar name={m.name} avatarUrl={m.avatarUrl} size={36} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="mini-row-title is-name" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {m.name}
              {m.isPro && <ProBadge size={12} />}
            </span>
            <span className="meta people-panel-sub">{m.headline || m.jobTitle || m.companyName || "GovConUnited Member"}</span>
            {highlightIds?.has(m.id) && highlightLabel && <span className="people-panel-badge">{highlightLabel}</span>}
          </span>
        </Link>
      ))}
    </div>
  );
}

// A sidebar card listing real members (followers, connections, following)
// with their avatars; long lists collapse behind "Show all".
export function PeopleListPanel({
  id,
  title,
  members,
  total,
  emptyText,
  highlightIds,
  highlightLabel,
  initialCount = 6,
  footer,
}: {
  id?: string;
  title: string;
  members: NetworkMember[];
  // When the real total differs from the rendered list (e.g. a public
  // count shown to a signed-out visitor who can't see the list).
  total?: number;
  emptyText: string;
  highlightIds?: Set<string>;
  highlightLabel?: string;
  initialCount?: number;
  footer?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = total ?? members.length;
  const visible = expanded ? members : members.slice(0, initialCount);

  return (
    <section className="card panel people-panel" id={id}>
      <h2 className="section-title">
        {title} <span className="people-panel-count">{count.toLocaleString()}</span>
      </h2>
      {members.length === 0 ? (
        emptyText && (
          <p className="meta" style={{ marginTop: 8 }}>
            {emptyText}
          </p>
        )
      ) : (
        <>
          <PeopleRows members={visible} highlightIds={highlightIds} highlightLabel={highlightLabel} />
          {members.length > initialCount && (
            <button type="button" className="link-btn" style={{ marginTop: 8 }} onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show less" : `Show all ${members.length}`}
            </button>
          )}
        </>
      )}
      {footer}
    </section>
  );
}
