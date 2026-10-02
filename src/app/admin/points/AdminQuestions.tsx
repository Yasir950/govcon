"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast-provider";
import {
  createQuestionAction,
  deleteQuestionAction,
  reviewQuestionAction,
  scheduleQuestionAction,
} from "./actions";

type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export interface AdminQuestion {
  id: string;
  question: string;
  status: "pending" | "approved" | "rejected" | "published";
  day: string | null;
  createdAt: string;
  suggestedBy: string | null;
  rejectReason: string | null;
  options: { label: string; votes: number }[];
  totalVotes: number;
}

function useRun() {
  const router = useRouter();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<ActionResult>) => {
    setBusy(true);
    try {
      const res = await fn();
      showToast(res.ok ? (res.message ?? "Saved.") : res.error);
      if (res.ok) router.refresh();
      return res.ok;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

function NewQuestion() {
  const { run, busy } = useRun();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState("");
  const [day, setDay] = useState("");
  return (
    <section className="card panel" style={{ marginBottom: 16 }}>
      <h3 className="section-title">Add a question</h3>
      <p className="meta">One answer per line (2 to 5). Leave the day empty to add it to the queue; questions run in the order they were approved.</p>
      <div style={{ display: "grid", gap: 8, maxWidth: 640 }}>
        <input className="field" placeholder="Will the CR last past December?" value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} />
        <textarea className="field" rows={4} placeholder={"Yes\nNo\nAnother short CR"} value={options} onChange={(e) => setOptions(e.target.value)} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="field" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Run on (optional)" />
          <button
            className="btn btn-primary"
            disabled={busy || !question.trim()}
            onClick={async () => {
              const ok = await run(() => createQuestionAction(question, options.split("\n"), day || null));
              if (ok) {
                setQuestion("");
                setOptions("");
                setDay("");
              }
            }}
          >
            Add question
          </button>
        </div>
      </div>
    </section>
  );
}

function PendingRow({ q }: { q: AdminQuestion }) {
  const { run, busy } = useRun();
  const [question, setQuestion] = useState(q.question);
  const [options, setOptions] = useState(q.options.map((o) => o.label).join("\n"));
  const [reason, setReason] = useState("");
  const edited = question !== q.question || options !== q.options.map((o) => o.label).join("\n");
  return (
    <li className="card panel" style={{ display: "grid", gap: 8 }}>
      <span className="meta">
        Suggested by {q.suggestedBy ?? "a member"} · {new Date(q.createdAt).toLocaleDateString()}
      </span>
      <input className="field" value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} aria-label="Question" />
      <textarea className="field" rows={Math.max(2, q.options.length)} value={options} onChange={(e) => setOptions(e.target.value)} aria-label="Answers, one per line" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => run(() => reviewQuestionAction(q.id, true, edited ? { question, options: options.split("\n") } : null, null))}
        >
          {edited ? "Save edits & approve" : "Approve"}
        </button>
        <input className="field" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ minWidth: 200 }} />
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => reviewQuestionAction(q.id, false, null, reason))}>
          Decline
        </button>
      </div>
    </li>
  );
}

function QueueRow({ q }: { q: AdminQuestion }) {
  const { run, busy } = useRun();
  const [day, setDay] = useState(q.day ?? "");
  return (
    <tr>
      <td>
        {q.question}
        <div className="meta">{q.options.map((o) => o.label).join(" · ")}</div>
      </td>
      <td>{q.suggestedBy ?? "Admin"}</td>
      <td>
        <input className="field" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Run on" />
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        <button className="btn btn-outline btn-sm" disabled={busy || day === (q.day ?? "")} onClick={() => run(() => scheduleQuestionAction(q.id, day || null))}>
          {day ? "Schedule" : "Unschedule"}
        </button>{" "}
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => deleteQuestionAction(q.id))}>
          Remove
        </button>
      </td>
    </tr>
  );
}

export function AdminQuestions({ questions }: { questions: AdminQuestion[] }) {
  const pending = questions.filter((q) => q.status === "pending");
  const queue = questions
    .filter((q) => q.status === "approved")
    .sort((a, b) => (a.day ?? "9999").localeCompare(b.day ?? "9999"));
  const published = questions.filter((q) => q.status === "published").sort((a, b) => (b.day ?? "").localeCompare(a.day ?? ""));

  return (
    <>
      <NewQuestion />

      <section className="card panel" style={{ marginBottom: 16 }}>
        <h3 className="section-title">Member suggestions ({pending.length})</h3>
        <p className="meta">Approved suggestions join the queue. The member earns XP and Credits when theirs goes live (2 a month at most).</p>
        {pending.length === 0 ? (
          <p className="meta">Nothing waiting for review.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {pending.map((q) => (
              <PendingRow key={q.id} q={q} />
            ))}
          </ul>
        )}
      </section>

      <section className="card panel" style={{ marginBottom: 16 }}>
        <h3 className="section-title">Queue ({queue.length})</h3>
        <p className="meta">Scheduled questions run on their day (Eastern time); the rest run in approval order when no question is scheduled.</p>
        {queue.length === 0 ? (
          <p className="meta">The queue is empty. Members will see no question until one is added.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="points-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>From</th>
                  <th>Run on</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {queue.map((q) => (
                  <QueueRow key={q.id} q={q} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card panel">
        <h3 className="section-title">Past questions</h3>
        {published.length === 0 ? (
          <p className="meta">None yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="points-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Question</th>
                  <th>Results</th>
                </tr>
              </thead>
              <tbody>
                {published.map((q) => (
                  <tr key={q.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{q.day}</td>
                    <td>
                      {q.question}
                      {q.suggestedBy && <div className="meta">Suggested by {q.suggestedBy}</div>}
                    </td>
                    <td>
                      {q.options.map((o) => (
                        <div key={o.label} className="meta">
                          {o.label}: {o.votes} ({q.totalVotes ? Math.round((o.votes / q.totalVotes) * 100) : 0}%)
                        </div>
                      ))}
                      <strong>{q.totalVotes} votes</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
