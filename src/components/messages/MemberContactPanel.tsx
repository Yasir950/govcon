"use client";

import { useCallback, useEffect, useState } from "react";
import { getOrCreateConversationId } from "@/app/(app)/messages/actions";
import { getConversationMessagesAction, sendMessageAction } from "@/app/(app)/messages/actions";
import { Avatar } from "@/components/avatar";
import { useSignInPrompt } from "@/components/sign-in-prompt-provider";
import { useToast } from "@/components/toast-provider";
import type { MessageItem } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";
import { MessageBody } from "@/components/messages/MessageBody";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// A quick-contact drawer for messaging any member directly (e.g. an
// event's creator from "Contact Event Support") without leaving the page
// for the full /messages inbox — same shape as CompanyContactPanel, minus
// the company-contact-resolution step since the target profile id is
// already known here.
export function MemberContactPanel({
  member,
  viewer,
  onClose,
}: {
  member: { id: string; name: string; avatarUrl: string | null } | null;
  viewer: Viewer | null;
  onClose: () => void;
}) {
  const showToast = useToast();
  const promptSignIn = useSignInPrompt();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const memberId = member?.id ?? null;

  useEffect(() => {
    if (!member) return;
    if (!viewer) {
      onClose();
      promptSignIn({ message: `Sign in or create a free account to message ${member.name}.` });
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setConversationId(null);
    (async () => {
      const result = await getOrCreateConversationId(member.id);
      if (cancelled) return;
      if (result.error || !result.id) {
        setLoading(false);
        onClose();
        showToast(result.error ?? "Couldn't start a conversation. Please try again.");
        return;
      }
      setConversationId(result.id);
      const history = await getConversationMessagesAction(result.id);
      if (cancelled) return;
      setMessages(history);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const send = useCallback(async () => {
    if (!conversationId || !draft.trim() || sending || !viewer) return;
    const body = draft.trim();
    setDraft("");
    setSending(true);
    const optimistic: MessageItem = {
      id: `pending-${Date.now()}`,
      senderId: viewer.id,
      body,
      imageUrl: null,
      createdAt: new Date().toISOString(),
      mine: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    const result = await sendMessageAction(conversationId, body);
    setSending(false);
    if (result.error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
      showToast(result.error);
    }
  }, [conversationId, draft, sending, viewer, showToast]);

  if (!member || !viewer) return null;

  return (
    <div className="contact-panel-backdrop" role="presentation" onClick={onClose}>
      <section
        className="contact-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Message ${member.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="message-room-head">
          <Avatar name={member.name} avatarUrl={member.avatarUrl} size={38} />
          <div>
            <strong>{member.name}</strong>
            <div className="meta">Usually replies within a few days</div>
          </div>
          <button type="button" className="partner-modal-close" aria-label="Close" onClick={onClose} style={{ marginLeft: "auto" }}>
            ×
          </button>
        </div>

        <div className="chat-area">
          {loading ? (
            <div className="message-empty">
              <p className="meta">Loading conversation…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="message-empty">
              <p className="meta">No messages yet. Say hello to {member.name}.</p>
            </div>
          ) : (
            messages.map((m) => (
              <div className={`message-line${m.mine ? " me" : ""}`} key={m.id}>
                <div className={`bubble${m.mine ? " me" : ""}`}>
                  <MessageBody m={m} />
                </div>
                <span className="message-time">{formatTime(m.createdAt)}</span>
              </div>
            ))
          )}
        </div>

        <div className="chat-input">
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
            disabled={sending || loading || !conversationId}
          />
          <button className="btn btn-primary" onClick={send} disabled={sending || loading || !conversationId || !draft.trim()}>
            Send
          </button>
        </div>
      </section>
    </div>
  );
}
