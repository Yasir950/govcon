import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardProfileCard } from "@/components/dashboard/DashboardProfileCard";
import { NotificationsPageClient } from "@/components/notifications/NotificationsPageClient";
import { getNotifications } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Notifications · GovConUnited" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/notifications");

  const notifications = await getNotifications(viewer.id, 50);

  // Same card as the dashboard's left rail (banner, Pro badge, level/streak,
  // company) so the two pages never drift apart.
  return <NotificationsPageClient notifications={notifications} profileCard={<DashboardProfileCard viewer={viewer} />} />;
}
