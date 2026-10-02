import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DashboardFeedSection } from "@/components/dashboard/DashboardFeedSection";
import { DashboardFeedSkeleton } from "@/components/dashboard/DashboardFeedSkeleton";
import { DashboardIconSprite } from "@/components/dashboard/dashboard-icons";
import { DashboardLeftRail } from "@/components/dashboard/DashboardLeftRail";
import { DashboardLeftRailSkeleton } from "@/components/dashboard/DashboardLeftRailSkeleton";
import { DashboardRightRail } from "@/components/dashboard/DashboardRightRail";
import { DashboardRightRailSkeleton } from "@/components/dashboard/DashboardRightRailSkeleton";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Home · GovConUnited" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  // Set when arriving from a notification/email "View Post" link
  // (community/discussion/[slug] redirects feed-origin posts here) — the
  // feed is scrolled to and highlights this post, and the specific comment
  // if one is given, instead of a separate post-detail page.
  searchParams: Promise<{ post?: string; comment?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, plan_selection, headline, job_title, location, company_name, avatar_url, cover_image_url, role")
    .eq("id", user.id)
    .maybeSingle();

  const viewer: Viewer = {
    id: user.id,
    firstName: profile?.first_name || user.email?.split("@")[0] || "Member",
    lastName: profile?.last_name || "",
    planSelection: profile?.plan_selection || "free",
    headline: profile?.headline,
    jobTitle: profile?.job_title,
    location: profile?.location,
    companyName: profile?.company_name,
    avatarUrl: profile?.avatar_url,
    coverImageUrl: profile?.cover_image_url,
    isAdmin: profile?.role === "admin",
  };

  const { post: highlightSlug, comment: highlightCommentId } = await searchParams;

  // Each of the three columns fetches and streams in independently — the
  // feed (personalization + comments + reposts) is far slower than the
  // left/right rails' small count/list queries, so it used to make ALL
  // THREE columns wait on it when they shared one Suspense boundary.
  // Splitting them means the rails paint almost immediately regardless of
  // how long the feed takes.
  return (
    <section className="main" id="dashboard-home">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <div className="network-home">
            <Suspense fallback={<DashboardLeftRailSkeleton />}>
              <DashboardLeftRail viewer={viewer} />
            </Suspense>
            <Suspense fallback={<DashboardFeedSkeleton />}>
              <DashboardFeedSection viewer={viewer} highlightSlug={highlightSlug} highlightCommentId={highlightCommentId ?? null} />
            </Suspense>
            <Suspense fallback={<DashboardRightRailSkeleton />}>
              <DashboardRightRail viewer={viewer} />
            </Suspense>
          </div>
        </div>
      </div>
      <DashboardIconSprite />
    </section>
  );
}
