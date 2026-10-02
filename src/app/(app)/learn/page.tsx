import type { Metadata } from "next";
import Link from "next/link";
import { BadgeIcon } from "@/components/points/BadgeIcon";
import { RewardChip } from "@/components/member-help/shared";
import { createClient } from "@/lib/supabase/server";
import type { LearningCatalog } from "@/lib/learning-status-types";

export const metadata: Metadata = { title: "Learn · GovConUnited" };
export const dynamic = "force-dynamic";

// GovCon learning paths: short lessons, each with a quiz. Visitors can
// browse; taking a lesson needs an account.
export default async function LearnPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: auth }] = await Promise.all([supabase.rpc("learning_catalog"), supabase.auth.getUser()]);
  if (error || !data) {
    if (error) console.error("learning_catalog failed", error);
    return (
      <section className="main">
        <div className="wrap">
          <p className="meta">Learning paths couldn&apos;t load. Please refresh the page.</p>
        </div>
      </section>
    );
  }
  const catalog = data as unknown as LearningCatalog;
  const signedIn = Boolean(auth.user);
  const cap = catalog.lesson_rule?.daily_cap ?? 3;

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns learn-page">
          <header className="learn-head">
            <div>
              <h1>Learn</h1>
              <p className="meta">
                Short GovCon lessons with a quiz at the end of each. Pass with {catalog.pass_pct}% or better. Retakes are always allowed.
              </p>
            </div>
            <div className="learn-head-rewards">
              <span>
                Pass a lesson <RewardChip rule={catalog.lesson_rule} />
              </span>
              <span>
                Finish a path <RewardChip rule={catalog.path_rule} /> + badge
              </span>
              {signedIn && (
                <span className="meta">
                  {Math.min(catalog.paid_today, cap)} of {cap} lessons paid today
                  {catalog.pending_xp > 0 && ` · ${catalog.pending_xp} waiting for tomorrow`}
                </span>
              )}
            </div>
          </header>

          <ul className="learn-paths">
            {catalog.paths.map((p) => {
              const pct = p.lessons ? Math.round((p.passed / p.lessons) * 100) : 0;
              const href = p.completed_at || !p.next_lesson ? `/learn/${p.slug}` : `/learn/${p.slug}/${p.next_lesson}`;
              return (
                <li key={p.id} className={`card panel learn-path-card${p.completed_at ? " is-done" : ""}`}>
                  <div className="learn-path-top">
                    {p.badge && (
                      <span className={`learn-path-badge${p.completed_at ? " is-earned" : ""}`} title={p.badge.name}>
                        <BadgeIcon icon={p.badge.icon} tier={p.badge.tier} size={22} />
                      </span>
                    )}
                    <div>
                      <h2 className="learn-path-title">
                        <Link href={`/learn/${p.slug}`}>{p.title}</Link>
                      </h2>
                      <span className="meta">
                        {p.lessons} lessons · about {p.minutes} min{p.audience ? ` · ${p.audience}` : ""}
                      </span>
                    </div>
                  </div>
                  {p.summary && <p className="learn-path-summary">{p.summary}</p>}
                  <div className="learn-progress" aria-label={`${p.passed} of ${p.lessons} lessons passed`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <div className="learn-path-foot">
                    <span className="meta">
                      {p.completed_at
                        ? `Completed · ${p.badge ? `${p.badge.name} badge earned` : "path finished"}`
                        : `${p.passed} of ${p.lessons} passed${p.badge ? ` · earns ${p.badge.name}` : ""}`}
                    </span>
                    <Link href={href} className={`btn btn-sm ${p.completed_at ? "btn-outline" : "btn-primary"}`}>
                      {p.completed_at ? "Review" : p.passed > 0 ? "Continue" : "Start"}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="meta learn-foot-note">
            Each lesson has a short minimum reading time before its quiz opens. XP pays once per lesson, for up to {cap} lessons a day;
            lessons passed beyond that are paid on your next day of learning. Also new this season:{" "}
            <Link href="/predictions">award predictions</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}
