"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { getViewer } from "@/lib/supabase/viewer";
import { slugBase } from "@/lib/slugify";
import { fetchVideoMeta } from "@/lib/resource-video";
import { contentMatchesExtension, scanFile } from "@/lib/virus-scan";
import { createNotification } from "@/lib/notifications";
import { checkResourceTarget, recordLinkCheck } from "@/lib/resource-link-health";
import {
  fileExtension,
  isUuid,
  MAX_RESOURCE_FILE_BYTES,
  parseTags,
  parseVideoUrl,
  RESOURCE_ACCESS_LEVELS,
  RESOURCE_SLUG_PATTERN,
  RESOURCE_SOURCE_MAX,
  RESOURCE_STATUSES,
  RESOURCE_SUMMARY_MAX,
  RESOURCE_TITLE_MAX,
  type ResourceAccess,
  type ResourceKind,
  type ResourceStatus,
} from "@/lib/resources";

// Admin → Resources (20261001001200_resource_delivery_kinds.sql,
// 20261002000000_resource_access_levels.sql,
// 20261002000100_resource_admin_panel.sql).
// url / file_path / file_name / video_id / thumbnail_url and the review and
// link-health columns aren't selectable through the API, so reads of them
// go through the service role, after requireAdmin(). Writes use the
// admin's own session so the audit log records who did it.

const BUCKET = "resource-files";
const THUMB_BUCKET = "resource-thumbnails";

type ResourceUpdate = Database["public"]["Tables"]["resources"]["Update"];

export interface ResourceInput {
  title: string;
  slug: string;
  type: string;
  categoryId: string;
  description: string;
  // Full description, Markdown.
  body: string;
  tags: string;
  source: string;
  access: ResourceAccess;
  kind: ResourceKind;
  // External link URL, or the YouTube/Vimeo URL for a video.
  url: string;
  featured: boolean;
  status: ResourceStatus;
  scheduledAt: string | null;
}

export type ResourceActionResult = { error?: string; id?: string; warning?: string };
export type BulkResult = { error?: string; count?: number };

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admin access required");
  return viewer;
}

function revalidate() {
  revalidatePath("/admin/resources", "layout");
  revalidatePath("/resources", "layout");
  revalidatePath("/saved");
}

