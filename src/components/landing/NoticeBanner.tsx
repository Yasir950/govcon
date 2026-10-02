import type { ActiveNotice } from "@/lib/supabase/queries";

// The site-wide announcement banner (/admin/notices) — only rendered when
// getActiveNotice() finds a real published, in-window notice; no static
// placeholder text ever shows here.
export function NoticeBanner({ notice }: { notice: ActiveNotice | null }) {
  if (!notice) return null;

  return (
    <div
      role="status"
      style={{
        padding: "10px 16px",
        textAlign: "center",
        fontSize: 14,
        fontWeight: 600,
        color: notice.level === "warning" ? "#7a4b00" : "#0a2f78",
        background: notice.level === "warning" ? "#fff3d6" : "#eaf6fd",
        borderBottom: "1px solid rgba(0,0,0,.06)",
      }}
    >
      {notice.message}
    </div>
  );
}
