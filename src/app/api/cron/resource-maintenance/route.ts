import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { RESOURCE_PURGE_DAYS } from "@/lib/resources";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily (Vercel Cron, CRON_SECRET bearer):
//   1. Purges resources deleted more than 30 days ago, with their stored
//      files, old versions and thumbnails. Saves cascade away.
//   2. Removes member submission uploads that never became a submission
//      (upload finished but the submit failed or was abandoned).
const FILES = "resource-files";
const THUMBS = "resource-thumbnails";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - RESOURCE_PURGE_DAYS * 86400000).toISOString();

  const { data: doomed, error } = await admin
    .from("resources")
    .select("id, file_path, thumbnail_url, resource_versions(file_path)")
    .lt("deleted_at", cutoff)
    .limit(200);
  if (error) {
    console.error("[resource-maintenance] load failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let purged = 0;
  for (const r of doomed ?? []) {
    const files = [r.file_path, ...(r.resource_versions ?? []).map((v) => v.file_path)].filter((p): p is string => !!p);
    if (files.length) {
      const { error: removeError } = await admin.storage.from(FILES).remove(files);
      if (removeError) {
        console.error("[resource-maintenance] file removal failed", r.id, removeError);
        continue;
      }
    }
    const { data: thumbs } = await admin.storage.from(THUMBS).list(r.id);
    if (thumbs?.length) await admin.storage.from(THUMBS).remove(thumbs.map((t) => `${r.id}/${t.name}`));
    const { error: deleteError } = await admin.from("resources").delete().eq("id", r.id);
    if (deleteError) console.error("[resource-maintenance] delete failed", r.id, deleteError);
    else purged++;
  }

  // Orphaned submission uploads older than 2 days.
  let orphans = 0;
  const staleBefore = Date.now() - 2 * 86400000;
  const { data: folders } = await admin.storage.from(FILES).list("submissions", { limit: 1000 });
  for (const folder of folders ?? []) {
    const { data: objects } = await admin.storage.from(FILES).list(`submissions/${folder.name}`, { limit: 1000 });
    const old = (objects ?? []).filter((o) => o.id && new Date(o.created_at ?? 0).getTime() < staleBefore);
    if (!old.length) continue;
    const paths = old.map((o) => `submissions/${folder.name}/${o.name}`);
    const [{ data: inUse }, { data: inHistory }] = await Promise.all([
      admin.from("resources").select("file_path").in("file_path", paths),
      admin.from("resource_versions").select("file_path").in("file_path", paths),
    ]);
    const keep = new Set([...(inUse ?? []), ...(inHistory ?? [])].map((x) => x.file_path));
    const remove = paths.filter((p) => !keep.has(p));
    if (remove.length) {
      await admin.storage.from(FILES).remove(remove);
      orphans += remove.length;
    }
  }

  return NextResponse.json({ purged, orphans });
}
