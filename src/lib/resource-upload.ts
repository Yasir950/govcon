import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { contentMatchesExtension, scanFile } from "@/lib/virus-scan";
import { fileExtension, MAX_RESOURCE_FILE_BYTES } from "@/lib/resources";

const BUCKET = "resource-files";

// Checks size, type and the actual bytes of an upload already in the
// bucket, then virus-scans it. Deletes it and says why when it fails.
export async function vetResourceUpload(path: string, originalName: string): Promise<
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

