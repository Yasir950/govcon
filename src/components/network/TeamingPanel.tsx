"use client";

import Link from "next/link";
import { useState } from "react";
import {
  declareTeamingInterestAction,
  removeTeamingInterestAction,
  reportTeamingInquiryAction,
  respondToTeamingInquiryAction,
  withdrawTeamingInquiryAction,
  type TeamingRoleType,
} from "@/app/(app)/opportunities/[slug]/teaming-actions";
import { toggleProfileBlockAction } from "@/app/(app)/network/profile-actions";
import { useToast } from "@/components/toast-provider";
import type { TeamingInquiryItem, TeamingInterestItem } from "@/lib/supabase/queries";

const ROLE_OPTIONS: { value: TeamingRoleType; label: string }[] = [
  { value: "prime", label: "Prime Contractor" },
  { value: "sub", label: "Subcontractor" },
  { value: "supplier", label: "Supplier" },
  { value: "consultant", label: "Consultant" },
  { value: "joint_venture", label: "Joint Venture Partner" },
  { value: "mentor_protege", label: "Mentor-Protégé" },
];

function InquiryRow({
  item,
  kind,
  onUpdate,
}: {
  item: TeamingInquiryItem;
  kind: "received" | "sent";
  onUpdate: (patch: Partial<TeamingInquiryItem>) => void;
}) {
  const showToast = useToast();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState(false);

  async function respond(status: "accepted" | "declined") {
    setPending(true);
    const result = await respondToTeamingInquiryAction(item.id, status, reply);
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setReplying(false);
    showToast(`Inquiry ${status}`);
    onUpdate({ status, replyMessage: reply.trim() || null });
  }

  async function withdraw() {
    setPending(true);
    const result = await withdrawTeamingInquiryAction(item.id);
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Inquiry withdrawn");
    onUpdate({ status: "withdrawn" });
  }

  async function report() {
    const result = await reportTeamingInquiryAction(item.id, "other", "Reported from Network > Teaming");
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Report submitted");
  }

  async function block() {
    const result = await toggleProfileBlockAction(item.counterpartyId);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(result.blocked ? "Member blocked" : "Member unblocked");
  }

  return (
    <div className="list-row" style={{ display: "block" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <strong>{item.counterpartyName}</strong>
          <span className="meta"> · requesting {ROLE_OPTIONS.find((r) => r.value === item.requestedRole)?.label ?? item.requestedRole}</span>
          {item.opportunityRoute && (
            <div>
              <Link href={`/${item.opportunityRoute}`} className="meta">
                {item.opportunityTitle}
              </Link>
            </div>
          )}
        </div>
        <span className="tag">{item.status}</span>
      </div>
      <p className="meta" style={{ marginTop: 6 }}>
        {item.message}
      </p>
      {item.replyMessage && <p className="meta">Reply: {item.replyMessage}</p>}

      {kind === "received" && item.status === "pending" && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => respond("accepted")}>
            Accept
          </button>
          <button className="btn btn-outline btn-sm" disabled={pending} onClick={() => setReplying((v) => !v)}>
            Reply &amp; Decline
          </button>
          <button className="btn btn-outline btn-sm" onClick={report}>
            Report
          </button>
          <button className="btn btn-outline btn-sm" onClick={block}>
            Block
          </button>
        </div>
      )}
      {kind === "sent" && item.status === "pending" && (
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-outline btn-sm" disabled={pending} onClick={withdraw}>
            Withdraw
          </button>
        </div>
      )}
      {replying && (
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <input className="field" style={{ flex: 1 }} placeholder="Optional reply..." value={reply} onChange={(e) => setReply(e.target.value)} />
          <button className="btn btn-outline btn-sm" disabled={pending} onClick={() => respond("declined")}>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

export function TeamingPanel({
  myInterests: initialInterests,
  received: initialReceived,
  sent: initialSent,
}: {
  myInterests: TeamingInterestItem[];
  received: TeamingInquiryItem[];
  sent: TeamingInquiryItem[];
}) {
  const showToast = useToast();
  const [myInterests, setMyInterests] = useState(initialInterests);
  const [received, setReceived] = useState(initialReceived);
  const [sent, setSent] = useState(initialSent);
  const [role, setRole] = useState<TeamingRoleType>("sub");
  const [naics, setNaics] = useState("");
  const [locations, setLocations] = useState("");
  const [pending, setPending] = useState(false);

  function updateReceived(id: string, patch: Partial<TeamingInquiryItem>) {
    setReceived((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function updateSent(id: string, patch: Partial<TeamingInquiryItem>) {
    setSent((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function declare() {
    setPending(true);
    const result = await declareTeamingInterestAction(role, {
      naicsCodes: naics.split(",").map((s) => s.trim()).filter(Boolean),
      locations: locations.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setMyInterests((prev) => [
      ...prev.filter((i) => i.roleType !== role),
      {
        roleType: role,
        naicsCodes: naics.split(",").map((s) => s.trim()).filter(Boolean),
        locations: locations.split(",").map((s) => s.trim()).filter(Boolean),
        certifications: [],
        notes: null,
      },
    ]);
    showToast("Teaming interest saved");
  }

  async function removeInterest(roleType: string) {
    await removeTeamingInterestAction(roleType as TeamingRoleType);
    setMyInterests((prev) => prev.filter((i) => i.roleType !== roleType));
    showToast("Removed");
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="card panel">
        <h2 className="section-title">Your Teaming Interests</h2>
        <p className="meta">Declare which roles you're open to so other members can find you as a recommended partner.</p>
        <div style={{ marginTop: 10 }}>
          {myInterests.map((i) => (
            <span className="tag" key={i.roleType} style={{ marginRight: 6 }}>
              {ROLE_OPTIONS.find((r) => r.value === i.roleType)?.label ?? i.roleType}
              <button className="link-btn" style={{ marginLeft: 6 }} onClick={() => removeInterest(i.roleType)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as TeamingRoleType)}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <input className="field" placeholder="NAICS codes (comma-separated)" value={naics} onChange={(e) => setNaics(e.target.value)} />
          <input className="field" placeholder="Locations/states (comma-separated)" value={locations} onChange={(e) => setLocations(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={declare}>
            Add Interest
          </button>
        </div>
      </section>

      <section className="card panel">
        <h2 className="section-title">Received Teaming Inquiries ({received.length})</h2>
        {received.length === 0 ? (
          <p className="meta">No teaming inquiries yet.</p>
        ) : (
          received.map((item) => (
            <InquiryRow key={item.id} item={item} kind="received" onUpdate={(patch) => updateReceived(item.id, patch)} />
          ))
        )}
      </section>

      <section className="card panel">
        <h2 className="section-title">Sent Teaming Inquiries ({sent.length})</h2>
        {sent.length === 0 ? (
          <p className="meta">You haven't sent any teaming inquiries yet.</p>
        ) : (
          sent.map((item) => <InquiryRow key={item.id} item={item} kind="sent" onUpdate={(patch) => updateSent(item.id, patch)} />)
        )}
      </section>
    </div>
  );
}
