"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteCompanyReviewAction,
  getCompanyReviewsAction,
  respondToCompanyReviewAction,
  saveCompanyReviewAction,
} from "@/app/companies/review-actions";
import { Avatar } from "@/components/avatar";
import { useToast } from "@/components/toast-provider";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { CompanyReviewItem, CompanyReviewRelationship } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

export const RELATIONSHIP_LABEL: Record<CompanyReviewRelationship, string> = {
  teaming_partner: "Teaming partner",
  prime: "Worked under them as prime",
  subcontractor: "Their subcontractor",
  customer: "Government customer",
  employee: "Current or former employee",
  other: "Other",
};

type Sort = "newest" | "highest" | "lowest";

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="cr-stars" style={{ fontSize: size }} aria-label={`${value.toFixed(1)} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className="cr-star" aria-hidden="true">
            ★
            <span className="cr-star-fill" style={{ width: `${fill * 100}%` }}>
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function CompanyReviewsPanel({
  companyId,
  companySlug,
  companyName,
  initialReviews,
  viewer,
  isCompanyAdmin,
}: {
  companyId: string;
  companySlug: string;
  companyName: string;
  initialReviews: CompanyReviewItem[];
  viewer: Viewer | null;
  isCompanyAdmin: boolean;
}) {
  const showToast = useToast();
  const [reviews, setReviews] = useState(initialReviews);
  const [sort, setSort] = useState<Sort>("newest");
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const ownReview = viewer ? reviews.find((r) => r.reviewerId === viewer.id) ?? null : null;
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [relationship, setRelationship] = useState<CompanyReviewRelationship | "">("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");

  // Server re-renders (router.refresh / revalidatePath) hand in fresh rows.
  const [syncedInitial, setSyncedInitial] = useState(initialReviews);
  if (syncedInitial !== initialReviews) {
    setSyncedInitial(initialReviews);
    setReviews(initialReviews);
  }

  // Live updates: any insert/update/delete on this company's reviews
  // re-reads the list (the Realtime payload has no reviewer names).
  // Debounced so a burst of changes costs one fetch.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    function scheduleRefetch() {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(async () => {
        const fresh = await getCompanyReviewsAction(companyId);
        if (!cancelled) setReviews(fresh);
      }, 400);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`company-reviews-${companyId}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "company_reviews", filter: `company_id=eq.${companyId}` }, scheduleRefetch)
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [companyId]);

  const summary = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    let total = 0;
    for (const r of reviews) {
      counts[r.rating - 1] += 1;
      total += r.rating;
    }
    return { counts, avg: reviews.length ? total / reviews.length : 0 };
  }, [reviews]);

  const visible = useMemo(() => {
    const list = reviews.filter((r) => (starFilter ? r.rating === starFilter : true));
    list.sort((a, b) => {
      if (sort === "highest") return b.rating - a.rating || b.createdAt.localeCompare(a.createdAt);
      if (sort === "lowest") return a.rating - b.rating || b.createdAt.localeCompare(a.createdAt);
      return b.createdAt.localeCompare(a.createdAt);
    });
    // The viewer's own review stays on top so it's easy to find and edit.
    if (ownReview) {
      const i = list.findIndex((r) => r.id === ownReview.id);
      if (i > 0) list.unshift(...list.splice(i, 1));
    }
    return list;
  }, [reviews, sort, starFilter, ownReview]);

  function startEditing() {
    setRating(ownReview?.rating ?? 0);
    setRelationship(ownReview?.relationship ?? "");
    setTitle(ownReview?.title ?? "");
    setBody(ownReview?.body ?? "");
    setEditing(true);
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return showToast("Choose a star rating.");
    if (!relationship) return showToast("Choose how you worked with this company.");
    setSaving(true);
    const result = await saveCompanyReviewAction(companyId, { rating, relationship, title, body });
    setSaving(false);
    if (result.error) return showToast(result.error);
    setEditing(false);
    showToast(ownReview ? "Review updated" : "Review posted");
    setReviews(await getCompanyReviewsAction(companyId));
  }

  async function removeReview(review: CompanyReviewItem) {
    if (!confirm("Delete this review permanently?")) return;
    setPendingId(review.id);
    const result = await deleteCompanyReviewAction(review.id);
    setPendingId(null);
    if (result.error) return showToast(result.error);
    setReviews((prev) => prev.filter((r) => r.id !== review.id));
    showToast("Review deleted");
  }

  async function submitReply(review: CompanyReviewItem, text: string) {
    setPendingId(review.id);
    const result = await respondToCompanyReviewAction(review.id, text);
    setPendingId(null);
    if (result.error) return showToast(result.error);
    setReplyingId(null);
    setReplyDraft("");
    showToast(text.trim() ? "Response posted" : "Response removed");
    setReviews(await getCompanyReviewsAction(companyId));
  }

  const canReview = !!viewer && !isCompanyAdmin;
  const shownRating = hoverRating || rating;

  return (
    <section className="card panel">
      <div className="panel-head">
        <h2 className="section-title">Reviews</h2>
        <span className="cr-live" title="Updates live as reviews come in">
          <span className="cr-live-dot" aria-hidden="true" /> Live
        </span>
      </div>

      {reviews.length > 0 && (
        <div className="cr-summary">
          <div className="cr-summary-score">
            <strong>{summary.avg.toFixed(1)}</strong>
            <Stars value={summary.avg} size={18} />
            <span className="meta">
              {reviews.length} review{reviews.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="cr-breakdown">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary.counts[star - 1];
              const pct = reviews.length ? (count / reviews.length) * 100 : 0;
              return (
                <button
                  key={star}
                  type="button"
                  className={`cr-breakdown-row${starFilter === star ? " active" : ""}`}
                  onClick={() => setStarFilter(starFilter === star ? null : star)}
                  aria-pressed={starFilter === star}
                  title={`Show ${star}-star reviews`}
                  disabled={count === 0 && starFilter !== star}
                >
                  <span className="cr-breakdown-label">{star} ★</span>
                  <span className="cr-breakdown-track">
                    <span className="cr-breakdown-bar" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="cr-breakdown-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!viewer && (
        <p className="meta cr-callout">
          <Link href={`/login?next=${encodeURIComponent(`/companies/${companySlug}?tab=reviews`)}`} className="link-btn">
            Sign in
          </Link>{" "}
          to review {companyName}.
        </p>
      )}
      {isCompanyAdmin && reviews.length > 0 && (
        <p className="meta cr-callout">You manage {companyName}, so you can respond to reviews but not write one.</p>
      )}

      {canReview && !editing && !ownReview && (
        <button type="button" className="btn btn-primary btn-sm cr-write" onClick={startEditing}>
          Write a review
        </button>
      )}

      {canReview && editing && (
        <form className="cr-form" onSubmit={submitReview}>
          <div className="label">
            Your rating
            <div className="cr-star-input" onMouseLeave={() => setHoverRating(0)} role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  className={`cr-star-btn${n <= shownRating ? " on" : ""}`}
                  onMouseEnter={() => setHoverRating(n)}
                  onClick={() => setRating(n)}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <label className="label">
            How did you work with {companyName}?
            <select className="field" value={relationship} onChange={(e) => setRelationship(e.target.value as CompanyReviewRelationship)}>
              <option value="">Select…</option>
              {(Object.keys(RELATIONSHIP_LABEL) as CompanyReviewRelationship[]).map((k) => (
                <option key={k} value={k}>
                  {RELATIONSHIP_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Headline
            <input className="field" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Reliable teaming partner on a DoD recompete" />
          </label>
          <label className="label">
            Your review
            <textarea
              className="textarea"
              value={body}
              maxLength={4000}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What was it like to work with them? Delivery, communication, compliance, invoicing…"
            />
          </label>
          <div className="cr-form-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? "Saving…" : ownReview ? "Update review" : "Post review"}
            </button>
          </div>
        </form>
      )}

      {reviews.length === 0 ? (
        !editing && <p className="meta">No reviews yet.{canReview ? ` Be the first to review ${companyName}.` : ""}</p>
      ) : (
        <>
          <div className="cr-toolbar">
            <span className="meta">
              {starFilter ? `${visible.length} ${starFilter}-star review${visible.length === 1 ? "" : "s"}` : `${reviews.length} review${reviews.length === 1 ? "" : "s"}`}
              {starFilter && (
                <>
                  {" · "}
                  <button type="button" className="link-btn" onClick={() => setStarFilter(null)}>
                    Show all
                  </button>
                </>
              )}
            </span>
            <select className="field cr-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort reviews">
              <option value="newest">Newest</option>
              <option value="highest">Highest rated</option>
              <option value="lowest">Lowest rated</option>
            </select>
          </div>

          <div className="cr-list">
            {visible.map((r) => {
              const isOwn = viewer?.id === r.reviewerId;
              return (
                <article key={r.id} className={`cr-review${isOwn ? " own" : ""}`}>
                  <header className="cr-review-head">
                    <Link href={`/network/${r.reviewerId}`} className="cr-reviewer">
                      <Avatar name={r.reviewerName} avatarUrl={r.reviewerAvatarUrl} size={36} />
                      <span>
                        <b>{r.reviewerName}</b>
                        {isOwn && <span className="tag" style={{ marginLeft: 6 }}>You</span>}
                        {r.reviewerHeadline && <span className="meta cr-reviewer-sub">{r.reviewerHeadline}</span>}
                      </span>
                    </Link>
                    <span className="meta cr-date">
                      {formatDate(r.createdAt)}
                      {r.updatedAt > r.createdAt && new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime() > 60_000 && " · edited"}
                    </span>
                  </header>
                  <div className="cr-review-rating">
                    <Stars value={r.rating} />
                    <span className="tag">{RELATIONSHIP_LABEL[r.relationship]}</span>
                  </div>
                  <h3 className="cr-review-title">{r.title}</h3>
                  <p className="cr-review-body">{r.body}</p>

                  {r.response && replyingId !== r.id && (
                    <div className="cr-response">
                      <strong>Response from {companyName}</strong>
                      {r.respondedAt && <span className="meta"> · {formatDate(r.respondedAt)}</span>}
                      <p>{r.response}</p>
                    </div>
                  )}

                  {isCompanyAdmin && replyingId === r.id && (
                    <div className="cr-reply-form">
                      <textarea
                        className="textarea"
                        value={replyDraft}
                        maxLength={2000}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        placeholder={`Respond publicly as ${companyName}…`}
                        autoFocus
                      />
                      <div className="cr-form-actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setReplyingId(null)} disabled={pendingId === r.id}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={pendingId === r.id || !replyDraft.trim()}
                          onClick={() => submitReply(r, replyDraft)}
                        >
                          {pendingId === r.id ? "Saving…" : "Post response"}
                        </button>
                      </div>
                    </div>
                  )}

                  {(isOwn || isCompanyAdmin || viewer?.isAdmin) && replyingId !== r.id && (
                    <div className="cr-review-actions">
                      {isOwn && !editing && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={startEditing}>
                          Edit
                        </button>
                      )}
                      {isCompanyAdmin && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setReplyingId(r.id);
                            setReplyDraft(r.response ?? "");
                          }}
                        >
                          {r.response ? "Edit response" : "Respond"}
                        </button>
                      )}
                      {isCompanyAdmin && r.response && (
                        <button type="button" className="btn btn-outline btn-sm" disabled={pendingId === r.id} onClick={() => submitReply(r, "")}>
                          Remove response
                        </button>
                      )}
                      {(isOwn || viewer?.isAdmin) && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ color: "var(--o-red)", borderColor: "var(--o-red)" }}
                          disabled={pendingId === r.id}
                          onClick={() => removeReview(r)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
