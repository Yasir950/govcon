import Link from "next/link";
import { BookOpen } from "lucide-react";
import { BadgeIcon } from "@/components/points/BadgeIcon";
import { rewardText } from "@/lib/member-help-types";
import type { LearningCatalog } from "@/lib/learning-status-types";

// Home, right rail: the next lesson to take, so new members have a daily
// path to follow. Picks the path already in progress, else the first one
// not finished; hidden once every path is done.
export function ContinueLearningCard({ catalog }: { catalog: LearningCatalog | null }) {
  if (!catalog) return null;
  const open = catalog.paths.filter((p) => !p.completed_at && p.next_lesson);
  const path = open.find((p) => p.passed > 0) ?? open[0];
  if (!path) return null;
  const cap = catalog.lesson_rule?.daily_cap ?? 3;
  const reward = rewardText(catalog.lesson_rule);
  const doneToday = Math.min(catalog.paid_today, cap);

  return (
    <section className="card panel learn-rail-card">
      <div className="panel-head">
        <h2 className="section-title">
          <BookOpen size={16} aria-hidden="true" /> {path.passed > 0 ? "Continue learning" : "Learn something today"}
        </h2>
      </div>
      <div className="learn-rail-body">
        {path.badge && <BadgeIcon icon={path.badge.icon} tier={path.badge.tier} size={32} title={path.badge.name} />}
        <div>
          <Link href={`/learn/${path.slug}`} className="learn-rail-title">
            {path.title}
          </Link>
          <span className="meta">
            {path.passed} of {path.lessons} lessons{path.badge ? ` · earns ${path.badge.name}` : ""}
          </span>
        </div>
      </div>
      <div className="learn-progress" aria-hidden="true">
        <span style={{ width: `${path.lessons ? Math.round((path.passed / path.lessons) * 100) : 0}%` }} />
      </div>
      <div className="learn-rail-foot">
        <span className="meta">
          {doneToday >= cap ? "Today's lesson XP is done" : `${reward ? `${reward} a lesson · ` : ""}${doneToday}/${cap} today`}
        </span>
        <Link href={`/learn/${path.slug}/${path.next_lesson}`} className="btn btn-primary btn-sm">
          {path.passed > 0 ? "Next lesson" : "Start"}
        </Link>
      </div>
    </section>
  );
}
