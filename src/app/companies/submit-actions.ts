"use server";

import { createClient } from "@/lib/supabase/server";
import { getPlanLimit, planFromSelection } from "@/lib/entitlements";
import { uniqueCompanySlug } from "@/lib/company-slug";
import { getCompanyPageCountByOwner } from "@/lib/supabase/queries";
import { INDUSTRIES } from "@/lib/industries";

export type SubmitCompanyFields = {
  name: string;
  type: string;
  location: string;
  summary: string;
  capabilities: string;
  naicsCodes: string;
  pscCodes: string;
  certifications: string;
  uei: string;
  cageCode: string;
};

export type PossibleDuplicate = { id: string; name: string; route: string };

export type SubmitCompanyResult =
  | { error: string }
  | { possibleDuplicates: PossibleDuplicate[] }
  | { success: true; companyId: string };

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Self-service company creation (spec 8.2), pending admin review. Every
// submission lands as status='pending_review' -- the only non-admin write
// path onto companies (see the insert policy in
// 20260921002100_companies_expansion.sql) -- and stays off the public
// directory until an admin approves it via approveCompanySubmissionAction.
export async function submitCompanyAction(
  fields: SubmitCompanyFields,
  confirmDespiteDuplicates = false,
): Promise<SubmitCompanyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to submit a company." };

  const name = fields.name.trim();
  const type = fields.type.trim();
  const location = fields.location.trim();
  const summary = fields.summary.trim();
  const capabilities = fields.capabilities.trim();
  if (!name || !type || !location || !summary || !capabilities) {
    return { error: "Name, industry, location, summary, and capabilities are required." };
  }
  if (!(INDUSTRIES as readonly string[]).includes(type)) return { error: "Please choose an industry from the list." };

  const { data: profile } = await supabase.from("profiles").select("plan_selection").eq("id", user.id).maybeSingle();
  const companyPageLimit = await getPlanLimit(planFromSelection(profile?.plan_selection), "company_pages");
  if (companyPageLimit !== null) {
    const existingCount = await getCompanyPageCountByOwner(user.id);
    if (existingCount >= companyPageLimit) {
      return {
        error:
          companyPageLimit === 1
            ? "The Free plan includes one company page. Upgrade to Pro to create and manage more companies."
            : `You've reached the limit of ${companyPageLimit} company pages.`,
      };
    }
  }

  if (!confirmDespiteDuplicates) {
    const { data: matches } = await supabase
      .from("companies")
      .select("id, name, slug")
      .eq("status", "published")
      .ilike("name", `%${name}%`)
      .limit(5);
    if (matches && matches.length > 0) {
      return {
        possibleDuplicates: matches.map((m) => ({ id: m.id, name: m.name, route: `companies/${m.slug}` })),
      };
    }
  }

  let slug: string;
  try {
    slug = await uniqueCompanySlug(supabase, name);
  } catch {
    return { error: "Couldn't create the company. Please try again." };
  }

  const { data, error } = await supabase
    .from("companies")
    .insert({
      name,
      slug,
      type,
      location,
      summary,
      capabilities,
      certifications: fields.certifications.trim() || "None listed",
      logo_initials: name.slice(0, 2).toUpperCase(),
      naics_codes: splitTags(fields.naicsCodes),
      psc_codes: splitTags(fields.pscCodes),
      uei: fields.uei.trim() || null,
      cage_code: fields.cageCode.trim() || null,
      status: "pending_review",
      submitted_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: "Couldn't submit your company. Please try again." };

  return { success: true, companyId: data.id };
}
