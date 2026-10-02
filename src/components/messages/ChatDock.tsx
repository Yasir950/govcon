"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getConversationMessagesAction,
  getConversationsAction,
  markConversationReadAction,
  sendMessageAction,
} from "@/app/(app)/messages/actions";
import { setAwayMessageAction } from "@/app/(app)/settings/messages/actions";
import { Avatar } from "@/components/avatar";
import { PostMoreMenu } from "@/components/community/PostMoreMenu";
import { useToast } from "@/components/toast-provider";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { useOnlinePresence } from "@/components/OnlinePresenceProvider";
import type { Conversation, MessageItem } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";
import { MessageBody } from "@/components/messages/MessageBody";

const OPEN_KEY = "gcu:chatdock-open";
const MIN_KEY = "gcu:chatdock-minimized";
const MAX_OPEN_POPUPS = 3; // LinkedIn caps open chat heads too — an unbounded row would run off-screen

// Popups are position:fixed (so they aren't constrained by .chat-dock's
// own flexbox), which means their `right` offset has to be computed by
// hand from the dock panel's own geometry rather than just flowing next
// to it — these mirror the matching CSS values exactly (.chat-dock's own
// right inset, .chat-dock-panel's width, .chat-popup's width) so a popup
// never overlaps the dock panel next to it.
const DOCK_RIGHT_INSET = 96;
const DOCK_PANEL_WIDTH = 340;
const POPUP_WIDTH = 320;
const POPUP_GAP = 10;
const FIRST_POPUP_RIGHT = DOCK_RIGHT_INSET + DOCK_PANEL_WIDTH + POPUP_GAP;

function readIds(key: string): string[] {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Private browsing / storage disabled — popups just won't survive a navigation.
  }
}

function formatBubbleTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Minimize (collapse the popup down to just its header) shows a
// down-chevron; a minimized popup shows an up-chevron to restore it —
// same convention LinkedIn's own chat heads use, rather than a bare "–"
// text character.
function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={direction === "up" ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// Matches the pencil/compose icon MessagesPageClient's own topbar uses
// (kept as a plain SVG copy rather than a shared export since the two
// components don't otherwise share a module).
function ComposeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

// LinkedIn-style global chat widget: a "Messaging" bar docked bottom-right
// on every signed-in page, with click-to-open pop-up conversation windows
// stacked to its left (minimize/close, like LinkedIn's chat heads). This is
// deliberately separate from the full /messages inbox page — a
// convenience layer on top of it, not a replacement — so it hides itself
// there to avoid two overlapping realtime subscriptions and a redundant
// UI. Since DashboardShell (and this component with it) remounts on every
// route change (see docs/dashboard.md — the shell lives in each page.tsx,
// not a persistent layout), which popups are open/minimized is persisted
// to sessionStorage and re-read on mount so switching pages doesn't reset
// the dock, the same way a real SPA's in-memory state would survive.
export function ChatDock({ viewer, unreadCount }: { viewer: Viewer; unreadCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const showToast = useToast();
  const isPro = viewer.planSelection === "pro";
  const onlineIds = useOnlinePresence();
  const fullName = `${viewer.firstName} ${viewer.lastName}`.trim() || "You";
  const [awayModalOpen, setAwayModalOpen] = useState(false);
  const [awayMessage, setAwayMessage] = useState("");
  const [awaySaving, setAwaySaving] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [minimizedIds, setMinimizedIds] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [threads, setThreads] = useState<Record<string, MessageItem[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());

  // Realtime's callback closes over these on mount — refs keep it reading
  // the current values instead of the ones from whichever render first
  // subscribed.
  const openIdsRef = useRef<string[]>([]);
  useEffect(() => {
    openIdsRef.current = openIds;
  }, [openIds]);
  const minimizedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    minimizedRef.current = minimizedIds;
  }, [minimizedIds]);

  // Fetched on mount (i.e. on every page load, same as DashboardShell's
  // own unread-count fetch) rather than lazily on first dock-open — a
  // "Loading…" flash the moment someone actually opens the dock reads as
  // broken, so the data needs to already be there by the time they click.
  const loadConversations = useCallback(async () => {
    const data = await getConversationsAction();
    setConversations(data);
    setListLoaded(true);
  }, []);

  useEffect(() => {
    const ids = readIds(OPEN_KEY);
    setOpenIds(ids);
    setMinimizedIds(new Set(readIds(MIN_KEY)));
    setHydrated(true);
    loadConversations();
  }, [loadConversations]);
  useEffect(() => {
    if (hydrated) writeIds(OPEN_KEY, openIds);
  }, [openIds, hydrated]);
  useEffect(() => {
    if (hydrated) writeIds(MIN_KEY, [...minimizedIds]);
  }, [minimizedIds, hydrated]);

  // Fetch history + mark-read for any popup that's open but doesn't have
  // its thread loaded yet (a fresh open, or one just restored from
  // sessionStorage after a navigation).
  useEffect(() => {
    if (!hydrated) return;
    for (const id of openIds) {
      if (threads[id]) continue;
      getConversationMessagesAction(id).then((msgs) => {
        setThreads((prev) => (prev[id] ? prev : { ...prev, [id]: msgs }));
      });
      if (!minimizedRef.current.has(id)) {
        markConversationReadAction(id).catch(() => {});
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIds, hydrated]);

  useEffect(() => {
    if (pathname?.startsWith("/messages")) return; // the real inbox page owns realtime there
    let cancelled = false;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Same auth-race fix as DashboardShell's badge subscription and
    // MessagesPageClient's own — see the comment there for why this is
    // necessary (joining before the session hydrates silently never
    // delivers anything, even though the channel reports SUBSCRIBED).
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`chatdock-${viewer.id}-${Math.random().toString(36).slice(2)}`)
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
            if (row.sender_id === viewer.id) return;

            const isOpenAndVisible =
              openIdsRef.current.includes(row.conversation_id) && !minimizedRef.current.has(row.conversation_id);

            if (isOpenAndVisible) {
              setThreads((prev) => {
                const existing = prev[row.conversation_id] ?? [];
                if (existing.some((m) => m.id === row.id)) return prev;
                return {
                  ...prev,
                  [row.conversation_id]: [
                    ...existing,
                    { id: row.id, senderId: row.sender_id, body: row.body, imageUrl: row.image_url, createdAt: row.created_at, mine: false, recommendationRequestId: row.recommendation_request_id ?? null },
                  ],
                };
              });
              markConversationReadAction(row.conversation_id).catch(() => {});
            }

            setConversations((prev) => {
              const known = prev.some((c) => c.id === row.conversation_id);
              if (!known) {
                // A brand-new inbound conversation the dock hasn't loaded
                // yet — rare enough that a full refetch is simplest.
                getConversationsAction().then((data) => setConversations(data));
                return prev;
              }
              const next = prev.map((c) =>
                c.id === row.conversation_id
                  ? {
                      ...c,
                      unreadCount: isOpenAndVisible ? 0 : c.unreadCount + 1,
                      lastMessagePreview: row.body || (row.image_url ? "📷 Photo" : ""),
                      lastMessageAt: row.created_at,
                    }
                  : c,
              );
              next.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
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
  }, [viewer.id, pathname]);

  const openConversation = useCallback((id: string) => {
    setOpenIds((prev) => (prev.includes(id) ? prev : [...prev, id].slice(-MAX_OPEN_POPUPS)));
    setMinimizedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDockOpen(false);
  }, []);

  // Lets any "Contact"-style button elsewhere in the app (company/partner
  // cards, previously a separate side-panel drawer) open a popup here
  // instead, without prop-drilling through DashboardShell — same
  // window-event pattern already used for the unread-badge sync.
  useEffect(() => {
    function handleOpenChat(e: Event) {
      const detail = (e as CustomEvent<{ conversationId: string }>).detail;
      const id = detail?.conversationId;
      if (!id) return;
      openConversation(id);
      // Always refetch rather than conditionally checking "is it already
      // known" inside a setState updater — that ran loadConversations()
      // (an async side effect) from inside a functional updater, which
      // React doesn't guarantee actually invokes it (updaters must be
      // pure), so a brand-new conversation's metadata sometimes silently
      // never arrived and the popup had nothing to render.
      loadConversations();
    }
    window.addEventListener("gcu:open-chat", handleOpenChat);
    return () => window.removeEventListener("gcu:open-chat", handleOpenChat);
  }, [loadConversations, openConversation]);

  function openAwayModal() {
    if (!isPro) {
      showToast("Away messages are a Pro feature — upgrade to use this.");
      return;
    }
    setAwayModalOpen(true);
  }

  async function saveAwayMessage(enabled: boolean) {
    setAwaySaving(true);
    const result = await setAwayMessageAction(enabled, awayMessage);
    setAwaySaving(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(enabled ? "Away message turned on" : "Away message turned off");
    setAwayModalOpen(false);
  }

  const closePopup = useCallback((id: string) => {
    setOpenIds((prev) => prev.filter((x) => x !== id));
    setMinimizedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleMinimize = useCallback((id: string) => {
    setMinimizedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        markConversationReadAction(id).catch(() => {});
        setConversations((p) => p.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const sendFrom = useCallback(
    async (id: string) => {
      const body = (drafts[id] ?? "").trim();
      if (!body || sendingIds.has(id)) return;
      setDrafts((prev) => ({ ...prev, [id]: "" }));
      setSendingIds((prev) => new Set(prev).add(id));
      const optimistic: MessageItem = {
        id: `pending-${Date.now()}`,
        senderId: viewer.id,
        body,
        imageUrl: null,
        createdAt: new Date().toISOString(),
        mine: true,
      };
      setThreads((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), optimistic] }));
      setConversations((prev) => {
        const next = prev.map((c) => (c.id === id ? { ...c, lastMessagePreview: body, lastMessageAt: optimistic.createdAt } : c));
        next.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
        return next;
      });
      const result = await sendMessageAction(id, body);
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (result.error) {
        setThreads((prev) => ({ ...prev, [id]: (prev[id] ?? []).filter((m) => m.id !== optimistic.id) }));
        setDrafts((prev) => ({ ...prev, [id]: body }));
      }
    },
    [drafts, sendingIds, viewer.id],
  );

  if (pathname?.startsWith("/messages")) return null;

  const filtered = conversations.filter(
    (c) => !search || c.otherMemberName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="chat-dock">
      {openIds.map((id, index) => {
        const convo = conversations.find((c) => c.id === id);
        if (!convo) return null;
        const minimized = minimizedIds.has(id);
        const messages = threads[id] ?? [];
        return (
          <div
            key={id}
            className={`chat-popup${minimized ? " chat-popup-minimized" : ""}`}
            style={{ right: FIRST_POPUP_RIGHT + index * (POPUP_WIDTH + POPUP_GAP) }}
          >
            <div
              className="chat-popup-head"
              role="button"
              tabIndex={0}
              onClick={() => toggleMinimize(id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleMinimize(id);
                }
              }}
            >
              <Link
                href={`/network/${convo.otherMemberId}`}
                onClick={(e) => e.stopPropagation()}
                aria-label={`View ${convo.otherMemberName}'s profile`}
                style={{ position: "relative", display: "inline-flex" }}
              >
                <Avatar name={convo.otherMemberName} avatarUrl={convo.otherMemberAvatarUrl} size={26} />
                {onlineIds.has(convo.otherMemberId) && <span className="online-dot" aria-label="Online" />}
              </Link>
              <Link
                href={`/network/${convo.otherMemberId}`}
                onClick={(e) => e.stopPropagation()}
                style={{ color: "inherit", flex: 1, minWidth: 0 }}
              >
                <strong>{convo.otherMemberName}</strong>
              </Link>
              <span className="chat-popup-actions">
                <span
                  role="button"
                  tabIndex={0}
                  className="chat-popup-icon-btn"
                  aria-label={minimized ? "Expand" : "Minimize"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMinimize(id);
                  }}
                >
                  <ChevronIcon direction={minimized ? "up" : "down"} />
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className="chat-popup-icon-btn"
                  aria-label="Close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closePopup(id);
                  }}
                >
                  ×
                </span>
              </span>
            </div>
            {!minimized && (
              <>
                <div className="chat-popup-body">
                  {convo.otherMemberAwayMessage && (
                    <div className="chat-away-banner">
                      <strong>{convo.otherMemberName} is away</strong>
                      <p>{convo.otherMemberAwayMessage}</p>
                    </div>
                  )}
                  {messages.length === 0 ? (
                    <p className="meta" style={{ padding: 14, margin: 0 }}>
                      No messages yet. Say hello.
                    </p>
                  ) : (
                    messages.map((m) => (
                      <div className={`message-line${m.mine ? " me" : ""}`} key={m.id}>
                        <div className={`bubble${m.mine ? " me" : ""}`}>
                          <MessageBody m={m} showImage={false} />
                        </div>
                        <span className="message-time">{formatBubbleTime(m.createdAt)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="chat-popup-input">
                  <input
                    placeholder="Write a message..."
                    value={drafts[id] ?? ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendFrom(id);
                      }
                    }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => sendFrom(id)}
                    disabled={sendingIds.has(id) || !(drafts[id] ?? "").trim()}
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      <div className="chat-dock-panel">
        <div className="chat-dock-header">
          <button
            type="button"
            className="chat-dock-header-toggle"
            onClick={() => {
              const next = !dockOpen;
              setDockOpen(next);
              if (next) loadConversations();
            }}
          >
            <Avatar name={fullName} avatarUrl={viewer.avatarUrl} size={22} />
            <span className="chat-dock-header-title">Messaging</span>
          </button>
          <span className="chat-dock-header-actions">
            {unreadCount > 0 && <span className="unread-count">{unreadCount}</span>}
            <button
              type="button"
              className="chat-dock-icon-btn"
              aria-label="New message"
              onClick={() => {
                setDockOpen(true);
                loadConversations();
              }}
            >
              <ComposeIcon />
            </button>
            <PostMoreMenu
              items={[
                { label: "Manage conversations", onClick: () => router.push("/messages") },
                { label: "Messaging settings", onClick: () => router.push("/settings/messages") },
                { label: "Set away message", onClick: openAwayModal },
              ]}
            />
            <button
              type="button"
              className="chat-dock-icon-btn"
              aria-label={dockOpen ? "Collapse messaging" : "Expand messaging"}
              onClick={() => {
                const next = !dockOpen;
                setDockOpen(next);
                if (next) loadConversations();
              }}
            >
              <ChevronIcon direction={dockOpen ? "down" : "up"} />
            </button>
          </span>
        </div>
        {dockOpen && (
          <div className="chat-dock-list">
            <input
              className="chat-dock-search"
              placeholder="Search messages"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="chat-dock-rows">
              {!listLoaded ? (
                <p className="meta" style={{ padding: 14 }}>
                  Loading…
                </p>
              ) : filtered.length === 0 ? (
                <p className="meta" style={{ padding: 14 }}>
                  {conversations.length === 0 ? "No conversations yet." : "No conversations match."}
                </p>
              ) : (
                filtered.map((c) => (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    className={`conversation${c.unreadCount > 0 ? " conversation-unread" : ""}`}
                    onClick={() => openConversation(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openConversation(c.id);
                      }
                    }}
                  >
                    <Link
                      href={`/network/${c.otherMemberId}`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`View ${c.otherMemberName}'s profile`}
                      style={{ position: "relative", display: "inline-flex", justifySelf: "start" }}
                    >
                      <Avatar name={c.otherMemberName} avatarUrl={c.otherMemberAvatarUrl} size={32} />
                      {onlineIds.has(c.otherMemberId) && <span className="online-dot" aria-label="Online" />}
                    </Link>
                    <span className="conversation-open">
                      <Link
                        href={`/network/${c.otherMemberId}`}
                        className="mini-row-title is-name"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.otherMemberName}
                      </Link>
                      <span className="conversation-preview">{c.lastMessagePreview || "No messages yet"}</span>
                    </span>
                    {c.unreadCount > 0 && <span className="unread-count">{c.unreadCount}</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {awayModalOpen && (
        <div className="partner-modal-backdrop opps-app" role="presentation" onClick={() => setAwayModalOpen(false)}>
          <section
            className="partner-application-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="away-message-title"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: 420 }}
          >
            <header className="partner-modal-header">
              <h2 id="away-message-title">Set away message</h2>
              <button type="button" className="partner-modal-close" aria-label="Close" onClick={() => setAwayModalOpen(false)}>
                ×
              </button>
            </header>
            <div style={{ padding: "16px 20px" }}>
              <textarea
                className="textarea"
                placeholder="e.g. I'm traveling and will reply slower than usual this week."
                value={awayMessage}
                maxLength={280}
                onChange={(e) => setAwayMessage(e.target.value)}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button type="button" className="btn btn-outline" onClick={() => setAwayModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={awaySaving || !awayMessage.trim()}
                  onClick={() => saveAwayMessage(true)}
                >
                  Turn on
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
