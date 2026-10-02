"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, FileText, ThumbsUp } from "lucide-react";
import {
  closeReviewRequestAction,
  markReviewHelpfulAction,
  openReviewRequestAction,
  submitCapabilityReviewAction,
} from "@/app/(app)/teaming/actions";
import type { CapabilityRequest, ReviewBoard } from "@/lib/member-help-types";
import { EmptyState, PersonLine, RewardChip, timeAgo, useHelpAction } from "./shared";

function StatementLink({ url, name }: { url: string; name: string | null }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="help-file">
      <FileText size={15} aria-hidden="true" /> {name || "Capability statement"}
    </a>
  );
}

function MyStatement({ board, profileHref }: { board: ReviewBoard; profileHref: string }) {
  const { run, busy } = useHelpAction();
  const [note, setNote] = useState(board.my_request?.note ?? "");
  const req = board.my_request;
  const helpfulCount = req?.reviews.filter((r) => r.helpful).length ?? 0;

  if (!board.statement && !req) {
    return (
      <section className="card panel">
        <h3 className="section-title">Get feedback on your capability statement</h3>
        <p className="meta">Upload your capability statement to your profile, then ask members to review it.</p>
        <Link href={profileHref} className="btn btn-primary btn-sm">
          Upload on your profile
        </Link>
      </section>
    );
  }

  return (
    <section className="card panel help-form">
      <div className="help-item-head">
        <h3 className="section-title">Your capability statement</h3>
        {board.statement && <StatementLink url={board.statement.url} name={board.statement.name} />}
      </div>
      {req?.stale && (
        <p className="help-note">You&apos;ve uploaded a new statement since this request. Ask again to get reviews on the new one.</p>
      )}
      <label className="label">
        What feedback do you want? (optional)
        <textarea
          className="textarea help-textarea-sm"
          maxLength={500}
          placeholder="Is my differentiator clear? Is it too long for a one-pager?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="help-actions">
        {board.statement && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => openReviewRequestAction(note))}>
            {!req ? "Ask for reviews" : req.stale ? "Ask for reviews on the new statement" : "Update note"}
          </button>
        )}
        {req && (
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => closeReviewRequestAction(req.id))}>
            Stop taking reviews
          </button>
        )}
      </div>

      {req && (
        <>
          <h4 className="help-heading">
            Reviews ({req.reviews.length})
            {req.reviews.length > 0 && (
              <span className="meta">
                {" "}
                · Rate the useful ones. The first {board.helpful_per_request} you rate helpful earn the reviewer Rep and Credits.
              </span>
            )}
          </h4>
          {req.reviews.length === 0 ? (
            <EmptyState>No reviews yet. Members can find your statement on the review board.</EmptyState>
          ) : (
            <ul className="help-sublist">
              {req.reviews.map((r) => (
                <li key={r.id}>
                  <PersonLine person={r.reviewer} sub={timeAgo(r.created_at)} />
                  <dl className="help-review">
                    <dt>Strengths</dt>
                    <dd>{r.strengths}</dd>
                    <dt>Gaps</dt>
                    <dd>{r.gaps}</dd>
                    <dt>One fix</dt>
                    <dd>{r.one_fix}</dd>
                  </dl>
                  {r.helpful ? (
                    <span className="help-status is-done">
                      <Check size={14} aria-hidden="true" /> You found this helpful
                    </span>
                  ) : (
                    <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => markReviewHelpfulAction(r.id))}>
                      <ThumbsUp size={14} aria-hidden="true" /> Helpful
                      {helpfulCount < board.helpful_per_request && <RewardChip rule={board.helpful_rule} prefix="· they get" />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function RequestCard({ req, board }: { req: CapabilityRequest; board: ReviewBoard }) {
  const { run, busy } = useHelpAction();
  const [open, setOpen] = useState(false);
  const [strengths, setStrengths] = useState("");
  const [gaps, setGaps] = useState("");
  const [fix, setFix] = useState("");
  const total = strengths.trim().length + gaps.trim().length + fix.trim().length;
  const short = total < board.min_chars;

  return (
    <li className="card panel help-item">
      <div className="help-item-head">
        <PersonLine person={req.owner} sub={timeAgo(req.created_at)} />
        <StatementLink url={req.statement_url} name={req.statement_name} />
      </div>
      {req.note && <p className="help-body">&ldquo;{req.note}&rdquo;</p>}
      <div className="help-actions">
        {req.reviewed ? (
          <span className="help-status is-done">
            <Check size={14} aria-hidden="true" /> You reviewed this
          </span>
        ) : req.same_company ? (
          <span className="meta">You can&apos;t review your own company&apos;s statement.</span>
        ) : !open ? (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
              Write a review
            </button>
            <RewardChip rule={board.write_rule} />
          </>
        ) : null}
        <span className="meta">{req.review_count === 1 ? "1 review" : `${req.review_count} reviews`}</span>
      </div>
      {open && !req.reviewed && (
        <form
          className="help-inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => submitCapabilityReviewAction(req.id, strengths, gaps, fix))) setOpen(false);
          }}
        >
          <label className="label">
            Strengths
            <textarea className="textarea help-textarea-sm" required maxLength={1500} placeholder="What works well?" value={strengths} onChange={(e) => setStrengths(e.target.value)} />
          </label>
          <label className="label">
            Gaps
            <textarea className="textarea help-textarea-sm" required maxLength={1500} placeholder="What's missing or unclear to a contracting officer?" value={gaps} onChange={(e) => setGaps(e.target.value)} />
          </label>
          <label className="label">
            One fix
            <textarea className="textarea help-textarea-sm" required maxLength={1500} placeholder="The single change that would help most." value={fix} onChange={(e) => setFix(e.target.value)} />
          </label>
          <div className="help-actions">
            <button className="btn btn-primary btn-sm" disabled={busy || short}>
              Send review
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <span className={`meta${short ? "" : " help-ok"}`}>
              {short ? `${board.min_chars - total} more characters needed` : "Ready to send"}
            </span>
          </div>
        </form>
      )}
    </li>
  );
}

export function ReviewsTab({ board, profileHref }: { board: ReviewBoard; profileHref: string }) {
  return (
    <div className="help-tab">
      <section className="card panel help-intro">
        <div>
          <h2 className="section-title">Capability statement reviews</h2>
          <p className="meta">
            Share your capability statement and get a short, structured review from other members: strengths, gaps and one fix. Write
            reviews for others to earn XP; earn Rep when they rate yours helpful.
          </p>
        </div>
        <div className="help-intro-rewards">
          <span>
            Write a review ({board.min_chars}+ characters) <RewardChip rule={board.write_rule} />
          </span>
          <span>
            Rated helpful <RewardChip rule={board.helpful_rule} />
          </span>
        </div>
      </section>

      <MyStatement board={board} profileHref={profileHref} />

      <h3 className="help-heading">Statements waiting for review</h3>
      {board.open_requests.length === 0 ? (
        <EmptyState>Nobody is asking for reviews right now.</EmptyState>
      ) : (
        <ul className="help-list">
          {board.open_requests.map((r) => (
            <RequestCard key={r.id} req={r} board={board} />
          ))}
        </ul>
      )}

      {board.my_reviews.length > 0 && (
        <>
          <h3 className="help-heading">Reviews you wrote</h3>
          <ul className="help-list">
            {board.my_reviews.map((r) => (
              <li key={r.id} className="card panel help-item help-item-row">
                <PersonLine person={r.owner} sub={timeAgo(r.created_at)} />
                {r.helpful ? (
                  <span className="help-status is-done">
                    <ThumbsUp size={14} aria-hidden="true" /> Rated helpful
                  </span>
                ) : (
                  <span className="meta">Not rated yet</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
