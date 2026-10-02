"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  declineRecommendationRequestAction,
  deleteRecommendationAction,
  getProfileRecommendationsAction,
  requestRecommendationAction,
  saveRecommendationAction,
  setRecommendationVisibilityAction,
  withdrawRecommendationRequestAction,
} from "@/app/(app)/network/recommendation-actions";
import { Avatar } from "@/components/avatar";
import { useToast } from "@/components/toast-provider";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { NetworkMember } from "@/lib/landing-data";
import type {
  ProfileRecommendations,
  RecommendationItem,
  RecommendationPerson,
  RecommendationRelationship,
  RecommendationRequestItem,
} from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

const RELATIONSHIPS: RecommendationRelationship[] = [
  "managed_directly",
  "reported_to",
  "senior_not_managing",
  "junior_not_managed",
  "same_team",
  "different_teams",
  "client_of_author",
  "author_was_client",
  "teaming_partner",
  "mentored",
  "other",
];

const first = (name: string) => name.split(" ")[0] || name;

// Form wording, from the author's side ("You managed Alex directly").
function relationshipOption(key: RecommendationRelationship, recipient: string) {
  switch (key) {
    case "managed_directly": return `You managed ${recipient} directly`;
    case "reported_to": return `${recipient} managed you directly`;
    case "senior_not_managing": return `You were senior to ${recipient} but didn't manage them directly`;
    case "junior_not_managed": return `${recipient} was senior to you but didn't manage you directly`;
    case "same_team": return `You worked with ${recipient} on the same team`;
    case "different_teams": return `${recipient} worked with you but on different teams`;
    case "client_of_author": return `${recipient} was your client`;
    case "author_was_client": return `You were ${recipient}'s client`;
    case "teaming_partner": return `You and ${recipient} were teaming partners`;
    case "mentored": return `You mentored ${recipient}`;
    case "other": return "Other";
  }
}

