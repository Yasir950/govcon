"use client";

import { useState } from "react";
import { Check, GraduationCap, Lock } from "lucide-react";
import {
  answerMentorSessionAction,
  endMentorshipAction,
  logMentorSessionAction,
  requestMentorshipAction,
  respondMentorshipAction,
  saveMentorProfileAction,
} from "@/app/(app)/teaming/actions";
import type { MentorListing, MentorSession, MentoringBoard, Mentorship } from "@/lib/member-help-types";
import { EmptyState, PersonLine, RewardChip, formatDay, useHelpAction } from "./shared";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function MentorProfileForm({ board }: { board: MentoringBoard }) {
  const { run, busy } = useHelpAction();
  const [topics, setTopics] = useState((board.my_profile?.topics ?? []).join(", "));
  const [bio, setBio] = useState(board.my_profile?.bio ?? "");
  const accepting = board.my_profile?.accepting ?? false;
  const topicList = topics
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (!board.can_mentor && !board.my_profile) {
    return (
      <section className="card panel help-locked">
        <Lock size={18} aria-hidden="true" />
        <div>
          <h3 className="section-title">Become a mentor</h3>
          <p className="meta">
            Mentoring opens at Level {board.min_level} ({board.min_rank}). Until then, you can find a mentor below.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="card panel help-form">
      <div className="help-item-head">
        <h3 className="section-title">
          <GraduationCap size={18} aria-hidden="true" /> Your mentor profile
        </h3>
        {board.my_profile && <span className={`help-pill ${accepting ? "is-verified" : "is-pending"}`}>{accepting ? "Taking protégés" : "Paused"}</span>}
      </div>
      <label className="label">
        Topics you can help with (comma-separated, up to 8)
        <input className="field" placeholder="Capture, pricing, 8(a) program, GSA schedules" value={topics} onChange={(e) => setTopics(e.target.value)} />
      </label>
      <label className="label">
        A short intro
        <textarea className="textarea help-textarea-sm" maxLength={1000} placeholder="Your background and how you like to mentor." value={bio} onChange={(e) => setBio(e.target.value)} />
      </label>
      <div className="help-actions">
        {board.can_mentor && (
          <button className="btn btn-primary btn-sm" disabled={busy || topicList.length > 8} onClick={() => run(() => saveMentorProfileAction(topicList, bio, true))}>
            {board.my_profile ? "Save and take protégés" : "List me as a mentor"}
          </button>
        )}
        {board.my_profile && (
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => saveMentorProfileAction(topicList, bio, false))}>
            {accepting ? "Pause new requests" : "Save, stay paused"}
          </button>
        )}
        {topicList.length > 8 && <span className="meta">Pick up to 8 topics.</span>}
      </div>
    </section>
  );
}

