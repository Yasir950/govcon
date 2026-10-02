"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; text: string };

/**
 * Mirrors crewupapp's floating assistant widget (bubble + panel, same
 * /api/chatbot request shape) but built with this project's plain CSS
 * design system (see chatbot styles in landing.css) since there's no
 * Tailwind/shadcn here. The bubble reuses the `.chat-launcher` class
 * that already existed as a static mockup button on the landing page.
 *
 * userName/accountType are optional — passed in only when mounted on a
 * logged-in page, so the assistant can personalize replies. The public
 * landing-page instance passes neither.
 */
export function Chatbot({
  userName,
  accountType,
}: {
  userName?: string;
  accountType?: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: userName
        ? `👋 Hi ${userName.split(" ")[0]}! I'm Prime, the GovConUnited assistant. What can I help you with?`
        : "👋 Hi! I'm Prime, the GovConUnited assistant. Looking for opportunities or want to grow your GovCon network?",
    },
  ]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Real unread count — starts at 1 for the initial greeting and would grow
  // if another assistant reply arrived while the panel is closed; cleared
  // the moment the visitor actually opens the chat, not a hardcoded badge.
  const [unreadCount, setUnreadCount] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  function handleToggle() {
    setOpen((prev) => {
      const next = !prev;
      if (next) setUnreadCount(0);
      return next;
    });
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", text: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          userName,
          accountType,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", text: data.reply }]);
      if (!open) setUnreadCount((prev) => prev + 1);
    } catch {
      setError("Couldn't reach the assistant. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        onClick={handleToggle}
        aria-label={open ? "Close chat" : "Open chat"}
        className="chat-launcher"
      >
        {open ? <X size={26} /> : <MessageCircle size={26} />}
        {!open && unreadCount > 0 && <span className="chat-launcher-badge">{unreadCount}</span>}
      </button>

      {open && (
        <div className="chat-panel" role="dialog" aria-label="GovConUnited Assistant">
          <div className="chat-panel-head">
            <span className="chat-avatar">V</span>
            <div>
              <p className="chat-panel-title">Prime</p>
              <p className="chat-panel-subtitle">GovConUnited Assistant · Ask me anything</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="chat-panel-close"
              aria-label="Close chat"
            >
              <X size={16} />
            </button>
          </div>

          <div className="chat-panel-messages">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`chat-bubble ${msg.role === "assistant" ? "chat-bubble-assistant" : "chat-bubble-user"}`}
              >
                {msg.text}
              </div>
            ))}
            {sending && <div className="chat-bubble chat-bubble-assistant chat-bubble-typing">Typing…</div>}
            {error && <div className="chat-bubble chat-bubble-error">{error}</div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-panel-input">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message…"
              disabled={sending}
            />
            <button onClick={handleSend} disabled={sending || !input.trim()} aria-label="Send message">
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
