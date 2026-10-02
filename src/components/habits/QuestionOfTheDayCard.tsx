"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { suggestQuestionAction, voteQuestionAction } from "@/app/(app)/dashboard/habit-actions";
import { useToast } from "@/components/toast-provider";
import type { QuestionOfTheDay } from "@/lib/daily-habits-types";

const MAX_OPTIONS = 5;

function SuggestForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const showToast = useToast();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await suggestQuestionAction(question, options);
    setBusy(false);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    showToast("Thanks! We'll let you know if your question is chosen.");
    onDone();
  };

  return (
    <form className="habit-suggest" onSubmit={submit}>
      <label className="label">
        Your question
        <input
          className="field"
          value={question}
          maxLength={200}
          minLength={10}
          required
          placeholder="Will the CR last past December?"
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>
      <fieldset className="habit-suggest-options">
        <legend className="label">Answers (2 to {MAX_OPTIONS})</legend>
        {options.map((o, i) => (
          <div key={i} className="habit-suggest-option">
            <input
              className="field"
              value={o}
              maxLength={80}
              required={i < 2}
              aria-label={`Answer ${i + 1}`}
              placeholder={`Answer ${i + 1}`}
              onChange={(e) => setOptions((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {i >= 2 && (
              <button
                type="button"
                className="points-reroll"
                aria-label={`Remove answer ${i + 1}`}
                onClick={() => setOptions((cur) => cur.filter((_, j) => j !== i))}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <button type="button" className="link-btn" onClick={() => setOptions((cur) => [...cur, ""])}>
            <Plus size={13} aria-hidden="true" /> Add an answer
          </button>
        )}
      </fieldset>
      <div className="habit-match-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          Send suggestion
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// Home, right rail: a one-tap GovCon poll. Results show after voting;
// members can suggest tomorrow's questions.
export function QuestionOfTheDayCard({ initial }: { initial: QuestionOfTheDay | null }) {
  const showToast = useToast();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  if (!data) return null;
  const q = data.question;
  const canSuggest = data.pending_suggestions < data.max_pending_suggestions;

  const vote = async (optionId: string) => {
    if (busy || !q || q.my_vote) return;
    setBusy(true);
    const res = await voteQuestionAction(optionId);
    setBusy(false);
    if (res.ok) setData(res.data);
    else showToast(res.error);
  };

  return (
    <section className="card panel habit-card" id="question-of-the-day" aria-labelledby="qotd-title">
      <div className="panel-head">
        <h2 className="section-title" id="qotd-title">
          Question of the day
        </h2>
        {q && !q.my_vote && data.vote_xp > 0 && <span className="points-quest-reward">+{data.vote_xp} XP</span>}
      </div>

      {!q ? (
        <p className="habit-empty meta">No question today. Suggest one for tomorrow!</p>
      ) : (
        <>
          <p className="habit-question">{q.question}</p>
          {q.my_vote ? (
            <ul className="habit-poll-results">
              {q.options.map((o) => {
                const pct = q.total ? Math.round(((o.votes ?? 0) / q.total) * 100) : 0;
                const mine = o.id === q.my_vote;
                return (
                  <li key={o.id} className={mine ? "is-mine" : ""}>
                    <span className="habit-poll-bar" style={{ width: `${pct}%` }} aria-hidden="true" />
                    <span className="habit-poll-label">
                      {mine && <Check size={13} aria-label="Your answer" />} {o.label}
                    </span>
                    <span className="habit-poll-pct">{pct}%</span>
                  </li>
                );
              })}
              <li className="habit-poll-total meta">
                {q.total === 1 ? "1 vote" : `${(q.total ?? 0).toLocaleString()} votes`}
              </li>
            </ul>
          ) : (
            <div className="habit-poll-options">
              {q.options.map((o) => (
                <button key={o.id} type="button" className="habit-poll-option" disabled={busy} onClick={() => vote(o.id)}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {q.suggested_by && (
            <p className="meta habit-credit">
              Suggested by{" "}
              {q.suggested_by.slug ? (
                <Link href={`/network/${q.suggested_by.slug}`}>{q.suggested_by.name}</Link>
              ) : (
                q.suggested_by.name
              )}
            </p>
          )}
        </>
      )}

      {suggesting ? (
        <SuggestForm
          onCancel={() => setSuggesting(false)}
          onDone={() => {
            setSuggesting(false);
            setData((d) => (d ? { ...d, pending_suggestions: d.pending_suggestions + 1 } : d));
          }}
        />
      ) : canSuggest ? (
        <button type="button" className="link-btn habit-suggest-toggle" onClick={() => setSuggesting(true)}>
          Suggest a question
        </button>
      ) : (
        <p className="meta habit-suggest-toggle">Your suggestions are waiting for review.</p>
      )}
    </section>
  );
}