async function uniqueSlug(base: string, exceptId: string | null): Promise<string> {
  const admin = createAdminClient();
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    let q = admin.from("resources").select("id").eq("slug", candidate);
    if (exceptId) q = q.neq("id", exceptId);
    const { data } = await q.maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function saveResourceAction(id: string | null, input: ResourceInput): Promise<ResourceActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();

  const title = input.title.trim();
  const description = input.description.trim();
  if (!title) return { error: "Title is required." };
  if (title.length > RESOURCE_TITLE_MAX) return { error: `Keep the title to ${RESOURCE_TITLE_MAX} characters.` };
  if (!description) return { error: "Short description is required." };
  if (description.length > RESOURCE_SUMMARY_MAX) return { error: `Keep the short description to ${RESOURCE_SUMMARY_MAX} characters.` };
  if (input.source.trim().length > RESOURCE_SOURCE_MAX) return { error: `Keep the source to ${RESOURCE_SOURCE_MAX} characters.` };
  if (!RESOURCE_ACCESS_LEVELS.some((a) => a.value === input.access)) return { error: "Pick who can open it." };
  if (!RESOURCE_STATUSES.some((s) => s.value === input.status)) return { error: "Pick a status." };
  if (input.status === "scheduled" && !input.scheduledAt) return { error: "Pick the date and time to publish it." };

  const [{ data: type }, { data: category }] = await Promise.all([
    supabase.from("resource_types").select("name").eq("name", input.type).maybeSingle(),
    isUuid(input.categoryId)
      ? supabase.from("resource_categories").select("id").eq("id", input.categoryId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!type) return { error: "Pick a type." };
  if (!category) return { error: "Pick a category." };

  const wantedSlug = input.slug.trim().toLowerCase() || slugBase(title, "resource");
  if (!RESOURCE_SLUG_PATTERN.test(wantedSlug) || wantedSlug.length > 80) {
    return { error: "The slug can only use lowercase letters, numbers and single dashes (max 80)." };
  }
  if (input.slug.trim()) {
    let taken = admin.from("resources").select("id").eq("slug", wantedSlug);
    if (id) taken = taken.neq("id", id);
    if ((await taken.maybeSingle()).data) return { error: "That slug is already used by another resource." };
  }
  const slug = input.slug.trim() ? wantedSlug : await uniqueSlug(wantedSlug, id);

  const payload: ResourceUpdate = {
    title,
    slug,
    type: type.name,
    category_id: category.id,
    description,
    body: input.body.trim() || null,
    tags: parseTags(input.tags),
    source: input.source.trim() || null,
    // is_pro is kept in sync by the resources_sync_access trigger.
    access: input.access,
    featured: input.featured,
    kind: input.kind,
    url: null,
    video_provider: null,
    video_id: null,
    video_thumbnail_url: null,
    video_duration_seconds: null,
  };

  // Submissions under review are published by Approve, not by the status
  // field (that would skip the notification and XP).
  const { data: existing } = id
    ? await admin.from("resources").select("submission_status, status, url, video_id, video_provider, kind").eq("id", id).maybeSingle()
    : { data: null };
  if (id && !existing) return { error: "That resource no longer exists." };
  const underReview = !!existing?.submission_status && existing.submission_status !== "approved";
  if (!underReview) {
    payload.status = input.status;
    payload.scheduled_at = input.status === "scheduled" ? input.scheduledAt : null;
    if (input.status === "archived" && existing?.status !== "archived") payload.archived_at = new Date().toISOString();
  }

  if (input.kind === "link") {
    const url = input.url.trim();
    if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url)) return { error: "Add a full link starting with https://." };
    payload.url = url;
  } else if (input.kind === "video") {
    const video = parseVideoUrl(input.url);
    if (!video) return { error: "Paste a YouTube or Vimeo video URL." };
    payload.video_provider = video.provider;
    payload.video_id = video.id;
    const sameVideo = existing?.kind === "video" && existing.video_id === video.id && existing.video_provider === video.provider;
    const meta = await fetchVideoMeta(video.provider, video.id);
    payload.video_thumbnail_url = meta.thumbnailUrl;
    payload.video_duration_seconds = meta.durationSeconds;
    if (!sameVideo) Object.assign(payload, { link_status: null, link_error: null, link_failed_at: null, link_fail_streak: 0 });
  }
  if (input.kind === "link" && existing?.url !== payload.url) {
    Object.assign(payload, { link_status: null, link_error: null, link_failed_at: null, link_fail_streak: 0 });
  }

  // Switching a file resource to a link/video: the file moves to the
  // version history (resources_keep_version), it isn't deleted.
  if (id && input.kind !== "file") {
    Object.assign(payload, {
      file_path: null,
      file_name: null,
      file_size: null,
      file_ext: null,
      file_uploaded_at: null,
      scan_status: null,
      scanned_at: null,
    });
  }

  let savedId = id;
  if (id) {
    const { error } = await supabase.from("resources").update(payload).eq("id", id);
    if (error) return { error: error.code === "23505" ? "That slug is already used by another resource." : "Couldn't save changes. Please try again." };
  } else {
    const { data: last } = await admin.from("resources").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase
      .from("resources")
      .insert({ ...payload, title, description, type: type.name, slug, sort_order: (last?.sort_order ?? 0) + 1 })
      .select("id")
      .single();
    if (error || !data) return { error: error?.code === "23505" ? "That slug is already used by another resource." : "Couldn't create that. Please try again." };
    savedId = data.id;
  }

  revalidate();

  const warning =
    input.kind === "video" && payload.video_duration_seconds == null
      ? "Saved. The video length couldn't be read from the provider, so the card shows just “Video”."
      : undefined;
  return { id: savedId ?? undefined, warning };
}

// Checks size, type and the actual bytes of an upload already in the
// bucket, then virus-scans it. Deletes it and says why when it fails.
async function vetUpload(path: string, originalName: string): Promise<
  { error: string } | { ext: string; size: number; scanStatus: "clean" | "unscanned" }
