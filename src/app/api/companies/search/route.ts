import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Backs the Experience form's Company/Organization autocomplete — real
// published companies from our own directory, not a free-text-only field.
// Typing a name with no match is still accepted (the profile form falls
// back to storing the plain text with no company_id), matching how
// LinkedIn's own organization picker behaves for an unlisted employer.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, logo_url")
    .eq("status", "published")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(8);
  if (error) return NextResponse.json({ results: [] });

  return NextResponse.json({
    results: (data ?? []).map((c) => ({ id: c.id, name: c.name, logoUrl: c.logo_url })),
  });
}
