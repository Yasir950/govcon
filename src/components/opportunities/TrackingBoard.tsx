"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  addBidStageAction,
  addTrackingTaskAction,
  deleteBidStageAction,
  deleteTrackingTaskAction,
  leaveSharedBidAction,
  removeTrackingAction,
  reorderBidStagesAction,
  saveTrackingNotesAction,
  setDefaultReminderDaysAction,
  setTrackingAmendmentAlertsAction,
  setTrackingRemindersAction,
  setTrackingStageAction,
  shareBidAction,
  unshareBidAction,
  updateBidStageAction,
  updateTrackingTaskAction,
} from "@/app/(app)/opportunities/tracking/actions";
import { BidLimitPrompt } from "@/components/opportunities/BidLimitPrompt";
import { useToast } from "@/components/toast-provider";
import { ACTIVE_BID_STAGES, FREE_ACTIVE_BID_LIMIT, type TrackingStage } from "@/lib/bid-tracker-plan";
import type { BidShareRecipient, BidStage, SharedBid, TrackingItem, TrackingTask } from "@/lib/supabase/queries";

type Column = { key: string; label: string; color: string; custom: boolean };

const FIXED_BEFORE: Column[] = [{ key: "interested", label: "Interested", color: "#64748b", custom: false }];
const FIXED_AFTER: Column[] = [
  { key: "submitted", label: "Submitted", color: "#0d9488", custom: false },
  { key: "won", label: "Won", color: "#14764b", custom: false },
  { key: "lost", label: "Lost", color: "#dc2626", custom: false },
  { key: "not_submitted", label: "Not submitted", color: "#94a3b8", custom: false },
];

const STAGE_COLORS = ["#0ea5e9", "#0071bc", "#8b5cf6", "#d97706", "#db2777", "#0d9488", "#64748b"];

function columnKey(item: Pick<TrackingItem, "stage" | "customStageId">) {
  return item.stage === "working" ? `working:${item.customStageId}` : item.stage;
}

function parseColumnKey(key: string): { stage: TrackingStage; customStageId: string | null } {
  if (key.startsWith("working:")) return { stage: "working", customStageId: key.slice(8) };
  return { stage: key as TrackingStage, customStageId: null };
}

function isActive(item: TrackingItem) {
  return ACTIVE_BID_STAGES.includes(item.stage);
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

// "7, 3, 1" → [7, 3, 1]; null when the text isn't a valid schedule.
function parseDays(text: string): number[] | null {
  const parts = text
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 6) return null;
  const days = parts.map(Number);
  if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 60)) return null;
  return [...new Set(days)].sort((a, b) => b - a);
}

function formatDays(days: number[]) {
  if (days.length === 0) return "none";
  return `${days.join(", ")} day${days.length === 1 && days[0] === 1 ? "" : "s"} before`;
}

// Deadline, bid-logged and outcome chips.
function BidStatus({ item }: { item: TrackingItem }) {
  const deadline = item.responseDeadline ? new Date(item.responseDeadline) : null;
  const daysLeft = deadline ? daysUntil(deadline) : null;
  return (
    <div className="trk-bid">
      {deadline && !item.bidSubmittedAt && (
        <span
          className={`trk-chip${daysLeft !== null && daysLeft < 0 ? " is-past" : daysLeft !== null && daysLeft <= 3 ? " is-due-soon" : ""}`}
          title={deadline.toLocaleString()}
        >
          {daysLeft !== null && daysLeft < 0
            ? "Deadline passed"
            : daysLeft === 0
              ? "Due today"
              : `Due ${shortDate(item.responseDeadline!)} · ${daysLeft}d`}
        </span>
      )}
      {item.bidSubmittedAt && <span className="trk-chip is-bid">Bid logged {shortDate(item.bidSubmittedAt)}</span>}
      {item.outcome && <span className={`trk-chip is-${item.outcome}`}>{item.outcome === "won" ? "Won" : "Lost"}</span>}
    </div>
  );
}

