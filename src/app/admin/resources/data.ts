import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import type { ResourceFormInitial } from "@/components/admin/ResourceForm";
import type { ResourceAccess, ResourceCategory, ResourceKind, ResourceStatus } from "@/lib/resources";

// Shared reads for Admin → Resources pages. Service role throughout: the
// file / link / video / review columns aren't selectable through the API,
// and the admin layout has already checked isAdmin.

type ResourceRow = Database["public"]["Tables"]["resources"]["Row"];

export async function getResourceTaxonomy(): Promise<{ categories: ResourceCategory[]; types: string[] }> {
  const admin = createAdminClient();
  const [{ data: categories }, { data: types }] = await Promise.all([
    admin.from("resource_categories").select("id, name").order("sort_order").order("name"),
    admin.from("resource_types").select("name").order("sort_order").order("name"),
  ]);
  return { categories: categories ?? [], types: (types ?? []).map((t) => t.name) };
}

export async function getResourceRow(id: string): Promise<ResourceRow | null> {
  const { data } = await createAdminClient().from("resources").select("*").eq("id", id).maybeSingle();
  return data;
}

export function toFormInitial(r: ResourceRow): ResourceFormInitial {
  const kind = r.kind as ResourceKind;
  const videoUrl =
    r.video_provider === "youtube"
      ? `https://www.youtube.com/watch?v=${r.video_id}`
      : r.video_provider === "vimeo"
        ? `https://vimeo.com/${r.video_id}`
        : "";
  return {
    title: r.title,
    slug: r.slug,
    type: r.type,
    categoryId: r.category_id ?? "",
    description: r.description,
    body: r.body ?? "",
    tags: (r.tags ?? []).join(", "),
    source: r.source ?? "",
    access: r.access as ResourceAccess,
    kind,
    url: kind === "video" ? videoUrl : (r.url ?? ""),
    featured: r.featured,
    status: r.status as ResourceStatus,
    scheduledAt: r.scheduled_at,
    fileName: r.file_name,
    fileSize: r.file_size,
    fileUploadedAt: r.file_uploaded_at,
    scanStatus: r.scan_status,
    videoDurationSeconds: r.video_duration_seconds,
    videoThumbnailUrl: r.video_thumbnail_url,
    thumbnailUrl: r.thumbnail_url,
    thumbnailAuto: r.thumbnail_auto,
  };
}

export interface ResourceVersion {
  id: string;
  kind: string;
  label: string;
  replacedAt: string;
  replacedBy: string | null;
  hasFile: boolean;
}

export interface AuditEntry {
  id: number;
  action: string;
  actor: string | null;
  createdAt: string;
  fields: string[];
}

function personName(p: { first_name: string | null; last_name: string | null } | null | undefined): string | null {
  if (!p) return null;
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || null;
}

// Earlier files / links / videos (resources_keep_version) and the audit log
// (resources_audit), newest first.
export async function getResourceHistory(id: string): Promise<{ versions: ResourceVersion[]; audit: AuditEntry[] }> {
  const admin = createAdminClient();
  const [{ data: versions }, { data: audit }] = await Promise.all([
    admin
      .from("resource_versions")
      .select("id, kind, url, file_path, file_name, file_size, video_provider, video_id, replaced_at, replaced_by")
      .eq("resource_id", id)
      .order("replaced_at", { ascending: false })
      .limit(50),
    admin
      .from("resource_audit_log")
      .select("id, action, actor_id, changes, created_at")
      .eq("resource_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const people = new Set<string>();
  (versions ?? []).forEach((v) => v.replaced_by && people.add(v.replaced_by));
  (audit ?? []).forEach((a) => a.actor_id && people.add(a.actor_id));
  const { data: profiles } = people.size
    ? await admin.from("profiles").select("id, first_name, last_name").in("id", [...people])
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, personName(p)]));

  return {
    versions: (versions ?? []).map((v) => ({
      id: v.id,
      kind: v.kind,
      label:
        v.kind === "file"
          ? (v.file_name ?? "File")
          : v.kind === "video"
            ? `${v.video_provider === "vimeo" ? "Vimeo" : "YouTube"} ${v.video_id ?? ""}`.trim()
            : (v.url ?? "Link"),
      replacedAt: v.replaced_at,
      replacedBy: v.replaced_by ? (names.get(v.replaced_by) ?? "Admin") : null,
      hasFile: v.kind === "file" && !!v.file_path,
    })),
    audit: (audit ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      actor: a.actor_id ? (names.get(a.actor_id) ?? "Unknown") : "System",
      createdAt: a.created_at,
      fields: a.changes && typeof a.changes === "object" && !Array.isArray(a.changes) ? Object.keys(a.changes) : [],
    })),
  };
}