function MentorCard({ m }: { m: MentorListing }) {
  const { run, busy } = useHelpAction();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <li className="card panel help-item">
      <PersonLine person={m.person} sub={m.sessions === 1 ? "1 confirmed session" : `${m.sessions} confirmed sessions`} />
      {m.topics.length > 0 && (
        <div className="help-tags">
          {m.topics.map((t) => (
            <span key={t} className="help-tag">
              {t}
            </span>
          ))}
        </div>
      )}
      {m.bio && <p className="help-body">{m.bio}</p>}
      <div className="help-actions">
        {m.my_status === "active" ? (
          <span className="help-status is-done">
            <Check size={14} aria-hidden="true" /> Your mentor
          </span>
        ) : m.my_status === "requested" ? (
          <span className="help-status">Request sent</span>
        ) : !open ? (
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            Ask to be mentored
          </button>
        ) : null}
      </div>
      {open && !m.my_status && (
        <form
          className="help-inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => requestMentorshipAction(m.person.id, message))) setOpen(false);
          }}
        >
          <textarea
            className="textarea help-textarea-sm"
            maxLength={1000}
            placeholder="What you'd like help with and how often you'd like to meet."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="help-actions">
            <button className="btn btn-primary btn-sm" disabled={busy}>
              Send request
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

function SessionRow({ s, asProtege, noteMin }: { s: MentorSession; asProtege: boolean; noteMin: number }) {
  const { run, busy } = useHelpAction();
  const [note, setNote] = useState("");
  return (
    <li className="help-session">
      <div className="help-session-head">
        <strong>{formatDay(s.session_date)}</strong>
        <span className="meta">
          {s.minutes} min · {s.topic}
        </span>
        <span className={`help-pill is-${s.status === "confirmed" ? "verified" : s.status === "disputed" ? "false" : "pending"}`}>
          {s.status === "confirmed" ? "Confirmed" : s.status === "disputed" ? "Disputed" : asProtege ? "Needs your confirmation" : "Waiting for protégé"}
        </span>
      </div>
      {s.protege_note && <p className="help-body">&ldquo;{s.protege_note}&rdquo;</p>}
      {asProtege && s.status === "pending" && (
        <div className="help-inline-form">
          <textarea
            className="textarea help-textarea-sm"
            maxLength={1000}
            placeholder={`What did you take away from this session? (${noteMin}+ characters)`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="help-actions">
            <button className="btn btn-primary btn-sm" disabled={busy || note.trim().length < noteMin} onClick={() => run(() => answerMentorSessionAction(s.id, true, note))}>
              Confirm session
            </button>
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => answerMentorSessionAction(s.id, false, note))}>
              This didn&apos;t happen
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function LogSessionForm({ mentorshipId, minMinutes }: { mentorshipId: string; minMinutes: number }) {
  const { run, busy } = useHelpAction();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [minutes, setMinutes] = useState(String(Math.max(30, minMinutes)));
  const [topic, setTopic] = useState("");
  if (!open) {
    return (
      <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
        Log a session
      </button>
    );
  }
  return (
    <form
      className="help-inline-form help-log-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => logMentorSessionAction(mentorshipId, date, Number(minutes), topic))) {
          setOpen(false);
          setTopic("");
        }
      }}
    >
      <label className="label">
        Date
        <input className="field" type="date" required max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="label">
        Minutes
        <input className="field" type="number" required min={minMinutes} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </label>
      <label className="label help-log-topic">
        What you covered
        <input className="field" required minLength={3} maxLength={200} placeholder="Pricing strategy for a recompete" value={topic} onChange={(e) => setTopic(e.target.value)} />
      </label>
      <div className="help-actions">
        <button className="btn btn-primary btn-sm" disabled={busy}>
          Log session
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function MentorshipCard({ m, asMentor, board }: { m: Mentorship; asMentor: boolean; board: MentoringBoard }) {
  const { run, busy } = useHelpAction();
  return (
    <li className="card panel help-item">
      <div className="help-item-head">
        <PersonLine person={m.person} sub={asMentor ? "Your protégé" : "Your mentor"} />
        {m.status === "active" && (
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => endMentorshipAction(m.id))}>
            End mentorship
          </button>
        )}
      </div>
      {m.status === "requested" ? (
        <>
          {m.message && <p className="help-body">&ldquo;{m.message}&rdquo;</p>}
          {asMentor ? (
            <div className="help-actions">
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => respondMentorshipAction(m.id, true))}>
                Accept
              </button>
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => respondMentorshipAction(m.id, false))}>
                Decline
              </button>
            </div>
          ) : (
            <div className="help-actions">
              <span className="help-status">Waiting for them to accept</span>
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => endMentorshipAction(m.id))}>
                Cancel request
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {m.sessions.length === 0 ? (
            <EmptyState>{asMentor ? "No sessions logged yet. Log one after you meet." : "No sessions yet. Your mentor logs each one for you to confirm."}</EmptyState>
          ) : (
            <ul className="help-sublist">
              {m.sessions.map((s) => (
                <SessionRow key={s.id} s={s} asProtege={!asMentor} noteMin={board.note_min_chars} />
              ))}
            </ul>
          )}
          {asMentor && (
            <div className="help-actions">
              <LogSessionForm mentorshipId={m.id} minMinutes={board.min_minutes} />
            </div>
          )}
        </>
      )}
    </li>
  );
}

export function MentoringTab({ board }: { board: MentoringBoard }) {
  const pendingForMe =
    board.as_mentor.filter((m) => m.status === "requested").length +
    board.as_protege.reduce((n, m) => n + m.sessions.filter((s) => s.status === "pending").length, 0);
  return (
    <div className="help-tab">
      <section className="card panel help-intro">
        <div>
          <h2 className="section-title">Mentor-protégé</h2>
          <p className="meta">
            Members at Level {board.min_level} ({board.min_rank}) and up can mentor. Mentors log each session ({board.min_minutes}+ minutes);
            it counts once the protégé confirms it with a short note. Up to {board.pair_monthly} sessions per pair earn points each month.
          </p>
        </div>
        <div className="help-intro-rewards">
          <span>
            Mentor, per session <RewardChip rule={board.mentor_rule} />
          </span>
          <span>
            Protégé, per session <RewardChip rule={board.protege_rule} />
          </span>
        </div>
      </section>

      {(board.as_mentor.length > 0 || board.as_protege.length > 0) && (
        <>
          <h3 className="help-heading">Your mentorships{pendingForMe > 0 ? ` · ${pendingForMe} need you` : ""}</h3>
          <ul className="help-list">
            {board.as_mentor.map((m) => (
              <MentorshipCard key={m.id} m={m} asMentor board={board} />
            ))}
            {board.as_protege.map((m) => (
              <MentorshipCard key={m.id} m={m} asMentor={false} board={board} />
            ))}
          </ul>
        </>
      )}

      <MentorProfileForm board={board} />

      <h3 className="help-heading">Find a mentor</h3>
      {board.mentors.length === 0 ? (
        <EmptyState>No mentors are taking protégés right now. Check back soon.</EmptyState>
      ) : (
        <ul className="help-list help-grid">
          {board.mentors.map((m) => (
            <MentorCard key={m.person.id} m={m} />
          ))}
        </ul>
      )}
    </div>
  );
}
