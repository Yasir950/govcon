"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast-provider";
import { saveLessonAction, savePathAction, type LessonInput, type PathInput, type QuestionInput } from "./learning-actions";

export interface AdminLesson {
  id: string;
  pathId: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  minReadSeconds: number | null;
  sortOrder: number;
  active: boolean;
  passes: number;
  questions: QuestionInput[];
}

export interface AdminPath {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  audience: string | null;
  badgeCode: string | null;
  sortOrder: number;
  active: boolean;
  completions: number;
  lessons: AdminLesson[];
}

type Res = { ok: true; message?: string } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<Res>) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    showToast(res.ok ? (res.message ?? "Saved.") : res.error);
    if (res.ok) router.refresh();
    return res.ok;
  };
  return { run, busy };
}

function PathForm({ initial, badges, onDone }: { initial?: AdminPath; badges: { code: string; name: string }[]; onDone: () => void }) {
  const { run, busy } = useRun();
  const [f, setF] = useState<PathInput>({
    id: initial?.id,
    slug: initial?.slug ?? "",
    title: initial?.title ?? "",
    summary: initial?.summary ?? "",
    audience: initial?.audience ?? "",
    badgeCode: initial?.badgeCode ?? "",
    sortOrder: initial?.sortOrder ?? 100,
    active: initial?.active ?? true,
  });
  return (
    <div className="card panel" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="field" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ flex: "2 1 240px" }} />
        <input className="field" placeholder="slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} style={{ flex: "1 1 160px" }} />
        <input
          className="field"
          type="number"
          title="Sort order"
          value={f.sortOrder}
          onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })}
          style={{ width: 90 }}
        />
      </div>
      <textarea className="field" rows={2} placeholder="Summary" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input className="field" placeholder="Audience" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} style={{ flex: "1 1 200px" }} />
        <select className="select" value={f.newBadgeName !== undefined ? "__new" : f.badgeCode} onChange={(e) =>
            setF(e.target.value === "__new" ? { ...f, newBadgeName: "" } : { ...f, badgeCode: e.target.value, newBadgeName: undefined })
          }>
          <option value="">No badge</option>
          <option value="__new">New badge…</option>
          {badges.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
        {f.newBadgeName !== undefined && (
          <input className="field" placeholder="Badge name (e.g. FAR Fluent)" value={f.newBadgeName} onChange={(e) => setF({ ...f, newBadgeName: e.target.value })} />
        )}
        <label className="meta">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active
        </label>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => (await run(() => savePathAction(f))) && onDone()}>
          Save path
        </button>
        <button className="btn btn-outline btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function LessonForm({ pathId, initial, onDone }: { pathId: string; initial?: AdminLesson; onDone: () => void }) {
  const { run, busy } = useRun();
  const [f, setF] = useState<LessonInput>({
    id: initial?.id,
    pathId,
    slug: initial?.slug ?? "",
    title: initial?.title ?? "",
    summary: initial?.summary ?? "",
    body: initial?.body ?? "",
    minReadSeconds: initial?.minReadSeconds ?? null,
    sortOrder: initial?.sortOrder ?? 100,
    active: initial?.active ?? true,
    questions: initial?.questions ?? [],
  });
  const setQ = (i: number, q: Partial<QuestionInput>) => setF({ ...f, questions: f.questions.map((x, j) => (j === i ? { ...x, ...q } : x)) });

  return (
    <div className="card panel" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="field" placeholder="Lesson title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ flex: "2 1 240px" }} />
        <input className="field" placeholder="slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} style={{ flex: "1 1 160px" }} />
        <input
          className="field"
          type="number"
          title="Sort order"
          value={f.sortOrder}
          onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })}
          style={{ width: 90 }}
        />
      </div>
      <input className="field" placeholder="One-line summary" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
      <textarea
        className="field"
        rows={14}
        placeholder="Lesson body (Markdown: ### headings, **bold**, - lists, | tables |)"
        value={f.body}
        onChange={(e) => setF({ ...f, body: e.target.value })}
        style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label className="meta">
          Minimum reading time (seconds, blank = from length){" "}
          <input
            className="field"
            type="number"
            min={0}
            max={1800}
            value={f.minReadSeconds ?? ""}
            onChange={(e) => setF({ ...f, minReadSeconds: e.target.value === "" ? null : Number(e.target.value) })}
            style={{ width: 100 }}
          />
        </label>
        <label className="meta">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active
        </label>
      </div>

      <h4 style={{ margin: "8px 0 0" }}>Quiz ({f.questions.length} questions)</h4>
      <p className="meta" style={{ margin: 0 }}>
        Pass mark is a setting (learning_quiz_pass_pct, 80% by default), so 5 questions means 4 must be right.
      </p>
      {f.questions.map((q, i) => (
        <div key={i} style={{ display: "grid", gap: 6, padding: 10, border: "1px solid var(--o-line, #dbe5ef)", borderRadius: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input className="field" placeholder={`Question ${i + 1}`} value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} style={{ flex: 1 }} />
            <button
              className="btn btn-outline btn-sm"
              type="button"
              onClick={() => setF({ ...f, questions: f.questions.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
          {q.options.map((o, oi) => (
            <label key={oi} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="radio" name={`correct-${i}`} checked={q.correctIndex === oi} onChange={() => setQ(i, { correctIndex: oi })} title="Correct answer" />
              <input
                className="field"
                value={o}
                placeholder={`Option ${oi + 1}`}
                onChange={(e) => setQ(i, { options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })}
                style={{ flex: 1 }}
              />
              {q.options.length > 2 && (
                <button
                  className="link-btn"
                  type="button"
                  onClick={() =>
                    setQ(i, {
                      options: q.options.filter((_, k) => k !== oi),
                      correctIndex: q.correctIndex === oi ? 0 : q.correctIndex > oi ? q.correctIndex - 1 : q.correctIndex,
                    })
                  }
                >
                  ×
                </button>
              )}
            </label>
          ))}
          {q.options.length < 6 && (
            <button className="link-btn" type="button" style={{ justifySelf: "start" }} onClick={() => setQ(i, { options: [...q.options, ""] })}>
              + Option
            </button>
          )}
          <input
            className="field"
            placeholder="Explanation shown after a pass"
            value={q.explanation}
            onChange={(e) => setQ(i, { explanation: e.target.value })}
          />
        </div>
      ))}
      <button
        className="link-btn"
        type="button"
        style={{ justifySelf: "start" }}
        onClick={() => setF({ ...f, questions: [...f.questions, { prompt: "", options: ["", "", "", ""], correctIndex: 0, explanation: "" }] })}
      >
        + Add question
      </button>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => (await run(() => saveLessonAction(f))) && onDone()}>
          Save lesson
        </button>
        <button className="btn btn-outline btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function PathBlock({ path, badges }: { path: AdminPath; badges: { code: string; name: string }[] }) {
  const [editing, setEditing] = useState(false);
  const [lesson, setLesson] = useState<string | "new" | null>(null);
  return (
    <section className="card panel" style={{ display: "grid", gap: 10 }}>
      {editing ? (
        <PathForm initial={path} badges={badges} onDone={() => setEditing(false)} />
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div>
            <strong>{path.title}</strong>{" "}
            <span className="meta">
              /learn/{path.slug} · {path.active ? "active" : "hidden"} · {path.completions} completed
              {path.badgeCode ? ` · badge ${badges.find((b) => b.code === path.badgeCode)?.name ?? path.badgeCode}` : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>
              Edit path
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setLesson("new")}>
              Add lesson
            </button>
          </div>
        </div>
      )}
      {lesson === "new" && <LessonForm pathId={path.id} onDone={() => setLesson(null)} />}
      <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
        {path.lessons.map((l) =>
          lesson === l.id ? (
            <li key={l.id}>
              <LessonForm pathId={path.id} initial={l} onDone={() => setLesson(null)} />
            </li>
          ) : (
            <li key={l.id}>
              <button className="link-btn" onClick={() => setLesson(l.id)}>
                {l.title}
              </button>{" "}
              <span className="meta">
                {l.active ? "" : "hidden · "}
                {l.questions.length} questions · {l.passes} passed
              </span>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

export function AdminLearning({ paths, badges }: { paths: AdminPath[]; badges: { code: string; name: string }[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="meta" style={{ margin: 0 }}>
        Paths are 5 to 8 short lessons, each with a quiz. Passing pays the learning_lesson_passed rule (once per lesson, 3 a day);
        finishing every active lesson in a path pays learning_path_completed and awards the path&apos;s badge (pick &quot;New badge…&quot;
        on a path to create one). Hiding a lesson doesn&apos;t undo completions already earned.
      </p>
      <div>
        {adding ? (
          <PathForm badges={badges} onDone={() => setAdding(false)} />
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            Add path
          </button>
        )}
      </div>
      {paths.map((p) => (
        <PathBlock key={p.id} path={p} badges={badges} />
      ))}
    </div>
  );
}
