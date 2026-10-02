"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { recheckResourceLinkAction, setLinkAutoHideAction, unhideResourceAction } from "@/app/admin/resources/actions";
import { useToast } from "@/components/toast-provider";

export interface LinkHealthRow {
  id: string;
  title: string;
  kind: "link" | "video";
  target: string;
  status: string;
  linkStatus: "ok" | "broken" | null;
  error: string | null;
  checkedAt: string | null;
  failedAt: string | null;
  failStreak: number;
  hidden: boolean;
}

function shortDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

export function LinkHealthClient({ rows, autoHide: initialAutoHide }: { rows: LinkHealthRow[]; autoHide: boolean }) {
  const router = useRouter();
  const showToast = useToast();
  const [autoHide, setAutoHide] = useState(initialAutoHide);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const broken = rows.filter((r) => r.linkStatus === "broken");
  const unchecked = rows.filter((r) => !r.linkStatus).length;
  const lastRun = rows.reduce<string | null>((max, r) => (r.checkedAt && (!max || r.checkedAt > max) ? r.checkedAt : max), null);
  const list = showAll ? rows : broken;

  async function toggleAutoHide(next: boolean) {
    setAutoHide(next);
    const res = await setLinkAutoHideAction(next);
    if (res.error) {
      setAutoHide(!next);
      showToast(res.error);
    } else showToast(next ? "Items will be hidden after 2 failed checks in a row" : "Auto-hide turned off");
  }

  async function recheck(id: string) {
    setBusyId(id);
    const res = await recheckResourceLinkAction(id);
    setBusyId(null);
    if (res.error) return showToast(res.error);
    showToast(res.ok ? "Working again" : `Still failing: ${res.message}`);
    router.refresh();
  }

  async function unhide(id: string) {
    setBusyId(id);
    const res = await unhideResourceAction(id);
    setBusyId(null);
    if (res.error) return showToast(res.error);
    showToast("Visible to members again");
    router.refresh();
  }

  return (
    <div className="stack">
      <section className="card panel">
        <div className="admin-stat-grid" style={{ marginBottom: 12 }}>
          <div className="admin-stat-card">
            <small className="meta">Links &amp; videos</small>
            <strong>{rows.length}</strong>
          </div>
          <div className="admin-stat-card">
            <small className="meta">Flagged</small>
            <strong className={broken.length ? "ra-text-red" : undefined}>{broken.length}</strong>
          </div>
          <div className="admin-stat-card">
            <small className="meta">Hidden from members</small>
            <strong>{rows.filter((r) => r.hidden).length}</strong>
          </div>
          <div className="admin-stat-card">
            <small className="meta">Last check</small>
            <strong>{shortDate(lastRun)}</strong>
          </div>
        </div>
        <p className="meta" style={{ margin: "0 0 10px" }}>
          Every Monday each external link and video is checked. Pages answering 404 or 5xx, redirects to a site&apos;s homepage, and videos that are
          unavailable are flagged, and admins get an email summary.{unchecked ? ` ${unchecked} haven't been checked yet.` : ""}
        </p>
        <label className="admin-checkbox-label">
          <input type="checkbox" checked={autoHide} onChange={(e) => toggleAutoHide(e.target.checked)} />
          <span>Hide an item from members after 2 failed checks in a row (it comes back once a check passes)</span>
        </label>
      </section>

      <section className="card panel">
        <div className="ra-toolbar">
          <h2 className="section-title" style={{ margin: 0 }}>{showAll ? "All links and videos" : "Flagged"}</h2>
          <button className="btn btn-outline btn-sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show flagged only" : `Show all ${rows.length}`}
          </button>
        </div>
        {list.length === 0 ? (
          <p className="meta">{showAll ? "No external links or videos yet." : "Nothing flagged — every checked link and video is working."}</p>
        ) : (
          <div className="ra-table-wrap">
            <table className="points-table ra-table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Result</th>
                  <th>Found</th>
                  <th>Last checked</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/resources/${r.id}/edit`} className="ra-title">{r.title}</Link>
                      <div className="meta ra-url">
                        {r.kind === "video" ? "Video · " : ""}
                        <a href={r.target} target="_blank" rel="noopener noreferrer nofollow">{r.target}</a>
                      </div>
                      <div className="ra-badges">
                        {r.status !== "published" && <span className="admin-status-pill admin-status-draft">{r.status}</span>}
                        {r.hidden && <span className="ra-badge-red">Hidden from members</span>}
                      </div>
                    </td>
                    <td>
                      {r.linkStatus === "broken" ? (
                        <span className="ra-badge-red">{r.error ?? "Failed"}</span>
                      ) : r.linkStatus === "ok" ? (
                        <span className="admin-status-pill admin-status-published">Working</span>
                      ) : (
                        <span className="meta">Not checked yet</span>
                      )}
                      {r.failStreak > 1 && <div className="meta">{r.failStreak} failed checks in a row</div>}
                    </td>
                    <td className="meta">{shortDate(r.failedAt)}</td>
                    <td className="meta">{shortDate(r.checkedAt)}</td>
                    <td>
                      <div className="ra-row-actions">
                        <button className="btn btn-outline btn-sm" disabled={busyId === r.id} onClick={() => recheck(r.id)}>
                          {busyId === r.id ? "Checking…" : "Recheck"}
                        </button>
                        <Link href={`/admin/resources/${r.id}/edit`} className="btn btn-outline btn-sm">Edit</Link>
                        {r.hidden && (
                          <button className="btn btn-outline btn-sm" disabled={busyId === r.id} onClick={() => unhide(r.id)}>
                            Un-hide
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
