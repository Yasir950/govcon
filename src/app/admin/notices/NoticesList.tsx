"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteNoticeAction, setNoticeStatusAction } from "./actions";
import { useToast } from "@/components/toast-provider";

interface Notice {
  id: string;
  message: string;
  level: string;
  status: string;
  ends_at: string | null;
}

export function NoticesList({ notices }: { notices: Notice[] }) {
  const router = useRouter();
  const showToast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function setStatus(id: string, status: "draft" | "published" | "archived") {
    setPendingId(id);
    const result = await setNoticeStatusAction(id, status);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this notice?")) return;
    setPendingId(id);
    const result = await deleteNoticeAction(id);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    router.refresh();
  }

  if (notices.length === 0) {
    return (
      <section className="card empty">
        <strong>No notices yet</strong>
        Create one above to show a site-wide banner.
      </section>
    );
  }

  return (
    <div>
      {notices.map((n) => (
        <div className="admin-row" key={n.id}>
          <div>
            <div className="admin-row-title">{n.message}</div>
            <div className="admin-row-meta">
              <span className={`admin-status-pill admin-status-${n.status}`}>{n.status}</span>
              {" · "}
              {n.level}
              {n.ends_at ? ` · ends ${new Date(n.ends_at).toLocaleString()}` : ""}
            </div>
          </div>
          <div className="admin-row-actions">
            {n.status !== "published" && (
              <button className="btn btn-primary btn-sm" disabled={pendingId === n.id} onClick={() => setStatus(n.id, "published")}>
                Publish
              </button>
            )}
            {n.status === "published" && (
              <button className="btn btn-outline btn-sm" disabled={pendingId === n.id} onClick={() => setStatus(n.id, "draft")}>
                Unpublish
              </button>
            )}
            {n.status !== "archived" && (
              <button className="btn btn-outline btn-sm" disabled={pendingId === n.id} onClick={() => setStatus(n.id, "archived")}>
                Archive
              </button>
            )}
            <button
              className="btn btn-outline btn-sm"
              style={{ color: "var(--o-red)", borderColor: "var(--o-red)" }}
              disabled={pendingId === n.id}
              onClick={() => remove(n.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
