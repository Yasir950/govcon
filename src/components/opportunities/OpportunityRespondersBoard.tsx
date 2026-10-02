"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteOpportunityResponseAction } from "@/app/(app)/companies/[slug]/(shell)/opportunities/actions";
import { Avatar } from "@/components/avatar";
import { ClearanceBadge } from "@/components/ClearanceBadge";
import { useToast } from "@/components/toast-provider";
import type { OpportunityResponder } from "@/lib/supabase/queries";

// A company's "who's interested" view for an opportunity it posted —
// LinkedIn-style flat list, same pattern as the jobs applicant list
// (src/components/jobs/HiringPipelineBoard.tsx): no status pipeline, no
// team assignment, no private notes, no audit trail. There's nothing to
// track here in the first place — responding is a one-click "Express
// Interest," not a submitted application — so this just shows real,
// current profile info per responder plus a way to reach out.
function toCsv(responders: OpportunityResponder[]): string {
  const header = ["Name", "Headline", "Phone", "Clearance", "Responded"];
  const rows = responders.map((r) => [
    r.name,
    r.headline ?? r.jobTitle ?? "",
    r.phone ?? "",
    r.clearance ? `${r.clearance} (${r.clearanceVerified ? "verified" : "unverified"})` : "",
    new Date(r.respondedAt).toLocaleDateString(),
  ]);
  return [header, ...rows].map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function ResponderCard({
  responder,
  removing,
  onRemove,
}: {
  responder: OpportunityResponder;
  removing: boolean;
  onRemove: () => void;
}) {
  // A headline is the preferred one-line summary, but plenty of real
  // profiles never fill it in — falling back through job title, then
  // company/location is still real, useful context for deciding whether to
  // reach out, rather than leaving the owner with just a name and a date.
  const roleLine = responder.headline || responder.jobTitle;
  const companyLocation = [responder.jobTitle && responder.headline ? responder.jobTitle : null, responder.companyName, responder.location]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="card panel" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <Link href={`/network/${responder.profileId}`} style={{ display: "contents" }}>
        <Avatar name={responder.name} avatarUrl={responder.avatarUrl} />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link href={`/network/${responder.profileId}`} style={{ color: "inherit", textDecoration: "none" }}>
          <strong>{responder.name}</strong>
        </Link>
        {roleLine && <p className="meta">{roleLine}</p>}
        {companyLocation && <p className="meta">{companyLocation}</p>}
        {responder.skills.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {responder.skills.slice(0, 5).map((s) => (
              <span className="tag" key={s}>
                {s}
              </span>
            ))}
          </div>
        )}
        {responder.clearance && (
          <p className="meta">
            <ClearanceBadge clearance={responder.clearance} verified={responder.clearanceVerified} />
          </p>
        )}
        <p className="meta">Responded {new Date(responder.respondedAt).toLocaleDateString()}</p>
        {responder.phone && <p className="meta">{responder.phone}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <Link href={`/network/${responder.profileId}`} className="btn btn-outline btn-sm">
          View Profile
        </Link>
        <Link href={`/messages?to=${responder.profileId}`} className="btn btn-outline btn-sm">
          Message
        </Link>
        <button type="button" className="btn btn-outline btn-sm btn-remove" disabled={removing} onClick={onRemove}>
          {removing ? "Removing…" : "Remove"}
        </button>
      </div>
    </div>
  );
}

export function OpportunityRespondersBoard({
  opportunityTitle,
  responders,
}: {
  opportunityTitle: string;
  responders: OpportunityResponder[];
}) {
  const router = useRouter();
  const showToast = useToast();
  const [query, setQuery] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function removeResponder(responder: OpportunityResponder) {
    if (!window.confirm(`Remove ${responder.name}'s response to this opportunity? This can't be undone.`)) return;
    setRemovingId(responder.responseId);
    const result = await deleteOpportunityResponseAction(responder.responseId);
    setRemovingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Response removed");
    router.refresh();
  }

  function exportCsv() {
    const blob = new Blob([toCsv(responders)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${opportunityTitle.replace(/\s+/g, "-").toLowerCase()}-responders.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = responders.filter((r) => !query || r.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Responses for {opportunityTitle}</h1>
          <p>{responders.length} member(s) expressed interest.</p>
        </div>
        <button className="btn btn-outline" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <input
        className="field search-field"
        style={{ marginBottom: 12 }}
        placeholder="Search responders..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 ? (
        <div className="empty">
          <strong>No responses yet</strong>
          Members who express interest in this opportunity will appear here.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((r) => (
            <ResponderCard
              key={r.responseId}
              responder={r}
              removing={removingId === r.responseId}
              onRemove={() => removeResponder(r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
