"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flame, Star } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { BadgeIcon, tierLabel } from "@/components/points/BadgeIcon";
import { pinBadgeAction } from "@/app/(app)/rewards/actions";
import type { PointsProfile } from "@/lib/points-types";

// Visitors only see a streak once it's worth showing off.
const PUBLIC_STREAK_MIN = 3;

// Profile header: rank, Rep, level, streak and up to 3 pinned badges.
export function ProfilePointsStrip({ points, isOwner = false }: { points: PointsProfile | null; isOwner?: boolean }) {
  if (!points) return null;
  const showStreak = isOwner || points.streak >= PUBLIC_STREAK_MIN;
  return (
    <div className="points-profile-strip">
      <span className={`points-rank-label${points.is_legend ? " is-legend" : ""}`} title={`Level ${points.level}`}>
        Lv {points.level} · {points.is_legend ? `GovCon Legend${points.legend_stars ? ` ${"★".repeat(Math.min(points.legend_stars, 5))}` : ""}` : points.rank}
      </span>
      {points.rep !== null && (
        <span className="points-stat" title="Reputation from other members">
          <Star size={14} aria-hidden="true" color="#d4a017" /> <strong>{points.rep.toLocaleString()}</strong> Rep
        </span>
      )}
      {showStreak && (
        <span className="points-stat" title="Workday streak">
          <Flame size={14} aria-hidden="true" color="#f97316" />
          {/* One flex item, so the strip's gap doesn't split "3" from "-day". */}
          <span>
            <strong>{points.streak}</strong>-day streak
          </span>
        </span>
      )}
      {points.streak_flair && <span className="points-flair">{points.streak_flair}</span>}
      {points.is_beta && <span className="points-flair">Beta group</span>}
      {points.pinned.length > 0 && (
        <span className="points-pinned">
          {points.pinned.slice(0, 3).map((b) => (
            <BadgeIcon
              key={b.id}
              icon={b.icon}
              tier={b.tier}
              size={26}
              title={`${b.name}${tierLabel(b.tier, b.name) ? ` (${tierLabel(b.tier, b.name)})` : ""}${b.community_name ? ` · ${b.community_name}` : ""}`}
            />
          ))}
        </span>
      )}
    </div>
  );
}

// Profile "Achievements" section: every badge earned, the next badge to
// earn with progress (own profile), and hidden-achievement slots.
export function AchievementsSection({ points, isOwner }: { points: PointsProfile | null; isOwner: boolean }) {
  const router = useRouter();
  const showToast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!points) return null;
  const hiddenLeft = Math.max(0, points.hidden_total - points.hidden_earned);
  const pinnedCount = points.badges.filter((b) => b.pinned).length;

  const togglePin = async (id: string, pinned: boolean) => {
    setBusy(id);
    const res = await pinBadgeAction(id, pinned);
    setBusy(null);
    if (!res.ok) showToast(res.error);
    else router.refresh();
  };

  return (
    <section className="card panel" id="achievements">
      <div className="panel-head">
        <h2 className="section-title">Achievements</h2>
        {isOwner && (
          <Link href="/rewards?tab=badges" className="link-btn">
            All badges
          </Link>
        )}
      </div>
      {points.badges.length === 0 && hiddenLeft === 0 ? (
        <p className="meta">No badges yet.</p>
      ) : (
        <div className="points-achievements-grid">
          {points.badges.map((b) => (
            <div key={b.id} className="points-achievement">
              <BadgeIcon icon={b.icon} tier={b.tier} size={44} title={b.description ?? undefined} />
              <strong>{b.name}</strong>
              <span className="meta">
                {[tierLabel(b.tier, b.name), b.community_name, b.family === "member_anniversary" && b.award_key ? `Year ${b.award_key}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {isOwner && (
                <button
                  type="button"
                  className="link-btn"
                  disabled={busy === b.id || (!b.pinned && pinnedCount >= 3)}
                  onClick={() => togglePin(b.id, !b.pinned)}
                  title={!b.pinned && pinnedCount >= 3 ? "Unpin a badge first (max 3)" : undefined}
                >
                  {b.pinned ? "Unpin" : "Pin"}
                </button>
              )}
            </div>
          ))}
          {Array.from({ length: hiddenLeft }).map((_, i) => (
            <div key={`hidden-${i}`} className="points-achievement" title="Hidden achievement: revealed when earned">
              <BadgeIcon icon="lock" tier="single" locked size={44} />
              <strong>???</strong>
              <span className="meta">Hidden</span>
            </div>
          ))}
        </div>
      )}
      {isOwner && points.next_badges && points.next_badges.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <strong style={{ fontSize: "0.86rem" }}>Next to earn</strong>
          <ul className="points-next-badges" style={{ marginTop: 8 }}>
            {points.next_badges.slice(0, 2).map((b) => (
              <li key={b.code}>
                <BadgeIcon icon={b.icon} tier={b.tier} size={30} locked />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "0.84rem", fontWeight: 600 }}>
                    {b.name}
                    {tierLabel(b.tier, b.name) && ` · ${tierLabel(b.tier, b.name)}`}: {b.description}
                  </span>
                  <span className="points-progress-bar">
                    <span style={{ width: `${Math.round((b.value / b.threshold) * 100)}%` }} />
                  </span>
                </span>
                <span className="meta">
                  {b.value}/{b.threshold}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
