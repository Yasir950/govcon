"use client";

import { adminResourceFileUrlAction } from "@/app/admin/resources/actions";
import { useToast } from "@/components/toast-provider";
import type { AuditEntry, ResourceVersion } from "@/app/admin/resources/data";

const ACTION_LABEL: Record<string, string> = {
  create: "Created",
  submit: "Submitted by member",
  resubmit: "Resubmitted by member",
  edit: "Edited",
  publish: "Published",
  schedule: "Scheduled",
  unpublish: "Moved to draft",
  archive: "Archived",
  replace_file: "Replaced the file",
  delete: "Deleted",
  restore: "Restored",
  purge: "Permanently removed",
  remove_policy: "Removed for a policy breach",
  approve: "Approved",
  reject: "Rejected",
  request_changes: "Requested changes",
  auto_hide: "Hidden by Link Health",
  unhide: "Un-hidden",
};

// Columns that are noise in the "what changed" list.
const HIDDEN_FIELDS = new Set(["updated_at", "archived_at", "deleted_by", "reviewed_at", "reviewed_by", "file_uploaded_at", "scanned_at"]);

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ResourceHistory({ resourceId, versions, audit }: { resourceId: string; versions: ResourceVersion[]; audit: AuditEntry[] }) {
  const showToast = useToast();

  async function openVersion(versionId: string) {
    const res = await adminResourceFileUrlAction(resourceId, versionId);
    if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
    else showToast(res.error ?? "Couldn't open that file.");
  }

  return (
    <div className="ra-history">
      <section className="card panel">
        <h2 className="section-title">Earlier versions</h2>
        {versions.length === 0 ? (
          <p className="meta">No earlier files, links or videos. Replacing one keeps the same resource and link, and the old one is listed here.</p>
        ) : (
          <ul className="ra-history-list">
            {versions.map((v) => (
              <li key={v.id}>
                <div className="ra-history-main">
                  <span className="ra-history-what" title={v.label}>{v.label}</span>
                  {v.hasFile && (
                    <button type="button" className="link-btn" onClick={() => openVersion(v.id)}>
                      Open
                    </button>
                  )}
                </div>
                <div className="meta">
                  Replaced {when(v.replacedAt)}
                  {v.replacedBy ? ` by ${v.replacedBy}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card panel">
        <h2 className="section-title">Audit log</h2>
        {audit.length === 0 ? (
          <p className="meta">Nothing recorded yet.</p>
        ) : (
          <ul className="ra-history-list">
            {audit.map((a) => {
              const fields = a.fields.filter((f) => !HIDDEN_FIELDS.has(f));
              return (
                <li key={a.id}>
                  <div className="ra-history-main">
                    <strong>{ACTION_LABEL[a.action] ?? a.action}</strong>
                    <span className="meta">{a.actor}</span>
                  </div>
                  <div className="meta">
                    {when(a.createdAt)}
                    {a.action === "edit" && fields.length > 0 ? ` · ${fields.map((f) => f.replace(/_/g, " ")).join(", ")}` : ""}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
