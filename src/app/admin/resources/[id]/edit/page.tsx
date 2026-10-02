import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ResourceForm } from "@/components/admin/ResourceForm";
import type { ResourceAccess, ResourceKind } from "@/lib/resources";

export const dynamic = "force-dynamic";

export default async function EditResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Service role: the link/video/file columns aren't selectable through the
  // API. The admin layout has already checked isAdmin.
  const supabase = createAdminClient();
  const { data: resource } = await supabase.from("resources").select("*").eq("id", id).maybeSingle();
  if (!resource) notFound();

  const kind = resource.kind as ResourceKind;
  const videoUrl =
    resource.video_provider === "youtube"
      ? `https://www.youtube.com/watch?v=${resource.video_id}`
      : resource.video_provider === "vimeo"
        ? `https://vimeo.com/${resource.video_id}`
        : "";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit Resource</h1>
        </div>
      </div>
      <ResourceForm
        id={id}
        initial={{
          title: resource.title,
          type: resource.type,
          description: resource.description,
          access: resource.access as ResourceAccess,
          kind,
          url: kind === "video" ? videoUrl : (resource.url ?? ""),
          fileName: resource.file_name,
          fileSize: resource.file_size,
          fileUploadedAt: resource.file_uploaded_at,
          scanStatus: resource.scan_status,
          videoDurationSeconds: resource.video_duration_seconds,
          videoThumbnailUrl: resource.video_thumbnail_url,
        }}
      />
    </div>
  );
}
