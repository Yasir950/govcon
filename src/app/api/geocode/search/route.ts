import { NextRequest, NextResponse } from "next/server";

// Real, worldwide location autocomplete backed by Komoot's free Photon
// geocoder (built on OpenStreetMap data, no API key/vendor account needed
// unlike Google Places or Mapbox) -- proxied server-side so this one route
// absorbs rate-limit/caching concerns instead of every consumer, and so a
// paid geocoder can be swapped in later by rewriting only this file.
//
// Deliberately NOT OpenStreetMap's own Nominatim /search: that endpoint is
// a fuzzy full-text/geocoding search, not a prefix/typeahead index -- a
// short partial query like "Quee" returned unrelated street/POI names
// containing that substring anywhere (verified directly), not real places
// starting with it. Photon is purpose-built for exactly this "type ahead,
// get real places back" use case and was verified to return "Queensland,
// Australia" / "Queens, New York, United States" / "Queenstown, Otago,
// New Zealand" for "Quee", matching real-world autocomplete behavior.
const PHOTON_URL = "https://photon.komoot.io/api/";

interface PhotonProperties {
  name?: string;
  state?: string;
  country?: string;
  osm_key?: string;
}

interface PhotonFeature {
  properties: PhotonProperties;
}

// Restricted to osm_key === "place" (city/town/village/state/country/
// suburb/district) -- Photon's unfiltered results also include streets,
// universities, and other POIs that happen to match the query text, which
// aren't "locations" in the sense this field means.
function formatLabel(props: PhotonProperties): string | null {
  const primary = props.name;
  if (!primary) return null;
  const parts = [primary];
  if (props.state && props.state !== primary) parts.push(props.state);
  if (props.country) parts.push(props.country);
  return parts.join(", ");
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const url = new URL(PHOTON_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "8");
    url.searchParams.set("lang", "en");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "GovConUnited/1.0 (support@govconunited.com)" },
      // Same query from many different members hits the cache instead of
      // Photon's public instance again.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ results: [] });

    const data = (await res.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const results: string[] = [];
    for (const feature of data.features ?? []) {
      if (feature.properties.osm_key !== "place") continue;
      const label = formatLabel(feature.properties);
      if (label && !seen.has(label)) {
        seen.add(label);
        results.push(label);
      }
      if (results.length >= 6) break;
    }
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[geocode] search failed (non-fatal):", err);
    return NextResponse.json({ results: [] });
  }
}
