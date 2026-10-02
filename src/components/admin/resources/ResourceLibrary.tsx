"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  deleteResourcesAction,
  duplicateResourceAction,
  removeResourceForPolicyAction,
  reorderResourcesAction,
  restoreResourcesAction,
  setResourceFeaturedAction,
  setResourcesCategoryAction,
  setResourcesStatusAction,
} from "@/app/admin/resources/actions";
import { ModalShell } from "@/components/ModalShell";
import { useToast } from "@/components/toast-provider";
import {
  RESOURCE_ACCESS_LEVELS,
  RESOURCE_PURGE_DAYS,
  RESOURCE_STATUSES,
  type ResourceAccess,
  type ResourceCategory,
  type ResourceKind,
} from "@/lib/resources";

export interface LibraryRow {
  id: string;
  title: string;
  slug: string;
  type: string;
  categoryId: string | null;
  kind: ResourceKind;
  access: ResourceAccess;
  status: string;
  scheduledAt: string | null;
  featured: boolean;
  updatedAt: string;
  deletedAt: string | null;
  fileMissing: boolean;
  unscanned: boolean;
  linkBroken: boolean;
  linkError: string | null;
  autoHidden: boolean;
  memberSubmitted: boolean;
  policyRemoved: boolean;
  views: number;
  clicks: number;
}

