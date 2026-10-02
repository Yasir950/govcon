"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { triggerSamGovSyncAction } from "@/app/admin/opportunities/sync-actions";
import { useToast } from "@/components/toast-provider";

export function SyncNowButton() {
  const router = useRouter();
  const showToast = useToast();
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    const result = await triggerSamGovSyncAction();
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    const s = result.summary!;
    showToast(`Sync complete: ${s.createdCount} created, ${s.updatedCount} updated, ${s.archivedCount} archived, ${s.failedCount} failed.`);
    router.refresh();
  }

  return (
    <button className="btn btn-primary btn-sm" disabled={pending} onClick={run}>
      {pending ? "Syncing…" : "Sync Now"}
    </button>
  );
}