> {
  const admin = createAdminClient();
  const discard = () => admin.storage.from(BUCKET).remove([path]);
  const ext = fileExtension(originalName);
  if (!ext) {
    await discard();
    return { error: "Only PDF, DOCX, XLSX, PPTX, CSV and ZIP files are allowed." };
  }
  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(path);
  if (downloadError || !blob) return { error: "Couldn't read the uploaded file. Please try again." };
  if (blob.size > MAX_RESOURCE_FILE_BYTES) {
    await discard();
    return { error: "Files can be at most 25 MB." };
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!contentMatchesExtension(bytes, ext)) {
    await discard();
    return { error: `That file isn't a real .${ext} file.` };
  }
  const scan = await scanFile(bytes, originalName);
  if (scan.status === "infected") {
    await discard();
    return { error: "The virus scan flagged this file, so it was deleted." };
  }
  if (scan.status === "failed") {
    await discard();
    return { error: "The virus scanner couldn't check this file. Please try again in a few minutes." };
  }
  return { ext, size: blob.size, scanStatus: scan.status };
}

// Called after the browser uploaded the file to resource-files/{id}/…
// (admin storage policy). Replacing a file keeps the resource id and link;
// the previous file stays in storage and in the version history.
export async function attachResourceFileAction(
  id: string,
  path: string,
  originalName: string,
): Promise<ResourceActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  if (!path.startsWith(`${id}/`)) return { error: "That upload doesn't belong to this resource." };
  const vetted = await vetUpload(path, originalName);
  if ("error" in vetted) return { error: vetted.error };

  const { data: current } = await createAdminClient().from("resources").select("thumbnail_auto").eq("id", id).maybeSingle();
  const now = new Date().toISOString();
  const patch: ResourceUpdate = {
    kind: "file",
    file_path: path,
    file_name: originalName,
    file_size: vetted.size,
    file_ext: vetted.ext,
    file_uploaded_at: now,
    scan_status: vetted.scanStatus,
    scanned_at: vetted.scanStatus === "clean" ? now : null,
  };
  // A thumbnail generated from the old PDF no longer matches.
  if (current?.thumbnail_auto && vetted.ext !== "pdf") Object.assign(patch, { thumbnail_url: null, thumbnail_auto: false });
  const { error } = await supabase.from("resources").update(patch).eq("id", id);
  if (error) {
    await createAdminClient().storage.from(BUCKET).remove([path]);
    return { error: "Couldn't attach the file. Please try again." };
  }
  revalidate();

  return vetted.scanStatus === "unscanned"
    ? { id, warning: "File attached, but no virus scanner is configured (VIRUS_SCAN_URL), so it wasn't scanned." }
    : { id };
}

// The browser uploaded an image to resource-thumbnails/{id}/… (custom, or
// the PDF's first page rendered client-side when auto). null clears it.
export async function setResourceThumbnailAction(id: string, path: string | null, auto: boolean): Promise<ResourceActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  if (path && !path.startsWith(`${id}/`)) return { error: "That image doesn't belong to this resource." };
  const { data: current } = await createAdminClient().from("resources").select("thumbnail_url, thumbnail_auto").eq("id", id).maybeSingle();
  if (!current) return { error: "That resource no longer exists." };
  // Never let an auto thumbnail overwrite a custom one.
  if (auto && current.thumbnail_url && !current.thumbnail_auto) return { id };

  const url = path ? supabase.storage.from(THUMB_BUCKET).getPublicUrl(path).data.publicUrl : null;
  const { error } = await supabase.from("resources").update({ thumbnail_url: url, thumbnail_auto: !!path && auto }).eq("id", id);
  if (error) return { error: "Couldn't save the thumbnail." };

  const oldPath = current.thumbnail_url?.split(`/${THUMB_BUCKET}/`)[1];
  if (oldPath && oldPath !== path) await supabase.storage.from(THUMB_BUCKET).remove([decodeURIComponent(oldPath)]);
  revalidate();
  return { id };
}

