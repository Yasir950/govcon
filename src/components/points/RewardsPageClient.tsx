"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Award,
  CalendarCheck,
  CheckCircle2,
  Coins,
  Copy,
  FileText,
  Flame,
  MessageSquare,
  ShieldCheck,
  ShoppingBag,
  Star,
  Target,
  ThumbsUp,
  TrendingUp,
  Undo2,
  UserPlus,
  Zap,
  Gift,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { ModalShell } from "@/components/ModalShell";
import { useToast } from "@/components/toast-provider";
import { BadgeIcon, tierLabel } from "@/components/points/BadgeIcon";
import { LeaderboardList } from "@/components/points/LeaderboardList";
import { usePoints } from "@/components/points/PointsProvider";
import { TodayCard } from "@/components/points/TodayCard";
import { CompanyLeaderboard } from "@/components/social/CompanyLeaderboard";
import { StreakBuddyCard } from "@/components/social/StreakBuddyCard";
import {
  ExpertRequestModal,
  RedemptionExtras,
  STORE_SECTIONS,
  StoreItemNote,
  soldOutLabel,
} from "@/components/points/StoreExtras";
import type { CompanyBoard, StreakBuddyState } from "@/lib/team-social-types";
import {
  getRedeemTargetsAction,
  pinBadgeAction,
  redeemRewardAction,
  setRewardsPreferencesAction,
  undoRedemptionAction,
} from "@/app/(app)/rewards/actions";
import {
  PROFILE_FRAMES,
  PROFILE_THEMES,
  STREAK_RULE,
  type BadgeDefinition,
  type LeaderboardResult,
  type LevelDefinition,
  type PointRule,
  type PointsHistoryEntry,
  type PointsProfile,
  type PointsSummary,
  type ExpertRequest,
  type RedemptionEntry,
  type RewardItem,
  type StoreStatus,
} from "@/lib/points-types";

type Tab = "overview" | "store" | "badges" | "leaderboards" | "history" | "how";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "store", label: "Credits store" },
  { id: "badges", label: "Achievements" },
  { id: "leaderboards", label: "Leaderboards" },
  { id: "history", label: "Points history" },
  { id: "how", label: "How points work" },
];

// Old/alternate ?tab= keys that deep links and notifications may use.
const TAB_ALIASES: Record<string, Tab> = { achievements: "badges", points: "history", leaderboard: "leaderboards" };

function resolveTab(key: string | undefined): Tab {
  const k = (key ?? "").toLowerCase();
  return TABS.find((t) => t.id === k)?.id ?? TAB_ALIASES[k] ?? "overview";
}

const CATEGORY_LABEL: Record<string, string> = {
  getting_started: "Getting started",
  learning: "Learning",
  streaks: "Streaks",
  community: "Community",
  reputation: "Reputation",
  networking: "Networking",
  events: "Events",
  opportunities: "Opportunities",
  trust: "Trust",
  special: "Special",
  recognition: "Recognition",
  hidden: "Hidden achievements",
};

// Member-to-member help (Teaming page): listed together under How to earn
// with their full reward and limit, instead of in the XP / Rep chip lists.
const MEMBER_HELP_ACTIONS = [
  "teaming_match",
  "mentor_session_mentor",
  "contract_win_posted",
  "contract_win_verified",
  "capability_review_helpful",
  "mentor_session_protege",
  "capability_review_written",
  "teaming_need_posted",
  "teaming_response",
  "contract_win_congrats",
];
// Learning and status (Learn, verified certifications, award predictions),
// with the limit each one carries.
const LEARNING_ACTIONS: [string, string][] = [
  ["learning_lesson_passed", "once per lesson"],
  ["learning_path_completed", "once per path, plus the path badge"],
  ["certification_verified", "once per certification, plus a Verified badge"],
  ["certification_reverified", "once a year per certification"],
  ["prediction_season_picks", "once a season"],
  ["prediction_correct", "up to 10 a season"],
  ["prediction_oracle", "once a season, plus the Oracle badge"],
];
const MEMBER_HELP_HIDDEN = new Set([...MEMBER_HELP_ACTIONS, ...LEARNING_ACTIONS.map(([a]) => a), "contract_win_false"]);

function helpReward(r: PointRule) {
  const parts = [r.xp && `+${r.xp} XP`, r.rep && `+${r.rep} Rep`, r.credits && `+${r.credits} Credits`].filter(Boolean);
  const limit = r.daily_cap ? `${r.daily_cap} a day` : r.monthly_cap ? `${r.monthly_cap} a month` : "";
  return [parts.join(" · "), limit].filter(Boolean).join(" · ");
}

const LIMIT_LABEL: Record<string, string> = { day: "a day", week: "a week", month: "a month", quarter: "a quarter", year: "a year", ever: "" };

// "1 a week", "1 a month per company", "1 per event". One-time unlocks
// (cosmetics) show nothing: owning it already says so.
function limitLabel(item: RewardItem) {
  if (!item.limit_count) return null;
  const per = item.limit_per_target && item.target_type ? ` per ${item.target_type}` : "";
  if (item.limit_period === "ever" && !per) return null;
  return `${item.limit_count}${item.limit_period === "ever" ? "" : ` ${LIMIT_LABEL[item.limit_period ?? ""] ?? ""}`}${per}`;
}

// A streak repair restores a streak that may have moved on since, so it
// can't be taken back.
const NOT_UNDOABLE = new Set(["streak_repair"]);
// A partner code can't be taken back once it's shown.
const isUndoable = (item: RewardItem) => !NOT_UNDOABLE.has(item.code) && item.fulfilment !== "partner_code";

const REDEMPTION_STATUS: Record<string, string> = {
  active: "Active",
  fulfilled: "Done",
  pending: "Waiting for approval",
  declined: "Declined",
  refunded: "Refunded",
  expired: "Expired",
};

type StreakMilestone = { days: number; xp: number; credits: number; badge_code: string | null; multiplier: number; flair: string | null };

function milestoneReward(m: StreakMilestone) {
  return [m.xp && `+${m.xp.toLocaleString()} XP`, m.credits && `+${m.credits.toLocaleString()} Credits`].filter(Boolean).join(" · ");
}

