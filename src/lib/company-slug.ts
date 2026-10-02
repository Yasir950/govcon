import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { slugBase } from "@/lib/slugify";

// Company URLs are just the name (/companies/acme-federal-solutions), unlike
// other content's timestamp-suffixed slugs. next_company_slug() appends
// -2, -3, ... only when another company already has that slug.
export async function uniqueCompanySlug(
  supabase: SupabaseClient<Database>,
  name: string,
): Promise<string> {
  const base = slugBase(name, "company");
  const { data, error } = await supabase.rpc("next_company_slug", { p_base: base });
  if (error || !data) throw new Error("Couldn't generate a company URL.");
  return data;
}
