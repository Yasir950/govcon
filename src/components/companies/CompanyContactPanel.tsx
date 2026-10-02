"use client";

import { useCallback, useEffect, useState } from "react";
import { startCompanyConversationAction } from "@/app/companies/actions";
import { getConversationMessagesAction, sendMessageAction } from "@/app/(app)/messages/actions";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { CompanyLink } from "@/components/companies/CompanyLink";
import { useSignInPrompt } from "@/components/sign-in-prompt-provider";
import { useToast } from "@/components/toast-provider";
import type { MessageItem } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// A quick-contact drawer for messaging a company directly from a card (the
// partner/company directories) without leaving the page for the full
// /messages inbox. Reuses the same startCompanyConversationAction/
// sendMessageAction the company profile's "Message" button already calls.
export function CompanyContactPanel({
  company,
  viewer,
  onClose,
}: {
  company: { id: string; name: string; slug?: string | null; logo: string; logoUrl: string | null } | null;
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

  const companyId = company?.id ?? null;

  useEffect(() => {
    if (!company) return;
    if (!viewer) {
      onClose();
      promptSignIn({ message: `Sign in or create a free account to message ${company.name}.` });
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setConversationId(null);
    (async () => {
      const result = await startCompanyConversationAction(company.id);
      if (cancelled) return;
      if (result.error || !result.conversationId) {
        setLoading(false);
        onClose();
        showToast(result.error ?? "Couldn't start a conversation. Please try again.");
        return;
      }
      setConversationId(result.conversationId);
      const history = await getConversationMessagesAction(result.conversationId);
      if (cancelled) return;
      setMessages(history);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

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

  if (!company || !viewer) return null;

  return (
    <div className="contact-panel-backdrop" role="presentation" onClick={onClose}>
      <section
        className="contact-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Message ${company.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="message-room-head">
          <CompanyLogo name={company.name} initials={company.logo} logoUrl={company.logoUrl} className="company-logo-avatar" />
          <div>
            <strong>
              <CompanyLink slug={company.slug}>{company.name}</CompanyLink>
            </strong>
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
              <p className="meta">No messages yet. Say hello to {company.name}.</p>
            </div>
          ) : (
            messages.map((m) => (
              <div className={`message-line${m.mine ? " me" : ""}`} key={m.id}>
                <div className={`bubble${m.mine ? " me" : ""}`}>
                  {m.imageUrl && <img src={m.imageUrl} alt="" style={{ maxWidth: "100%", borderRadius: 8, display: "block", marginBottom: m.body ? 6 : 0 }} />}
                  {m.body}
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
