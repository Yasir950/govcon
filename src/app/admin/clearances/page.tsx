import { createClient } from "@/lib/supabase/server";
import { ClearanceReviewList } from "./ClearanceReviewList";

export const dynamic = "force-dynamic";

export default async function AdminClearancesPage() {
  const supabase = await createClient();
  // Admin-gated at the layout level — "Admins can view all profiles" lets
  // this read other members' clearance fields directly.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, clearance, clearance_proof_note, clearance_submitted_at")
    .eq("clearance_status", "pending")
    .order("clearance_submitted_at", { ascending: true });
  if (error) throw error;

  const submissions = (data ?? []).map((p) => ({
    id: p.id,
    name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "Member",
    email: p.email,
    clearance: p.clearance,
    note: p.clearance_proof_note,
    submittedAt: p.clearance_submitted_at,
  }));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Clearance Verification</h1>
          <p>Members who uploaded proof of their security clearance, oldest first.</p>
        </div>
      </div>
      <ClearanceReviewList submissions={submissions} />
    </div>
  );
}
