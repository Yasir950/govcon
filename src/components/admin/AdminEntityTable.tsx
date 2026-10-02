"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  deleteContentAction,
  setContentStatusAction,
  setListingClosedAction,
  toggleFeaturedAction,
  type ContentStatus,
  type ManagedTable,
} from "@/app/admin/actions";
import { useToast } from "@/components/toast-provider";
import { ListPagination } from "@/components/ListPagination";
import { ListSearchBar } from "@/components/ListSearchBar";

export interface AdminEntityRow {
  id: string;
  title: string;
  subtitle?: string;
  status: string;
  featured: boolean;
  scheduledAt?: string | null;
  // Opportunities only — shown as a "Responses (N)" link when
  // responsesHrefBase is passed. Left undefined for listings with no
  // GovCon company (SAM.gov notices, admin posts): members respond to
  // those on SAM.gov, so there's nothing to show.
  responseCount?: number;
  // Jobs/opportunities only — set when the listing has been closed to new
  // applications/responses (still visible, with a Closed badge). Left
  // undefined for tables with no closing concept, which hides the button.
  closedAt?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  pending_review: "Pending Review",
  archived: "Archived",
};

// <input type="datetime-local"> needs "YYYY-MM-DDTHH:mm" in LOCAL time —
// toISOString() gives UTC with seconds/millis, which the input rejects.
// The public site treats a 'scheduled' row as live once scheduled_at has
// passed (see PUBLISHED_FILTER in lib/supabase/queries.ts) — nothing flips
// the stored status, so the admin list has to apply the same rule or a row
// that's already on the site keeps showing as Scheduled/unpublished here.
function effectiveStatus(row: AdminEntityRow): string {
  if (row.status === "scheduled" && row.scheduledAt && new Date(row.scheduledAt) <= new Date()) {
    return "published";
  }
  return row.status;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// One shared list view for every managed content type (opportunities,
// jobs, companies, events, community posts, resources, testimonials,
// partners) — publish/schedule/feature/archive/delete controls are
// identical across all of them (see 20260919000100/000200/000300/000400
// migrations), so this is the only place that logic needs to exist.
export function AdminEntityTable({
  table,
  rows,
  editHrefBase,
  responsesHrefBase,
  newHref,
  onApprove,
  onReject,
  searchPlaceholder,
  serverPaging,
}: {
  table: ManagedTable;
  rows: AdminEntityRow[];
  // A base path, not a function — Server Components can't pass functions
  // to Client Components (they aren't serializable across that boundary).
  // The edit URL is built here as `${editHrefBase}/${row.id}/edit`.
  editHrefBase?: string;
  // Same idea: the link is `${responsesHrefBase}/${row.id}/responses`.
  responsesHrefBase?: string;
  newHref?: string;
  // Only passed from the companies admin page, for status='pending_review'
  // rows — a self-submitted company needs real side effects on approval
  // (granting the submitter 'owner' access, sending a notification), not
  // just the generic publish/draft flip every other managed table uses.
  // Server Actions pass across the Server->Client boundary fine (unlike
  // plain functions), so the page can hand these down directly.
  onApprove?: (id: string) => Promise<{ error?: string }>;
  onReject?: (id: string, reason: string) => Promise<{ error?: string }>;
  // Opt-in: when set, a search bar filters rows by title/subtitle.
  searchPlaceholder?: string;
  // For tables too big to load whole (thousands of synced opportunities —
  // PostgREST also caps a single read at 1,000 rows): `rows` is one page,
  // and the search box + pager drive ?q=&page= for the server to apply.
  serverPaging?: { q: string; page: number; pageCount: number; total: number; pageSize: number };
}) {
  const router = useRouter();
  const showToast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const [scheduleValue, setScheduleValue] = useState("");
  // router.refresh() re-runs this page's server fetch, but that round trip
  // can take a couple of seconds — long enough that clicking Schedule/
  // Feature looked like it silently did nothing (the button re-enables
  // right away, well before the row's real data comes back). Local state,
  // updated the instant the action itself succeeds, is what actually
  // renders; router.refresh() still runs after so a second admin's changes
  // (or a page reload) stay in sync, but it's no longer what the person who
  // just clicked is waiting on to see a result.
  const [localRows, setLocalRows] = useState(rows);
  useEffect(() => setLocalRows(rows), [rows]);
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(serverPaging?.q ?? "");
  const needle = query.trim().toLowerCase();
  const visibleRows =
    needle && !serverPaging
      ? localRows.filter((r) => `${r.title} ${r.subtitle ?? ""}`.toLowerCase().includes(needle))
      : localRows;

  function goTo(q: string, page: number) {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (page > 1) qs.set("page", String(page));
    const s = qs.toString();
    startTransition(() => router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false }));
  }

  // Server-side search: push the query once typing pauses.
  useEffect(() => {
    if (!serverPaging || query.trim() === serverPaging.q) return;
    const t = setTimeout(() => goTo(query.trim(), 1), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function patchRow(id: string, patch: Partial<AdminEntityRow>) {
    setLocalRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function runStatus(id: string, status: ContentStatus, scheduledAt?: string | null) {
    setPendingId(id);
    const result = await setContentStatusAction(table, id, status, scheduledAt);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    patchRow(id, { status, scheduledAt: status === "scheduled" ? (scheduledAt ?? null) : null });
    showToast(`Marked ${STATUS_LABEL[status].toLowerCase()}`);
    router.refresh();
  }

  async function runFeatured(id: string, next: boolean) {
    setPendingId(id);
    const result = await toggleFeaturedAction(table, id, next);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    patchRow(id, { featured: next });
    showToast(next ? "Featured" : "Unfeatured");
    router.refresh();
  }

  async function runClosed(id: string, closed: boolean) {
    if (table !== "jobs" && table !== "opportunities") return;
    setPendingId(id);
    const result = await setListingClosedAction(table, id, closed);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    patchRow(id, { closedAt: closed ? new Date().toISOString() : null });
    showToast(closed ? "Closed" : "Reopened");
    router.refresh();
  }

  async function runApprove(id: string) {
    if (!onApprove) return;
    setPendingId(id);
    const result = await onApprove(id);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Approved");
    router.refresh();
  }

  async function runReject(id: string) {
    if (!onReject) return;
    const reason = prompt("Reason for rejecting this submission (shown to the submitter):");
    if (reason === null) return;
    setPendingId(id);
    const result = await onReject(id, reason);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Rejected");
    router.refresh();
  }

  async function runDelete(id: string) {
    if (!confirm("Delete this permanently? This can't be undone.")) return;
    setPendingId(id);
    const result = await deleteContentAction(table, id);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setLocalRows((prev) => prev.filter((r) => r.id !== id));
    showToast("Deleted");
    router.refresh();
  }

  return (
    <div>
      {newHref && (
        <div style={{ marginBottom: 12 }}>
          <Link href={newHref} className="btn btn-primary">
            + New
          </Link>
        </div>
      )}

      {searchPlaceholder && (localRows.length > 0 || serverPaging) && (
        <>
          <ListSearchBar value={query} onChange={setQuery} label="Search" placeholder={searchPlaceholder} />
          {serverPaging ? (
            <p className="meta" style={{ marginBottom: 10 }}>
              {serverPaging.total.toLocaleString()} {serverPaging.q ? "match" : "total"}
              {serverPaging.pageCount > 1 &&
                ` · showing ${((serverPaging.page - 1) * serverPaging.pageSize + 1).toLocaleString()}–${Math.min(
                  serverPaging.page * serverPaging.pageSize,
                  serverPaging.total,
                ).toLocaleString()}`}
            </p>
          ) : (
            needle && (
              <p className="meta" style={{ marginBottom: 10 }}>
                {visibleRows.length} of {localRows.length} match
              </p>
            )
          )}
        </>
      )}

      <div aria-busy={isPending} style={{ opacity: isPending ? 0.55 : 1, transition: "opacity .15s" }}>
      {localRows.length === 0 && !serverPaging?.q ? (
        <section className="card empty">
          <strong>Nothing here yet</strong>
          Create the first one to see it appear here.
        </section>
      ) : visibleRows.length === 0 ? (
        <section className="card empty">
          <strong>No matches</strong>
          Nothing matches &ldquo;{serverPaging?.q ?? query.trim()}&rdquo;.
        </section>
      ) : (
        visibleRows.map((stored) => {
          const row = { ...stored, status: effectiveStatus(stored) };
          return (
          <div className="admin-row" key={row.id}>
            <div>
              <div className="admin-row-title">{row.title}</div>
              {row.subtitle && <div className="admin-row-meta">{row.subtitle}</div>}
              <div className="admin-row-meta">
                <span className={`admin-status-pill admin-status-${row.status}`}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </span>
                {row.featured && <span className="admin-status-pill admin-status-published" style={{ marginLeft: 6 }}>Featured</span>}
                {row.closedAt && <span className="admin-status-pill admin-status-archived" style={{ marginLeft: 6 }}>Closed</span>}
                {row.status === "scheduled" && row.scheduledAt && (
                  <span style={{ marginLeft: 6 }}>for {new Date(row.scheduledAt).toLocaleString()}</span>
                )}
              </div>
            </div>
            <div className="admin-row-actions">
              {editHrefBase && (
                <Link href={`${editHrefBase}/${row.id}/edit`} className="btn btn-outline btn-sm">
                  Edit
                </Link>
              )}
              {responsesHrefBase && row.responseCount !== undefined && (
                <Link href={`${responsesHrefBase}/${row.id}/responses`} className="btn btn-outline btn-sm">
                  Responses ({row.responseCount ?? 0})
                </Link>
              )}
              {row.status === "pending_review" && onApprove ? (
                <>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={pendingId === row.id}
                    onClick={() => runApprove(row.id)}
                  >
                    Approve
                  </button>
                  {onReject && (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ color: "var(--o-red)", borderColor: "var(--o-red)" }}
                      disabled={pendingId === row.id}
                      onClick={() => runReject(row.id)}
                    >
                      Reject
                    </button>
                  )}
                </>
              ) : (
                row.status !== "published" && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={pendingId === row.id}
                    onClick={() => runStatus(row.id, "published")}
                  >
                    Publish
                  </button>
                )
              )}
              {row.status === "published" && (
                <button
                  className="btn btn-outline btn-sm"
                  disabled={pendingId === row.id}
                  onClick={() => runStatus(row.id, "draft")}
                >
                  Unpublish
                </button>
              )}
              {scheduleFor === row.id ? (
                <>
                  <input
                    type="datetime-local"
                    className="field"
                    style={{ height: 32, fontSize: ".78rem", padding: "0 8px" }}
                    value={scheduleValue}
                    onChange={(e) => setScheduleValue(e.target.value)}
                  />
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={!scheduleValue || pendingId === row.id}
                    onClick={() => {
                      runStatus(row.id, "scheduled", new Date(scheduleValue).toISOString());
                      setScheduleFor(null);
                    }}
                  >
                    Confirm
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-outline btn-sm"
                  disabled={pendingId === row.id}
                  onClick={() => {
                    setScheduleFor(row.id);
                    setScheduleValue(row.scheduledAt ? toLocalInputValue(row.scheduledAt) : "");
                  }}
                >
                  {row.status === "scheduled" ? "Change Schedule" : "Schedule"}
                </button>
              )}
              <button
                className="btn btn-outline btn-sm"
                disabled={pendingId === row.id}
                onClick={() => runFeatured(row.id, !row.featured)}
              >
                {row.featured ? "Unfeature" : "Feature"}
              </button>
              {row.closedAt !== undefined && (
                <button
                  className="btn btn-outline btn-sm"
                  disabled={pendingId === row.id}
                  onClick={() => runClosed(row.id, !row.closedAt)}
                >
                  {row.closedAt ? "Reopen" : "Close"}
                </button>
              )}
              {/* Jobs have no "Archived" view on the user side (unlike
                  Opportunities, which surfaces a saved-and-archived one) —
                  archiving one here has nothing for a member to ever see,
                  so the action is hidden rather than left dangling. */}
              {table !== "jobs" && row.status !== "archived" && (
                <button
                  className="btn btn-outline btn-sm"
                  disabled={pendingId === row.id}
                  onClick={() => runStatus(row.id, "archived")}
                >
                  Archive
                </button>
              )}
              <button
                className="btn btn-outline btn-sm"
                style={{ color: "var(--o-red)", borderColor: "var(--o-red)" }}
                disabled={pendingId === row.id}
                onClick={() => runDelete(row.id)}
              >
                Delete
              </button>
            </div>
          </div>
          );
        })
      )}
      </div>
      {serverPaging && (
        <ListPagination
          page={serverPaging.page}
          pageCount={serverPaging.pageCount}
          onPageChange={(page) => {
            goTo(serverPaging.q, page);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
