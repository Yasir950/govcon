import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { BadgeIcon } from "@/components/points/BadgeIcon";
import { RewardChip } from "@/components/member-help/shared";
import { createClient } from "@/lib/supabase/server";
import { readTime, type LearningPathDetail } from "@/lib/learning-status-types";

export const dynamic = "force-dynamic";

async function loadPath(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learning_path", { p_slug: slug });
  if (error) console.error("learning_path failed", error);
  return (data as unknown as LearningPathDetail | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ path: string }> }): Promise<Metadata> {
  const { path } = await params;
  const p = await loadPath(path);
  return { title: p ? `${p.title} · Learn · GovConUnited` : "Learn · GovConUnited" };
}

export default async function LearningPathPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  const p = await loadPath(path);
  if (!p) notFound();
  const passed = p.lessons.filter((l) => l.passed_at).length;
  const next = p.lessons.find((l) => !l.passed_at);

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns learn-page">
          <nav className="learn-crumbs meta" aria-label="Breadcrumb">
            <Link href="/learn">Learn</Link> <span aria-hidden="true">/</span> {p.title}
          </nav>
          <header className="card panel learn-path-hero">
            {p.badge && (
              <span className={`learn-path-badge is-large${p.completed_at ? " is-earned" : ""}`}>
                <BadgeIcon icon={p.badge.icon} tier={p.badge.tier} size={44} title={p.badge.name} />
              </span>
            )}
            <div className="learn-path-hero-text">
              <h1>{p.title}</h1>
              {p.summary && <p>{p.summary}</p>}
              <p className="meta">
                {passed} of {p.lessons.length} lessons passed · each quiz needs {p.pass_pct}% · pass a lesson{" "}
                <RewardChip rule={p.lesson_rule} /> · finish the path <RewardChip rule={p.path_rule} />
                {p.badge ? ` + the ${p.badge.name} badge` : ""}
              </p>
              {p.completed_at ? (
                <p className="learn-done-note">
                  You finished this path on {new Date(p.completed_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.
                </p>
              ) : (
                next && (
                  <Link href={`/learn/${p.slug}/${next.slug}`} className="btn btn-primary">
                    {passed > 0 ? "Continue" : "Start the path"}
                  </Link>
                )
              )}
            </div>
          </header>

          <ol className="learn-lessons">
            {p.lessons.map((l, i) => (
              <li key={l.id} className={`card panel learn-lesson-row${l.passed_at ? " is-passed" : ""}`}>
                <span className="learn-lesson-status" aria-hidden="true">
                  {l.passed_at ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                </span>
                <div className="learn-lesson-text">
                  <Link href={`/learn/${p.slug}/${l.slug}`} className="learn-lesson-title">
                    {i + 1}. {l.title}
                  </Link>
                  {l.summary && <span className="meta">{l.summary}</span>}
                  <span className="meta">
                    {readTime(l.read_seconds)} · {l.questions}-question quiz
                    {l.passed_at
                      ? ` · Passed (${l.best_score}%)${l.xp_paid ? "" : " · XP pays on your next day of learning"}`
                      : l.attempts > 0
                        ? ` · Best so far ${l.best_score ?? 0}%`
                        : ""}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
