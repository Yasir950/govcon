"use client";

import { useEffect, useRef, useState } from "react";
import { searchMentionCandidatesAction } from "@/app/(app)/communities/actions";
import { Avatar } from "@/components/avatar";
import { formatMention } from "@/lib/mentions";
import type { NetworkMember } from "@/lib/landing-data";

// Drop-in replacement for a plain <textarea> that adds LinkedIn-style
// @mention autocomplete: typing "@" followed by characters opens a
// dropdown of matching members (searchMentionCandidatesAction), and
// picking one inserts `@[Name](id) ` at the trigger position — see
// src/lib/mentions.ts for why that markup, not a live/rendered chip, is
// what actually gets stored.
export function MentionTextarea({
  value,
  onChange,
  className,
  placeholder,
  style,
  rows,
  disabled,
  autoFocus,
  onKeyDown,
  containerStyle,
  name,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  style?: React.CSSProperties;
  rows?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  // Forwarded to the underlying <textarea> for plain <form action={...}>
  // submission (FormData), same as any other form field.
  name?: string;
  // Extra styles for the wrapping div (e.g. `flex: 1` when the textarea
  // needs to share a flex row with an avatar/button, as the comment
  // composer does) — merged after position:relative, never replacing it.
  containerStyle?: React.CSSProperties;
  // Lets a wrapper (the rich-text toolbar) read and set the selection.
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  // Called for any key that the mention dropdown didn't itself handle
  // (e.g. the comment composer's own Enter-to-submit) — the dropdown's
  // own ArrowUp/ArrowDown/Enter/Tab/Escape handling always takes priority
  // while a suggestion list is open, exactly like every other @mention
  // implementation, so those never fall through to it.
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? ownRef;
  const [query, setQuery] = useState<string | null>(null);
  const [triggerIndex, setTriggerIndex] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<NetworkMember[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (query === null) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await searchMentionCandidatesAction(query);
      if (!cancelled) {
        setSuggestions(results);
        setActiveIndex(0);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function detectTrigger(text: string, cursor: number) {
    const upToCursor = text.slice(0, cursor);
    // "@" must start a word (beginning of text or after whitespace) so an
    // email address or a mid-word "@" doesn't trigger the dropdown.
    const match = /(?:^|\s)@([^\s@]{0,40})$/.exec(upToCursor);
    if (!match) {
      setQuery(null);
      setTriggerIndex(null);
      return;
    }
    setTriggerIndex(cursor - match[1].length - 1);
    setQuery(match[1]);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    detectTrigger(next, e.target.selectionStart ?? next.length);
  }

  function selectSuggestion(member: NetworkMember) {
    if (triggerIndex === null) return;
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? value.length;
    const before = value.slice(0, triggerIndex);
    const after = value.slice(cursor);
    const insertion = `${formatMention(member.name, member.id)} `;
    const next = `${before}${insertion}${after}`;
    onChange(next);
    setQuery(null);
    setTriggerIndex(null);
    requestAnimationFrame(() => {
      if (!textarea) return;
      const pos = before.length + insertion.length;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || suggestions.length === 0) {
      onKeyDown?.(e);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setQuery(null);
      setTriggerIndex(null);
    } else {
      onKeyDown?.(e);
    }
  }

  return (
    <div style={{ position: "relative", ...containerStyle }}>
      <textarea
        ref={textareaRef}
        name={name}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => detectTrigger(value, e.currentTarget.selectionStart ?? value.length)}
        style={style}
        rows={rows}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      {query !== null && suggestions.length > 0 && (
        <div className="mention-suggestions">
          {suggestions.map((m, i) => (
            <button
              type="button"
              key={m.id}
              className={`mention-suggestion${i === activeIndex ? " active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(m);
              }}
            >
              <Avatar name={m.name} avatarUrl={m.avatarUrl} size={28} />
              <span className="mention-suggestion-info">
                <strong>{m.name}</strong>
                {(m.headline || m.jobTitle) && <span className="meta">{m.headline || m.jobTitle}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
