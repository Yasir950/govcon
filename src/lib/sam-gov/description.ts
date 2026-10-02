import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSamGovNoticeDescription } from "./client";
import { SAM_GOV_DESCRIPTION_PENDING } from "./parse";

// Synced notices store a placeholder description (the search API only links
// to the text). On first view, fetch the real text and persist it so each
// notice costs at most one extra SAM.gov request. Falls back to the
// placeholder if SAM.gov is unreachable — the page links to the original.
export async function resolveSamGovDescription(opportunity: {
  id: string;
  source: string;
  noticeId: string | null;
  description: string;
}): Promise<string> {
  if (opportunity.source !== "sam_gov" || !opportunity.noticeId || opportunity.description !== SAM_GOV_DESCRIPTION_PENDING) {
    return opportunity.description;
  }
  const text = await fetchSamGovNoticeDescription(opportunity.noticeId);
  if (!text) return opportunity.description;
  // Service role: viewers have no write access to synced notices. The
  // content_hash is untouched, so the next sync won't treat this as a change.
  await createAdminClient().from("opportunities").update({ description: text }).eq("id", opportunity.id);
  return text;
}
