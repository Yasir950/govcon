"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { submitQuizAction } from "@/app/(app)/learn/actions";
import { useToast } from "@/components/toast-provider";
import { rewardText } from "@/lib/member-help-types";
import type { LessonDetail, QuizResult } from "@/lib/learning-status-types";

// The lesson quiz. It stays locked until the lesson's minimum reading time
// has passed (the server checks the same clock on submit). A failed try only
// says which answers were wrong; explanations come with a pass.
export function LessonQuiz({ lesson }: { lesson: LessonDetail }) {
  const router = useRouter();
  const showToast = useToast();
  const [secondsLeft, setSecondsLeft] = useState(lesson.seconds_left);
  const [answers, setAnswers] = useState<(number | null)[]>(() => lesson.questions.map(() => null));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  if (lesson.questions.length === 0) return null;

  const locked = secondsLeft > 0;
  const allAnswered = answers.every((a) => a != null);
  const byId = new Map(result?.results.map((r) => [r.id, r]));
  const reward = rewardText(lesson.lesson_rule);

  const submit = async () => {
    if (!allAnswered) return showToast("Answer every question first.");
    setBusy(true);
    const res = await submitQuizAction(
      lesson.id,
      answers.map((a) => a ?? -1),
    );
    setBusy(false);
    if (!res.ok) {
      const wait = /quiz opens in (\d+) seconds/.exec(res.error);
      if (wait) setSecondsLeft(Number(wait[1]));
      return showToast(res.error);
    }
    setResult(res.data);
    if (res.data.passed) router.refresh();
  };

  const retake = () => {
    setResult(null);
    setAnswers(lesson.questions.map(() => null));
  };

  return (
    <section className="card panel learn-quiz" aria-labelledby="quiz-title">
      <div className="learn-quiz-head">
        <h2 id="quiz-title" className="section-title">
          Quiz · {lesson.questions.length} questions
        </h2>
        <span className="meta">
          Pass with {lesson.pass_pct}%{reward && !lesson.passed_at ? ` · ${reward}` : ""}
          {lesson.passed_at ? " · You've passed this one; retakes don't pay again" : ""}
        </span>
      </div>

      {locked ? (
        <div className="learn-quiz-locked" role="status">
          <Clock size={18} aria-hidden="true" />
          <span>
            Read the lesson first. The quiz opens in{" "}
            <strong>
              {Math.floor(secondsLeft / 60) > 0 ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : `${secondsLeft}s`}
            </strong>
            .
          </span>
        </div>
      ) : (
        <>
          <ol className="learn-questions">
            {lesson.questions.map((q, qi) => {
              const r = byId.get(q.id);
              return (
                <li key={q.id} className={r ? (r.correct ? "is-correct" : "is-wrong") : ""}>
                  <fieldset disabled={busy || Boolean(result)}>
                    <legend>{q.prompt}</legend>
                    {q.options.map((opt, oi) => {
                      const isAnswer = r?.answer === oi;
                      return (
                        <label key={oi} className={`learn-option${answers[qi] === oi ? " is-picked" : ""}${isAnswer ? " is-answer" : ""}`}>
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            checked={answers[qi] === oi}
                            onChange={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)))}
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                  {r && (
                    <p className={`learn-feedback ${r.correct ? "is-correct" : "is-wrong"}`}>
                      {r.correct ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
                      <span>
                        {r.correct ? "Correct." : result?.passed ? "Not quite." : "Not quite. Re-read the lesson and try again."}
                        {r.explanation ? ` ${r.explanation}` : ""}
                      </span>
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          {result ? (
            <div className={`learn-result ${result.passed ? "is-pass" : "is-fail"}`} role="status">
              <strong>
                {result.score}% · {result.correct} of {result.total} correct · {result.passed ? "Passed!" : `You need ${lesson.pass_pct}% to pass`}
              </strong>
              <span>
                {result.passed
                  ? result.first_pass
                    ? result.xp_paid
                      ? `${reward || "XP"} added.`
                      : result.xp_pending
                        ? "You've hit today's lesson XP limit. Your XP for this lesson pays on your next day of learning."
                        : ""
                    : "You'd already passed this lesson, so this retake doesn't pay again."
                  : "Retakes are allowed anytime."}
                {result.path_completed && " You finished the whole path. Your badge is on your profile."}
              </span>
              <div className="learn-result-actions">
                {!result.passed && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={retake}>
                    Try again
                  </button>
                )}
                {result.passed && lesson.next && (
                  <Link href={`/learn/${lesson.path.slug}/${lesson.next.slug}`} className="btn btn-primary btn-sm">
                    Next lesson
                  </Link>
                )}
                {result.passed && !lesson.next && (
                  <Link href={`/learn/${lesson.path.slug}`} className="btn btn-primary btn-sm">
                    Back to the path
                  </Link>
                )}
                {result.passed && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={retake}>
                    Retake
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy || !allAnswered} onClick={submit}>
              {busy ? "Checking…" : "Submit answers"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