const KIND_LABEL: Record<ResourceKind, string> = { file: "File", link: "External link", video: "Video" };
const CLICK_LABEL: Record<ResourceKind, string> = { file: "downloads", link: "clicks", video: "plays" };
const ALL = "";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ResourceLibrary({
  rows,
  categories,
  types,
}: {
  rows: LibraryRow[];
  categories: ResourceCategory[];
  types: string[];
}) {
  const router = useRouter();
  const showToast = useToast();
  const [local, setLocal] = useState(rows);
  useEffect(() => setLocal(rows), [rows]);

  const [view, setView] = useState<"active" | "trash">("active");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [access, setAccess] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LibraryRow | null>(null);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const active = local.filter((r) => !r.deletedAt);
  const trash = local.filter((r) => r.deletedAt);
  const filtersOn = !!(query.trim() || status || category || type || access);
  const needle = query.trim().toLowerCase();

  const visible = (view === "trash" ? trash : active).filter((r) => {
    if (needle && !r.title.toLowerCase().includes(needle)) return false;
    if (view === "trash") return true;
    if (status && r.status !== status) return false;
    if (category && (category === "none" ? r.categoryId : r.categoryId !== category)) return false;
    if (type && r.type !== type) return false;
    if (access && r.access !== access) return false;
    return true;
  });
  const canDrag = view === "active" && !filtersOn;
  const visibleIds = visible.map((r) => r.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const selectedIds = visibleIds.filter((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(label: string, fn: () => Promise<{ error?: string; count?: number }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) {
      showToast(res.error);
      return false;
    }
    showToast(label.replace("{n}", String(res.count ?? 0)));
    setSelected(new Set());
    router.refresh();
    return true;
  }

  async function bulkStatus(next: "published" | "archived") {
    const ok = await run(next === "published" ? "Published {n}" : "Archived {n}", () => setResourcesStatusAction(selectedIds, next));
    if (ok) setLocal((prev) => prev.map((r) => (selectedIds.includes(r.id) ? { ...r, status: next, scheduledAt: null } : r)));
  }

  async function bulkSetCategory() {
    if (!bulkCategory) return;
    const ok = await run("Moved {n} to the new category", () => setResourcesCategoryAction(selectedIds, bulkCategory));
    if (ok) setLocal((prev) => prev.map((r) => (selectedIds.includes(r.id) ? { ...r, categoryId: bulkCategory } : r)));
    setBulkCategory("");
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.length} resource${selectedIds.length === 1 ? "" : "s"}? They can be restored from Trash for ${RESOURCE_PURGE_DAYS} days.`)) return;
    const now = new Date().toISOString();
    const ok = await run("Deleted {n}", () => deleteResourcesAction(selectedIds));
    if (ok) setLocal((prev) => prev.map((r) => (selectedIds.includes(r.id) ? { ...r, deletedAt: now, featured: false } : r)));
  }

  async function restore(ids: string[]) {
    const ok = await run("Restored {n}", () => restoreResourcesAction(ids));
    if (ok) setLocal((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, deletedAt: null, policyRemoved: false } : r)));
  }

  async function duplicate(id: string) {
    setBusy(true);
    const res = await duplicateResourceAction(id);
    setBusy(false);
    if (res.error || !res.id) {
      showToast(res.error ?? "Couldn't duplicate.");
      return;
    }
    showToast(res.warning ?? "Duplicated as a draft");
    router.push(`/admin/resources/${res.id}/edit`);
  }

  async function archive(row: LibraryRow) {
    const next = row.status === "archived" ? "draft" : "archived";
    setBusy(true);
    const res = await setResourcesStatusAction([row.id], next);
    setBusy(false);
    if (res.error) return showToast(res.error);
    setLocal((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
    showToast(next === "archived" ? "Archived" : "Moved back to Draft");
    router.refresh();
  }

  async function feature(row: LibraryRow) {
    const res = await setResourceFeaturedAction(row.id, !row.featured);
    if (res.error) return showToast(res.error);
    setLocal((prev) => prev.map((r) => (r.id === row.id ? { ...r, featured: !row.featured } : r)));
    router.refresh();
  }

  async function drop(targetId: string) {
    const from = dragId;
    setDragId(null);
    setOverId(null);
    if (!from || from === targetId) return;
    const order = active.map((r) => r.id);
    const movingDown = order.indexOf(from) < order.indexOf(targetId);
    order.splice(order.indexOf(from), 1);
    // Dropped on a row below: lands after it; on a row above: before it.
    order.splice(order.indexOf(targetId) + (movingDown ? 1 : 0), 0, from);
    const byId = new Map(local.map((r) => [r.id, r]));
    const previous = local;
    setLocal([...order.map((id) => byId.get(id)!), ...trash]);
    const res = await reorderResourcesAction(order);
    if (res.error) {
      showToast(res.error);
      setLocal(previous);
      return;
    }
    showToast("Order saved");
    router.refresh();
  }

  return (
    <div>
      <div className="ra-toolbar">
        <div className="ra-view-switch">
          <button className={`btn btn-sm ${view === "active" ? "btn-primary" : "btn-outline"}`} onClick={() => { setView("active"); setSelected(new Set()); }}>
            All resources <span className="admin-tab-count">{active.length}</span>
          </button>
          <button className={`btn btn-sm ${view === "trash" ? "btn-primary" : "btn-outline"}`} onClick={() => { setView("trash"); setSelected(new Set()); }}>
            Trash <span className="admin-tab-count">{trash.length}</span>
          </button>
        </div>
        <Link href="/admin/resources/new" className="btn btn-primary btn-sm">
          + New resource
        </Link>
      </div>

      <div className="ra-filters">
        <input className="field" type="search" placeholder="Search by title" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search by title" />
        {view === "active" && (
          <>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">All statuses</option>
              {RESOURCE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value="none">No category</option>
            </select>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select className="select" value={access} onChange={(e) => setAccess(e.target.value)} aria-label="Access level">
              <option value="">All access levels</option>
              {RESOURCE_ACCESS_LEVELS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            {filtersOn && (
              <button className="link-btn" onClick={() => { setQuery(""); setStatus(""); setCategory(""); setType(""); setAccess(""); }}>
                Clear filters
              </button>
            )}
          </>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="ra-bulk" role="region" aria-label="Bulk actions">
          <strong>{selectedIds.length} selected</strong>
          {view === "active" ? (
            <>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => bulkStatus("published")}>Publish</button>
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => bulkStatus("archived")}>Archive</button>
              <select className="select" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} aria-label="Change category to">
                <option value="">Change category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {bulkCategory && (
                <button className="btn btn-outline btn-sm" disabled={busy} onClick={bulkSetCategory}>Apply</button>
              )}
              <button className="btn btn-outline btn-sm ra-danger" disabled={busy} onClick={bulkDelete}>Delete</button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => restore(selectedIds)}>Restore</button>
          )}
          <button className="link-btn" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {view === "active" && (
        <p className="meta" style={{ margin: "0 0 8px" }}>
          {canDrag
            ? "Drag rows by the handle to reorder. This order is the default sort on Resources, with Featured items pinned to the top."
            : "Clear the filters and search to drag rows into a new order."}
        </p>
      )}
      {view === "trash" && (
        <p className="meta" style={{ margin: "0 0 8px" }}>
          Deleted resources are hidden from members and permanently removed {RESOURCE_PURGE_DAYS} days after deletion. Members who saved one see
          &ldquo;no longer available&rdquo;.
        </p>
      )}

      <div className="ra-table-wrap card">
        <table className="points-table ra-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(visibleIds))}
                />
              </th>
              {view === "active" && <th style={{ width: 22 }} aria-label="Reorder" />}
              <th>Title</th>
              <th>Type</th>
              <th>Category</th>
              {view === "active" ? (
                <>
                  <th>Delivery</th>
                  <th>Access</th>
                  <th>Status</th>
                  <th className="ra-num">Views</th>
                  <th className="ra-num">Downloads / clicks</th>
                  <th>Updated</th>
                </>
              ) : (
                <>
                  <th>Deleted</th>
                  <th>Purged</th>
                </>
              )}
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={12} className="meta" style={{ padding: 18, textAlign: "center" }}>
                  {view === "trash" ? "Trash is empty." : filtersOn ? "No resources match these filters." : "No resources yet."}
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr
                key={r.id}
                className={`${dragId === r.id ? "is-dragging" : ""}${overId === r.id && dragId !== r.id ? " is-drop-target" : ""}`}
                draggable={canDrag}
                onDragStart={(e) => {
                  setDragId(r.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  if (overId !== r.id) setOverId(r.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(r.id);
                }}
              >
                <td>
                  <input type="checkbox" aria-label={`Select ${r.title}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                {view === "active" && (
                  <td className={`ra-handle${canDrag ? "" : " is-disabled"}`} title={canDrag ? "Drag to reorder" : undefined} aria-hidden="true">
                    ⋮⋮
                  </td>
                )}
                <td>
                  <Link href={`/admin/resources/${r.id}/edit`} className="ra-title">
                    {r.title}
                  </Link>
                  <div className="ra-badges">
                    {r.featured && <span className="admin-status-pill admin-status-published">Featured</span>}
                    {r.linkBroken && (
                      <Link href="/admin/resources/link-health" className="ra-badge-red" title={r.linkError ?? undefined}>
                        Broken link
                      </Link>
                    )}
                    {r.autoHidden && <span className="ra-badge-red">Hidden by Link Health</span>}
                    {r.fileMissing && <span className="ra-badge-red">File missing</span>}
                    {r.unscanned && <span className="admin-status-pill admin-status-draft">Not virus-scanned</span>}
                    {r.memberSubmitted && <span className="admin-status-pill admin-status-scheduled">Member</span>}
                    {r.policyRemoved && <span className="ra-badge-red">Removed: policy</span>}
                  </div>
                </td>
                <td>{r.type}</td>
                <td>{r.categoryId ? categoryName.get(r.categoryId) ?? "—" : <span className="meta">—</span>}</td>
                {view === "active" ? (
                  <>
                    <td>{KIND_LABEL[r.kind]}</td>
                    <td>{RESOURCE_ACCESS_LEVELS.find((a) => a.value === r.access)?.label ?? r.access}</td>
                    <td>
                      <span className={`admin-status-pill admin-status-${r.status}`}>
                        {RESOURCE_STATUSES.find((s) => s.value === r.status)?.label ?? r.status}
                      </span>
                      {r.status === "scheduled" && r.scheduledAt && <div className="meta">{new Date(r.scheduledAt).toLocaleString()}</div>}
                    </td>
                    <td className="ra-num">{r.views.toLocaleString()}</td>
                    <td className="ra-num" title={CLICK_LABEL[r.kind]}>{r.clicks.toLocaleString()}</td>
                    <td className="meta">{shortDate(r.updatedAt)}</td>
                  </>
                ) : (
                  <>
                    <td className="meta">{r.deletedAt && shortDate(r.deletedAt)}</td>
                    <td className="meta">
                      {r.deletedAt && shortDate(new Date(new Date(r.deletedAt).getTime() + RESOURCE_PURGE_DAYS * 86400000).toISOString())}
                    </td>
                  </>
                )}
                <td>
                  <div className="ra-row-actions">
                    {view === "active" ? (
                      <>
                        <Link href={`/admin/resources/${r.id}/edit`} className="btn btn-outline btn-sm">Edit</Link>
                        <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => duplicate(r.id)}>Duplicate</button>
                        <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => feature(r)}>
                          {r.featured ? "Unfeature" : "Feature"}
                        </button>
                        <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => archive(r)}>
                          {r.status === "archived" ? "Unarchive" : "Archive"}
                        </button>
                        <button className="btn btn-outline btn-sm ra-danger" disabled={busy} onClick={() => setDeleting(r)}>Delete</button>
                      </>
                    ) : (
                      <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => restore([r.id])}>Restore</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleting && (
        <DeleteDialog
          row={deleting}
          onClose={() => setDeleting(null)}
          onDone={(policy) => {
            const now = new Date().toISOString();
            setLocal((prev) => prev.map((r) => (r.id === deleting.id ? { ...r, deletedAt: now, featured: false, policyRemoved: policy } : r)));
            setDeleting(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function DeleteDialog({ row, onClose, onDone }: { row: LibraryRow; onClose: () => void; onDone: (policy: boolean) => void }) {
  const showToast = useToast();
  const [policy, setPolicy] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const res = policy ? await removeResourceForPolicyAction(row.id, reason) : await deleteResourcesAction([row.id]);
    setBusy(false);
    if (res.error) return showToast(res.error);
    showToast(policy ? "Removed. The member's XP was reversed and they've been told why." : "Deleted. Restore it from Trash within 30 days.");
    onDone(policy);
  }

  return (
    <ModalShell title="Delete resource" onClose={onClose} maxWidth={520}>
      <p style={{ marginTop: 0 }}>
        <strong>{row.title}</strong> will be hidden from members right away. You can restore it from Trash for {RESOURCE_PURGE_DAYS} days; after
        that it&apos;s removed for good. Members who saved it will see &ldquo;no longer available&rdquo;.
      </p>
      {row.memberSubmitted && (
        <label className="admin-checkbox-label" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" checked={policy} onChange={(e) => setPolicy(e.target.checked)} />
          <span>
            Removed for a policy breach
            <span className="meta" style={{ display: "block" }}>Reverses the 50 XP the member earned for it and notifies them with your reason.</span>
          </span>
        </label>
      )}
      {policy && (
        <label className="label" style={{ marginTop: 10 }}>
          Reason (shown to the member) *
          <textarea className="textarea" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary ra-danger-solid" disabled={busy || (policy && !reason.trim())} onClick={submit}>
          {busy ? "Deleting…" : policy ? "Remove and reverse XP" : "Delete"}
        </button>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
      </div>
    </ModalShell>
  );
}
