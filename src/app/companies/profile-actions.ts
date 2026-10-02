"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeUrl } from "@/lib/url";
import { INDUSTRIES } from "@/lib/industries";

export type UpdateCompanyProfileResult = { error?: string };

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

// `companies` has no RLS UPDATE policy for a company_admins member (only
// platform admins can write to it directly) — same limitation
// uploadOwnerCompanyMediaAction() already works around for logo/cover, via
// a security-definer RPC that re-checks company_admins membership itself
// and writes only the whitelisted columns. See update_company_profile() in
// 20260922040000_company_manage_expansion.sql.
export async function updateCompanyProfileAction(companyId: string, companySlug: string, formData: FormData): Promise<UpdateCompanyProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const yearFoundedRaw = field("yearFounded");
  const yearFounded = yearFoundedRaw ? parseInt(yearFoundedRaw, 10) : null;
  if (yearFoundedRaw && Number.isNaN(yearFounded)) return { error: "Year founded must be a number." };
  // Only a value from the canonical list is written; anything else (e.g. a
  // legacy free-text industry left selected) is sent as null, which the RPC
  // treats as "keep the current industry".
  const industry = field("industry");
  const pType = (INDUSTRIES as readonly string[]).includes(industry) ? industry : null;

  // The generated RPC arg types mark every parameter non-nullable (Postgres
  // function params carry no NOT NULL of their own for the codegen to pick
  // up), but the function itself is written to accept and store a real
  // NULL for "not set" — the same representation every other nullable
  // company column already uses — so the params object is cast at the
  // call boundary only, not loosely typed throughout.
  const args = {
    target_company_id: companyId,
    p_tagline: field("tagline") || null,
    p_overview: field("overview") || null,
    p_website: normalizeUrl(field("website")),
    p_business_email: field("businessEmail") || null,
    p_phone: field("phone") || null,
    p_year_founded: yearFounded,
    p_company_size: field("companySize") || null,
    p_ownership: field("ownership") || null,
    p_location: field("location") || null,
    p_services: splitList(field("services")),
    p_service_areas: splitList(field("serviceAreas")),
    p_agencies_served: splitList(field("agenciesServed")),
    p_contract_vehicles: splitList(field("contractVehicles")),
    p_naics_codes: splitList(field("naicsCodes")),
    p_psc_codes: splitList(field("pscCodes")),
    p_keywords: splitList(field("keywords")),
    // Retired: Contract Vehicles is a single list field (p_contract_vehicles)
    // now — the old free-text note is cleared on every save.
    p_contract_vehicles_note: null,
    p_core_specialties: field("coreSpecialties") || null,
    p_type: pType,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above: generated arg types are wrong, not this call
  const { error } = await supabase.rpc("update_company_profile", args as any);
  if (error) return { error: "Couldn't save your changes. Please try again." };

  revalidatePath(`/companies/${companySlug}`);
  revalidatePath(`/companies/${companySlug}/manage`);
  revalidatePath("/companies");
  revalidatePath("/partners");
  return {};
}

export type UpdateCompanyIdentityResult = { error?: string; sentBackForReview?: boolean };

// Legal name, UEI, and CAGE code are what a platform admin verifies the
// company against, so they save through their own RPC —
// update_company_identity() in 20260928000700 — which the
// guard_company_verification trigger turns into a re-review when the
// company was already verified.
export async function updateCompanyIdentityAction(
  companyId: string,
  companySlug: string,
  formData: FormData,
): Promise<UpdateCompanyIdentityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const legalName = field("legalName");
  const uei = field("uei").toUpperCase();
  const cageCode = field("cageCode").toUpperCase();
  if (uei && !/^[A-Z0-9]{12}$/.test(uei)) return { error: "UEI must be 12 letters or numbers." };
  if (cageCode && !/^[A-Z0-9]{5}$/.test(cageCode)) return { error: "CAGE code must be 5 letters or numbers." };

  const { data: before } = await supabase.from("companies").select("verification_status").eq("id", companyId).maybeSingle();
  if (!before) return { error: "Couldn't find that company." };

  const { data: status, error } = await supabase.rpc("update_company_identity", {
    target_company_id: companyId,
    p_legal_name: legalName,
    p_uei: uei,
    p_cage_code: cageCode,
  });
  if (error) return { error: "Couldn't save your changes. Please try again." };

  revalidatePath(`/companies/${companySlug}`);
  revalidatePath(`/companies/${companySlug}/manage`);
  revalidatePath("/companies");
  revalidatePath("/admin/companies");
  return { sentBackForReview: before.verification_status === "verified" && status !== "verified" };
}
