"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";
import { runSamGovSync, type SyncRunSummary } from "@/lib/sam-gov/sync";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admin access required");
  return viewer;
}

export type TriggerSyncResult = { error?: string; summary?: SyncRunSummary };

// Admin-triggered sync runs the same core function the cron route calls,
// in-process (no self-HTTP-call), over the admin's own RLS-scoped session
// (not the service-role client) — is_admin()-gated policies on every
// affected table make this safe, and it means "Sync Now" doesn't depend on
// SUPABASE_SERVICE_ROLE_KEY being configured at all. Only the cron route
// (no user session to work with) needs the service-role client.
export async function triggerSamGovSyncAction(): Promise<TriggerSyncResult> {
  const viewer = await requireAdmin();
  try {
    const summary = await runSamGovSync({
      supabase: await createClient(),
      trigger: "admin",
      triggeredByProfileId: viewer.id,
    });
    revalidatePath("/admin/opportunities/sync");
    revalidatePath("/opportunities");
    return { summary };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sync failed. Check SAM_GOV_API_KEY and try again." };
  }
}