type SeasonRow = { id: string; code: string; name: string; theme: string | null; starts_at: string; ends_at: string; finalized_at: string | null };

export function RewardsPageClient({
  viewerId,
  initialTab,
  catalog,
  history,
  redemptions,
  badges,
  profile,
  levels,
  rules,
  milestones,
  boards,
  seasons,
  selectedSeason,
  siteOrigin,
  downvotesAffectRep,
  inviteActiveDays,
  undoMinutes,
  isPro,
  streakBuddy,
  companyBoard,
  storeStatus,
  expertRequests,
}: {
  viewerId: string;
  siteOrigin: string;
  initialTab: string;
  catalog: RewardItem[];
  history: PointsHistoryEntry[];
  redemptions: RedemptionEntry[];
  badges: BadgeDefinition[];
  profile: PointsProfile | null;
  levels: LevelDefinition[];
  rules: PointRule[];
  milestones: StreakMilestone[];
  downvotesAffectRep: boolean;
  inviteActiveDays: number;
  undoMinutes: number;
  isPro: boolean;
  boards: { weekly: LeaderboardResult; season: LeaderboardResult; network: LeaderboardResult; answerers: LeaderboardResult };
  seasons: SeasonRow[];
  selectedSeason: string | null;
  streakBuddy: StreakBuddyState | null;
  companyBoard: CompanyBoard | null;
  storeStatus: StoreStatus;
  expertRequests: Record<string, ExpertRequest>;
}) {
  const router = useRouter();
  const showToast = useToast();
  const { summary, setSummary, refresh } = usePoints();
  const [tab, setTab] = useState<Tab>(() => resolveTab(initialTab));
  const [redeeming, setRedeeming] = useState<RewardItem | null>(null);
  const [pinBusy, setPinBusy] = useState<string | null>(null);
  const [undoBusy, setUndoBusy] = useState<string | null>(null);
  // Set after mount (and ticked) so Undo buttons appear and lapse on the
  // client without a server/client clock mismatch.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);

  // Pro members can't take the free-member trial, and a Pro grant extends
  // the plan they already have.
  const storeItems = useMemo(
    () =>
      catalog
        .filter((i) => !(isPro && i.free_members_only))
        .map((i) =>
          isPro && i.pro_days > 0
            ? { ...i, name: `Extend Pro by ${i.pro_days} days`, description: `Adds ${i.pro_days} days to your Pro membership.` }
            : i,
        ),
    [catalog, isPro],
  );

  const catalogByCode = useMemo(() => new Map(catalog.map((c) => [c.code, c])), [catalog]);

  // Partner codes can't be taken back once shown, downloads once taken, and
  // expert requests once an expert has picked them up.
  const canUndo = (r: RedemptionEntry) =>
    now !== null &&
    ["fulfilled", "active", "pending"].includes(r.status) &&
    !NOT_UNDOABLE.has(r.rewardCode) &&
    catalogByCode.get(r.rewardCode)?.fulfilment !== "partner_code" &&
    typeof r.meta.downloaded_at !== "string" &&
    (!expertRequests[r.id] || expertRequests[r.id].status === "open") &&
    now - new Date(r.createdAt).getTime() < undoMinutes * 60_000;

  const undoRedemption = async (id: string) => {
    setUndoBusy(id);
    const res = await undoRedemptionAction(id);
    setUndoBusy(null);
    if (!res.ok) return showToast(res.error);
    showToast(res.message ?? "Undone.");
    await refresh();
    router.refresh();
  };

  const selectTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  };

  const earnedByCode = useMemo(() => {
    const map = new Map<string, NonNullable<PointsProfile["badges"]>[number][]>();
    for (const b of profile?.badges ?? []) map.set(b.code, [...(map.get(b.code) ?? []), b]);
    return map;
  }, [profile]);

  const ownedCosmetics = useMemo(() => {
    const owned = new Set<string>();
    for (const r of redemptions) if (["fulfilled", "active"].includes(r.status)) owned.add(r.rewardCode);
    return owned;
  }, [redemptions]);

  // Downloads already bought: the store button becomes Download.
  const ownedDownloads = useMemo(() => {
    const owned = new Map<string, string>();
    for (const r of redemptions)
      if (["fulfilled", "active"].includes(r.status) && catalogByCode.get(r.rewardCode)?.fulfilment === "download" && !owned.has(r.rewardCode))
        owned.set(r.rewardCode, r.id);
    return owned;
  }, [redemptions, catalogByCode]);

  // Streak badges carry no Credits of their own; the reward is paid by the
  // streak milestone that awards them, so show that.
  const milestoneByBadge = useMemo(() => new Map(milestones.filter((m) => m.badge_code).map((m) => [m.badge_code!, m])), [milestones]);

  const level = summary?.level ?? profile?.level ?? 1;
  const inviteLink = `${siteOrigin}/signup?ref=${viewerId}`;

  const togglePin = async (userBadgeId: string, pinned: boolean) => {
    setPinBusy(userBadgeId);
    const res = await pinBadgeAction(userBadgeId, pinned);
    setPinBusy(null);
    if (!res.ok) showToast(res.error);
    else router.refresh();
  };

  return (
    <div className="points-page">
      <header className="card panel points-hero">
        <div>
          <p className="meta" style={{ margin: 0 }}>
            Level {level}
          </p>
          <h1>{summary?.rank ?? profile?.rank ?? "Registrant"}</h1>
          {!summary && (
            <>
              <span className="skeleton-block points-skeleton" style={{ display: "block", maxWidth: 420, height: 8, margin: "10px 0 8px" }} />
              <span className="skeleton-block points-skeleton" style={{ width: 220, height: 14 }} />
            </>
          )}
          {summary && (
            <>
              <div className="points-progress-bar" style={{ maxWidth: 420 }}>
                <span
                  style={{
                    width: `${summary.next_xp ? Math.min(100, Math.round(((summary.xp - summary.level_xp) / (summary.next_xp - summary.level_xp)) * 100)) : 100}%`,
                  }}
                />
              </div>
              <p className="meta">
                {summary.xp.toLocaleString()} XP
                {summary.next_xp ? ` · ${(summary.next_xp - summary.xp).toLocaleString()} more to reach ${summary.next_rank}` : ""}
              </p>
            </>
          )}
        </div>
        <div className="points-hero-stats">
          <div className="points-hero-stat is-rep">
            <span className="points-hero-stat-icon">
              <Star size={18} aria-hidden="true" />
            </span>
            <span className="points-hero-stat-text">
              <span className="points-hero-num">
                {summary || profile?.rep != null ? (summary?.rep ?? profile?.rep ?? 0).toLocaleString() : <HeroSkeleton />}
              </span>
              <span className="points-hero-label">Reputation</span>
            </span>
          </div>
          <div className="points-hero-stat is-streak">
            <span className="points-hero-stat-icon">
              <Flame size={18} aria-hidden="true" />
            </span>
            <span className="points-hero-stat-text">
              <span className="points-hero-num">{summary ? summary.streak : <HeroSkeleton />}</span>
              <span className="points-hero-label">Day streak</span>
            </span>
          </div>
          <div className="points-hero-stat is-credits">
            <span className="points-hero-stat-icon">
              <Coins size={18} aria-hidden="true" />
            </span>
            <span className="points-hero-stat-text">
              <span className="points-hero-num">{summary ? summary.credits.toLocaleString() : <HeroSkeleton />}</span>
              <span className="points-hero-label">Credits</span>
            </span>
          </div>
        </div>
      </header>

      <nav className="points-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-active" : ""} onClick={() => selectTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="points-grid">
          <div className="stack">
            <TodayCard />
            <StreakBuddyCard initial={streakBuddy} />
            {summary?.streak_lost_value ? (
              <section className="card panel">
                <h2 className="section-title">Repair your streak</h2>
                <p className="meta">Your {summary.streak_lost_value}-day streak ended. Bring it back for 60 Credits.</p>
                <button className="btn btn-primary" onClick={() => setRedeeming(catalog.find((c) => c.code === "streak_repair") ?? null)}>
                  Repair for 60 Credits
                </button>
              </section>
            ) : null}
            <section className="card panel points-invite-card">
              <h2 className="section-title">Invite friends</h2>
              <p className="meta">
                Get 50 XP for each friend who joins with your link and becomes active: they complete their profile and visit on{" "}
                {inviteActiveDays} different days.
              </p>
              <div className="points-invite">
                <input readOnly value={inviteLink} aria-label="Your invite link" onFocus={(e) => e.currentTarget.select()} />
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    navigator.clipboard?.writeText(inviteLink).then(() => showToast("Invite link copied."));
                  }}
                >
                  <Copy size={14} aria-hidden="true" /> Copy
                </button>
              </div>
            </section>
          </div>
          <div className="stack">
            <section className="card panel">
              <div className="panel-head">
                <h2 className="section-title">This week</h2>
                <button className="link-btn" onClick={() => selectTab("leaderboards")}>
                  All leaderboards
                </button>
              </div>
              <LeaderboardList result={boards.weekly} unit="XP" limit={5} />
            </section>
            {profile?.next_badges && profile.next_badges.length > 0 && (
              <section className="card panel">
                <h2 className="section-title">Next badges</h2>
                <NextBadges items={profile.next_badges} />
              </section>
            )}
          </div>
        </div>
      )}

      {tab === "store" && (
        <div className="stack">
          <p className="meta">
            Spend the Credits you earn on GovCon resources, expert reviews, partner discounts, event tickets, and perks for your
            profile, posts and company. Profile themes color the header behind your name and photo: Classic Navy, Capitol Red and
            Evergreen are free from Level 4; Midnight and Sunrise can be bought at any level. Anything you buy is yours to keep.
          </p>
          {STORE_SECTIONS.map((section, si) => {
            const items = storeItems.filter((i) =>
              si === STORE_SECTIONS.length - 1
                ? !STORE_SECTIONS.slice(0, -1).some((x) => x.categories.includes(i.category))
                : section.categories.includes(i.category),
            );
            if (items.length === 0) return null;
            return (
              <section key={section.title} className="stack" style={{ gap: 8 }}>
                <h2 className="section-title" style={{ margin: 0 }}>{section.title}</h2>
                <div className="points-store-grid">
                  {items.map((item) => {
                    const isCosmetic = !!item.cosmetic_kind;
                    const locked = level < item.min_level;
                    const owned = isCosmetic && (ownedCosmetics.has(item.code) || (item.price === 0 && !locked));
                    const downloadId = ownedDownloads.get(item.code);
                    const status = storeStatus[item.code];
                    const limit = limitLabel(item);
                    return (
                      <article key={item.code} className={`card points-store-item${locked ? " is-locked" : ""}`}>
                        {item.cosmetic_kind === "theme" && item.cosmetic_value && (
                          <div className="points-theme-swatch" style={{ background: PROFILE_THEMES[item.cosmetic_value]?.swatch }} />
                        )}
                        {item.cosmetic_kind === "frame" && item.cosmetic_value && (
                          <div className="points-theme-swatch" style={{ border: `4px solid ${PROFILE_FRAMES[item.cosmetic_value]?.color}`, background: "#eef1f6" }} />
                        )}
                        <h3>{item.name}</h3>
                        <p className="meta">{item.description}</p>
                        <div className="points-store-foot">
                          <span className="points-credits-pill">
                            <Coins size={14} aria-hidden="true" /> {item.price === 0 ? "Free" : item.price.toLocaleString()}
                          </span>
                          {limit && <span className="meta">{limit}</span>}
                          {item.code === "streak_freeze" && (
                            <span className="meta">
                              You have {summary?.freezes ?? 0}/{summary?.freeze_max ?? 2}
                            </span>
                          )}
                          <StoreItemNote status={status} />
                        </div>
                        {locked ? (
                          <button className="btn btn-secondary btn-full points-store-btn-off" disabled>
                            Unlocks at Level {item.min_level}
                          </button>
                        ) : owned ? (
                          <Link href="/settings?tab=rewards#profile-look" className="btn btn-secondary btn-full">
                            Owned · Apply
                          </Link>
                        ) : downloadId ? (
                          <a href={`/rewards/download/${downloadId}`} className="btn btn-secondary btn-full">
                            Owned · Download
                          </a>
                        ) : status?.unavailable === "coming_soon" ? (
                          <button className="btn btn-secondary btn-full points-store-btn-off" disabled>
                            Coming soon
                          </button>
                        ) : status?.unavailable === "sold_out" ? (
                          <button className="btn btn-secondary btn-full points-store-btn-off" disabled>
                            {soldOutLabel(status)}
                          </button>
                        ) : summary && summary.credits < item.price ? (
                          <button className="btn btn-secondary btn-full points-store-btn-off" disabled>
                            Need {(item.price - summary.credits).toLocaleString()} more
                          </button>
                        ) : (
                          <button className="btn btn-primary btn-full" disabled={!summary} onClick={() => setRedeeming(item)}>
                            Redeem
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="card panel">
            <h2 className="section-title">Your redemptions</h2>
            {redemptions.length === 0 ? (
              <p className="meta">Nothing redeemed yet.</p>
            ) : (
              <table className="points-table">
                <thead>
                  <tr>
                    <th>Reward</th>
                    <th>Credits</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r) => (
                    <tr key={r.id}>
                      <td>{r.rewardName}</td>
                      <td>{r.price.toLocaleString()}</td>
                      <td>
                        {expertRequests[r.id] && r.status === "pending" ? "Sent" : (REDEMPTION_STATUS[r.status] ?? r.status)}
                        {typeof r.meta.discount_code === "string" && (
                          <>
                            {" · Code "}
                            <code>{r.meta.discount_code}</code>
                          </>
                        )}
                        {r.expiresAt && r.status === "active" && ` · until ${new Date(r.expiresAt).toLocaleDateString()}`}
                        {r.declineReason && ` · ${r.declineReason}`}
                        <RedemptionExtras redemption={r} item={catalogByCode.get(r.rewardCode)} request={expertRequests[r.id]} />
                      </td>
                      <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td>
                        {canUndo(r) && (
                          <button className="link-btn" disabled={undoBusy === r.id} onClick={() => undoRedemption(r.id)}>
                            <Undo2 size={13} aria-hidden="true" /> {undoBusy === r.id ? "Undoing…" : "Undo"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {tab === "badges" && (
        <div className="stack">
          <p className="meta">Earn badges by being active. Pin up to 3 to show on your profile.</p>
          {profile?.next_badges && profile.next_badges.length > 0 && (
            <section className="card panel">
              <h2 className="section-title">Next to earn</h2>
              <NextBadges items={profile.next_badges} />
            </section>
          )}
          {Object.entries(
            badges.reduce<Record<string, BadgeDefinition[]>>((acc, b) => {
              (acc[b.category] ??= []).push(b);
              return acc;
            }, {}),
          ).map(([category, list]) => (
            <section key={category} className="card panel">
              <h2 className="section-title">{CATEGORY_LABEL[category] ?? category}</h2>
              <div className="points-badge-grid">
                {list.map((b) => {
                  const earned = earnedByCode.get(b.code) ?? [];
                  const has = earned.length > 0;
                  if (b.hidden && !has) {
                    return (
                      <div key={b.code} className="points-badge-cell is-locked">
                        <BadgeIcon icon="lock" tier="single" locked size={44} />
                        <span className="points-badge-name">Secret badge</span>
                        <span className="meta">Keep exploring to find it</span>
                      </div>
                    );
                  }
                  return (
                    <div key={b.code} className={`points-badge-cell${has ? "" : " is-locked"}`}>
                      <BadgeIcon icon={b.icon} tier={b.tier} locked={!has} size={44} />
                      <span className="points-badge-name">
                        {b.name}
                        {tierLabel(b.tier, b.name) && ` · ${tierLabel(b.tier, b.name)}`}
                      </span>
                      <span className="meta">{b.description}</span>
                      {has &&
                        earned.map((e) => (
                          <span key={e.id} className="meta">
                            {e.community_name ? `${e.community_name} · ` : ""}
                            Earned {new Date(e.earned_at).toLocaleDateString()}
                            <button className="link-btn" disabled={pinBusy === e.id} onClick={() => togglePin(e.id, !e.pinned)}>
                              {e.pinned ? "Unpin" : "Pin"}
                            </button>
                          </span>
                        ))}
                      {!has && milestoneByBadge.has(b.code) ? (
                        <span className="meta">{milestoneReward(milestoneByBadge.get(b.code)!)}</span>
                      ) : (
                        !has && b.credits > 0 && <span className="meta">+{b.credits.toLocaleString()} Credits</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === "leaderboards" && (
        <div className="stack">
          <section className="card panel">
            <div className="panel-head">
              <h2 className="section-title">Season standings</h2>
              <select
                className="points-select is-compact"
                value={selectedSeason ?? boards.season.season?.code ?? ""}
                onChange={(e) => router.push(`/rewards?tab=leaderboards&season=${e.target.value}`)}
                aria-label="Season"
              >
                {seasons.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                    {s.theme ? ` · ${s.theme}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <p className="meta">
              {boards.season.season &&
                `${new Date(boards.season.season.starts_at).toLocaleDateString()} – ${new Date(new Date(boards.season.season.ends_at).getTime() - 1).toLocaleDateString()} · `}
              The top 10 members at the end of the season win prizes.
            </p>
            <LeaderboardList result={boards.season} unit="pts" emptyText="The season hasn't started yet." />
          </section>
          <CompanyLeaderboard initial={companyBoard} />
          <div className="points-grid">
            <section className="card panel">
              <h2 className="section-title">This week</h2>
              <p className="meta">Starts fresh every Monday.</p>
              <LeaderboardList result={boards.weekly} unit="XP" />
            </section>
            <section className="card panel">
              <h2 className="section-title">Most helpful this month</h2>
              <LeaderboardList result={boards.answerers} unit="best" emptyText="No Best Answers yet this month." />
            </section>
            <section className="card panel">
              <h2 className="section-title">Top networkers this month</h2>
              <LeaderboardList result={boards.network} unit="pts" emptyText="No new connections yet this month." />
            </section>
          </div>
          <section className="card panel">
            <h2 className="section-title">Privacy</h2>
            <label className="points-toggle">
              <input
                type="checkbox"
                checked={summary?.leaderboard_opt_out ?? false}
                onChange={async (e) => {
                  const res = await setRewardsPreferencesAction({ leaderboard_opt_out: e.target.checked });
                  if (res.ok && res.data) {
                    setSummary(res.data);
                    router.refresh();
                  } else if (!res.ok) showToast(res.error);
                }}
              />
              Hide me from leaderboards
            </label>
          </section>
        </div>
      )}

      {tab === "history" && <HistoryTimeline history={history} />}

      {tab === "how" && (
        <HowItWorks
          rules={rules}
          levels={levels}
          milestones={milestones}
          badges={badges}
          currentLevel={level}
          questRewards={summary?.quest_rewards}
          surprises={summary?.surprise_rewards}
          downvotesAffectRep={downvotesAffectRep}
        />
      )}

      {redeeming && (redeeming.fulfilment === "expert_review" || redeeming.fulfilment === "expert_call") && (
        <ExpertRequestModal
          item={redeeming}
          viewerId={viewerId}
          balance={summary?.credits ?? null}
          undoMinutes={undoMinutes}
          onClose={() => setRedeeming(null)}
          onDone={async (message) => {
            setRedeeming(null);
            showToast(message);
            await refresh();
            router.refresh();
          }}
          onError={(e) => showToast(e)}
        />
      )}
      {redeeming && redeeming.fulfilment !== "expert_review" && redeeming.fulfilment !== "expert_call" && (
        <RedeemModal
          item={redeeming}
          balance={summary?.credits ?? null}
          undoMinutes={undoMinutes}
          onClose={() => setRedeeming(null)}
          onDone={async (message) => {
            setRedeeming(null);
            showToast(
              !isUndoable(redeeming)
                ? message
                : `${message} Changed your mind? Undo it under Your redemptions within ${undoMinutes} minutes.`,
            );
            await refresh();
            router.refresh();
          }}
          onError={(e) => showToast(e)}
        />
      )}
    </div>
  );
}

// Stands in for a hero number until the live summary arrives, so a hard
// reload never flashes "0".
function HeroSkeleton() {
  return <span className="skeleton-block points-skeleton" style={{ width: 36, height: "1.1em" }} aria-label="Loading" />;
}

function historyLabel(h: PointsHistoryEntry) {
  const m = h.meta;
  if (h.actionType === "quest_complete" && m.quest) return `Quest: ${String(m.quest)}`;
  if (h.actionType === "badge_earned" && m.name) {
    const tier = tierLabel((m.tier as BadgeDefinition["tier"]) ?? "single", String(m.name));
    return `Badge: ${String(m.name)}${tier ? ` (${tier})` : ""}`;
  }
  if (h.actionType === "level_up" && m.rank) return `Level ${String(m.level)}: ${String(m.rank)}`;
  if (h.actionType === "streak_milestone" && m.days) return `${String(m.days)}-day streak`;
  if (h.actionType === "challenge_complete" && m.challenge) return `Challenge: ${String(m.challenge)}`;
  if (h.actionType === "redemption" && m.name) return `Redeemed: ${String(m.name)}`;
  if (h.actionType === "admin_adjustment" && m.reason) return `Adjustment: ${String(m.reason)}`;
  return h.label;
}

function NextBadges({ items }: { items: NonNullable<PointsProfile["next_badges"]> }) {
  return (
    <ul className="points-next-badges">
      {items.map((b) => (
        <li key={b.code}>
          <BadgeIcon icon={b.icon} tier={b.tier} size={32} locked />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="points-badge-name">
              {b.name}
              {tierLabel(b.tier, b.name) && ` · ${tierLabel(b.tier, b.name)}`}
            </span>
            <span className="meta" style={{ display: "block" }}>
              {b.description}
            </span>
            <span className="points-progress-bar">
              <span style={{ width: `${Math.round((b.value / b.threshold) * 100)}%` }} />
            </span>
          </span>
          <span className="meta">
            {b.value.toLocaleString()}/{b.threshold.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RedeemModal({
  item,
  balance,
  undoMinutes,
  onClose,
  onDone,
  onError,
}: {
  item: RewardItem;
  balance: number | null;
  undoMinutes: number;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (error: string) => void;
}) {
  const [targets, setTargets] = useState<{ id: string; label: string; type?: string }[] | null>(null);
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // The free ticket only covers GovConUnited's own events.
  const targetKind = item.fulfilment === "event_ticket" ? "official_event" : item.target_type;

  useEffect(() => {
    if (!targetKind) return;
    let cancelled = false;
    getRedeemTargetsAction(targetKind).then((t) => {
      if (cancelled) return;
      setTargets(t);
      if (t[0]) setTarget(t[0].id);
    });
    return () => {
      cancelled = true;
    };
  }, [targetKind]);

  const confirm = async () => {
    setBusy(true);
    const chosen = targets?.find((t) => t.id === target);
    const res = await redeemRewardAction(item.code, chosen?.type ?? item.target_type, item.target_type ? target : null);
    setBusy(false);
    if (res.ok) {
      const code = res.data?.meta?.discount_code;
      onDone(`${res.message ?? "Redeemed."}${typeof code === "string" && !res.message?.includes(code) ? ` Code: ${code}` : ""}`);
    } else onError(res.error);
  };

  return (
    <ModalShell title={`Redeem ${item.name}`} onClose={onClose} maxWidth={460}>
      <p className="meta">{item.description}</p>
      {item.target_type && (
        <label style={{ display: "block", margin: "12px 0" }}>
          <span className="meta" style={{ display: "block", marginBottom: 4 }}>
            {item.target_type === "post"
              ? "Which of your community posts?"
              : item.target_type === "company"
                ? "Which company?"
                : item.target_type === "listing"
                  ? "Which listing?"
                  : item.fulfilment === "event_ticket"
                    ? "Which GovConUnited event?"
                    : "Which event?"}
          </span>
          {targets === null ? (
            <span className="meta">Loading…</span>
          ) : targets.length === 0 ? (
            <span className="meta">Nothing eligible yet.</span>
          ) : (
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: "100%" }}>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </label>
      )}
      <p style={{ marginBottom: 4 }}>
        This costs <b>{item.price.toLocaleString()} Credits</b>.
        {balance !== null && (
          <>
            {" "}
            Your balance goes from {balance.toLocaleString()} to <b>{(balance - item.price).toLocaleString()}</b>.
          </>
        )}
      </p>
      <p className="meta">
        {!isUndoable(item)
          ? "This can't be undone."
          : `Made a mistake? You can undo this from Your redemptions within ${undoMinutes} minutes${item.fulfilment === "download" ? ", until you download it," : ""} and get your Credits back.`}
      </p>
      <div className="points-celebrate-actions" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy || (!!item.target_type && !target)} onClick={confirm}>
          {busy ? "Redeeming…" : "Redeem"}
        </button>
      </div>
    </ModalShell>
  );
}

function HowItWorks({
  rules,
  levels,
  milestones,
  badges,
  currentLevel,
  questRewards,
  surprises,
  downvotesAffectRep,
}: {
  rules: PointRule[];
  levels: LevelDefinition[];
  milestones: StreakMilestone[];
  badges: BadgeDefinition[];
  currentLevel: number;
  questRewards: PointsSummary["quest_rewards"];
  surprises: PointsSummary["surprise_rewards"];
  downvotesAffectRep: boolean;
}) {
  const daily = rules.filter((r) => r.category === "daily" && r.xp > 0 && !MEMBER_HELP_HIDDEN.has(r.action_type));
  const once = rules.filter((r) => r.category === "milestone" && r.xp > 0);
  // Downvote rows only cost Rep while downvotes_affect_rep is on.
  const rep = rules.filter(
    (r) => r.category === "rep" && !MEMBER_HELP_HIDDEN.has(r.action_type) && (r.rep > 0 || (r.rep < 0 && downvotesAffectRep)),
  );
  const help = MEMBER_HELP_ACTIONS.map((a) => rules.find((r) => r.action_type === a)).filter(
    (r): r is PointRule => Boolean(r && (r.xp || r.rep || r.credits)),
  );
  const learning = LEARNING_ACTIONS.map(([a, limit]) => [rules.find((r) => r.action_type === a), limit] as const).filter(
    (x): x is readonly [PointRule, string] => Boolean(x[0] && (x[0].xp || x[0].rep || x[0].credits)),
  );
  // Full ladder, so it matches the streak badges on Achievements.
  const streakRewards = milestones.filter((m) => m.xp || m.credits);
  const badgeName = new Map(badges.map((b) => [b.code, b.name]));
  // Before the summary loads, fall back to the rule rows (they mirror the
  // quest/sweep settings).
  const questRule = rules.find((r) => r.action_type === "quest_complete");
  const sweepRule = rules.find((r) => r.action_type === "daily_sweep");
  const qr = questRewards ?? {
    quest_xp: questRule?.xp ?? 10,
    quest_credits: questRule?.credits ?? 2,
    sweep_xp: sweepRule?.xp ?? 25,
    sweep_credits: sweepRule?.credits ?? 5,
  };
  return (
    <div className="stack points-how">
      <section className="card panel">
        <h2 className="section-title">The basics</h2>
        <p className="meta">You collect three things on GovConUnited.</p>
        <div className="points-how-basics">
          <div className="points-how-basic is-xp">
            <span className="points-how-icon">
              <Zap size={20} aria-hidden="true" />
            </span>
            <h3>XP</h3>
            <p>Earned by taking part: posting, commenting, voting and finishing quests. More XP moves you up a level.</p>
          </div>
          <div className="points-how-basic is-rep">
            <span className="points-how-icon">
              <Star size={20} aria-hidden="true" />
            </span>
            <h3>Reputation</h3>
            <p>Given to you by other members when they upvote or recommend you. It shows people they can trust you.</p>
          </div>
          <div className="points-how-basic is-credits">
            <span className="points-how-icon">
              <Coins size={20} aria-hidden="true" />
            </span>
            <h3>Credits</h3>
            <p>Won from quests, badges and new levels. Spend them in the Credits store.</p>
          </div>
        </div>
      </section>

      <section className="card panel">
        <h2 className="section-title">Your day in 3 steps</h2>
        <ol className="points-how-steps">
          <li>
            <span className="points-how-step-num">1</span>
            <span>
              <span className="points-how-step-title">Do your 3 daily quests</span>
              <span className="meta">
                Small tasks like voting or commenting. Each one gives +{qr.quest_xp} XP and {qr.quest_credits} Credits. Don&apos;t like one?
                Reroll it: 1 free a day, 2 from Level 4.
              </span>
            </span>
          </li>
          <li>
            <span className="points-how-step-num">2</span>
            <span>
              <span className="points-how-step-title">Finish all 3 for a bonus</span>
              <span className="meta">
                Get an extra +{qr.sweep_xp} XP and {qr.sweep_credits} Credits.
              </span>
            </span>
          </li>
          <li>
            <span className="points-how-step-num">3</span>
            <span>
              <span className="points-how-step-title">Keep your streak going</span>
              <span className="meta">{STREAK_RULE}</span>
            </span>
          </li>
        </ol>
        {streakRewards.length > 0 && (
          <div className="points-how-streaks">
            {streakRewards.map((m) => (
              <div key={m.days} className={`points-how-streak${m.badge_code ? " has-badge" : ""}`}>
                <Flame size={16} aria-hidden="true" />
                <span className="points-how-streak-days">{m.days} days</span>
                <span className="meta">
                  {milestoneReward(m)}
                  {m.badge_code && badgeName.has(m.badge_code) && ` · ${badgeName.get(m.badge_code)} badge`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {surprises &&
        (surprises.double_xp_enabled || surprises.lucky_drop_enabled || surprises.mystery_quest_enabled) && (
          <section className="card panel">
            <h2 className="section-title">Surprise bonuses</h2>
            <p className="meta">A few extras that turn up when you least expect them.</p>
            <div className="points-how-chips">
              {surprises.double_xp_enabled && (
                <div className="points-how-chip">
                  <span>
                    <Zap size={14} aria-hidden="true" /> Double XP hour: announced here at a random workday hour,{" "}
                    {surprises.double_xp_per_week_min === surprises.double_xp_per_week_max
                      ? surprises.double_xp_per_week_max
                      : `${surprises.double_xp_per_week_min} to ${surprises.double_xp_per_week_max}`}{" "}
                    times a week. Still counts toward your daily XP cap.
                  </span>
                  <span className="points-how-chip-value">{surprises.double_xp_multiplier}x daily XP</span>
                </div>
              )}
              {surprises.lucky_drop_enabled && (
                <div className="points-how-chip">
                  <span>
                    <Gift size={14} aria-hidden="true" /> Lucky drop: a {Math.round(surprises.lucky_drop_chance * 100)}% chance each day you
                    finish all 3 daily quests
                  </span>
                  <span className="points-how-chip-value">
                    {surprises.lucky_drop_min} to {surprises.lucky_drop_max} Credits
                  </span>
                </div>
              )}
              {surprises.mystery_quest_enabled && (
                <div className="points-how-chip">
                  <span>
                    <Sparkles size={14} aria-hidden="true" /> Bonus quest: a 4th quest that shows up on one workday a week
                  </span>
                  <span className="points-how-chip-value">
                    +{surprises.mystery_xp ?? 0} XP, {surprises.mystery_credits ?? 0} Credits
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

      <section className="card panel">
        <h2 className="section-title">Ways to earn XP</h2>
        <div className="points-how-chips">
          {daily.map((r) => (
            <div key={r.action_type} className="points-how-chip">
              <span>{r.label}</span>
              <span className="points-how-chip-value">+{r.xp} XP</span>
            </div>
          ))}
        </div>
        {once.length > 0 && (
          <>
            <h3 className="points-how-sub">One-time bonuses</h3>
            <div className="points-how-chips">
              {once.map((r) => (
                <div key={r.action_type} className="points-how-chip">
                  <span>{r.label}</span>
                  <span className="points-how-chip-value">+{r.xp} XP</span>
                </div>
              ))}
            </div>
          </>
        )}
        {rep.length > 0 && (
          <>
            <h3 className="points-how-sub">Ways to earn Reputation</h3>
            <div className="points-how-chips">
              {rep.map((r) => (
                <div key={r.action_type} className="points-how-chip is-rep">
                  <span>{r.label}</span>
                  <span className="points-how-chip-value">{r.rep > 0 ? `+${r.rep}` : r.rep}</span>
                </div>
              ))}
            </div>
            <p className="meta points-how-note">
              {downvotesAffectRep
                ? "Downvoting unlocks at Level 3. Each downvote from an established member costs the author Rep as shown above; downvotes from new or unverified accounts cost nothing. Rep never drops below 0."
                : "Downvoting unlocks at Level 3. Downvotes only affect ranking; they never cost Rep."}
            </p>
          </>
        )}
      </section>

      {help.length > 0 && (
        <section className="card panel">
          <h2 className="section-title">Help other members</h2>
          <p className="meta">
            These pay the most, because they help someone else. Rep only comes when the other member confirms it was useful.{" "}
            <Link href="/teaming">Open Teaming</Link>
          </p>
          <div className="points-how-chips">
            {help.map((r) => (
              <div key={r.action_type} className="points-how-chip">
                <span>{r.label}</span>
                <span className="points-how-chip-value">{helpReward(r)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {learning.length > 0 && (
        <section className="card panel">
          <h2 className="section-title">Learning and status</h2>
          <p className="meta">
            A daily path for new members, and status that matters in GovCon. <Link href="/learn">Open Learn</Link> ·{" "}
            <Link href="/predictions">Award predictions</Link>
          </p>
          <div className="points-how-chips">
            {learning.map(([r, limit]) => (
              <div key={r.action_type} className="points-how-chip">
                <span>{r.label}</span>
                <span className="points-how-chip-value">{[helpReward(r), limit].filter(Boolean).join(" · ")}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card panel">
        <h2 className="section-title">Levels</h2>
        <p className="meta">Your level never goes down.</p>
        <ol className="points-how-levels">
          {levels.map((l) => (
            <li
              key={l.level}
              className={l.level === currentLevel ? "is-current" : l.level < currentLevel ? "is-reached" : ""}
            >
              <span className="points-how-level-num">{l.level}</span>
              <span className="points-how-level-body">
                <span className="points-how-level-rank">
                  {l.rank_name}
                  {l.level === currentLevel && <span className="points-how-you">You</span>}
                </span>
                <span className="meta">{l.unlocks}</span>
              </span>
              <span className="points-how-level-xp">{l.xp_required.toLocaleString()} XP</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card panel">
        <h2 className="section-title">Play fair</h2>
        <ul className="points-how-fair">
          <li>
            <ShieldCheck size={16} aria-hidden="true" /> Comments need at least 20 characters to count.
          </li>
          <li>
            <ShieldCheck size={16} aria-hidden="true" /> Votes count after 10 minutes.
          </li>
          <li>
            <ShieldCheck size={16} aria-hidden="true" /> Voting on your own posts doesn&apos;t count.
          </li>
          <li>
            <ShieldCheck size={16} aria-hidden="true" /> Deleted or removed posts lose their points.
          </li>
        </ul>
        <p className="meta">
          <Link href="/settings?tab=rewards">Rewards settings</Link>
        </p>
      </section>
    </div>
  );
}

type HistoryFilter = "all" | "xp" | "rep" | "credits";
const HISTORY_FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "xp", label: "XP" },
  { id: "rep", label: "Reputation" },
  { id: "credits", label: "Credits" },
];

// The unit a filter totals and shows; "All" keeps the XP day total.
const FILTER_UNIT: Record<HistoryFilter, { key: "xp" | "rep" | "credits"; label: string }> = {
  all: { key: "xp", label: "XP" },
  xp: { key: "xp", label: "XP" },
  rep: { key: "rep", label: "Rep" },
  credits: { key: "credits", label: "Credits" },
};

// Rows worth showing even though they carry no points of their own.
const HISTORY_EVENTS = new Set(["badge_earned", "level_up", "streak_milestone"]);

function historyIcon(action: string): { Icon: LucideIcon; tone: string } {
  if (action === "quest_complete" || action === "daily_sweep" || action === "challenge_complete") return { Icon: Target, tone: "green" };
  if (action === "badge_earned") return { Icon: Award, tone: "gold" };
  if (action === "level_up") return { Icon: TrendingUp, tone: "blue" };
  if (action.includes("streak")) return { Icon: Flame, tone: "orange" };
  if (action === "redemption") return { Icon: ShoppingBag, tone: "gold" };
  if (action === "daily_checkin") return { Icon: CheckCircle2, tone: "green" };
  if (action.startsWith("milestone_")) return { Icon: Star, tone: "purple" };
  if (action.includes("vote") || action.includes("reaction")) return { Icon: ThumbsUp, tone: "blue" };
  if (action.includes("comment") || action === "best_answer") return { Icon: MessageSquare, tone: "blue" };
  if (action.includes("post") || action.includes("resource")) return { Icon: FileText, tone: "blue" };
  if (action.includes("event")) return { Icon: CalendarCheck, tone: "purple" };
  if (action.includes("connection") || action.includes("invite") || action.includes("recommendation") || action.includes("follow"))
    return { Icon: UserPlus, tone: "purple" };
  return { Icon: Zap, tone: "blue" };
}

function dayLabel(date: Date) {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function signed(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

function HistoryTimeline({ history }: { history: PointsHistoryEntry[] }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const days = useMemo(() => {
    const visible = history.filter((h) => {
      if (filter === "xp") return h.xp !== 0;
      if (filter === "rep") return h.rep !== 0;
      if (filter === "credits") return h.credits !== 0;
      return h.xp !== 0 || h.rep !== 0 || h.credits !== 0 || HISTORY_EVENTS.has(h.actionType);
    });
    const unit = FILTER_UNIT[filter].key;
    const groups: { label: string; total: number; items: PointsHistoryEntry[] }[] = [];
    for (const h of visible) {
      const label = dayLabel(new Date(h.createdAt));
      let group = groups[groups.length - 1];
      if (!group || group.label !== label) {
        group = { label, total: 0, items: [] };
        groups.push(group);
      }
      group.items.push(h);
      if (!h.reversedAt) group.total += h[unit];
    }
    return groups;
  }, [history, filter]);

  const totals = useMemo(
    () =>
      history.reduce(
        (t, h) => (h.reversedAt ? t : { xp: t.xp + h.xp, rep: t.rep + h.rep, credits: t.credits + h.credits }),
        { xp: 0, rep: 0, credits: 0 },
      ),
    [history],
  );
  // Under a single-unit filter, rows only show that unit's chip.
  const show = (unit: "xp" | "rep" | "credits") => filter === "all" || FILTER_UNIT[filter].key === unit;

  return (
    <section className="card panel points-history">
      <div className="panel-head">
        <h2 className="section-title">Points history</h2>
        <div className="points-history-filters" role="group" aria-label="Filter history">
          {HISTORY_FILTERS.map((f) => (
            <button key={f.id} type="button" className={filter === f.id ? "is-active" : ""} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="points-history-totals">
        <div className="is-xp">
          <Zap size={16} aria-hidden="true" />
          <span className="points-history-total-num">{totals.xp.toLocaleString()}</span>
          <span className="meta">XP</span>
        </div>
        <div className="is-rep">
          <Star size={16} aria-hidden="true" />
          <span className="points-history-total-num">{totals.rep.toLocaleString()}</span>
          <span className="meta">Reputation</span>
        </div>
        <div className="is-credits">
          <Coins size={16} aria-hidden="true" />
          <span className="points-history-total-num">{totals.credits.toLocaleString()}</span>
          <span className="meta">Credits</span>
        </div>
      </div>

      {days.length === 0 ? (
        <div className="points-history-empty">
          <Zap size={28} aria-hidden="true" />
          <p>Nothing here yet. Complete a quest to earn your first points.</p>
        </div>
      ) : (
        days.map((d) => (
          <div key={d.label} className="points-history-day">
            <div className="points-history-day-head">
              <span>{d.label}</span>
              {d.total !== 0 && (
                <span>
                  {signed(d.total)} {FILTER_UNIT[filter].label}
                </span>
              )}
            </div>
            <ul className="points-history-list">
              {d.items.map((h) => {
                const { Icon, tone } = historyIcon(h.actionType);
                return (
                  <li key={h.id} className={h.reversedAt ? "is-reversed" : ""}>
                    <span className={`points-history-icon is-${h.reversedAt ? "muted" : tone}`}>
                      {h.reversedAt ? <Undo2 size={16} aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}
                    </span>
                    <span className="points-history-body">
                      <span className="points-history-title">{historyLabel(h)}</span>
                      <span className="meta">
                        {new Date(h.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        {h.reversedAt && " · Taken back"}
                        {typeof h.meta.capped === "string" && " · Daily limit reached"}
                      </span>
                    </span>
                    <span className="points-history-values">
                      {h.xp !== 0 && show("xp") && <span className={`points-history-pill is-xp${h.xp < 0 ? " is-neg" : ""}`}>{signed(h.xp)} XP</span>}
                      {h.rep !== 0 && show("rep") && <span className={`points-history-pill is-rep${h.rep < 0 ? " is-neg" : ""}`}>{signed(h.rep)} Rep</span>}
                      {h.credits !== 0 && show("credits") && (
                        <span className={`points-history-pill is-credits${h.credits < 0 ? " is-neg" : ""}`}>{signed(h.credits)} Credits</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