// Admin preview of the current file or an older version (members use
// /resources/{id}/download).
export async function adminResourceFileUrlAction(id: string, versionId?: string): Promise<{ url?: string; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = versionId
    ? await admin.from("resource_versions").select("file_path, file_name").eq("id", versionId).eq("resource_id", id).maybeSingle()
    : await admin.from("resources").select("file_path, file_name").eq("id", id).maybeSingle();
  if (!data?.file_path) return { error: "No file attached." };
  const { data: signed, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(data.file_path, 120, { download: data.file_name ?? true });
  if (error || !signed) return { error: "Couldn't open the file." };
  return { url: signed.signedUrl };
}

// ------------------------------------------------------------- types & categories

export async function addResourceTypeAction(name: string): Promise<{ error?: string; name?: string }> {
  await requireAdmin();
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > 40) return { error: "Type names are 1–40 characters." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("resource_types").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("resource_types").insert({ name: clean, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error && error.code !== "23505") return { error: "Couldn't add that type." };
  revalidate();
  return { name: clean };
}

export async function addResourceCategoryAction(name: string): Promise<{ error?: string; id?: string; name?: string }> {
  await requireAdmin();
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > 60) return { error: "Category names are 1–60 characters." };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("resource_categories").select("id, name").ilike("name", clean).maybeSingle();
  if (existing) return existing;
  const { data: last } = await supabase.from("resource_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("resource_categories")
    .insert({ name: clean, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id, name")
    .single();
  if (error || !data) return { error: "Couldn't add that category." };
  revalidate();
  return data;
}

// ------------------------------------------------------------- library actions

export async function duplicateResourceAction(id: string): Promise<ResourceActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: r } = await admin.from("resources").select("*").eq("id", id).maybeSingle();
  if (!r) return { error: "That resource no longer exists." };

  const title = `Copy of ${r.title}`.slice(0, 120);
  const { data: last } = await admin.from("resources").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data: copy, error } = await supabase
    .from("resources")
    .insert({
      title,
      slug: await uniqueSlug(slugBase(title, "resource"), null),
      type: r.type,
      category_id: r.category_id,
      description: r.description,
      body: r.body,
      tags: r.tags,
      source: r.source,
      access: r.access,
      kind: r.kind,
      url: r.url,
      video_provider: r.video_provider,
      video_id: r.video_id,
      video_thumbnail_url: r.video_thumbnail_url,
      video_duration_seconds: r.video_duration_seconds,
      status: "draft",
      featured: false,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error || !copy) return { error: "Couldn't duplicate that resource." };

  // Own copies of the file and thumbnail, so deleting either resource
  // never breaks the other.
  let warning: string | undefined;
  if (r.file_path) {
    const to = `${copy.id}/${r.file_path.split("/").pop()}`;
    const { error: copyError } = await admin.storage.from(BUCKET).copy(r.file_path, to);
    if (copyError) warning = "Duplicated, but the file couldn't be copied — upload it on the copy.";
    else {
      await supabase
        .from("resources")
        .update({
          file_path: to,
          file_name: r.file_name,
          file_size: r.file_size,
          file_ext: r.file_ext,
          file_uploaded_at: r.file_uploaded_at,
          scan_status: r.scan_status,
          scanned_at: r.scanned_at,
        })
        .eq("id", copy.id);
    }
  }
  const thumbPath = r.thumbnail_url?.split(`/${THUMB_BUCKET}/`)[1];
  if (thumbPath) {
    const to = `${copy.id}/${decodeURIComponent(thumbPath).split("/").pop()}`;
    const { error: thumbError } = await admin.storage.from(THUMB_BUCKET).copy(decodeURIComponent(thumbPath), to);
    if (!thumbError) {
      await supabase
        .from("resources")
        .update({ thumbnail_url: admin.storage.from(THUMB_BUCKET).getPublicUrl(to).data.publicUrl, thumbnail_auto: r.thumbnail_auto })
        .eq("id", copy.id);
    }
  }
  revalidate();
  return { id: copy.id, warning };
}

function cleanIds(ids: string[]): string[] {
  return [...new Set(ids.filter(isUuid))].slice(0, 500);
}

export async function setResourcesStatusAction(ids: string[], status: "published" | "archived" | "draft"): Promise<BulkResult> {
  await requireAdmin();
  const list = cleanIds(ids);
  if (!list.length) return { count: 0 };
  const supabase = await createClient();
  const patch: ResourceUpdate = { status, scheduled_at: null };
  if (status === "archived") patch.archived_at = new Date().toISOString();
  // Submissions still under review are only published through Approve.
  const { data, error } = await supabase
    .from("resources")
    .update(patch)
    .in("id", list)
    .is("deleted_at", null)
    .or("submission_status.is.null,submission_status.eq.approved")
    .select("id");
  if (error) return { error: "Couldn't update those resources." };
  revalidate();
  return { count: data?.length ?? 0 };
}

export async function setResourcesCategoryAction(ids: string[], categoryId: string): Promise<BulkResult> {
  await requireAdmin();
  const list = cleanIds(ids);
  if (!list.length || !isUuid(categoryId)) return { error: "Pick a category." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("resources").update({ category_id: categoryId }).in("id", list).select("id");
  if (error) return { error: "Couldn't change the category." };
  revalidate();
  return { count: data?.length ?? 0 };
}

export async function setResourceFeaturedAction(id: string, featured: boolean): Promise<BulkResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("resources").update({ featured }).eq("id", id);
  if (error) return { error: "Couldn't update that resource." };
  revalidate();
  return { count: 1 };
}

// Soft delete: hidden everywhere at once, purged after 30 days by
// /api/cron/resource-maintenance. Members who saved it see "no longer
// available" in Saved.
export async function deleteResourcesAction(ids: string[]): Promise<BulkResult> {
  const viewer = await requireAdmin();
  const list = cleanIds(ids);
  if (!list.length) return { count: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .update({ deleted_at: new Date().toISOString(), deleted_by: viewer.id, featured: false })
    .in("id", list)
    .is("deleted_at", null)
    .select("id");
  if (error) return { error: "Couldn't delete those resources." };
  revalidate();
  return { count: data?.length ?? 0 };
}

export async function restoreResourcesAction(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  const list = cleanIds(ids);
  if (!list.length) return { count: 0 };
  const supabase = await createClient();
  // A resource removed for a policy breach keeps its XP reversed; restoring
  // it doesn't pay again (see points_on_resource).
  const { data, error } = await supabase
    .from("resources")
    .update({ deleted_at: null, deleted_by: null, policy_removed_at: null })
    .in("id", list)
    .select("id");
  if (error) return { error: "Couldn't restore those resources." };
  revalidate();
  return { count: data?.length ?? 0 };
}

// Delete + reverse the submitter's 50 XP + tell them why.
export async function removeResourceForPolicyAction(id: string, reason: string): Promise<BulkResult> {
  const viewer = await requireAdmin();
  const why = reason.trim();
  if (!why) return { error: "Say which policy it breaks — the member sees this." };
  if (why.length > 1000) return { error: "Keep the reason to 1,000 characters." };
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: r } = await admin.from("resources").select("id, title, submitted_by").eq("id", id).maybeSingle();
  if (!r) return { error: "That resource no longer exists." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("resources")
    .update({ deleted_at: now, deleted_by: viewer.id, policy_removed_at: now, review_note: why, featured: false })
    .eq("id", id);
  if (error) return { error: "Couldn't remove that resource." };

  if (r.submitted_by) {
    const { error: reverseError } = await admin.rpc("points_reverse", {
      p_user: r.submitted_by,
      p_actions: ["resource_approved"],
      p_key: `resource:${id}`,
      p_reason: `Resource removed for a policy breach: ${why}`.slice(0, 500),
      p_by: viewer.id,
    });
    if (reverseError) console.error("[resources] XP reversal failed", reverseError);
    await createNotification({
      recipientId: r.submitted_by,
      type: "resource_removed",
      subjectType: "resource",
      subjectId: id,
      title: `Your resource “${r.title}” was removed`,
      body: `It broke a community policy: ${why} The 50 XP it earned has been reversed.`,
      linkPath: `network/${r.submitted_by}#resource-submissions`,
    });
  }
  revalidate();
  return { count: 1 };
}

export async function reorderResourcesAction(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  const list = cleanIds(ids);
  const supabase = await createClient();
  const { error } = await supabase.rpc("resource_reorder", { p_ids: list });
  if (error) return { error: "Couldn't save the new order." };
  revalidate();
  return { count: list.length };
}

// ------------------------------------------------------------- submissions

export type SubmissionDecision = "approve" | "reject" | "changes";

export async function reviewSubmissionAction(id: string, decision: SubmissionDecision, note: string): Promise<ResourceActionResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: r } = await admin
    .from("resources")
    .select("id, slug, title, description, category_id, kind, file_path, scan_status, url, video_id, submitted_by, submission_status, source, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!r || r.deleted_at || !r.submitted_by || !r.submission_status) return { error: "That submission no longer exists." };
  const why = note.trim();
  if (why.length > 1000) return { error: "Keep the note to 1,000 characters." };
  if (decision !== "approve" && !why) {
    return { error: decision === "reject" ? "Give a reason — the member sees it." : "Say what needs changing — the member sees it." };
  }

  const now = new Date().toISOString();
  let patch: ResourceUpdate;
  if (decision === "approve") {
    if (r.submission_status === "approved") return { error: "That submission is already approved." };
    if (!r.category_id) return { error: "Pick a category before approving." };
    if (!r.description.trim()) return { error: "Add a short description before approving." };
    if (r.kind === "file" && (!r.file_path || !["clean", "unscanned"].includes(r.scan_status ?? ""))) {
      return { error: "Attach a file that passed the virus scan before approving." };
    }
    if (r.kind === "link" && !r.url) return { error: "Add the link before approving." };
    // Credit the member as the source unless an admin already set one.
    let source = r.source;
    if (!source) {
      const { data: p } = await admin.from("profiles").select("first_name, last_name").eq("id", r.submitted_by).maybeSingle();
      source = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "GovConUnited member";
    }
    patch = {
      submission_status: "approved",
      status: "published",
      scheduled_at: null,
      source,
      review_note: null,
      reviewed_at: now,
      reviewed_by: viewer.id,
    };
  } else {
    patch = {
      submission_status: decision === "reject" ? "rejected" : "changes_requested",
      status: "draft",
      review_note: why,
      reviewed_at: now,
      reviewed_by: viewer.id,
    };
  }

  // The points_on_resource trigger pays 50 XP on approval, once per resource.
  const { error } = await supabase.from("resources").update(patch).eq("id", id);
  if (error) return { error: "Couldn't save that decision. Please try again." };

  const profileLink = `network/${r.submitted_by}#resource-submissions`;
  if (decision === "approve") {
    await createNotification({
      recipientId: r.submitted_by,
      type: "resource_submission_approved",
      subjectType: "resource",
      subjectId: id,
      title: `Your resource “${r.title}” was approved`,
      body: "It's now live in the GovConUnited resource library, credited to you. You earned 50 XP.",
      linkPath: `resources/${r.slug}`,
    });
  } else if (decision === "reject") {
    await createNotification({
      recipientId: r.submitted_by,
      type: "resource_submission_rejected",
      subjectType: "resource",
      subjectId: id,
      title: `Your resource “${r.title}” wasn't approved`,
      body: why,
      linkPath: profileLink,
    });
  } else {
    await createNotification({
      recipientId: r.submitted_by,
      type: "resource_changes_requested",
      subjectType: "resource",
      subjectId: id,
      title: `Changes requested on “${r.title}”`,
      body: `${why} Edit it from your profile and send it back for review.`,
      linkPath: profileLink,
    });
  }

  revalidate();
  revalidatePath(`/network/${r.submitted_by}`);
  return { id };
}

// ------------------------------------------------------------- link health

export async function recheckResourceLinkAction(id: string): Promise<{ error?: string; ok?: boolean; message?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: r } = await admin
    .from("resources")
    .select("id, kind, url, video_provider, video_id, link_fail_streak, link_failed_at, auto_hidden_at")
    .eq("id", id)
    .maybeSingle();
  if (!r || (r.kind !== "link" && r.kind !== "video")) return { error: "Only links and videos are checked." };
  const result = await checkResourceTarget(r);
  // A manual recheck never auto-hides; it only un-hides when the target works again.
  await recordLinkCheck(admin, r, result, { autoHide: false });
  revalidate();
  return { ok: result.ok, message: result.ok ? "Link works" : result.error };
}

export async function setLinkAutoHideAction(enabled: boolean): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_settings")
    .upsert({ key: "resource_link_autohide", value: enabled ? "true" : "false" }, { onConflict: "key" });
  if (error) return { error: "Couldn't save that setting." };
  revalidatePath("/admin/resources/link-health");
  return {};
}

// Clears an auto-hide without waiting for the next check (e.g. the admin
// fixed the link by hand, or the site was only briefly down).
export async function unhideResourceAction(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("resources").update({ auto_hidden_at: null, link_fail_streak: 0 }).eq("id", id);
  if (error) return { error: "Couldn't un-hide that resource." };
  revalidate();
  return {};
}
