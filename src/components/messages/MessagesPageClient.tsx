"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getConversationMessagesAction, getOrCreateConversationId, markConversationReadAction, sendMessageAction } from "@/app/(app)/messages/actions";
import { Avatar } from "@/components/avatar";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { useOnlinePresence } from "@/components/OnlinePresenceProvider";
import { useToast } from "@/components/toast-provider";
import type { Conversation, MessageItem, NetworkMember } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";
import { MessageBody } from "@/components/messages/MessageBody";

function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// LinkedIn shows a bare date/weekday for the list row, not a full
// timestamp — "Sep 16", or just the time for anything sent today.
function formatRowDate(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dispatchUnreadChanged(count: number) {
  window.dispatchEvent(new CustomEvent("gcu:unread-messages-changed", { detail: { count } }));
}

const FILTERS = ["all", "unread", "connections"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = { all: "All", unread: "Unread", connections: "Connections" };

export function MessagesPageClient({
  viewer,
  conversations: initialConversations,
  activeId: initialActiveId,
  messages: initialMessages,
  messageableMembers,
  connectionIds,
}: {
  viewer: Viewer;
  conversations: Conversation[];
  activeId: string | null;
  messages: MessageItem[];
  messageableMembers: NetworkMember[];
  connectionIds: string[];
}) {
  const router = useRouter();
  const showToast = useToast();
  const connectionIdSet = useMemo(() => new Set(connectionIds), [connectionIds]);
  const onlineIds = useOnlinePresence();

  // Everything below is client-owned state from here on — switching
  // conversations, sending, and receiving all update this in place rather
  // than going through router.push/router.refresh (a real Next navigation
  // that re-runs the server component and reloads the whole page's
  // content). The server-rendered props above only seed the very first
  // paint.
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  const [localMessages, setLocalMessages] = useState<MessageItem[]>(initialMessages);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [composing, setComposing] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // Realtime callbacks are registered once on mount, so they'd otherwise
  // always see the activeId/viewer from that first render — refs keep
  // them current without re-subscribing the channel on every switch.
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Guards against a slow getConversationMessagesAction response (fired by
  // selectConversation/startConversation) landing after a newer action —
  // switching conversations again, or sending — and clobbering fresher
  // local state with stale/empty history. Bumped by anything that changes
  // what localMessages should hold; a fetch only applies its result if it's
  // still the most recent one in flight.
  const fetchTokenRef = useRef(0);

  const filteredMembers = useMemo(
    () =>
      messageableMembers.filter((m) => !pickerQuery || m.name.toLowerCase().includes(pickerQuery.toLowerCase())),
    [messageableMembers, pickerQuery],
  );

  const visibleConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (filter === "unread" && c.unreadCount === 0) return false;
      if (filter === "connections" && !connectionIdSet.has(c.otherMemberId)) return false;
      if (listSearch && !`${c.otherMemberName} ${c.lastMessagePreview}`.toLowerCase().includes(listSearch.toLowerCase())) return false;
      return true;
    });
  }, [conversations, filter, listSearch, connectionIdSet]);

  const unreadTotal = useMemo(() => conversations.reduce((sum, c) => sum + (c.unreadCount > 0 ? 1 : 0), 0), [conversations]);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);

  // Real-time inbound messages — no polling, no page refresh. RLS on
  // `messages` scopes this subscription to only the viewer's own
  // conversations (see 20260922060000_messaging_realtime.sql). The topic
  // name includes a random suffix per mount — reusing a bare
  // `viewer.id`-only name meant React Strict Mode's dev-only double-effect
  // (mount, cleanup, mount again) sent a "leave" and a "join" for the same
  // topic back to back, and the server-side subscription that resulted
  // silently never delivered events even though the client reported
  // SUBSCRIBED. A unique name per mount side-steps that, and also stops
  // two open tabs for the same viewer from sharing one topic.
  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // The browser client is a cookie-hydrated singleton (see
    // @supabase/ssr's createBrowserClient) — its session is read
    // asynchronously, and subscribing before that resolves joins the
    // channel with no JWT set. Postgres RLS then silently evaluates every
    // row as an anonymous subscriber and never matches, so nothing ever
    // arrives even though the channel itself reports SUBSCRIBED.
    // Explicitly awaiting the session and setting realtime auth first
    // closes that race.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`messages-page-${viewer.id}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as {
              id: string;
              conversation_id: string;
              sender_id: string;
              body: string;
              image_url: string | null;
              created_at: string;
              recommendation_request_id?: string | null;
            };
            if (row.sender_id === viewer.id) return; // our own sends are handled optimistically at the call site

            if (row.conversation_id === activeIdRef.current) {
              setLocalMessages((prev) =>
                prev.some((m) => m.id === row.id)
                  ? prev
                  : [...prev, { id: row.id, senderId: row.sender_id, body: row.body, imageUrl: row.image_url, createdAt: row.created_at, mine: false, recommendationRequestId: row.recommendation_request_id ?? null }],
              );
              markConversationReadAction(row.conversation_id).catch(() => {});
              // Not a new unread (the thread is open and was just marked
              // read), but DashboardShell's own realtime listener is off
              // while on this route — re-broadcast the true total so its
              // badge doesn't drift from what's actually unread.
              setConversations((prev) => {
                dispatchUnreadChanged(prev.reduce((sum, c) => sum + (c.unreadCount > 0 ? 1 : 0), 0));
                return prev;
              });
              return;
            }

            setConversations((prev) => {
              const known = prev.some((c) => c.id === row.conversation_id);
              if (!known) {
                // A conversation the client hasn't loaded yet (someone new
                // messaging for the first time) — rare enough that a real
                // refetch is simplest and correct.
                router.refresh();
                return prev;
              }
              const next = prev.map((c) =>
                c.id === row.conversation_id
                  ? { ...c, unreadCount: c.unreadCount + 1, lastMessagePreview: row.body || (row.image_url ? "📷 Photo" : ""), lastMessageAt: row.created_at }
                  : c,
              );
              next.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
              dispatchUnreadChanged(next.reduce((sum, c) => sum + (c.unreadCount > 0 ? 1 : 0), 0));
              return next;
            });
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.id]);

  const selectConversation = useCallback(
    async (id: string) => {
      if (id === activeId && !composing) return;
      const token = ++fetchTokenRef.current;
      setComposing(false);
      setActiveId(id);
      setLocalMessages([]);
      setLoadingMessages(true);
      window.history.replaceState(window.history.state, "", `/messages?c=${id}`);

      const [history] = await Promise.all([getConversationMessagesAction(id), markConversationReadAction(id)]);
      if (fetchTokenRef.current !== token) return;
      setLocalMessages(history);
      setLoadingMessages(false);
      setConversations((prev) => {
        const next = prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c));
        dispatchUnreadChanged(next.reduce((sum, c) => sum + (c.unreadCount > 0 ? 1 : 0), 0));
        return next;
      });
    },
    [activeId, composing],
  );

  const startConversation = useCallback(
    async (member: NetworkMember) => {
      setComposing(false);
      const result = await getOrCreateConversationId(member.id);
      if (result.error || !result.id) {
        showToast(result.error ?? "Couldn't start that conversation. Please try again.");
        return;
      }
      const id = result.id;
      setConversations((prev) => {
        if (prev.some((c) => c.id === id)) return prev;
        const entry: Conversation = {
          id,
          otherMemberId: member.id,
          otherMemberName: member.name,
          otherMemberInitials: member.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
          otherMemberAvatarUrl: member.avatarUrl ?? null,
          otherMemberHeadline: member.headline ?? null,
          otherMemberJobTitle: member.jobTitle ?? null,
          otherMemberAwayMessage: null,
          lastMessageAt: new Date().toISOString(),
          lastMessagePreview: "",
          unreadCount: 0,
        };
        return [entry, ...prev];
      });
      const token = ++fetchTokenRef.current;
      setActiveId(id);
      setLocalMessages([]);
      window.history.replaceState(window.history.state, "", `/messages?c=${id}`);
      const history = await getConversationMessagesAction(id);
      if (fetchTokenRef.current !== token) return;
      setLocalMessages(history);
    },
    [showToast],
  );

  async function handleImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("Choose an image file.");
    if (file.size > 10 * 1024 * 1024) return showToast("Image must be smaller than 10MB.");
    setImageUploading(true);
    try {
      const supabase = createBrowserClient();
      const extension = file.name.split(".").pop() || "jpg";
      const path = `${viewer.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("message-images").upload(path, file, { contentType: file.type });
      if (error) return showToast("Upload failed. Please try again.");
      const { data } = supabase.storage.from("message-images").getPublicUrl(path);
      setDraftImageUrl(data.publicUrl);
    } finally {
      setImageUploading(false);
    }
  }

  const send = useCallback(async () => {
    if (!activeId || (!draft.trim() && !draftImageUrl) || sending) return;
    fetchTokenRef.current++; // invalidate any in-flight history fetch so it can't overwrite this optimistic add
    const body = draft.trim();
    const imageUrl = draftImageUrl;
    setDraft("");
    setDraftImageUrl(null);
    setSending(true);
    const optimistic: MessageItem = {
      id: `pending-${Date.now()}`,
      senderId: viewer.id,
      body,
      imageUrl,
      createdAt: new Date().toISOString(),
      mine: true,
    };
    setLocalMessages((prev) => [...prev, optimistic]);
    setConversations((prev) => {
      const next = prev.map((c) => (c.id === activeId ? { ...c, lastMessagePreview: body || (imageUrl ? "📷 Photo" : ""), lastMessageAt: optimistic.createdAt } : c));
      next.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
      return next;
    });
    const result = await sendMessageAction(activeId, body, imageUrl ?? undefined);
    setSending(false);
    if (result.error) {
      setLocalMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
      setDraftImageUrl(imageUrl);
      showToast(result.error);
    }
  }, [activeId, draft, draftImageUrl, sending, viewer.id, showToast]);

  return (
    <section className="main" id="messages">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <div className="messaging-topbar">
            <h1>Messaging</h1>
            <div className="messaging-search">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                placeholder="Search messages"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
              />
            </div>
            <button className="compose-btn" onClick={() => setComposing(true)} aria-label="New message">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>

          <div className="messaging-filters">
            {FILTERS.map((f) => (
              <button key={f} className={`filter-pill${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
                {FILTER_LABEL[f]}
                {f === "unread" && unreadTotal > 0 ? ` (${unreadTotal})` : ""}
              </button>
            ))}
          </div>

          <div className={`card messages-shell${activeId || composing ? " has-active-chat" : ""}`}>
            <aside className="conversation-list">
              {visibleConversations.length === 0 ? (
                <div className="empty">
                  <strong>{conversations.length === 0 ? "No messages yet" : "No conversations match"}</strong>
                  {conversations.length === 0 ? (
                    <>
                      Click the compose button above, or start a conversation from a member&rsquo;s profile in{" "}
                      <Link href="/network" className="link-btn" style={{ display: "inline" }}>
                        Network
                      </Link>
                      .
                    </>
                  ) : (
                    "Try a different filter or search."
                  )}
                </div>
              ) : (
                visibleConversations.map((c) => (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    className={`conversation${c.id === activeId && !composing ? " conversation-active" : ""}${c.unreadCount > 0 ? " conversation-unread" : ""}`}
                    onClick={() => selectConversation(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectConversation(c.id);
                      }
                    }}
                  >
                    <span style={{ position: "relative", justifySelf: "start" }}>
                      <Link
                        href={`/network/${c.otherMemberId}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`View ${c.otherMemberName}'s profile`}
                      >
                        <Avatar name={c.otherMemberName} avatarUrl={c.otherMemberAvatarUrl} />
                      </Link>
                      {onlineIds.has(c.otherMemberId) && <span className="online-dot" aria-label="Online" />}
                    </span>
                    <span className="conversation-open">
                      <span className="conversation-row-top">
                        <Link
                          href={`/network/${c.otherMemberId}`}
                          className="mini-row-title is-name"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.otherMemberName}
                        </Link>
                        <span className="conversation-date">{formatRowDate(c.lastMessageAt)}</span>
                      </span>
                      <span className="conversation-preview">{c.lastMessagePreview || "No messages yet"}</span>
                    </span>
                    {c.unreadCount > 0 && <span className="unread-count">{c.unreadCount}</span>}
                  </div>
                ))
              )}
            </aside>

            <div className="message-room">
              {composing ? (
                <>
                  <div className="message-room-head">
                    <strong>New message</strong>
                    <button type="button" className="partner-modal-close" aria-label="Close" onClick={() => setComposing(false)} style={{ marginLeft: "auto" }}>
                      ×
                    </button>
                  </div>
                  <div style={{ padding: 18 }}>
                    <input
                      className="field"
                      style={{ width: "100%" }}
                      placeholder="Type a name..."
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      autoFocus
                    />
                    <div style={{ marginTop: 14 }}>
                      <span className="meta" style={{ textTransform: "uppercase", fontSize: ".7rem", letterSpacing: ".04em" }}>
                        Suggested
                      </span>
                      <div style={{ marginTop: 8, display: "grid" }}>
                        {messageableMembers.length === 0 ? (
                          <p className="meta">No other members to message yet.</p>
                        ) : filteredMembers.length === 0 ? (
                          <p className="meta">No members match that search.</p>
                        ) : (
                          filteredMembers.map((m) => (
                            <button key={m.id} className="conversation" onClick={() => startConversation(m)}>
                              <Avatar name={m.name} avatarUrl={m.avatarUrl} />
                              <span className="conversation-open">
                                <strong>{m.name}</strong>
                                <span className="conversation-preview">{m.headline || m.jobTitle || "GovConUnited Member"}</span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : !active ? (
                <div className="message-empty">
                  <div>
                    <strong>Select a conversation</strong>
                    <p className="meta">Choose a conversation on the left to see the messages.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="message-room-head">
                    <button
                      type="button"
                      className="message-back-btn"
                      aria-label="Back to conversations"
                      onClick={() => setActiveId(null)}
                    >
                      ‹
                    </button>
                    <Link
                      href={`/network/${active.otherMemberId}`}
                      className="message-room-head-link"
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <span style={{ position: "relative", display: "inline-flex" }}>
                        <Avatar name={active.otherMemberName} avatarUrl={active.otherMemberAvatarUrl} size={38} />
                        {onlineIds.has(active.otherMemberId) && <span className="online-dot" aria-label="Online" />}
                      </span>
                      <div>
                        <strong>{active.otherMemberName}</strong>
                        <div className="meta">{active.otherMemberHeadline || active.otherMemberJobTitle || "GovConUnited Member"}</div>
                      </div>
                    </Link>
                  </div>

                  {active.otherMemberAwayMessage && (
                    <div className="chat-away-banner">
                      <strong>{active.otherMemberName} is away</strong>
                      <p>{active.otherMemberAwayMessage}</p>
                    </div>
                  )}

                  <div className="chat-area">
                    {loadingMessages ? (
                      <div className="message-empty">
                        <p className="meta">Loading…</p>
                      </div>
                    ) : localMessages.length === 0 ? (
                      <div className="message-empty">
                        <p className="meta">No messages yet. Say hello.</p>
                      </div>
                    ) : (
                      localMessages.map((m) => (
                        <div className={`message-line${m.mine ? " me" : ""}`} key={m.id}>
                          <div className={`bubble${m.mine ? " me" : ""}`}>
                            <MessageBody m={m} />
                          </div>
                          <span className="message-time">{formatMessageTime(m.createdAt)}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="chat-input">
                    {draftImageUrl && (
                      <div style={{ position: "relative", flex: "none" }}>
                        <img src={draftImageUrl} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6 }} />
                        <button
                          type="button"
                          onClick={() => setDraftImageUrl(null)}
                          aria-label="Remove image"
                          style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", border: 0, background: "var(--o-red)", color: "#fff", fontSize: ".65rem", lineHeight: 1, cursor: "pointer" }}
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <label className="chat-image-btn" aria-label="Attach an image">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                      <input type="file" accept="image/*" onChange={handleImagePicked} disabled={imageUploading} style={{ display: "none" }} />
                    </label>
                    <input
                      className="field"
                      placeholder="Write a message..."
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          send();
                        }
                      }}
                      disabled={sending}
                    />
                    <button className="btn btn-primary" onClick={send} disabled={sending || imageUploading || (!draft.trim() && !draftImageUrl)}>
                      Send
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
