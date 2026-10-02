import "server-only";
import type { VideoProvider } from "@/lib/resources";

// Thumbnail + duration for an admin-pasted YouTube/Vimeo URL, pulled from
// the provider when the resource is saved (never hosted by us).
//   * Vimeo's public oEmbed returns both.
//   * YouTube's oEmbed has a thumbnail but no duration — the duration
//     needs the YouTube Data API (YOUTUBE_API_KEY). Without the key the
//     card just says "Video".
export async function fetchVideoMeta(
  provider: VideoProvider,
  id: string,
): Promise<{ thumbnailUrl: string | null; durationSeconds: number | null }> {
  if (provider === "vimeo") {
    const data = await getJson(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}`);
    return {
      thumbnailUrl: typeof data?.thumbnail_url === "string" ? data.thumbnail_url : null,
      durationSeconds: typeof data?.duration === "number" && data.duration > 0 ? Math.round(data.duration) : null,
    };
  }

  let durationSeconds: number | null = null;
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    const data = await getJson(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`,
    );
    const iso = data?.items?.[0]?.contentDetails?.duration;
    if (typeof iso === "string") durationSeconds = parseIsoDuration(iso);
  }
  // i.ytimg.com always serves hqdefault for a real video id.
  return { thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, durationSeconds };
}

// "PT1H2M3S" → 3723
function parseIsoDuration(iso: string): number | null {
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, d, h, min, s] = m.map((v) => Number(v ?? 0));
  const total = d * 86400 + h * 3600 + min * 60 + s;
  return total > 0 ? total : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getJson(url: string): Promise<any> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
