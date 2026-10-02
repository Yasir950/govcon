import { createClient } from "@/lib/supabase/server";

export type ClearanceStatus = "unverified" | "pending" | "verified" | "rejected";

// Owner-only view of their own clearance verification — profiles' RLS
// only lets a member read their own row, so this never leaks another
// member's proof or review notes.
export interface ClearanceVerification {
  status: ClearanceStatus;
  hasProof: boolean;
  proofFileName: string | null;
  proofNote: string | null;
  submittedAt: string | null;
  reviewNote: string | null;
}

export async function getOwnClearanceVerification(profileId: string): Promise<ClearanceVerification | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("clearance_status, clearance_proof_path, clearance_proof_note, clearance_submitted_at, clearance_review_note")
    .eq("id", profileId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.clearance_status as ClearanceStatus,
    hasProof: Boolean(data.clearance_proof_path),
    proofFileName: data.clearance_proof_path?.split("/").pop() ?? null,
    proofNote: data.clearance_proof_note,
    submittedAt: data.clearance_submitted_at,
    reviewNote: data.clearance_review_note,
  };
}
