"use server";

import { revalidatePath } from "next/cache";
import type { PastPerformanceRole } from "@/lib/past-performance";
import { createClient } from "@/lib/supabase/server";

export type PastPerformanceResult = { error?: string; id?: string };

const MAX_RECORDS_PER_COMPANY = 25;

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface PastPerformanceFields {
  title: string;
  customerAgency: string;
  role: PastPerformanceRole;
  contractNumber: string;
  valueDisplay: string;
  periodStart: string;
  periodEnd: string;
  isOngoing: boolean;
  location: string;
  naicsCodes: string;
  pscCodes: string;
  scope: string;
  outcomes: string;
  technologies: string;
  referencesText: string;
  confidentialNotes: string;
}

export async function upsertPastPerformanceAction(
  companyId: string,
  recordId: string | null,
  fields: PastPerformanceFields,
): Promise<PastPerformanceResult> {
  const supabase = await createClient();
  const title = fields.title.trim();
  const customerAgency = fields.customerAgency.trim();
  if (!title || !customerAgency) return { error: "Title and customer/agency are required." };

  if (!recordId) {
    const { count } = await supabase
      .from("company_past_performance")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if ((count ?? 0) >= MAX_RECORDS_PER_COMPANY) {
      return { error: `You can have up to ${MAX_RECORDS_PER_COMPANY} past performance records.` };
    }
  }

  const payload = {
    company_id: companyId,
    title,
    customer_agency: customerAgency,
    role: fields.role,
    contract_number: fields.contractNumber.trim() || null,
    value_display: fields.valueDisplay.trim() || null,
    period_start: fields.periodStart || null,
    period_end: fields.isOngoing ? null : fields.periodEnd || null,
    is_ongoing: fields.isOngoing,
    location: fields.location.trim() || null,
    naics_codes: splitTags(fields.naicsCodes),
    psc_codes: splitTags(fields.pscCodes),
    scope: fields.scope.trim() || null,
    outcomes: fields.outcomes.trim() || null,
    technologies: splitTags(fields.technologies),
    references_text: fields.referencesText.trim() || null,
    confidential_notes: fields.confidentialNotes.trim() || null,
  };

  if (recordId) {
    const { error } = await supabase.from("company_past_performance").update(payload).eq("id", recordId);
    if (error) return { error: "Couldn't save changes. Please try again." };
    return { id: recordId };
  }

  const { data, error } = await supabase.from("company_past_performance").insert(payload).select("id").single();
  if (error) return { error: "Couldn't create that record. Please try again." };
  return { id: data.id };
}

export async function setPastPerformanceStatusAction(
  recordId: string,
  status: "draft" | "published" | "archived",
): Promise<PastPerformanceResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("company_past_performance").update({ status }).eq("id", recordId);
  if (error) return { error: "Couldn't update that record. Please try again." };
  return {};
}

export async function deletePastPerformanceAction(recordId: string): Promise<PastPerformanceResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("company_past_performance").delete().eq("id", recordId);
  if (error) return { error: "Couldn't delete that record. Please try again." };
  return {};
}

export async function reorderPastPerformanceAction(recordId: string, direction: "up" | "down", companyId: string): Promise<PastPerformanceResult> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("company_past_performance")
    .select("id, sort_order")
    .eq("company_id", companyId)
    .order("sort_order");
  if (!rows) return { error: "Couldn't reorder. Please try again." };

  const index = rows.findIndex((r) => r.id === recordId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= rows.length) return {};

  const a = rows[index];
  const b = rows[swapIndex];
  await Promise.all([
    supabase.from("company_past_performance").update({ sort_order: b.sort_order }).eq("id", a.id),
    supabase.from("company_past_performance").update({ sort_order: a.sort_order }).eq("id", b.id),
  ]);
  revalidatePath(`/companies`);
  return {};
}
