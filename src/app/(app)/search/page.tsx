import type { Metadata } from "next";
import { SearchPageClient } from "@/components/search/SearchPageClient";
import { getSearchHistory } from "@/lib/supabase/queries";
import { searchOneType, SEARCH_ENTITY_TYPES, type SearchEntityType } from "@/lib/supabase/search";
import { getViewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Search · GovConUnited" };
export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const type = (SEARCH_ENTITY_TYPES as string[]).includes(params.type ?? "")
    ? (params.type as SearchEntityType)
    : "people";
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = 20;

  const viewer = await getViewer();
  const { results, hasMore } = q ? await searchOneType(type, q, viewer, (page - 1) * perPage, perPage) : { results: [], hasMore: false };
  const recentSearches = viewer ? await getSearchHistory(viewer.id) : [];

  return (
    <SearchPageClient
      query={q}
      activeType={type}
      results={results}
      hasMore={hasMore}
      page={page}
      recentSearches={recentSearches}
      signedIn={!!viewer}
    />
  );
}