// Display wording, as on LinkedIn ("Dana managed Alex directly").
function relationshipSentence(key: RecommendationRelationship, author: string, recipient: string) {
  switch (key) {
    case "managed_directly": return `${author} managed ${recipient} directly`;
    case "reported_to": return `${recipient} managed ${author} directly`;
    case "senior_not_managing": return `${author} was senior to ${recipient} but didn't manage ${recipient} directly`;
    case "junior_not_managed": return `${recipient} was senior to ${author} but didn't manage ${author} directly`;
    case "same_team": return `${author} worked with ${recipient} on the same team`;
    case "different_teams": return `${recipient} worked with ${author} but on different teams`;
    case "client_of_author": return `${recipient} was ${author}'s client`;
    case "author_was_client": return `${author} was ${recipient}'s client`;
    case "teaming_partner": return `${author} and ${recipient} were teaming partners`;
    case "mentored": return `${author} mentored ${recipient}`;
    case "other": return `${author} worked with ${recipient}`;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

type WriteTarget = { recipient: RecommendationPerson; existing: RecommendationItem | null; position: string };

export function ProfileRecommendationsPanel({
  profile,
  positionOptions,
  initial,
  viewer,
  isOwnProfile,
  isConnected,
  connections,
}: {
  profile: RecommendationPerson;
  // "Title at Company" from the profile's experience, offered when a
  // visitor writes one for this member.
  positionOptions: string[];
  initial: ProfileRecommendations;
  viewer: Viewer | null;
  // False during a public-profile preview, so owner controls hide.
  isOwnProfile: boolean;
  // Viewer and this member are 1st-degree connections.
  isConnected: boolean;
  // Owner only: their connections, for "Ask for a recommendation".
  connections: NetworkMember[];
}) {
  const showToast = useToast();
  const profileFirst = first(profile.name);
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"received" | "given">("received");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [writing, setWriting] = useState<WriteTarget | null>(null);
  const [relationship, setRelationship] = useState<RecommendationRelationship | "">("");
  const [position, setPosition] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const [asking, setAsking] = useState(false);
  const [askTo, setAskTo] = useState("");
  const [askPosition, setAskPosition] = useState("");
  const [askMessage, setAskMessage] = useState("");

  const [syncedInitial, setSyncedInitial] = useState(initial);
  if (syncedInitial !== initial) {
    setSyncedInitial(initial);
    setData(initial);
  }

  async function refresh() {
    setData(await getProfileRecommendationsAction(profile.id));
  }

  // Live: approvals, new/edited recommendations and withdrawals re-read
  // the lists (the Realtime payload has no names).
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    function scheduleRefetch() {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(async () => {
        const fresh = await getProfileRecommendationsAction(profile.id);
        if (!cancelled) setData(fresh);
      }, 400);
    }

    supabase.auth.getSession().then(({ data: s }) => {
      if (cancelled) return;
      if (s.session) supabase.realtime.setAuth(s.session.access_token);
      channel = supabase
        .channel(`profile-recs-${profile.id}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "profile_recommendations", filter: `recipient_id=eq.${profile.id}` }, scheduleRefetch)
        .on("postgres_changes", { event: "*", schema: "public", table: "profile_recommendations", filter: `author_id=eq.${profile.id}` }, scheduleRefetch)
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [profile.id]);

  const viewerId = viewer?.id ?? null;
  const isSelf = viewerId === profile.id;

  // Received: owner sees everything, sorted pending → shown → hidden.
  // Others see what RLS gives them (shown ones, plus their own).
  const received = useMemo(() => {
    const order = { pending: 0, visible: 1, hidden: 2 } as const;
    return [...data.received].sort((a, b) =>
      isOwnProfile ? order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt) : b.createdAt.localeCompare(a.createdAt),
    );
  }, [data.received, isOwnProfile]);
  const shownReceived = received.filter((r) => r.status === "visible");
  const pendingReceived = received.filter((r) => r.status === "pending");
  const shownGiven = data.given.filter((r) => r.status === "visible");

  const myRecForProfile = viewerId && !isSelf ? data.received.find((r) => r.author.id === viewerId) ?? null : null;
  const askedOfMe = data.requests.filter((r) => r.recommender.id === viewerId);
  const myAsks = data.requests.filter((r) => r.requester.id === viewerId);
  const canRecommend = !!viewer && !isSelf && isConnected;

  const askable = useMemo(() => {
    const busy = new Set([
      ...data.received.map((r) => r.author.id),
      ...data.requests.filter((r) => r.requester.id === profile.id).map((r) => r.recommender.id),
    ]);
    return connections.filter((c) => !busy.has(c.id));
  }, [connections, data, profile.id]);

  function openWriter(recipient: RecommendationPerson, existing: RecommendationItem | null, defaultPosition = "") {
    setAsking(false);
    setRelationship(existing?.relationship ?? "");
    setPosition(existing?.recipientPosition ?? defaultPosition);
    setBody(existing?.body ?? "");
    setWriting({ recipient, existing, position: defaultPosition });
  }

  async function submitRecommendation(e: React.FormEvent) {
    e.preventDefault();
    if (!writing) return;
    if (!relationship) return showToast("Choose how you know each other.");
    setSaving(true);
    const result = await saveRecommendationAction(writing.recipient.id, { relationship, recipientPosition: position, body });
    setSaving(false);
    if (result.error) return showToast(result.error);
    showToast(
      writing.existing
        ? `Revision sent — ${first(writing.recipient.name)} will review it again`
        : `Sent — ${first(writing.recipient.name)} will choose whether to show it`,
    );
    setWriting(null);
    await refresh();
  }

  async function submitAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!askTo) return showToast("Choose a connection to ask.");
    setSaving(true);
    const result = await requestRecommendationAction(askTo, { recipientPosition: askPosition, message: askMessage });
    setSaving(false);
    if (result.error) return showToast(result.error);
    showToast("Request sent");
    setAsking(false);
    setAskTo("");
    setAskMessage("");
    await refresh();
  }

  async function run(id: string, fn: () => Promise<{ error?: string }>, done: string) {
    setPendingId(id);
    const result = await fn();
    setPendingId(null);
    if (result.error) return showToast(result.error);
    showToast(done);
    await refresh();
  }

  // Arriving from a request card in Messages (?recommend=1): open the
  // writer straight away, prefilled from the request.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !canRecommend) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("recommend") !== "1") return;
    const ask = askedOfMe.find((r) => r.requester.id === profile.id);
    // Deferred (and the ref set inside) so a Strict Mode double-run
    // doesn't cancel it.
    const t = setTimeout(() => {
      autoOpened.current = true;
      url.searchParams.delete("recommend");
      window.history.replaceState(null, "", url.toString());
      openWriter(profile, myRecForProfile, ask?.recipientPosition ?? "");
      document.getElementById("recommendations")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRecommend]);

  if (!isOwnProfile && received.length === 0 && data.given.length === 0 && data.requests.length === 0 && !canRecommend) {
    return null;
  }

  function renderForm() {
    if (!writing) return null;
    const recipientFirst = first(writing.recipient.name);
    const options = writing.recipient.id === profile.id ? positionOptions : [];
    return (
      <form className="cr-form" onSubmit={submitRecommendation}>
        <strong>
          {writing.existing ? "Revise your recommendation for" : "Recommend"} {writing.recipient.name}
        </strong>
        <label className="label">
          How do you know {recipientFirst}?
          <select className="field" value={relationship} onChange={(e) => setRelationship(e.target.value as RecommendationRelationship)}>
            <option value="">Select…</option>
            {RELATIONSHIPS.map((k) => (
              <option key={k} value={k}>
                {relationshipOption(k, recipientFirst)}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          {recipientFirst}&rsquo;s position at the time <span className="meta">(optional)</span>
          <input
            className="field"
            value={position}
            maxLength={160}
            list={options.length ? "rec-position-options" : undefined}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="e.g. Capture Manager at Acme Federal"
          />
          {options.length > 0 && (
            <datalist id="rec-position-options">
              {options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          )}
        </label>
        <label className="label">
          Your recommendation
          <textarea
            className="textarea"
            value={body}
            maxLength={3000}
            rows={6}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Write something about what makes ${recipientFirst} great to work with — skills, results, character…`}
          />
          <span className="meta">{body.length}/3000</span>
        </label>
        <p className="meta" style={{ margin: 0 }}>
          {recipientFirst} will be notified and can choose whether to show it on their profile.
        </p>
        <div className="cr-form-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setWriting(null)} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !body.trim()}>
            {saving ? "Sending…" : writing.existing ? "Send revision" : "Send"}
          </button>
        </div>
      </form>
    );
  }

  function renderRequest(req: RecommendationRequestItem, incoming: boolean) {
    const other = incoming ? req.requester : req.recommender;
    return (
      <div key={req.id} className="cr-response" style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Avatar name={other.name} avatarUrl={other.avatarUrl} size={32} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong>
              {incoming ? (
                <>
                  <Link href={`/network/${other.id}`}>{other.name}</Link> asked you for a recommendation
                </>
              ) : (
                <>
                  You asked <Link href={`/network/${other.id}`}>{other.name}</Link> for a recommendation
                </>
              )}
            </strong>
            <span className="meta"> · {formatDate(req.createdAt)}</span>
            {req.recipientPosition && <div className="meta">Position: {req.recipientPosition}</div>}
          </div>
        </div>
        {req.message && <p style={{ whiteSpace: "pre-wrap" }}>{req.message}</p>}
        <div className="cr-review-actions">
          {incoming ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openWriter(req.requester, null, req.recipientPosition ?? "")}>
                Write recommendation
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pendingId === req.id}
                onClick={() => run(req.id, () => declineRecommendationRequestAction(req.id), "Request declined")}
              >
                Decline
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={pendingId === req.id}
              onClick={() => run(req.id, () => withdrawRecommendationRequestAction(req.id), "Request withdrawn")}
            >
              Withdraw
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderItem(r: RecommendationItem, side: "received" | "given") {
    const other = side === "received" ? r.author : r.recipient;
    const isAuthor = viewerId === r.author.id;
    const isRecipientOwner = isOwnProfile && r.recipient.id === profile.id;
    const long = r.body.length > 320;
    const open = expanded.has(r.id);
    return (
      <article key={r.id} className={`cr-review${r.status !== "visible" ? " own" : ""}`}>
        <header className="cr-review-head">
          <Link href={`/network/${other.id}`} className="cr-reviewer">
            <Avatar name={other.name} avatarUrl={other.avatarUrl} size={40} />
            <span>
              <b>{other.name}</b>
              {other.headline && <span className="meta cr-reviewer-sub">{other.headline}</span>}
              <span className="meta cr-reviewer-sub">
                {formatDate(r.createdAt)}, {relationshipSentence(r.relationship, first(r.author.name), first(r.recipient.name))}
              </span>
            </span>
          </Link>
          {r.status !== "visible" && (
            <span className="tag">{r.status === "pending" ? "Pending approval" : "Hidden from profile"}</span>
          )}
        </header>
        {r.recipientPosition && <div className="meta">Position: {r.recipientPosition}</div>}
        <p className="cr-review-body" style={{ whiteSpace: "pre-wrap" }}>
          {long && !open ? `${r.body.slice(0, 320).trimEnd()}…` : r.body}
          {long && (
            <>
              {" "}
              <button
                type="button"
                className="link-btn"
                style={{ display: "inline" }}
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (open) next.delete(r.id);
                    else next.add(r.id);
                    return next;
                  })
                }
              >
                {open ? "see less" : "see more"}
              </button>
            </>
          )}
        </p>

        {(isRecipientOwner || isAuthor || viewer?.isAdmin) && !(writing?.existing?.id === r.id) && (
          <div className="cr-review-actions">
            {isRecipientOwner && r.status !== "visible" && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={pendingId === r.id}
                onClick={() => run(r.id, () => setRecommendationVisibilityAction(r.id, "visible"), "Shown on your profile")}
              >
                Show on profile
              </button>
            )}
            {isRecipientOwner && r.status === "visible" && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={pendingId === r.id}
                onClick={() => run(r.id, () => setRecommendationVisibilityAction(r.id, "hidden"), "Hidden from your profile")}
              >
                Hide
              </button>
            )}
            {isAuthor && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => openWriter(r.recipient, r)}>
                Revise
              </button>
            )}
            {(isRecipientOwner || isAuthor || viewer?.isAdmin) && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ color: "var(--o-red)", borderColor: "var(--o-red)" }}
                disabled={pendingId === r.id}
                onClick={() => {
                  const label = isRecipientOwner && r.status === "pending" ? "Decline" : isAuthor ? "Withdraw" : "Remove";
                  if (!confirm(`${label} this recommendation? This can't be undone.`)) return;
                  run(r.id, () => deleteRecommendationAction(r.id), "Recommendation removed");
                }}
              >
                {isRecipientOwner && r.status === "pending" ? "Decline" : isAuthor ? "Withdraw" : "Remove"}
              </button>
            )}
          </div>
        )}
        {writing?.existing?.id === r.id && renderForm()}
      </article>
    );
  }

  const receivedList = isOwnProfile ? received : received.filter((r) => r.status === "visible" || r.author.id === viewerId);
  const givenList = isOwnProfile ? data.given : data.given.filter((r) => r.status === "visible" || r.author.id === viewerId || r.recipient.id === viewerId);
  const writingNew = writing && !writing.existing;

  return (
    <section className="card panel" id="recommendations">
      <div className="panel-head">
        <h2 className="section-title">Recommendations</h2>
        {isOwnProfile && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              setWriting(null);
              setAsking((v) => !v);
              if (!askMessage) setAskMessage(`Hi, would you be willing to write a recommendation I can add to my GovConUnited profile? I'd really appreciate it.`);
            }}
          >
            Ask for a recommendation
          </button>
        )}
        {canRecommend && !myRecForProfile && !writing && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => openWriter(profile, null)}>
            Recommend {profileFirst}
          </button>
        )}
      </div>

      {isOwnProfile && asking && (
        <form className="cr-form" onSubmit={submitAsk}>
          {askable.length === 0 ? (
            <p className="meta" style={{ margin: 0 }}>
              {connections.length === 0
                ? "Recommendations come from your connections. Connect with people you've worked with first."
                : "Everyone in your network has already recommended you or has a pending request."}
            </p>
          ) : (
            <>
              <label className="label">
                Who do you want to ask?
                <select className="field" value={askTo} onChange={(e) => setAskTo(e.target.value)}>
                  <option value="">Select a connection…</option>
                  {askable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.headline ? ` — ${c.headline}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                Your position at the time <span className="meta">(optional)</span>
                {positionOptions.length > 0 ? (
                  <select className="field" value={askPosition} onChange={(e) => setAskPosition(e.target.value)}>
                    <option value="">Not specified</option>
                    {positionOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className="field" value={askPosition} maxLength={160} onChange={(e) => setAskPosition(e.target.value)} />
                )}
              </label>
              <label className="label">
                Message
                <textarea className="textarea" value={askMessage} maxLength={1000} rows={3} onChange={(e) => setAskMessage(e.target.value)} />
              </label>
            </>
          )}
          <div className="cr-form-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setAsking(false)} disabled={saving}>
              Cancel
            </button>
            {askable.length > 0 && (
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !askTo}>
                {saving ? "Sending…" : "Send request"}
              </button>
            )}
          </div>
        </form>
      )}

      {askedOfMe.map((req) => renderRequest(req, true))}
      {myAsks.map((req) => renderRequest(req, false))}

      {writingNew && renderForm()}

      {!viewer && shownReceived.length === 0 && shownGiven.length === 0 ? null : (
        <>
          <div className="tabs">
            <button type="button" className={`tab${tab === "received" ? " active" : ""}`} onClick={() => setTab("received")}>
              Received ({isOwnProfile ? shownReceived.length : receivedList.filter((r) => r.status === "visible").length})
              {isOwnProfile && pendingReceived.length > 0 && ` · ${pendingReceived.length} pending`}
            </button>
            <button type="button" className={`tab${tab === "given" ? " active" : ""}`} onClick={() => setTab("given")}>
              Given ({shownGiven.length})
            </button>
          </div>

          {tab === "received" ? (
            receivedList.length === 0 ? (
              <div className="empty">
                <strong>No recommendations yet</strong>
                {isOwnProfile
                  ? "Ask a connection you've worked with to recommend you."
                  : canRecommend
                    ? `Worked with ${profileFirst}? Be the first to recommend them.`
                    : !viewer
                      ? null
                      : `Connect with ${profileFirst} to write a recommendation.`}
              </div>
            ) : (
              <div className="cr-list">{receivedList.map((r) => renderItem(r, "received"))}</div>
            )
          ) : givenList.length === 0 ? (
            <div className="empty">
              <strong>No recommendations given</strong>
              {isOwnProfile ? "Recommend a connection from their profile." : `${profileFirst} hasn't recommended anyone yet.`}
            </div>
          ) : (
            <div className="cr-list">{givenList.map((r) => renderItem(r, "given"))}</div>
          )}
        </>
      )}
    </section>
  );
}
