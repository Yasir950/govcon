import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RewardsPageClient } from "@/components/points/RewardsPageClient";
import { createClient } from "@/lib/supabase/server";
import {
  getBadgeCatalog,
  getLeaderboard,
  getLevels,
  getMyExpertRequests,
  getMyRedemptions,
  getPointRules,
  getPointsHistory,
  getPointsProfile,
  getPointsSetting,
  getRewardsCatalog,
  getSeasons,
  getStoreStatus,
  getStreakMilestones,
} from "@/lib/points";
import { fetchCompanyBoardAction, fetchStreakBuddyAction } from "@/app/(app)/rewards/social-actions";

export const metadata: Metadata = { title: "Rewards · GovConUnited" };
export const dynamic = "force-dynamic";

export default async function RewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; season?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/rewards");

  const { tab, season } = await searchParams;
  // Invite links are shared outside the app, so they always point at the
  // live site, never at whichever host (e.g. localhost) rendered the page.
  const siteOrigin = "https://govconunited.com";
  const [
    catalog,
    history,
    redemptions,
    badges,
    profile,
    levels,
    rules,
    milestones,
    weekly,
    seasonBoard,
    network,
    answerers,
    seasons,
    downvotesAffectRep,
    inviteActiveDays,
    undoMinutes,
    { data: planRow },
    streakBuddy,
    companyBoard,
    storeStatus,
    expertRequests,
  ] = await Promise.all([
      getRewardsCatalog(),
      getPointsHistory(user.id, 150),
      getMyRedemptions(user.id),
      getBadgeCatalog(),
      getPointsProfile(user.id),
      getLevels(),
      getPointRules(),
      getStreakMilestones(),
      getLeaderboard("weekly", { limit: 10 }),
      getLeaderboard("season", { period: season ?? null, limit: 10 }),
      getLeaderboard("network", { limit: 10 }),
      getLeaderboard("answerers", { limit: 10 }),
      getSeasons(),
      getPointsSetting("downvotes_affect_rep", true),
      getPointsSetting("invite_active_days", 7),
      getPointsSetting("redemption_undo_minutes", 10),
      supabase.from("profiles").select("plan_selection").eq("id", user.id).maybeSingle(),
      fetchStreakBuddyAction(),
      fetchCompanyBoardAction(),
      getStoreStatus(),
      getMyExpertRequests(),
    ]);

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <RewardsPageClient
            viewerId={user.id}
            initialTab={tab ?? "overview"}
            catalog={catalog}
            history={history}
            redemptions={redemptions}
            badges={badges}
            profile={profile}
            levels={levels}
            rules={rules}
            milestones={milestones}
            boards={{ weekly, season: seasonBoard, network, answerers }}
            seasons={seasons}
            selectedSeason={season ?? null}
            siteOrigin={siteOrigin}
            downvotesAffectRep={Boolean(downvotesAffectRep)}
            inviteActiveDays={Number(inviteActiveDays) || 7}
            undoMinutes={Number(undoMinutes) || 10}
            isPro={planRow?.plan_selection === "pro"}
            streakBuddy={streakBuddy}
            companyBoard={companyBoard}
            storeStatus={storeStatus}
            expertRequests={expertRequests}
          />
        </div>
      </div>
    </section>
  );
}