function toCsv(items: TrackingItem[], columns: Column[]): string {
  const label = (i: TrackingItem) => columns.find((c) => c.key === columnKey(i))?.label ?? i.stage;
  const header = ["Opportunity", "Agency", "Stage", "Response Deadline", "Bid Logged", "Outcome", "Notes", "Open Tasks", "Added", "Updated"];
  const rows = items.map((i) => [
    i.opportunityTitle,
    i.agency ?? "",
    label(i),
    i.responseDeadline ? new Date(i.responseDeadline).toLocaleString() : "",
    i.bidSubmittedAt ? new Date(i.bidSubmittedAt).toLocaleDateString() : "",
    i.outcome ?? "",
    (i.notes ?? "").replace(/\n/g, " "),
    String(i.tasks.filter((t) => !t.done).length),
    new Date(i.createdAt).toLocaleDateString(),
    new Date(i.updatedAt).toLocaleDateString(),
  ]);
  return [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

type ItemPatch = (item: TrackingItem) => TrackingItem;

function ProLock({ children }: { children: ReactNode }) {
  return (
    <p className="trk-pro-lock">
      <span className="tag gold">Pro</span> {children}{" "}
      <Link href="/billing">Upgrade</Link>
    </p>
  );
}

function ReminderEditor({ item, defaultDays, onPatch }: { item: TrackingItem; defaultDays: number[]; onPatch: (p: ItemPatch) => void }) {
  const showToast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState((item.reminderDays ?? defaultDays).join(", "));

  async function save(days: number[] | null) {
    const prev = item.reminderDays;
    onPatch((i) => ({ ...i, reminderDays: days }));
    setEditing(false);
    const result = await setTrackingRemindersAction(item.id, days);
    if (result.error) {
      onPatch((i) => ({ ...i, reminderDays: prev }));
      showToast(result.error);
    }
  }

  if (!editing) {
    return (
      <div className="trk-row">
        <span>
          Reminders: {formatDays(item.reminderDays ?? defaultDays)}
          {!item.reminderDays && " (default)"}
        </span>
        <button type="button" className="link-btn" onClick={() => setEditing(true)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <form
      className="trk-row trk-inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        const days = parseDays(text);
        if (!days) {
          showToast("Enter up to 6 numbers from 1 to 60, like 7, 3, 1.");
          return;
        }
        save(days);
      }}
    >
      <input className="field" value={text} onChange={(e) => setText(e.target.value)} aria-label="Days before the deadline" placeholder="7, 3, 1" />
      <button type="submit" className="btn btn-primary btn-sm">
        Save
      </button>
      {item.reminderDays && (
        <button type="button" className="link-btn" onClick={() => save(null)}>
          Use default
        </button>
      )}
    </form>
  );
}

function SharePanel({
  item,
  connections,
  onPatch,
}: {
  item: TrackingItem;
  connections: BidShareRecipient[];
  onPatch: (p: ItemPatch) => void;
}) {
  const showToast = useToast();
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState("");
  const available = connections.filter((c) => !item.sharedWith.some((s) => s.profileId === c.profileId));

  async function share() {
    const person = connections.find((c) => c.profileId === choice);
    if (!person) return;
    onPatch((i) => ({ ...i, sharedWith: [...i.sharedWith, person] }));
    setChoice("");
    setPicking(false);
    const result = await shareBidAction(item.id, person.profileId);
    if (result.error) {
      onPatch((i) => ({ ...i, sharedWith: i.sharedWith.filter((s) => s.profileId !== person.profileId) }));
      showToast(result.error);
      return;
    }
    showToast(`Shared with ${person.name}`);
  }

  async function unshare(person: BidShareRecipient) {
    onPatch((i) => ({ ...i, sharedWith: i.sharedWith.filter((s) => s.profileId !== person.profileId) }));
    const result = await unshareBidAction(item.id, person.profileId);
    if (result.error) {
      onPatch((i) => ({ ...i, sharedWith: [...i.sharedWith, person] }));
      showToast(result.error);
    }
  }

  return (
    <div className="trk-share">
      <div className="trk-row">
        <span>{item.sharedWith.length === 0 ? "Not shared" : "Shared with"}</span>
        {!picking && (
          <button type="button" className="link-btn" onClick={() => setPicking(true)}>
            Share
          </button>
        )}
      </div>
      {item.sharedWith.length > 0 && (
        <div className="trk-share-list">
          {item.sharedWith.map((s) => (
            <span key={s.profileId} className="trk-chip">
              {s.name}
              <button type="button" className="trk-chip-x" aria-label={`Stop sharing with ${s.name}`} onClick={() => unshare(s)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {picking &&
        (available.length === 0 ? (
          <p className="meta">
            {connections.length === 0 ? "Connect with teammates or partners to share bids with them." : "Already shared with all your connections."}{" "}
            <button type="button" className="link-btn" onClick={() => setPicking(false)}>
              Close
            </button>
          </p>
        ) : (
          <div className="trk-row trk-inline-form">
            <select className="select" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Share with">
              <option value="">Choose a connection…</option>
              {available.map((c) => (
                <option key={c.profileId} value={c.profileId}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary btn-sm" disabled={!choice} onClick={share}>
              Share
            </button>
            <button type="button" className="link-btn" onClick={() => setPicking(false)}>
              Cancel
            </button>
          </div>
        ))}
    </div>
  );
}

function TrackingCard({
  item,
  columns,
  isPro,
  defaultDays,
  connections,
  onPatch,
  onRemove,
  onLimit,
}: {
  item: TrackingItem;
  columns: Column[];
  isPro: boolean;
  defaultDays: number[];
  connections: BidShareRecipient[];
  onPatch: (id: string, patch: ItemPatch) => void;
  onRemove: (id: string) => void;
  onLimit: (limit: number) => void;
}) {
  const showToast = useToast();
  const [notes, setNotes] = useState(item.notes ?? "");
  const [newTask, setNewTask] = useState("");
  const doneCount = item.tasks.filter((t) => t.done).length;
  const key = columnKey(item);
  const column = columns.find((c) => c.key === key) ?? FIXED_BEFORE[0];
  const patch = (p: ItemPatch) => onPatch(item.id, p);
  // Free members get the fixed stages; a bid left in a custom stage from a
  // past Pro plan keeps showing it.
  const options = columns.filter((c) => isPro || !c.custom || c.key === key);

  function patchTasks(fn: (tasks: TrackingTask[]) => TrackingTask[]) {
    patch((i) => ({ ...i, tasks: fn(i.tasks) }));
  }

  async function changeStage(nextKey: string) {
    const prev = { stage: item.stage, customStageId: item.customStageId };
    const next = parseColumnKey(nextKey);
    patch((i) => ({ ...i, ...next, updatedAt: new Date().toISOString() }));
    const result = await setTrackingStageAction(item.id, next.stage, next.customStageId);
    if (result.error) {
      patch((i) => ({ ...i, ...prev }));
      if (result.limitReached) onLimit(result.limitReached);
      else showToast(result.error);
      return;
    }
    const bidSubmittedAt = result.bidSubmittedAt ?? null;
    const outcome = result.outcome ?? null;
    patch((i) => ({ ...i, bidSubmittedAt, outcome }));
    // The database only logs a bid before the response deadline, and an
    // outcome only for a logged bid — say so when a move didn't count.
    if (next.stage === "submitted" && !bidSubmittedAt) {
      showToast("The response deadline has passed, so this isn't logged as a bid.");
    } else if ((next.stage === "won" || next.stage === "lost") && !bidSubmittedAt) {
      showToast("Outcomes are logged for bids moved to Submitted before the deadline.");
    }
  }

  async function saveNotes() {
    if (notes === (item.notes ?? "")) return;
    patch((i) => ({ ...i, notes }));
    const result = await saveTrackingNotesAction(item.id, notes);
    if (result.error) showToast(result.error);
  }

  async function addTask() {
    const title = newTask.trim();
    if (!title) return;
    const tempId = `temp-${Date.now()}`;
    setNewTask("");
    patchTasks((tasks) => [...tasks, { id: tempId, title, dueAt: null, done: false }]);
    const result = await addTrackingTaskAction(item.id, title);
    if (result.error || !result.taskId) {
      patchTasks((tasks) => tasks.filter((t) => t.id !== tempId));
      showToast(result.error ?? "Couldn't add that task. Please try again.");
      return;
    }
    const taskId = result.taskId;
    patchTasks((tasks) => tasks.map((t) => (t.id === tempId ? { ...t, id: taskId } : t)));
  }

  async function updateTask(task: TrackingTask, change: { done?: boolean; dueAt?: string | null }) {
    patchTasks((tasks) => tasks.map((t) => (t.id === task.id ? { ...t, ...change } : t)));
    const result = await updateTrackingTaskAction(task.id, change);
    if (result.error) {
      patchTasks((tasks) => tasks.map((t) => (t.id === task.id ? task : t)));
      showToast(result.error);
    }
  }

  async function deleteTask(task: TrackingTask) {
    patchTasks((tasks) => tasks.filter((t) => t.id !== task.id));
    const result = await deleteTrackingTaskAction(task.id);
    if (result.error) {
      patchTasks((tasks) => [...tasks, task]);
      showToast(result.error);
    }
  }

  async function toggleAmendments(enabled: boolean) {
    patch((i) => ({ ...i, amendmentAlerts: enabled }));
    const result = await setTrackingAmendmentAlertsAction(item.id, enabled);
    if (result.error) {
      patch((i) => ({ ...i, amendmentAlerts: !enabled }));
      showToast(result.error);
    }
  }

  const awaitingDeadline = item.stage === "interested" || item.stage === "working";

  return (
    <article className="trk-card" style={{ borderTopColor: column.color }}>
      <div className="trk-card-head">
        <Link href={`/${item.opportunityRoute}`} className="trk-card-title">
          {item.opportunityTitle}
        </Link>
        <button
          type="button"
          className="trk-icon-btn"
          title="Remove from Bid Tracker"
          aria-label="Remove from Bid Tracker"
          onClick={() => onRemove(item.id)}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          </svg>
        </button>
      </div>

      <div className="trk-card-meta">
        <select className="trk-stage-select" value={key} onChange={(e) => changeStage(e.target.value)} aria-label="Stage">
          {options.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="trk-updated">Updated {new Date(item.updatedAt).toLocaleDateString()}</span>
      </div>

      <BidStatus item={item} />

      {isPro ? (
        <>
          <textarea
            className="trk-notes"
            rows={2}
            placeholder="Private notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
          />

          <div className="trk-tasks">
            {item.tasks.length > 0 && (
              <div className="trk-progress">
                <span>
                  Tasks {doneCount}/{item.tasks.length}
                </span>
                <div className="trk-progress-bar">
                  <div style={{ width: `${(doneCount / item.tasks.length) * 100}%`, background: column.color }} />
                </div>
              </div>
            )}
            {item.tasks.map((t) => (
              <div key={t.id} className={`trk-task${t.done ? " is-done" : ""}`}>
                <input
                  type="checkbox"
                  checked={t.done}
                  disabled={t.id.startsWith("temp-")}
                  onChange={(e) => updateTask(t, { done: e.target.checked })}
                  aria-label={`Mark ${t.title} done`}
                />
                <span>{t.title}</span>
                <input
                  type="date"
                  className="trk-task-due"
                  value={t.dueAt ? t.dueAt.slice(0, 10) : ""}
                  disabled={t.id.startsWith("temp-")}
                  onChange={(e) => updateTask(t, { dueAt: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null })}
                  aria-label={`Due date for ${t.title}`}
                  title="Due date"
                />
                <button
                  type="button"
                  className="trk-icon-btn trk-task-del"
                  aria-label={`Delete task ${t.title}`}
                  disabled={t.id.startsWith("temp-")}
                  onClick={() => deleteTask(t)}
                >
                  ×
                </button>
              </div>
            ))}
            <form
              className="trk-add-task"
              onSubmit={(e) => {
                e.preventDefault();
                addTask();
              }}
            >
              <input placeholder="+ Add a task" value={newTask} onChange={(e) => setNewTask(e.target.value)} />
              {newTask.trim() && <button type="submit">Add</button>}
            </form>
          </div>

          <div className="trk-extras">
            {awaitingDeadline && item.responseDeadline && <ReminderEditor item={item} defaultDays={defaultDays} onPatch={patch} />}
            <label className="trk-row trk-check">
              <input type="checkbox" checked={item.amendmentAlerts} onChange={(e) => toggleAmendments(e.target.checked)} />
              <span>Amendment alerts</span>
            </label>
            <SharePanel item={item} connections={connections} onPatch={patch} />
          </div>
        </>
      ) : (
        <div className="trk-extras">
          {awaitingDeadline && item.responseDeadline && <p className="trk-row">Email reminder 3 days before the deadline</p>}
          <ProLock>Notes, tasks, reminder schedules, amendment alerts and sharing.</ProLock>
        </div>
      )}
    </article>
  );
}

function SharedBidCard({ bid, highlighted, onLeave }: { bid: SharedBid; highlighted: boolean; onLeave: (id: string) => void }) {
  const stageLabel =
    bid.stage === "working" ? "In progress" : [...FIXED_BEFORE, ...FIXED_AFTER].find((c) => c.key === bid.stage)?.label ?? bid.stage;
  return (
    <article id={`shared-${bid.id}`} className={`trk-card trk-shared${highlighted ? " is-highlighted" : ""}`}>
      <div className="trk-card-head">
        <Link href={`/${bid.opportunityRoute}`} className="trk-card-title">
          {bid.opportunityTitle}
        </Link>
      </div>
      <p className="meta">
        Shared by <b>{bid.ownerName}</b> · {stageLabel}
      </p>
      <BidStatus item={bid} />
      {bid.notes && <p className="trk-shared-notes">{bid.notes}</p>}
      {bid.tasks.length > 0 && (
        <ul className="trk-shared-tasks">
          {bid.tasks.map((t) => (
            <li key={t.id} className={t.done ? "is-done" : ""}>
              {t.done ? "✓" : "○"} {t.title}
              {t.dueAt && <span className="meta"> · due {shortDate(t.dueAt)}</span>}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="link-btn" onClick={() => onLeave(bid.id)}>
        Remove from my tracker
      </button>
    </article>
  );
}

// Pro: default reminder schedule and custom stages.
function TrackerSettings({
  stages,
  setStages,
  reminderDays,
  setReminderDays,
  onClose,
}: {
  stages: BidStage[];
  setStages: (fn: (s: BidStage[]) => BidStage[]) => void;
  reminderDays: number[];
  setReminderDays: (d: number[]) => void;
  onClose: () => void;
}) {
  const showToast = useToast();
  const [daysText, setDaysText] = useState(reminderDays.join(", "));
  const [newLabel, setNewLabel] = useState("");

  async function saveDays() {
    const days = parseDays(daysText);
    if (!days) {
      showToast("Enter up to 6 numbers from 1 to 60, like 7, 3, 1.");
      return;
    }
    const result = await setDefaultReminderDaysAction(days);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setReminderDays(result.days ?? days);
    showToast("Reminder schedule saved");
  }

  async function addStage() {
    const label = newLabel.trim();
    if (!label) return;
    const color = STAGE_COLORS[stages.length % STAGE_COLORS.length];
    setNewLabel("");
    const result = await addBidStageAction(label, color);
    if (result.error || !result.id) {
      showToast(result.error ?? "Couldn't add that stage. Please try again.");
      return;
    }
    const id = result.id;
    setStages((s) => [...s, { id, label, color, sortOrder: s.length + 1 }]);
  }

  async function renameStage(stage: BidStage, label: string) {
    if (!label.trim() || label.trim() === stage.label) return;
    setStages((s) => s.map((x) => (x.id === stage.id ? { ...x, label: label.trim() } : x)));
    const result = await updateBidStageAction(stage.id, { label });
    if (result.error) {
      setStages((s) => s.map((x) => (x.id === stage.id ? stage : x)));
      showToast(result.error);
    }
  }

  async function recolorStage(stage: BidStage, color: string) {
    setStages((s) => s.map((x) => (x.id === stage.id ? { ...x, color } : x)));
    const result = await updateBidStageAction(stage.id, { color });
    if (result.error) showToast(result.error);
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    setStages(() => next);
    const result = await reorderBidStagesAction(next.map((s) => s.id));
    if (result.error) {
      setStages(() => stages);
      showToast(result.error);
    }
  }

  async function removeStage(stage: BidStage) {
    if (!window.confirm(`Delete the "${stage.label}" stage? Bids in it move back to Interested.`)) return;
    const result = await deleteBidStageAction(stage.id);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setStages((s) => s.filter((x) => x.id !== stage.id));
    // Bids in it moved to Interested server-side; reload to pick that up.
    window.location.reload();
  }

  return (
    <section className="card panel trk-settings">
      <div className="panel-head">
        <h2 className="section-title">Tracker settings</h2>
        <button type="button" className="link-btn" onClick={onClose}>
          Done
        </button>
      </div>

      <div className="trk-settings-block">
        <strong>Default reminder schedule</strong>
        <p className="meta">Days before the response deadline, for bids at Interested or a custom stage. Each bid can override it.</p>
        <form
          className="trk-row trk-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveDays();
          }}
        >
          <input className="field" value={daysText} onChange={(e) => setDaysText(e.target.value)} placeholder="7, 3, 1" aria-label="Default reminder days" />
          <button type="submit" className="btn btn-primary btn-sm">
            Save
          </button>
        </form>
      </div>

      <div className="trk-settings-block">
        <strong>Custom stages</strong>
        <p className="meta">Your own steps between Interested and Submitted.</p>
        <ul className="trk-stage-list">
          {stages.map((s, i) => (
            <li key={s.id}>
              <input type="color" value={s.color} onChange={(e) => recolorStage(s, e.target.value)} aria-label={`Color for ${s.label}`} />
              <input
                className="field"
                defaultValue={s.label}
                maxLength={40}
                onBlur={(e) => renameStage(s, e.target.value)}
                aria-label="Stage name"
              />
              <button type="button" className="trk-icon-btn" aria-label={`Move ${s.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button
                type="button"
                className="trk-icon-btn"
                aria-label={`Move ${s.label} down`}
                disabled={i === stages.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button type="button" className="trk-icon-btn" aria-label={`Delete ${s.label}`} onClick={() => removeStage(s)}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <form
          className="trk-row trk-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            addStage();
          }}
        >
          <input className="field" value={newLabel} maxLength={40} onChange={(e) => setNewLabel(e.target.value)} placeholder="New stage, e.g. Teaming" />
          <button type="submit" className="btn btn-outline btn-sm" disabled={!newLabel.trim()}>
            Add stage
          </button>
        </form>
      </div>
    </section>
  );
}

export function TrackingBoard({
  initialItems,
  initialStages,
  initialReminderDays,
  sharedBids: initialShared,
  connections,
  isPro,
  highlightSharedId,
}: {
  initialItems: TrackingItem[];
  initialStages: BidStage[];
  initialReminderDays: number[];
  sharedBids: SharedBid[];
  connections: BidShareRecipient[];
  isPro: boolean;
  highlightSharedId: string | null;
}) {
  const showToast = useToast();
  const [items, setItems] = useState(initialItems);
  const [stages, setStages] = useState(initialStages);
  const [reminderDays, setReminderDays] = useState(initialReminderDays);
  const [shared, setShared] = useState(initialShared);
  const [showSettings, setShowSettings] = useState(false);
  const [bidLimit, setBidLimit] = useState<number | null>(null);

  useEffect(() => {
    if (highlightSharedId) document.getElementById(`shared-${highlightSharedId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightSharedId]);

  const customColumns: Column[] = stages.map((s) => ({ key: `working:${s.id}`, label: s.label, color: s.color, custom: true }));
  const columns = [...FIXED_BEFORE, ...customColumns, ...FIXED_AFTER];
  // Free members only see custom-stage columns that still hold a bid.
  const visibleColumns = columns.filter((c) => isPro || !c.custom || items.some((i) => columnKey(i) === c.key));

  function patchItem(id: string, patch: ItemPatch) {
    setItems((current) => current.map((i) => (i.id === id ? patch(i) : i)));
  }

  async function removeItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (item && (item.notes || item.tasks.length > 0) && !window.confirm("Remove this bid? Its notes and tasks will be deleted.")) return;
    const snapshot = items;
    setItems((current) => current.filter((i) => i.id !== id));
    const result = await removeTrackingAction(id);
    if (result.error) {
      setItems(snapshot);
      showToast(result.error);
    }
  }

  async function leaveShared(id: string) {
    const snapshot = shared;
    setShared((s) => s.filter((b) => b.id !== id));
    const result = await leaveSharedBidAction(id);
    if (result.error) {
      setShared(snapshot);
      showToast(result.error);
    }
  }

  function exportCsv() {
    const blob = new Blob([toCsv(items, columns)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bid-tracker.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const active = items.filter(isActive).length;
  const bids = items.filter((i) => i.bidSubmittedAt).length;
  const wins = items.filter((i) => i.outcome === "won").length;
  const decided = items.filter((i) => i.outcome).length;
  const pending = items.filter((i) => i.bidSubmittedAt && !i.outcome).length;
  const openTasks = items.reduce((n, i) => n + i.tasks.filter((t) => !t.done).length, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Bid Tracker</h1>
          <p>
            Track opportunities from Interested to Submitted to Won or Lost. Move a bid to Submitted before the response deadline to
            log it, then record how it turned out.{" "}
            {isPro
              ? `Reminders go out ${formatDays(reminderDays)} the deadline by default.`
              : "You'll get an email 3 days before each deadline."}
          </p>
        </div>
        <div className="head-actions">
          {isPro ? (
            <>
              <button className="btn btn-outline" onClick={() => setShowSettings((v) => !v)}>
                Customize
              </button>
              <button className="btn btn-outline" onClick={exportCsv} disabled={items.length === 0}>
                Export CSV
              </button>
            </>
          ) : (
            <Link href="/billing" className="btn btn-outline" title="CSV export is a Pro feature">
              Export CSV · Pro
            </Link>
          )}
        </div>
      </div>

      {!isPro && (
        <div className="trk-meter">
          <div className="trk-meter-head">
            <span>
              <b>{active}</b> of {FREE_ACTIVE_BID_LIMIT} active bids
            </span>
            <span className="meta">Won, Lost and Not submitted don&apos;t count</span>
          </div>
          <div className="trk-progress-bar">
            <div
              style={{
                width: `${Math.min(100, (active / FREE_ACTIVE_BID_LIMIT) * 100)}%`,
                background: active >= FREE_ACTIVE_BID_LIMIT ? "#d97706" : "#0071bc",
              }}
            />
          </div>
        </div>
      )}

      {isPro && showSettings && (
        <TrackerSettings
          stages={stages}
          setStages={(fn) => setStages(fn)}
          reminderDays={reminderDays}
          setReminderDays={setReminderDays}
          onClose={() => setShowSettings(false)}
        />
      )}

      {items.length === 0 ? (
        <div className="empty">
          <strong>Your Bid Tracker is empty</strong>
          Tap the bookmark on any opportunity, or use Track this bid on its detail page, to add it here as Interested.
        </div>
      ) : (
        <>
          <div className="trk-stats">
            <div>
              <strong>{active}</strong>
              <span>Active</span>
            </div>
            <div>
              <strong>{bids}</strong>
              <span>Bids logged</span>
            </div>
            <div>
              <strong>{wins}</strong>
              <span>Won</span>
            </div>
            {isPro ? (
              <>
                <div>
                  <strong>{decided > 0 ? `${Math.round((wins / decided) * 100)}%` : "—"}</strong>
                  <span>Win rate{decided > 0 ? ` (${wins}/${decided})` : ""}</span>
                </div>
                <div>
                  <strong>{pending}</strong>
                  <span>Awaiting result</span>
                </div>
                <div>
                  <strong>{openTasks}</strong>
                  <span>Open tasks</span>
                </div>
              </>
            ) : (
              <Link href="/billing" className="trk-stat-locked">
                <strong>Win rate</strong>
                <span>Pro</span>
              </Link>
            )}
          </div>

          <div className="trk-board">
            {visibleColumns.map((col) => {
              const colItems = items.filter((i) => columnKey(i) === col.key);
              return (
                <section key={col.key} className={`trk-col${colItems.length === 0 ? " is-empty" : ""}`}>
                  <header className="trk-col-head">
                    <span className="trk-dot" style={{ background: col.color }} />
                    <span className="trk-col-label">{col.label}</span>
                    <span className="trk-count">{colItems.length}</span>
                  </header>
                  <div className="trk-col-body">
                    {colItems.length === 0 ? (
                      <div className="trk-col-empty">Nothing here</div>
                    ) : (
                      colItems.map((item) => (
                        <TrackingCard
                          key={item.id}
                          item={item}
                          columns={columns}
                          isPro={isPro}
                          defaultDays={reminderDays}
                          connections={connections}
                          onPatch={patchItem}
                          onRemove={removeItem}
                          onLimit={setBidLimit}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {shared.length > 0 && (
        <section className="trk-shared-section">
          <h2 className="section-title">Shared with you</h2>
          <p className="meta">Bids your connections shared with you. You can see them but not change them.</p>
          <div className="trk-shared-grid">
            {shared.map((b) => (
              <SharedBidCard key={b.id} bid={b} highlighted={b.id === highlightSharedId} onLeave={leaveShared} />
            ))}
          </div>
        </section>
      )}

      {bidLimit !== null && <BidLimitPrompt limit={bidLimit} onClose={() => setBidLimit(null)} />}
    </div>
  );
}
