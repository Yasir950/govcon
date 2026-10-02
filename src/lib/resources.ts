// Shared rules for the three resource delivery kinds (file / external link /
// video) — see 20261001001200_resource_delivery_kinds.sql. Safe to import
// from client and server code: no network calls here.

export type ResourceKind = "file" | "link" | "video";
export type VideoProvider = "youtube" | "vimeo";

// Who can open a resource — see 20261002000000_resource_access_levels.sql.
export type ResourceAccess = "public" | "members" | "pro";

export const RESOURCE_ACCESS_LEVELS: { value: ResourceAccess; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone, even signed out" },
  { value: "members", label: "Members", hint: "Any signed-in member" },
  { value: "pro", label: "Pro", hint: "Pro members only; others see it locked" },
];

export const RESOURCE_KINDS: { value: ResourceKind; label: string }[] = [
  { value: "file", label: "File (PDF, DOCX, XLSX, PPTX, CSV, ZIP)" },
  { value: "link", label: "External link" },
  { value: "video", label: "Video (YouTube or Vimeo)" },
];

// Fallback list only — the real list is the resource_types table, which
// admins can add to (20261002000100_resource_admin_panel.sql).
export const RESOURCE_TYPES = ["Guide", "Checklist", "Template", "Workbook", "Video"];

export const RESOURCE_TITLE_MAX = 120;
export const RESOURCE_SUMMARY_MAX = 200;
export const RESOURCE_SOURCE_MAX = 120;
export const RESOURCE_MAX_TAGS = 20;
export const MAX_PENDING_SUBMISSIONS = 5;
export const RESOURCE_PURGE_DAYS = 30;

export type ResourceStatus = "draft" | "scheduled" | "published" | "archived";
export type SubmissionStatus = "pending" | "changes_requested" | "approved" | "rejected";

export const RESOURCE_STATUSES: { value: ResourceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: "Under review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Not approved",
};

export interface ResourceCategory {
  id: string;
  name: string;
}

// "8(a), WOSB ,naics" → ["8(a)", "WOSB", "naics"], de-duplicated
// case-insensitively.
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out.slice(0, RESOURCE_MAX_TAGS);
}

export const RESOURCE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export const MAX_RESOURCE_FILE_BYTES = 25 * 1024 * 1024;

// Extension → the content type the bucket accepts. The browser's own
// File.type is unreliable on Windows (CSV comes through as
// application/vnd.ms-excel, ZIP as application/x-zip-compressed, or empty),
// so uploads always send these.
export const RESOURCE_FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  zip: "application/zip",
};

export const RESOURCE_FILE_ACCEPT = Object.keys(RESOURCE_FILE_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export function fileExtension(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext in RESOURCE_FILE_TYPES && name.includes(".") ? ext : null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

// "https://www.sba.gov/federal-contracting/…" → "sba.gov"
export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function parseVideoUrl(url: string): { provider: VideoProvider; id: string } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1, 12);
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: "youtube", id } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/)?.[1] ?? "";
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: "youtube", id } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.match(/^\/(?:video\/)?(\d+)/)?.[1];
    return id ? { provider: "vimeo", id } : null;
  }
  return null;
}

export function videoEmbedUrl(provider: VideoProvider, id: string): string {
  return provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`
    : `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1`;
}

// The one label shown on a card / saved row — always what the member gets.
export function resourceDeliveryLabel(r: {
  kind: ResourceKind;
  fileExt: string | null;
  fileSize: number | null;
  linkDomain: string | null;
  videoDurationSeconds: number | null;
}): string {
  if (r.kind === "file") {
    const ext = r.fileExt?.toUpperCase() ?? "File";
    return r.fileSize ? `${ext} · ${formatFileSize(r.fileSize)}` : ext;
  }
  if (r.kind === "video") {
    return r.videoDurationSeconds ? `Video · ${formatDuration(r.videoDurationSeconds)}` : "Video";
  }
  return r.linkDomain ? `External link · ${r.linkDomain}` : "External link";
}
