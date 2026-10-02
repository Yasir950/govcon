import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LessonQuiz } from "@/components/learning/LessonQuiz";
import { RichText } from "@/components/rich-text/RichText";
import { createClient } from "@/lib/supabase/server";
import { readTime, type LessonDetail } from "@/lib/learning-status-types";

export const metadata: Metadata = { title: "Lesson · Learn · GovConUnited" };
export const dynamic = "force-dynamic";

// Opening the page starts the lesson's reading clock (server-side), so the
// quiz below unlocks only after the minimum reading time.
export default async function LessonPage({ params }: { params: Promise<{ path: string; lesson: string }> }) {
  const { path, lesson } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/learn/${path}/${lesson}`);

  const { data, error } = await supabase.rpc("learning_lesson_open", { p_path: path, p_lesson: lesson });
  if (error) console.error("learning_lesson_open failed", error);
  const l = data as unknown as LessonDetail | null;
  if (!l) notFound();

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns learn-page learn-lesson-page">
          <nav className="learn-crumbs meta" aria-label="Breadcrumb">
            <Link href="/learn">Learn</Link> <span aria-hidden="true">/</span> <Link href={`/learn/${l.path.slug}`}>{l.path.title}</Link>{" "}
            <span aria-hidden="true">/</span> Lesson {l.position} of {l.total}
          </nav>
          <article className="card panel learn-lesson">
            <header>
              <h1>{l.title}</h1>
              <p className="meta">
                {readTime(l.read_seconds)}
                {l.passed_at ? ` · Passed (${l.best_score}%)` : ""}
              </p>
            </header>
            <RichText text={l.body} className="learn-lesson-body" />
          </article>

          <LessonQuiz lesson={l} />

          <nav className="learn-pager" aria-label="Lessons">
            {l.prev ? (
              <Link href={`/learn/${l.path.slug}/${l.prev.slug}`} className="btn btn-outline btn-sm">
                ← {l.prev.title}
              </Link>
            ) : (
              <span />
            )}
            {l.next ? (
              <Link href={`/learn/${l.path.slug}/${l.next.slug}`} className="btn btn-outline btn-sm">
                {l.next.title} →
              </Link>
            ) : (
              <Link href={`/learn/${l.path.slug}`} className="btn btn-outline btn-sm">
                Back to the path
              </Link>
            )}
          </nav>
        </div>
      </div>
    </section>
  );
}
