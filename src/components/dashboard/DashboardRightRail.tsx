import Link from "next/link";
import { ConnectButton } from "@/components/network/ConnectButton";
import { ProBadge } from "@/components/pro-badge";
import { Avatar } from "@/components/avatar";
import { AdBanner } from "@/components/landing/AdBanner";
import { NetworkRequestsCard, NewMembersCard } from "@/components/dashboard/DashboardRightRailWidgets";
import { PresenceDot } from "@/components/PresenceDot";
import { TodayCard } from "@/components/points/TodayCard";
import { DailyMatchesCard } from "@/components/habits/DailyMatchesCard";
import { QuestionOfTheDayCard } from "@/components/habits/QuestionOfTheDayCard";
import { fetchDailyMatchesAction, fetchQuestionOfTheDayAction } from "@/app/(app)/dashboard/habit-actions";
import { CelebrationsCard } from "@/components/social/CelebrationsCard";
import { StreakBuddyCard } from "@/components/social/StreakBuddyCard";
import { fetchCelebrationsAction, fetchStreakBuddyAction } from "@/app/(app)/rewards/social-actions";
import { WeeklyLeaderboardCard } from "@/components/points/WeeklyLeaderboardCard";
import { ContinueLearningCard } from "@/components/learning/ContinueLearningCard";
import { fetchLearningCatalogAction } from "@/app/(app)/learn/actions";
import {
  getConnectionRequests,
  getGovConNews,
  getNewMembers,
  getSponsoredContent,
  getSuggestedConnections,
  getUpcomingEvents,
} from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

// The lightest of the dashboard's three columns (small, independent
// queries) — isolated into its own Suspense boundary so it streams in on
// its own instead of waiting on the feed's much slower fetch.
export async function DashboardRightRail({ viewer }: { viewer: Viewer }) {
  const [
    upcomingEvents,
    govconNews,
    sponsoredContent,
    connectionRequests,
    newMembers,
    suggestions,
    dailyMatches,
    questionOfTheDay,
    streakBuddy,
    celebrations,
    learning,
  ] = await Promise.all([
    getUpcomingEvents(3),
    getGovConNews(5),
    getSponsoredContent(),
    getConnectionRequests(viewer.id),
    getNewMembers(viewer.id, 3),
    getSuggestedConnections(viewer.id, 1),
    fetchDailyMatchesAction(),
    fetchQuestionOfTheDayAction(),
    fetchStreakBuddyAction(),
    fetchCelebrationsAction(),
    fetchLearningCatalogAction(),
  ]);
  const suggestedMember = suggestions[0] ?? null;
  // Same free-only / production-only gate as SiteFooter's banner.
  const showAd = viewer.planSelection !== "pro" && process.env.NODE_ENV === "production";

  return (
    <aside className="home-right-rail">
      {showAd && <AdBanner variant="rail" />}
      <TodayCard />
      <StreakBuddyCard initial={streakBuddy} compact />
      <DailyMatchesCard initial={dailyMatches} viewerId={viewer.id} />
      <QuestionOfTheDayCard initial={questionOfTheDay} />
      <ContinueLearningCard catalog={learning} />
      <WeeklyLeaderboardCard />
      <CelebrationsCard initial={celebrations} />

      {govconNews.length > 0 && (
        <section className="card panel">
          <div className="panel-head">
            <h2 className="section-title">GovCon News</h2>
            <span className="tag">Today</span>
          </div>
          <div className="news-list">
            {govconNews.map((n) => (
              <a href={n.sourceUrl} key={n.id} target="_blank" rel="noopener noreferrer" className="news-item">
                <strong>{n.headline}</strong>
                <span>
                  {n.sourceName} · {new Date(n.publishedAt).toLocaleDateString()}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="card panel">
        <div className="panel-head">
          <h2 className="section-title">Upcoming Events</h2>
          <Link href="/events" className="link-btn">
            View all
          </Link>
        </div>
        {upcomingEvents.length === 0 ? (
          <p className="meta">No upcoming events.</p>
        ) : (
          upcomingEvents.map((e) => (
            <Link href={e.href} key={e.id} className="home-event-link">
              <span className="date-tile">
                <b>{e.month}</b>
                <span>{e.day}</span>
              </span>
              <span>
                <span className="mini-row-title">{e.title}</span>
                <span className="meta">{e.kind}</span>
              </span>
            </Link>
          ))
        )}
      </section>

      <NewMembersCard members={newMembers} />

      <NetworkRequestsCard initialRequests={connectionRequests} />

      {sponsoredContent && (
        <section className="card promoted-card">
          <div className="promoted-head">
            <span className="meta" style={{ marginBottom: 6, display: "block" }}>
              Promoted · {sponsoredContent.sponsorName}
            </span>
            <strong style={{ fontSize: "1.02rem" }}>{sponsoredContent.headline}</strong>
            <p style={{ marginBottom: 12 }}>{sponsoredContent.body}</p>
            <a href={sponsoredContent.ctaUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-full">
              {sponsoredContent.ctaLabel}
            </a>
          </div>
        </section>
      )}

      {suggestedMember && (
        <section className="card panel">
          <div className="panel-head">
            <h2 className="section-title">Suggested for You</h2>
            <Link href="/network" className="link-btn">
              See all
            </Link>
          </div>
          <div className="home-suggested">
            <Link href={`/network/${suggestedMember.id}`} style={{ position: "relative", display: "inline-flex" }}>
              <Avatar name={suggestedMember.name} avatarUrl={suggestedMember.avatarUrl} size={38} />
              <PresenceDot memberId={suggestedMember.id} />
            </Link>
            <span>
              <Link href={`/network/${suggestedMember.id}`} className="mini-row-title is-name" style={{ textDecoration: "none" }}>
                {suggestedMember.name}
                {suggestedMember.isPro && <ProBadge size={14} />}
                {suggestedMember.boosted && <span className="points-boosted" style={{ marginLeft: 4 }}>Boosted</span>}
              </Link>
              <span className="meta" style={{ display: "block" }}>
                {suggestedMember.headline || suggestedMember.jobTitle || "GovConUnited Member"}
              </span>
            </span>
          </div>
          {suggestedMember.mutualCount > 0 && (
            <div className="meta" style={{ textAlign: "center", marginTop: 8 }}>
              {suggestedMember.mutualCount} mutual connection{suggestedMember.mutualCount === 1 ? "" : "s"}
            </div>
          )}
          <div className="head-actions" style={{ marginTop: 12 }}>
            <ConnectButton memberId={suggestedMember.id} memberName={suggestedMember.name} viewer={viewer} connectionState={null} />
          </div>
        </section>
      )}
    </aside>
  );
}
